import { noStore, optionalViewer } from "@/lib/auth";
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
      plan,
      rsvps,
      comments,
      polls,
      expenses,
      viewer: viewer
        ? { name: viewer.name, email: viewer.email, simulated: viewer.simulated }
        : null,
    },
    { headers: noStore },
  );
}

export async function POST(request: Request, ctx: Ctx) {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return Response.json(
      { error: "sign_in_required" },
      { status: 401, headers: noStore },
    );
  }
  const { token } = await ctx.params;
  const plan = await getPlanByShare(token);
  if (!plan) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const body = (await request.json()) as { response?: string };
  const response = body.response || "going";
  if (!["going", "maybe", "no"].includes(response)) {
    return Response.json(
      { error: "bad_response" },
      { status: 400, headers: noStore },
    );
  }
  await setRsvp(plan.id, viewer.sub, response);
  return Response.json(
    { rsvps: await listRsvps(plan.id) },
    { headers: noStore },
  );
}
