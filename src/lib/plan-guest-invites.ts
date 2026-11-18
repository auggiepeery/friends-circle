import { randomInt } from "node:crypto";
import { normalizeAudience } from "./audience";
import { sql } from "./db";
import { id } from "./ids";
import { getPlan, setRsvp } from "./plans";
import { newGuestId } from "./guest";
import { DEFAULT_CIRCLE_ID, secretsEqual } from "./group";
import type { Plan } from "./types";

/** When a plan has a start but no end, treat the hang as this long for expiry. */
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

export function isFourDigitCode(value: string): boolean {
  return /^[0-9]{4}$/.test(value.trim());
}

/** Absolute expiry = hang end time (no grace). */
export function inviteExpiresAt(
  plan: Pick<Plan, "starts_at" | "ends_at">,
): Date | null {
  const endMs = hangEndMs(plan);
  if (endMs == null) return null;
  return new Date(endMs);
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

export async function getInviteByCode(
  code: string,
): Promise<PlanGuestInvite | null> {
  const trimmed = code.trim();
  if (!isFourDigitCode(trimmed)) return null;
  const rows = await sql<PlanGuestInvite>(
    `select id, token, plan_id, created_by, created_at, revoked_at
     from plan_guest_invites
     where token = $1
     order by created_at desc
     limit 1`,
    [trimmed],
  );
  return rows[0] ?? null;
}

export async function getInviteById(
  inviteId: string,
): Promise<PlanGuestInvite | null> {
  const rows = await sql<PlanGuestInvite>(
    `select id, token, plan_id, created_by, created_at, revoked_at
     from plan_guest_invites
     where id = $1
     limit 1`,
    [inviteId],
  );
  return rows[0] ?? null;
}

/** Bump session_version for guests admitted via a hang invite (or all for a plan). */
export async function invalidateHangGuestSessions(input: {
  inviteId?: string;
  planId?: string;
}): Promise<void> {
  if (input.inviteId) {
    await sql(
      `update profiles p
       set session_version = session_version + 1
       from hang_guest_bindings b
       where b.user_id = p.id and b.invite_id = $1`,
      [input.inviteId],
    );
    return;
  }
  if (input.planId) {
    await sql(
      `update profiles p
       set session_version = session_version + 1
       from hang_guest_bindings b
       where b.user_id = p.id and b.plan_id = $1`,
      [input.planId],
    );
  }
}

/**
 * Hang-code guests stay valid only while their invite is active.
 * Circle-wide guests (no hang binding) are unaffected.
 */
export async function hangGuestAccessStillValid(
  userId: string,
): Promise<boolean> {
  if (!userId.startsWith("guest:")) return true;
  const rows = await sql<{ invite_id: string; plan_id: string }>(
    `select invite_id, plan_id from hang_guest_bindings where user_id = $1`,
    [userId],
  );
  const binding = rows[0];
  if (!binding) return true;
  const invite = await getInviteById(binding.invite_id);
  const plan = await getPlan(binding.plan_id);
  return inviteLifecycle(invite, plan) === "active";
}

async function codeInUse(code: string): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `select id from plan_guest_invites
     where token = $1 and revoked_at is null
     limit 1`,
    [code],
  );
  return Boolean(rows[0]);
}

async function allocateFourDigitCode(): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const code = String(randomInt(0, 10_000)).padStart(4, "0");
    if (!(await codeInUse(code))) return code;
  }
  return null;
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

  await sql(
    `update plan_guest_invites
     set revoked_at = coalesce(revoked_at, now())
     where plan_id = $1 and revoked_at is null`,
    [input.planId],
  );
  // Rotating the hang code must kick guests who redeemed the previous one.
  await invalidateHangGuestSessions({ planId: input.planId });

  const code = await allocateFourDigitCode();
  if (!code) return { ok: false, error: "code_unavailable" };

  const inviteId = id("pgi");
  const rows = await sql<PlanGuestInvite>(
    `insert into plan_guest_invites (id, token, plan_id, created_by)
     values ($1, $2, $3, $4)
     returning id, token, plan_id, created_by, created_at, revoked_at`,
    [inviteId, code, input.planId, input.createdBy],
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
    await invalidateHangGuestSessions({ inviteId: input.inviteId });
    return { ok: true };
  }
  await sql(
    `update plan_guest_invites
     set revoked_at = now()
     where plan_id = $1 and revoked_at is null`,
    [input.planId],
  );
  await invalidateHangGuestSessions({ planId: input.planId });
  return { ok: true };
}

/**
 * Redeem a 4-digit hang code as a guest (same sign-in path as circle invite).
 * Does not leak plan/circle details on failure.
 */
export async function redeemHangCode(
  name: string,
  code: string,
): Promise<
  | {
      ok: true;
      userId: string;
      name: string;
      planId: string;
      sessionVersion: number;
    }
  | { ok: false; error: string }
> {
  const display = name.trim();
  if (display.length < 2) return { ok: false, error: "name_required" };
  if (!isFourDigitCode(code)) return { ok: false, error: "invalid_invite" };

  const invite = await getInviteByCode(code);
  if (!invite || !secretsEqual(invite.token, code.trim())) {
    return { ok: false, error: "invalid_invite" };
  }
  const plan = await getPlan(invite.plan_id);
  if (!plan) return { ok: false, error: "invalid_invite" };

  const life = inviteLifecycle(invite, plan);
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
  await sql(
    `insert into hang_guest_bindings (user_id, invite_id, plan_id)
     values ($1, $2, $3)
     on conflict (user_id) do update set
       invite_id = excluded.invite_id,
       plan_id = excluded.plan_id`,
    [userId, invite.id, plan.id],
  );
  await setRsvp(plan.id, userId, "going");
  return {
    ok: true,
    userId,
    name: display,
    planId: plan.id,
    sessionVersion: 0,
  };
}

export function summarizeInviteForHost(
  invite: PlanGuestInvite,
  plan: Plan,
): {
  id: string;
  code: string;
  status: InviteLifecycle;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
} {
  const expires = inviteExpiresAt(plan);
  return {
    id: invite.id,
    code: invite.token,
    status: inviteLifecycle(invite, plan),
    expiresAt: expires ? expires.toISOString() : null,
    createdAt: invite.created_at,
    revokedAt: invite.revoked_at,
  };
}
