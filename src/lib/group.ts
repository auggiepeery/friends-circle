import { timingSafeEqual } from "node:crypto";
import { sql } from "./db";
import { shareToken } from "./ids";

export const DEFAULT_CIRCLE_ID = "circle_default";

export type CircleMember = {
  user_id: string;
  display_name: string;
  availability_hint: string;
  joined_at: string;
};

function codesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export async function ensureDefaultCircle(): Promise<void> {
  await sql(
    `insert into circles (id, name, invite_code)
     values ($1, 'Fun Peepers', $2)
     on conflict (id) do nothing`,
    [DEFAULT_CIRCLE_ID, shareToken()],
  );
  const rows = await sql<{ invite_code: string | null }>(
    `select invite_code from circles where id = $1`,
    [DEFAULT_CIRCLE_ID],
  );
  if (rows[0] && !rows[0].invite_code) {
    await sql(`update circles set invite_code = $2 where id = $1`, [
      DEFAULT_CIRCLE_ID,
      shareToken(),
    ]);
  }
}

export async function memberCount(): Promise<number> {
  const rows = await sql<{ count: number }>(
    `select count(*)::int as count from circle_members where circle_id = $1`,
    [DEFAULT_CIRCLE_ID],
  );
  return rows[0]?.count ?? 0;
}

export async function getInviteCode(): Promise<string> {
  await ensureDefaultCircle();
  const rows = await sql<{ invite_code: string }>(
    `select invite_code from circles where id = $1`,
    [DEFAULT_CIRCLE_ID],
  );
  return rows[0]?.invite_code || "";
}

export async function isCircleMember(userId: string): Promise<boolean> {
  const rows = await sql<{ user_id: string }>(
    `select user_id from circle_members
     where circle_id = $1 and user_id = $2
     limit 1`,
    [DEFAULT_CIRCLE_ID, userId],
  );
  return Boolean(rows[0]);
}

/** Bound personal secret for empty-circle founder bootstrap (local fallback for PGlite). */
function founderSetupSecret(): string {
  const fromEnv = (process.env.FOUNDER_SETUP_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  // Published host must bind FOUNDER_SETUP_SECRET; never open-claim an empty circle there.
  if (process.env.NODE_ENV === "production") return "";
  return "local-founder-setup";
}

/**
 * Join only with a valid invite code.
 * Empty circle: founder must present FOUNDER_SETUP_SECRET (or the circle invite code).
 * Public visitors cannot claim ownership with a blank code.
 */
export async function joinWithInvite(
  userId: string,
  inviteCode?: string,
  setupSecret?: string,
): Promise<{ ok: true; founder: boolean } | { ok: false; error: string }> {
  await ensureDefaultCircle();
  if (await isCircleMember(userId)) {
    return { ok: true, founder: false };
  }

  const count = await memberCount();
  const expected = await getInviteCode();
  const provided = (inviteCode || "").trim();
  const providedSetup = (setupSecret || "").trim();
  const inviteOk =
    Boolean(provided) && Boolean(expected) && codesEqual(provided, expected);

  if (count === 0) {
    const setup = founderSetupSecret();
    const setupOk =
      Boolean(setup) &&
      Boolean(providedSetup) &&
      codesEqual(providedSetup, setup);
    if (!inviteOk && !setupOk) {
      return {
        ok: false,
        error: setup ? "setup_required" : "setup_unavailable",
      };
    }
    await sql(
      `insert into circle_members (circle_id, user_id)
       values ($1, $2)
       on conflict do nothing`,
      [DEFAULT_CIRCLE_ID, userId],
    );
    return { ok: true, founder: true };
  }

  if (!inviteOk) {
    return { ok: false, error: "invalid_invite" };
  }

  await sql(
    `insert into circle_members (circle_id, user_id)
     values ($1, $2)
     on conflict do nothing`,
    [DEFAULT_CIRCLE_ID, userId],
  );
  return { ok: true, founder: false };
}

export async function listCircleMembers(): Promise<CircleMember[]> {
  return sql(
    `select m.user_id, p.display_name, p.availability_hint, m.joined_at
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1
     order by p.display_name asc
     limit 40`,
    [DEFAULT_CIRCLE_ID],
  );
}

export async function canAccessCirclePlan(
  planCircleId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  const circleId = planCircleId || DEFAULT_CIRCLE_ID;
  const rows = await sql<{ user_id: string }>(
    `select user_id from circle_members
     where circle_id = $1 and user_id = $2
     limit 1`,
    [circleId, userId],
  );
  return Boolean(rows[0]);
}

export async function requireCircleMember(
  userId: string,
): Promise<true | Response> {
  if (await isCircleMember(userId)) return true;
  return Response.json(
    { error: "invite_required" },
    {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
