import { sql } from "./db";

export const DEFAULT_CIRCLE_ID = "circle_default";

export type CircleMember = {
  user_id: string;
  display_name: string;
  availability_hint: string;
  joined_at: string;
};

export async function ensureDefaultCircle(): Promise<void> {
  await sql(
    `insert into circles (id, name) values ($1, 'Fun Peepers')
     on conflict (id) do nothing`,
    [DEFAULT_CIRCLE_ID],
  );
}

/** Every signed-in friend joins the shared circle — one small-group calendar. */
export async function joinDefaultCircle(userId: string): Promise<void> {
  await ensureDefaultCircle();
  await sql(
    `insert into circle_members (circle_id, user_id)
     values ($1, $2)
     on conflict do nothing`,
    [DEFAULT_CIRCLE_ID, userId],
  );
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
