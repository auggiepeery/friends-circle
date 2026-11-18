import { canAccessCirclePlan } from "./group";
import type { Plan } from "./types";

/** Any circle member can open any plan on the shared calendar. */
export async function canAccessPlan(
  plan: Plan,
  userId: string,
): Promise<boolean> {
  return canAccessCirclePlan(
    (plan as Plan & { circle_id?: string | null }).circle_id,
    userId,
  );
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
