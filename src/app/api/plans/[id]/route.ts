import { canAccessPlan, planForViewer } from "@/lib/access";
import { noStore, requireViewer } from "@/lib/auth";
import { memberRole } from "@/lib/group";
import {
  MAX_PLACE,
  MAX_POLL_OPTIONS,
  MAX_POLL_OPTION,
  MAX_TEXT,
  MAX_TITLE,
  clip,
  readJsonBounded,
} from "@/lib/http";
import {
  addComment,
  addExpense,
  createPoll,
  deletePlan,
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

async function loadAuthorizedPlan(request: Request, id: string) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return { error: viewer as Response };
  const plan = await getPlan(id);
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
  const auth = await loadAuthorizedPlan(request, id);
  if ("error" in auth && auth.error) return auth.error;
  const { viewer, plan } = auth as {
    viewer: { sub: string; name: string };
    plan: NonNullable<Awaited<ReturnType<typeof getPlan>>>;
  };
  const [rsvps, comments, polls, expenses] = await Promise.all([
    listRsvps(id),
    listComments(id),
    listPolls(id, viewer.sub),
    listExpenses(id),
  ]);
  return Response.json(
    {
      plan: planForViewer(plan),
      rsvps,
      comments,
      polls,
      expenses,
    },
    { headers: noStore },
  );
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await loadAuthorizedPlan(request, id);
  if ("error" in auth && auth.error) return auth.error;
  const { viewer, plan } = auth as {
    viewer: { sub: string; name: string };
    plan: NonNullable<Awaited<ReturnType<typeof getPlan>>>;
  };
  const role = await memberRole(viewer.sub);
  const canDelete =
    plan.creator_id === viewer.sub || role === "founder";
  if (!canDelete) {
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: noStore },
    );
  }
  const ok = await deletePlan(id);
  if (!ok) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: noStore },
    );
  }
  return Response.json({ ok: true }, { headers: noStore });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await loadAuthorizedPlan(request, id);
  if ("error" in auth && auth.error) return auth.error;
  const { viewer, plan } = auth as {
    viewer: { sub: string; name: string };
    plan: NonNullable<Awaited<ReturnType<typeof getPlan>>>;
  };
  if (plan.creator_id !== viewer.sub) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  const body = await readJsonBounded<Record<string, unknown>>(request);
  if (body instanceof Response) return body;
  const updated = await updatePlan(id, {
    title: clip(body.title, MAX_TITLE) || undefined,
    description: clip(body.description, MAX_TEXT) || undefined,
    place: clip(body.place, MAX_PLACE) || undefined,
    startsAt:
      body.startsAt === null || typeof body.startsAt === "string"
        ? (body.startsAt as string | null)
        : undefined,
    endsAt:
      body.endsAt === null || typeof body.endsAt === "string"
        ? (body.endsAt as string | null)
        : undefined,
    outdoor: typeof body.outdoor === "boolean" ? body.outdoor : undefined,
    recurringRule:
      typeof body.recurringRule === "string"
        ? clip(body.recurringRule, 32)
        : undefined,
    status: typeof body.status === "string" ? clip(body.status, 32) : undefined,
  });
  return Response.json(
    { plan: updated ? planForViewer(updated) : null },
    { headers: noStore },
  );
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await loadAuthorizedPlan(request, id);
  if ("error" in auth && auth.error) return auth.error;
  const { viewer, plan } = auth as {
    viewer: { sub: string; name: string };
    plan: NonNullable<Awaited<ReturnType<typeof getPlan>>>;
  };
  const body = await readJsonBounded<{
    action?: string;
    response?: string;
    body?: string;
    kind?: string;
    question?: string;
    options?: string[];
    optionId?: string;
    description?: string;
    amountCents?: number;
  }>(request);
  if (body instanceof Response) return body;

  switch (body.action) {
    case "rsvp": {
      const response = clip(body.response, 16) || "going";
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
      const text = clip(body.body, MAX_TEXT);
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
      // Any circle member can add a poll to an existing plan.
      const options = Array.isArray(body.options)
        ? body.options
            .slice(0, MAX_POLL_OPTIONS)
            .map((o) => clip(o, MAX_POLL_OPTION))
            .filter(Boolean)
        : [];
      if (options.length < 2) {
        return Response.json(
          { error: "need_options" },
          { status: 400, headers: noStore },
        );
      }
      const question = clip(body.question, 200);
      if (!question) {
        return Response.json(
          { error: "question_required" },
          { status: 400, headers: noStore },
        );
      }
      const poll = await createPoll({
        planId: id,
        kind: clip(body.kind, 16) || "time",
        question,
        options,
      });
      if (plan.creator_id !== viewer.sub) {
        await notify({
          userId: plan.creator_id,
          kind: "poll",
          title: `New poll on ${plan.title}`,
          body: question.slice(0, 80),
          href: `/plans/${id}`,
        });
      }
      return Response.json({ poll }, { status: 201, headers: noStore });
    }
    case "vote": {
      const optionId = clip(body.optionId, 80);
      if (!optionId) {
        return Response.json(
          { error: "option_required" },
          { status: 400, headers: noStore },
        );
      }
      const ok = await votePoll(optionId, viewer.sub, id);
      if (!ok) {
        return Response.json(
          { error: "not_found" },
          { status: 404, headers: noStore },
        );
      }
      return Response.json(
        { polls: await listPolls(id, viewer.sub) },
        { headers: noStore },
      );
    }
    case "expense": {
      const expense = await addExpense({
        planId: id,
        payerId: viewer.sub,
        description: clip(body.description, 200) || "Expense",
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
