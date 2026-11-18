import { sql } from "./db";
import { id } from "./ids";
import { notify } from "./plans";
import type { Friendship, Profile } from "./types";

export async function listFriends(userId: string): Promise<Friendship[]> {
  return sql(
    `select f.*,
       p.display_name,
       p.email,
       p.availability_hint
     from friendships f
     join profiles p on p.id = case
       when f.user_id = $1 then f.friend_id
       else f.user_id
     end
     where (f.user_id = $1 or f.friend_id = $1)
       and f.status = 'accepted'
     order by p.display_name asc`,
    [userId],
  );
}

export async function listPending(userId: string): Promise<Friendship[]> {
  return sql(
    `select f.*, p.display_name, p.email, p.availability_hint
     from friendships f
     join profiles p on p.id = f.user_id
     where f.friend_id = $1 and f.status = 'pending'
     order by f.created_at desc`,
    [userId],
  );
}

export async function inviteFriend(
  fromId: string,
  emailOrName: string,
): Promise<{ ok: true; friendship: Friendship } | { ok: false; error: string }> {
  const q = emailOrName.trim().toLowerCase().slice(0, 160);
  if (!q) return { ok: false, error: "Enter an email or name" };

  let friend = await findProfileForInvite(q);
  if (!friend) {
    // Create a placeholder invitee profile keyed by email so invites work before they sign in.
    if (!q.includes("@")) {
      return { ok: false, error: "No matching friend yet — try their email" };
    }
    const placeholderId = `invite:${q}`;
    await sql(
      `insert into profiles (id, email, display_name)
       values ($1, $2, $3)
       on conflict (id) do nothing`,
      [placeholderId, q, q.split("@")[0].slice(0, 80)],
    );
    friend = await findProfileForInvite(q);
  }

  if (!friend) {
    return { ok: false, error: "Couldn’t find that friend" };
  }
  if (friend.id === fromId) {
    return { ok: false, error: "That’s you" };
  }

  const existing = await sql<Friendship>(
    `select * from friendships
     where (user_id = $1 and friend_id = $2)
        or (user_id = $2 and friend_id = $1)
     limit 1`,
    [fromId, friend.id],
  );
  if (existing[0]) {
    return { ok: false, error: `Already ${existing[0].status}` };
  }

  const friendshipId = id("fr");
  const rows = await sql<Friendship>(
    `insert into friendships (id, user_id, friend_id, status)
     values ($1,$2,$3,'pending')
     returning *`,
    [friendshipId, fromId, friend.id],
  );

  await notify({
    userId: friend.id,
    kind: "invite",
    title: "Friend invite",
    body: "Someone wants to plan with you on Fun Peepers.",
    href: "/circle",
  });

  return {
    ok: true,
    friendship: {
      ...rows[0],
      display_name: friend.display_name,
      // Do not echo matched profile emails back — invitees are confirmed server-side only.
      availability_hint: friend.availability_hint,
    },
  };
}

export async function respondInvite(
  friendshipId: string,
  userId: string,
  accept: boolean,
): Promise<boolean> {
  const rows = await sql<Friendship>(
    `select * from friendships where id = $1 and friend_id = $2 and status = 'pending'`,
    [friendshipId, userId],
  );
  if (!rows[0]) return false;
  if (accept) {
    await sql(`update friendships set status = 'accepted' where id = $1`, [
      friendshipId,
    ]);
    await notify({
      userId: rows[0].user_id,
      kind: "invite",
      title: "Invite accepted",
      body: "You’re friends on Fun Peepers — time to plan.",
      href: "/circle",
    });
  } else {
    await sql(`delete from friendships where id = $1`, [friendshipId]);
  }
  return true;
}

export async function setAvailability(
  userId: string,
  hint: string,
): Promise<void> {
  await sql(`update profiles set availability_hint = $2 where id = $1`, [
    userId,
    hint.trim().slice(0, 160),
  ]);
}

/** Exact email invite lookup only — never substring search, never returned to clients. */
export async function findProfileForInvite(
  emailOrName: string,
): Promise<Profile | null> {
  const q = emailOrName.trim().toLowerCase().slice(0, 160);
  if (!q) return null;
  if (q.includes("@")) {
    const rows = await sql<Profile>(
      `select id, email, display_name, availability_hint from profiles
       where lower(email) = $1
       limit 1`,
      [q],
    );
    return rows[0] ?? null;
  }
  const rows = await sql<Profile>(
    `select id, email, display_name, availability_hint from profiles
     where lower(display_name) = $1
     limit 1`,
    [q],
  );
  return rows[0] ?? null;
}
