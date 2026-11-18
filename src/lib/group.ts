import { timingSafeEqual } from "node:crypto";
import { FOUNDER_ID, newFriendId, newGuestId } from "./guest";
import { sql } from "./db";
import { shareToken } from "./ids";
import { hashPassword, verifyPassword } from "./passwords";

export const DEFAULT_CIRCLE_ID = "circle_default";

export type CircleMember = {
  user_id: string;
  display_name: string;
  availability_hint: string;
  joined_at: string;
  role?: string;
};

export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/** Bound personal secret for founder sign-in — never a hardcoded fallback. */
export function founderSetupSecret(): string {
  return (process.env.FOUNDER_SETUP_SECRET || "").trim();
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

export async function memberRole(
  userId: string,
): Promise<"founder" | "friend" | "guest" | null> {
  const rows = await sql<{ role: string }>(
    `select role from circle_members
     where circle_id = $1 and user_id = $2
     limit 1`,
    [DEFAULT_CIRCLE_ID, userId],
  );
  const role = rows[0]?.role;
  if (role === "founder" || role === "friend" || role === "guest") return role;
  return null;
}

async function ensureMembership(
  userId: string,
  role: "founder" | "friend" | "guest",
): Promise<void> {
  await ensureDefaultCircle();
  await sql(
    `insert into circle_members (circle_id, user_id, role)
     values ($1, $2, $3)
     on conflict (circle_id, user_id) do update set role = excluded.role`,
    [DEFAULT_CIRCLE_ID, userId, role],
  );
}

/**
 * Friend sign-in by display name + real password (hashed).
 * Does not reveal whether the name exists vs bad password.
 */
export async function getSessionVersion(userId: string): Promise<number> {
  const rows = await sql<{ session_version: number }>(
    `select session_version from profiles where id = $1`,
    [userId],
  );
  return Number(rows[0]?.session_version ?? 0);
}

export async function signInAsFriend(
  displayName: string,
  password: string,
): Promise<
  | { ok: true; userId: string; name: string; sessionVersion: number }
  | { ok: false; error: string }
> {
  await ensureDefaultCircle();
  const name = displayName.trim();
  if (name.length < 2 || password.length < 4) {
    return { ok: false, error: "bad_credentials" };
  }

  const rows = await sql<{
    user_id: string;
    display_name: string;
    password_hash: string;
    role: string;
    session_version: number;
  }>(
    `select m.user_id, p.display_name, p.password_hash, m.role, p.session_version
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1
       and m.role = 'friend'
       and p.display_name = $2
     limit 1`,
    [DEFAULT_CIRCLE_ID, name],
  );
  const row = rows[0];
  if (!row?.password_hash) {
    return { ok: false, error: "bad_credentials" };
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return { ok: false, error: "bad_credentials" };
  return {
    ok: true,
    userId: row.user_id,
    name: row.display_name,
    sessionVersion: Number(row.session_version ?? 0),
  };
}

/** Guest join requires a valid invite code — no open public guest access. */
export async function signInAsGuest(
  name: string,
  inviteCode: string,
): Promise<
  | { ok: true; userId: string; name: string; sessionVersion: number }
  | { ok: false; error: string }
> {
  const display = name.trim();
  if (display.length < 2) return { ok: false, error: "name_required" };

  await ensureDefaultCircle();
  const expected = await getInviteCode();
  const provided = inviteCode.trim();
  if (!expected || !provided || !secretsEqual(provided, expected)) {
    return { ok: false, error: "invalid_invite" };
  }

  const userId = newGuestId();
  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, '', $2)
     on conflict (id) do update set display_name = excluded.display_name`,
    [userId, display],
  );
  await ensureMembership(userId, "guest");
  return { ok: true, userId, name: display, sessionVersion: 0 };
}

export async function signInAsFounder(
  password: string,
  displayName?: string,
): Promise<
  | {
      ok: true;
      userId: string;
      name: string;
      founded: boolean;
      sessionVersion: number;
    }
  | { ok: false; error: string }
> {
  const setup = founderSetupSecret();
  if (!setup) return { ok: false, error: "setup_unavailable" };
  if (!secretsEqual(password.trim(), setup)) {
    return { ok: false, error: "bad_password" };
  }

  const count = await memberCount();
  const existing = await sql<{ display_name: string }>(
    `select display_name from profiles where id = $1`,
    [FOUNDER_ID],
  );
  const existingName = existing[0]?.display_name?.trim() || "";
  const remapped =
    !existingName || existingName === "Founder" ? "Auggie" : existingName;
  const name = (displayName || "").trim() || remapped;

  await sql(
    `insert into profiles (id, email, display_name, password_hash)
     values ($1, '', $2, '')
     on conflict (id) do update set
       display_name = case
         when excluded.display_name <> '' then excluded.display_name
         else profiles.display_name
       end`,
    [FOUNDER_ID, name],
  );
  await ensureMembership(FOUNDER_ID, "founder");
  const sessionVersion = await getSessionVersion(FOUNDER_ID);
  return {
    ok: true,
    userId: FOUNDER_ID,
    name,
    founded: count === 0,
    sessionVersion,
  };
}

/** Add a named friend with an initial password (hashed). Only founder/friend. */
export async function addNamedFriend(
  displayName: string,
  initialPassword: string,
): Promise<
  | { ok: true; id: string; name: string }
  | { ok: false; error: string }
> {
  const name = displayName.trim();
  if (name.length < 2) return { ok: false, error: "name_required" };
  if (initialPassword.length < 6) return { ok: false, error: "password_short" };

  const dup = await sql<{ user_id: string }>(
    `select m.user_id
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1
       and m.role in ('friend', 'founder')
       and p.display_name = $2
     limit 1`,
    [DEFAULT_CIRCLE_ID, name],
  );
  if (dup[0]) return { ok: false, error: "name_taken" };

  const userId = newFriendId();
  const passwordHash = await hashPassword(initialPassword);
  await sql(
    `insert into profiles (id, email, display_name, password_hash)
     values ($1, '', $2, $3)`,
    [userId, name, passwordHash],
  );
  await ensureMembership(userId, "friend");
  return { ok: true, id: userId, name };
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) return { ok: false, error: "password_short" };
  const role = await memberRole(userId);
  if (role !== "friend") return { ok: false, error: "forbidden" };

  const rows = await sql<{ password_hash: string }>(
    `select password_hash from profiles where id = $1`,
    [userId],
  );
  const hash = rows[0]?.password_hash || "";
  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    return { ok: false, error: "bad_password" };
  }
  const next = await hashPassword(newPassword);
  await sql(
    `update profiles
     set password_hash = $2, session_version = session_version + 1
     where id = $1`,
    [userId, next],
  );
  return { ok: true };
}

/** Update own display name; must stay unique among named members. */
export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<
  | { ok: true; name: string }
  | { ok: false; error: string }
> {
  const name = displayName.trim();
  if (name.length < 2) return { ok: false, error: "name_required" };
  if (name.length > 120) return { ok: false, error: "name_too_long" };

  const dup = await sql<{ user_id: string }>(
    `select m.user_id
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1
       and m.role in ('friend', 'founder')
       and p.display_name = $2
       and m.user_id <> $3
     limit 1`,
    [DEFAULT_CIRCLE_ID, name, userId],
  );
  if (dup[0]) return { ok: false, error: "name_taken" };

  await sql(`update profiles set display_name = $2 where id = $1`, [
    userId,
    name,
  ]);
  return { ok: true, name };
}

/** Rotate the guest invite code (named friends / founder only). */
export async function rotateInviteCode(): Promise<string> {
  await ensureDefaultCircle();
  const code = shareToken();
  await sql(`update circles set invite_code = $2 where id = $1`, [
    DEFAULT_CIRCLE_ID,
    code,
  ]);
  return code;
}

export async function listCircleMembers(): Promise<CircleMember[]> {
  return sql(
    `select m.user_id, p.display_name, p.availability_hint, m.joined_at, m.role
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1
     order by
       case m.role when 'founder' then 0 when 'friend' then 1 else 2 end,
       p.display_name asc
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
    { error: "sign_in_required" },
    {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    },
  );
}

/** Guests can view calendar but cannot add friends or manage circle. */
export async function requireNamedMember(
  userId: string,
): Promise<true | Response> {
  const role = await memberRole(userId);
  if (role === "founder" || role === "friend") return true;
  return Response.json(
    { error: "friends_only" },
    {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
