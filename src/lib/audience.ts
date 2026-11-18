import { memberRole } from "./group";

/** Who a plan is for on the shared calendar. */
export type PlanAudience = "fun_peeps" | "guest";

export function isPlanAudience(value: unknown): value is PlanAudience {
  return value === "fun_peeps" || value === "guest";
}

export function normalizeAudience(value: unknown): PlanAudience {
  return isPlanAudience(value) ? value : "fun_peeps";
}

export function audienceLabel(audience: PlanAudience | string | null | undefined): string {
  return audience === "guest" ? "Guest" : "Fun Peeps";
}

/**
 * Guests only see Guest plans.
 * Fun Peeps (friend/founder) see Fun Peeps plans and Guest plans (so they can host guests).
 */
export function canRoleSeeAudience(
  role: "founder" | "friend" | "guest" | null,
  audience: PlanAudience | string | null | undefined,
): boolean {
  if (!role) return false;
  const a = normalizeAudience(audience);
  if (role === "guest") return a === "guest";
  return a === "fun_peeps" || a === "guest";
}

export async function canUserSeeAudience(
  userId: string,
  audience: PlanAudience | string | null | undefined,
): Promise<boolean> {
  const role = await memberRole(userId);
  return canRoleSeeAudience(role, audience);
}

/** SQL fragment: `$userIdParam` must be the viewer user id placeholder (e.g. `$1`). */
export function audienceFilterSql(planAlias: string, userIdParam: string): string {
  return `(
    case coalesce(
      (select m.role from circle_members m
       where m.circle_id = coalesce(${planAlias}.circle_id, 'circle_default')
         and m.user_id = ${userIdParam}
       limit 1),
      ''
    )
      when 'guest' then coalesce(${planAlias}.audience, 'fun_peeps') = 'guest'
      when 'friend' then true
      when 'founder' then true
      else false
    end
  )`;
}
