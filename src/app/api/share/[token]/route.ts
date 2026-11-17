import { publicPlan } from "@/lib/access";
import { noStore, optionalViewer, requireViewer } from "@/lib/auth";
import { clip, readJsonBounded } from "@/lib/http";
import {
  getPlanByShare,
  listComments,
  listExpenses,
  listPolls,
  listRsvps,
  setRsvp,
} from "@/lib/plans";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token || token.length > 64) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const plan = await getPlanByShare(token);
  if (!plan) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const viewer = await optionalViewer(request);
  const userId = viewer?.sub || "";
  const [rsvps, comments, polls, expenses] = await Promise.all([
    listRsvps(plan.id),
    listComments(plan.id),
    userId ? listPolls(plan.id, userId) : Promise.resolve([]),
    listExpenses(plan.id),
  ]);
  return Response.json(
    {
      plan: publicPlan(plan),
      rsvps,
      comments,
      polls,
      expenses,
      viewer: viewer
        ? { name: viewer.name, simulated: viewer.simulated }
        : null,
    },
    { headers: noStore },
  );
}

export async function POST(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { token } = await ctx.params;
  if (!token || token.length > 64) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const plan = await getPlanByShare(token);
  if (!plan) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const body = await readJsonBounded<{ response?: string }>(request);
  if (body instanceof Response) return body;
  const response = clip(body.response, 16) || "going";
  if (!["going", "maybe", "no"].includes(response)) {
    return Response.json(
      { error: "bad_response" },
      { status: 400, headers: noStore },
    );
  }
  await setRsvp(plan.id, viewer.sub, response);
  return Response.json(
    { rsvps: await listRsvps(plan.id), planId: plan.id },
    { headers: noStore },
  );
}
