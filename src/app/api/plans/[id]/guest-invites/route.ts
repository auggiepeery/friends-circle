import { canAccessPlan } from "@/lib/access";
import { noStore, requireViewer } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/csrf";
import { requireNamedMember } from "@/lib/group";
import { clip, readJsonBounded } from "@/lib/http";
import {
  createPlanGuestInvite,
  listInvitesForPlan,
  revokePlanGuestInvite,
  summarizeInviteForHost,
} from "@/lib/plan-guest-invites";
import { getPlan } from "@/lib/plans";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function authorizeHost(request: Request, planId: string) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return { error: viewer as Response };
  const named = await requireNamedMember(viewer.sub);
  if (named !== true) return { error: named };
  const plan = await getPlan(planId);
  if (!plan) {
    return {
      error: Response.json(
        { error: "not_found" },
        { status: 404, headers: noStore },
      ),
    };
  }
  if (!(await canAccessPlan(plan, viewer.sub))) {
    return {
      error: Response.json(
        { error: "forbidden" },
        { status: 403, headers: noStore },
      ),
    };
  }
  return { viewer, plan };
}

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await authorizeHost(request, id);
  if ("error" in auth && auth.error) return auth.error;
  const { plan } = auth as {
    plan: NonNullable<Awaited<ReturnType<typeof getPlan>>>;
  };
  const invites = await listInvitesForPlan(id);
  return Response.json(
    {
      invites: invites.map((inv) => summarizeInviteForHost(inv, plan)),
      audience: plan.audience || "fun_peeps",
      endsAt: plan.ends_at,
      startsAt: plan.starts_at,
    },
    { headers: noStore },
  );
}

export async function POST(request: Request, ctx: Ctx) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  if (!rateLimit(clientKey(request, "guest-invite-write"), 20, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }

  const { id } = await ctx.params;
  const auth = await authorizeHost(request, id);
  if ("error" in auth && auth.error) return auth.error;
  const { viewer, plan } = auth as {
    viewer: { sub: string };
    plan: NonNullable<Awaited<ReturnType<typeof getPlan>>>;
  };

  const body = await readJsonBounded<{
    action?: string;
    inviteId?: string;
  }>(request);
  if (body instanceof Response) return body;

  const action = clip(body.action, 32) || "create";

  if (action === "create") {
    const result = await createPlanGuestInvite({
      planId: id,
      createdBy: viewer.sub,
    });
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        {
          status: result.error === "not_found" ? 404 : 400,
          headers: noStore,
        },
      );
    }
    return Response.json(
      {
        ok: true,
        invite: summarizeInviteForHost(result.invite, plan),
      },
      { status: 201, headers: noStore },
    );
  }

  if (action === "revoke") {
    const result = await revokePlanGuestInvite({
      planId: id,
      inviteId: clip(body.inviteId, 80) || undefined,
    });
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: 404, headers: noStore },
      );
    }
    const invites = await listInvitesForPlan(id);
    return Response.json(
      {
        ok: true,
        invites: invites.map((inv) => summarizeInviteForHost(inv, plan)),
      },
      { headers: noStore },
    );
  }

  return Response.json(
    { error: "unknown_action" },
    { status: 400, headers: noStore },
  );
}
