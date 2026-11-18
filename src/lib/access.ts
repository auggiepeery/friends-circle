import { canUserSeeAudience } from "./audience";
import { canAccessCirclePlan } from "./group";
import type { Plan } from "./types";

/** Circle membership + Guest vs Fun Peeps audience. */
export async function canAccessPlan(
  plan: Plan,
  userId: string,
): Promise<boolean> {
  const inCircle = await canAccessCirclePlan(
    (plan as Plan & { circle_id?: string | null }).circle_id,
    userId,
  );
  if (!inCircle) return false;
  return canUserSeeAudience(userId, plan.audience);
}

/** Never expose share tokens — calendar is shared in-app, not via send links. */
export function publicPlan(plan: Plan) {
  const { share_token: _t, ...rest } = plan;
  void _t;
  return rest;
}

export function planForViewer(plan: Plan) {
  return publicPlan(plan);
}
