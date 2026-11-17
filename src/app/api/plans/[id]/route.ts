import { noStore, requireViewer } from "@/lib/auth";
import {
  addComment,
  addExpense,
  createPoll,
  getPlan,
  listComments,
  listExpenses,
  listPolls,
  listRsvps,
  notify,
  setRsvp,
  updatePlan,
  votePoll,
} from "@/lib/plans";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const [rsvps, comments, polls, expenses] = await Promise.all([
    listRsvps(id),
    listComments(id),
    listPolls(id, viewer.sub),
    listExpenses(id),
  ]);
  return Response.json(
    { plan, rsvps, comments, polls, expenses },
    { headers: noStore },
  );
}

export async function PATCH(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  if (plan.creator_id !== viewer.sub) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const updated = await updatePlan(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    description:
      typeof body.description === "string" ? body.description : undefined,
    place: typeof body.place === "string" ? body.place : undefined,
    startsAt:
      body.startsAt === null || typeof body.startsAt === "string"
        ? (body.startsAt as string | null)
        : undefined,
    endsAt:
      body.endsAt === null || typeof body.endsAt === "string"
        ? (body.endsAt as string | null)
        : undefined,
    outdoor: typeof body.outdoor === "boolean" ? body.outdoor : undefined,
    reminderAt:
      body.reminderAt === null || typeof body.reminderAt === "string"
        ? (body.reminderAt as string | null)
        : undefined,
    recurringRule:
      typeof body.recurringRule === "string" ? body.recurringRule : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
  });
  return Response.json({ plan: updated }, { headers: noStore });
}

export async function POST(request: Request, ctx: Ctx) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  const body = (await request.json()) as {
    action?: string;
    response?: string;
    body?: string;
    kind?: string;
    question?: string;
    options?: string[];
    optionId?: string;
    description?: string;
    amountCents?: number;
  };

  switch (body.action) {
    case "rsvp": {
      const response = body.response || "going";
      if (!["going", "maybe", "no"].includes(response)) {
        return Response.json(
          { error: "bad_response" },
          { status: 400, headers: noStore },
        );
      }
      await setRsvp(id, viewer.sub, response);
      if (plan.creator_id !== viewer.sub) {
        await notify({
          userId: plan.creator_id,
          kind: "rsvp",
          title: `${viewer.name} is ${response}`,
          body: plan.title,
          href: `/plans/${id}`,
        });
      }
      return Response.json(
        { rsvps: await listRsvps(id) },
        { headers: noStore },
      );
    }
    case "comment": {
      const text = (body.body || "").trim();
      if (!text) {
        return Response.json(
          { error: "empty" },
          { status: 400, headers: noStore },
        );
      }
      const comment = await addComment(id, viewer.sub, text);
      if (plan.creator_id !== viewer.sub) {
        await notify({
          userId: plan.creator_id,
          kind: "chat",
          title: `New note on ${plan.title}`,
          body: text.slice(0, 80),
          href: `/plans/${id}`,
        });
      }
      return Response.json({ comment }, { status: 201, headers: noStore });
    }
    case "poll": {
      if (plan.creator_id !== viewer.sub) {
        return Response.json(
          { error: "forbidden" },
          { status: 403, headers: noStore },
        );
      }
      const poll = await createPoll({
        planId: id,
        kind: body.kind || "time",
        question: body.question || "When works?",
        options: body.options || [],
      });
      return Response.json({ poll }, { status: 201, headers: noStore });
    }
    case "vote": {
      if (!body.optionId) {
        return Response.json(
          { error: "option_required" },
          { status: 400, headers: noStore },
        );
      }
      await votePoll(body.optionId, viewer.sub);
      return Response.json(
        { polls: await listPolls(id, viewer.sub) },
        { headers: noStore },
      );
    }
    case "expense": {
      const expense = await addExpense({
        planId: id,
        payerId: viewer.sub,
        description: body.description || "Expense",
        amountCents: Number(body.amountCents) || 0,
      });
      return Response.json({ expense }, { status: 201, headers: noStore });
    }
    default:
      return Response.json(
        { error: "unknown_action" },
        { status: 400, headers: noStore },
      );
  }
}
