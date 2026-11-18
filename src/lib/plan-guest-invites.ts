import { normalizeAudience } from "./audience";
import { sql } from "./db";
import { formatWhenRange } from "./format";
import { id, shareToken } from "./ids";
import { getPlan, setRsvp } from "./plans";
import { newGuestId } from "./guest";
import { DEFAULT_CIRCLE_ID, secretsEqual } from "./group";
import type { Plan } from "./types";

/** How long after the hang end guests can still redeem the link. */
export const GUEST_INVITE_GRACE_MS = 2 * 60 * 60 * 1000;

/** When a plan has a start but no end, treat the hang as this long. */
export const DEFAULT_HANG_MS = 4 * 60 * 60 * 1000;

export type PlanGuestInvite = {
  id: string;
  token: string;
  plan_id: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
};

export type InviteLifecycle =
  | "active"
  | "expired"
  | "revoked"
  | "wrong_audience"
  | "unscheduled"
  | "missing";

export type InvitePublicStatus = "ok" | "expired" | "revoked" | "invalid";

/** Absolute expiry instant for a hang invite (end + grace). */
export function inviteExpiresAt(plan: Pick<Plan, "starts_at" | "ends_at">): Date | null {
  const endMs = hangEndMs(plan);
  if (endMs == null) return null;
  return new Date(endMs + GUEST_INVITE_GRACE_MS);
}

function hangEndMs(plan: Pick<Plan, "starts_at" | "ends_at">): number | null {
  if (plan.ends_at) {
    const end = new Date(plan.ends_at).getTime();
    return Number.isFinite(end) ? end : null;
  }
  if (plan.starts_at) {
    const start = new Date(plan.starts_at).getTime();
    return Number.isFinite(start) ? start + DEFAULT_HANG_MS : null;
  }
  return null;
}

export function inviteLifecycle(
  invite: PlanGuestInvite | null | undefined,
  plan: Plan | null | undefined,
  now = Date.now(),
): InviteLifecycle {
  if (!invite || !plan) return "missing";
  if (invite.revoked_at) return "revoked";
  if (normalizeAudience(plan.audience) !== "guest") return "wrong_audience";
  const expires = inviteExpiresAt(plan);
  if (!expires) return "unscheduled";
  if (expires.getTime() <= now) return "expired";
  return "active";
}

export function publicStatusFromLifecycle(
  life: InviteLifecycle,
): InvitePublicStatus {
  if (life === "active") return "ok";
  if (life === "expired") return "expired";
  if (life === "revoked") return "revoked";
  return "invalid";
}

export async function listInvitesForPlan(
  planId: string,
): Promise<PlanGuestInvite[]> {
  return sql<PlanGuestInvite>(
    `select id, token, plan_id, created_by, created_at, revoked_at
     from plan_guest_invites
     where plan_id = $1
     order by created_at desc
     limit 20`,
    [planId],
  );
}

export async function getInviteByToken(
  token: string,
): Promise<PlanGuestInvite | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const rows = await sql<PlanGuestInvite>(
    `select id, token, plan_id, created_by, created_at, revoked_at
     from plan_guest_invites
     where token = $1
     limit 1`,
    [trimmed],
  );
  return rows[0] ?? null;
}

/**
 * Constant-time-ish lookup: compare against stored token after fetch by exact match.
 * Token uniqueness means a miss returns null without leaking plan data.
 */
export async function resolveInviteToken(
  token: string,
): Promise<{ invite: PlanGuestInvite; plan: Plan } | null> {
  const invite = await getInviteByToken(token);
  if (!invite || !secretsEqual(invite.token, token.trim())) return null;
  const plan = await getPlan(invite.plan_id);
  if (!plan) return null;
  return { invite, plan };
}

export async function createPlanGuestInvite(input: {
  planId: string;
  createdBy: string;
}): Promise<
  | { ok: true; invite: PlanGuestInvite; expiresAt: string }
  | { ok: false; error: string }
