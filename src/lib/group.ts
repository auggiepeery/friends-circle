import { timingSafeEqual } from "node:crypto";
import { FOUNDER_ID, newFriendId, newGuestId } from "./guest";
import { sql } from "./db";
import { shareToken } from "./ids";

export const DEFAULT_CIRCLE_ID = "circle_default";

export type CircleMember = {
  user_id: string;
  display_name: string;
  availability_hint: string;
  joined_at: string;
  role?: string;
};

export type PickerFriend = {
  id: string;
  name: string;
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

/** Bound personal secret for founder sign-in (local fallback for PGlite only). */
export function founderSetupSecret(): string {
  const fromEnv = (process.env.FOUNDER_SETUP_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return "";
  return "local-founder-setup";
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

/** Named friends for the sign-in picker (not ephemeral guests). */
export async function listPickerFriends(): Promise<PickerFriend[]> {
  await ensureDefaultCircle();
  const rows = await sql<{ user_id: string; display_name: string }>(
    `select m.user_id, p.display_name
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1
       and m.role in ('friend', 'founder')
       and p.display_name <> ''
     order by p.display_name asc
     limit 40`,
    [DEFAULT_CIRCLE_ID],
  );
  return rows.map((r) => ({ id: r.user_id, name: r.display_name }));
}

export async function signInAsFriend(
  friendId: string,
  password: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  await ensureDefaultCircle();
  const rows = await sql<{
    user_id: string;
    display_name: string;
    role: string;
  }>(
    `select m.user_id, p.display_name, m.role
     from circle_members m
     join profiles p on p.id = m.user_id
     where m.circle_id = $1 and m.user_id = $2
     limit 1`,
    [DEFAULT_CIRCLE_ID, friendId],
  );
  const row = rows[0];
  if (!row || (row.role !== "friend" && row.role !== "founder")) {
    return { ok: false, error: "unknown_friend" };
  }
  const name = row.display_name;
  // Friend password = display name exactly as stored (case-sensitive).
  // Founder account uses FOUNDER_SETUP_SECRET instead.
  if (row.user_id === FOUNDER_ID || row.role === "founder") {
    const setup = founderSetupSecret();
    if (!setup || !secretsEqual(password, setup)) {
      return { ok: false, error: "bad_password" };
    }
  } else if (!name || !secretsEqual(password, name)) {
    return { ok: false, error: "bad_password" };
  }
  return { ok: true, name };
}

export async function signInAsGuest(
  name: string,
): Promise<{ ok: true; userId: string; name: string } | { ok: false; error: string }> {
  const display = name.trim();
  if (display.length < 2) return { ok: false, error: "name_required" };
  const userId = newGuestId();
  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, '', $2)
     on conflict (id) do update set display_name = excluded.display_name`,
    [userId, display],
  );
  await ensureMembership(userId, "guest");
  return { ok: true, userId, name: display };
}

export async function signInAsFounder(
  password: string,
  displayName?: string,
): Promise<
  | { ok: true; userId: string; name: string; founded: boolean }
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
  const name =
    (displayName || "").trim() ||
    existing[0]?.display_name ||
    "Founder";

  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, '', $2)
     on conflict (id) do update set
       display_name = case
         when excluded.display_name <> '' then excluded.display_name
         else profiles.display_name
       end`,
    [FOUNDER_ID, name],
  );
  await ensureMembership(FOUNDER_ID, "founder");
  return { ok: true, userId: FOUNDER_ID, name, founded: count === 0 };
}

/** Add a named friend to the picker (password will be their display name). */
export async function addNamedFriend(
  displayName: string,
): Promise<
  | { ok: true; id: string; name: string }
  | { ok: false; error: string }
> {
  const name = displayName.trim();
  if (name.length < 2) return { ok: false, error: "name_required" };

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
  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, '', $2)`,
    [userId, name],
  );
  await ensureMembership(userId, "friend");
  return { ok: true, id: userId, name };
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
