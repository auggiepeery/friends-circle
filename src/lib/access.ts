import { sql } from "./db";
import type { Plan } from "./types";

/** Creator, existing RSVP, or accepted friend of the creator. */
export async function canAccessPlan(
  plan: Plan,
  userId: string,
): Promise<boolean> {
  if (plan.creator_id === userId) return true;

  const rsvp = await sql<{ user_id: string }>(
    `select user_id from plan_rsvps where plan_id = $1 and user_id = $2 limit 1`,
    [plan.id, userId],
  );
  if (rsvp[0]) return true;

  const friend = await sql<{ id: string }>(
    `select id from friendships
     where status = 'accepted'
       and (
         (user_id = $1 and friend_id = $2)
         or (friend_id = $1 and user_id = $2)
       )
     limit 1`,
    [userId, plan.creator_id],
  );
  return Boolean(friend[0]);
}

/** Public-safe plan fields — never includes share_token. */
export function publicPlan(plan: Plan) {
  const { share_token: _share, ...rest } = plan;
  return rest;
}

/** Creator-only fields such as share_token. */
export function planForViewer(plan: Plan, userId: string) {
  if (plan.creator_id === userId) return plan;
  return publicPlan(plan);
}