> {
  const plan = await getPlan(input.planId);
  if (!plan) return { ok: false, error: "not_found" };
  if (normalizeAudience(plan.audience) !== "guest") {
    return { ok: false, error: "guest_audience_required" };
  }
  const expires = inviteExpiresAt(plan);
  if (!expires) return { ok: false, error: "unscheduled" };
  if (expires.getTime() <= Date.now()) {
    return { ok: false, error: "already_ended" };
  }

  // One active link per plan — revoke prior open invites.
  await sql(
    `update plan_guest_invites
     set revoked_at = coalesce(revoked_at, now())
     where plan_id = $1 and revoked_at is null`,
    [input.planId],
  );

  const inviteId = id("pgi");
  const token = shareToken();
  const rows = await sql<PlanGuestInvite>(
    `insert into plan_guest_invites (id, token, plan_id, created_by)
     values ($1, $2, $3, $4)
     returning id, token, plan_id, created_by, created_at, revoked_at`,
    [inviteId, token, input.planId, input.createdBy],
  );
  return {
    ok: true,
    invite: rows[0],
    expiresAt: expires.toISOString(),
  };
}

export async function revokePlanGuestInvite(input: {
  planId: string;
  inviteId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.inviteId) {
    const rows = await sql<{ id: string }>(
      `update plan_guest_invites
       set revoked_at = now()
       where id = $1 and plan_id = $2 and revoked_at is null
       returning id`,
      [input.inviteId, input.planId],
    );
    if (!rows[0]) return { ok: false, error: "not_found" };
    return { ok: true };
  }
  await sql(
    `update plan_guest_invites
     set revoked_at = now()
     where plan_id = $1 and revoked_at is null`,
    [input.planId],
  );
  return { ok: true };
}

export type HangPreview =
  | {
      status: "ok";
      title: string;
      whenLabel: string | null;
      expiresAt: string;
    }
  | { status: Exclude<InvitePublicStatus, "ok"> };

/** Public preview — never returns circle/member data on failure. */
export async function previewHangInvite(token: string): Promise<HangPreview> {
  const resolved = await resolveInviteToken(token);
  if (!resolved) return { status: "invalid" };
  const life = inviteLifecycle(resolved.invite, resolved.plan);
  const status = publicStatusFromLifecycle(life);
  if (status !== "ok") return { status };
  const expires = inviteExpiresAt(resolved.plan)!;
  return {
    status: "ok",
    title: resolved.plan.title,
    whenLabel: formatWhenRange(resolved.plan.starts_at, resolved.plan.ends_at),
    expiresAt: expires.toISOString(),
  };
}

/** Redeem a hang invite as a guest; auto-RSVP going on that plan. */
export async function redeemHangInvite(
  name: string,
  token: string,
): Promise<
  | { ok: true; userId: string; name: string; planId: string; sessionVersion: number }
  | { ok: false; error: string }
> {
  const display = name.trim();
  if (display.length < 2) return { ok: false, error: "name_required" };

  const resolved = await resolveInviteToken(token);
  if (!resolved) return { ok: false, error: "invalid_invite" };
  const life = inviteLifecycle(resolved.invite, resolved.plan);
  if (life === "expired") return { ok: false, error: "expired" };
  if (life === "revoked") return { ok: false, error: "revoked" };
  if (life !== "active") return { ok: false, error: "invalid_invite" };

  const userId = newGuestId();
  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, '', $2)
     on conflict (id) do update set display_name = excluded.display_name`,
    [userId, display],
  );
  await sql(
    `insert into circle_members (circle_id, user_id, role)
     values ($1, $2, 'guest')
     on conflict (circle_id, user_id) do update set role = 'guest'`,
    [DEFAULT_CIRCLE_ID, userId],
  );
  await setRsvp(resolved.plan.id, userId, "going");
  return {
    ok: true,
    userId,
    name: display,
    planId: resolved.plan.id,
    sessionVersion: 0,
  };
}

export function inviteUrlFor(origin: string, token: string): string {
  return `${origin}/hang/${encodeURIComponent(token)}`;
}

export function summarizeInviteForHost(
  invite: PlanGuestInvite,
  plan: Plan,
  origin: string,
): {
  id: string;
  url: string;
  status: InviteLifecycle;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
} {
  const expires = inviteExpiresAt(plan);
  return {
    id: invite.id,
    url: inviteUrlFor(origin, invite.token),
    status: inviteLifecycle(invite, plan),
    expiresAt: expires ? expires.toISOString() : null,
    createdAt: invite.created_at,
    revokedAt: invite.revoked_at,
  };
}
