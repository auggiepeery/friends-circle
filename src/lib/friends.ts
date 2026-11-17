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
  const q = emailOrName.trim().toLowerCase();
  if (!q) return { ok: false, error: "Enter an email or name" };

  let targets = await sql<Profile>(
    `select * from profiles
     where lower(email) = $1 or lower(display_name) = $1
     limit 5`,
    [q],
  );
  if (targets.length === 0) {
    // Create a placeholder invitee profile keyed by email so invites work before they sign in.
    if (!q.includes("@")) {
      return { ok: false, error: "No matching friend yet — try their email" };
    }
    const placeholderId = `invite:${q}`;
    await sql(
      `insert into profiles (id, email, display_name)
       values ($1, $2, $3)
       on conflict (id) do nothing`,
      [placeholderId, q, q.split("@")[0]],
    );
    targets = await sql<Profile>(`select * from profiles where id = $1`, [
      placeholderId,
    ]);
  }

  const friend = targets[0];
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
    href: "/friends",
  });

  return {
    ok: true,
    friendship: {
      ...rows[0],
      display_name: friend.display_name,
      email: friend.email,
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
      href: "/friends",
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

export async function searchPeople(
  userId: string,
  q: string,
): Promise<Profile[]> {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return sql(
    `select * from profiles
     where id <> $1
       and (lower(email) like $2 or lower(display_name) like $2)
     order by display_name asc
     limit 12`,
    [userId, `%${query}%`],
  );
}
