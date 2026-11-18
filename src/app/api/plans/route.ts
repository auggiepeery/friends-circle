import { planForViewer } from "@/lib/access";
import { normalizeAudience, type PlanAudience } from "@/lib/audience";
import { noStore, requireViewer } from "@/lib/auth";
import { listCircleMembers, memberRole, requireCircleMember } from "@/lib/group";
import {
  MAX_PLACE,
  MAX_POLL_OPTIONS,
  MAX_POLL_OPTION,
  MAX_TEXT,
  MAX_TITLE,
  clip,
  readJsonBounded,
} from "@/lib/http";
import { createPlan, createPoll, listUpcomingForUser, notify } from "@/lib/plans";
import { templateById } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  const plans = await listUpcomingForUser(viewer.sub);
  return Response.json({ plans }, { headers: noStore });
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  const body = await readJsonBounded<{
    title?: string;
    description?: string;
    place?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    template?: string;
    outdoor?: boolean;
    lat?: number | null;
    lon?: number | null;
    reminderAt?: string | null;
    recurringRule?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    pollKind?: string;
    audience?: string;
  }>(request);
  if (body instanceof Response) return body;

  const role = await memberRole(viewer.sub);
  let audience: PlanAudience = normalizeAudience(body.audience);
  // Guests may only create Guest plans.
  if (role === "guest") audience = "guest";
  if (role !== "guest" && body.audience !== undefined) {
    audience = normalizeAudience(body.audience);
  }

  const tmpl = body.template ? templateById(clip(body.template, 32)) : undefined;
  const title = clip(body.title || tmpl?.title || "", MAX_TITLE);
  if (!title) {
    return Response.json(
      { error: "title_required" },
      { status: 400, headers: noStore },
    );
  }

  const plan = await createPlan({
    creatorId: viewer.sub,
    title,
    description: clip(body.description ?? tmpl?.description ?? "", MAX_TEXT),
    place: clip(body.place ?? tmpl?.place ?? "", MAX_PLACE),
    startsAt: typeof body.startsAt === "string" ? body.startsAt.slice(0, 40) : body.startsAt,
    endsAt: typeof body.endsAt === "string" ? body.endsAt.slice(0, 40) : body.endsAt,
    template: clip(body.template || tmpl?.id || "custom", 32),
    outdoor: Boolean(body.outdoor ?? tmpl?.outdoor ?? false),
    lat: typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null,
    lon: typeof body.lon === "number" && Number.isFinite(body.lon) ? body.lon : null,
    reminderAt:
      typeof body.reminderAt === "string" ? body.reminderAt.slice(0, 40) : body.reminderAt,
    recurringRule: clip(body.recurringRule, 32),
    audience,
  });

  if (body.pollQuestion) {
    const options = Array.isArray(body.pollOptions)
      ? body.pollOptions
          .slice(0, MAX_POLL_OPTIONS)
          .map((o) => clip(o, MAX_POLL_OPTION))
          .filter(Boolean)
      : [];
    if (options.length >= 2) {
      await createPoll({
        planId: plan.id,
        kind: clip(body.pollKind, 16) || "time",
        question: clip(body.pollQuestion, 200),
        options,
      });
    }
  }

  const members = await listCircleMembers();
  for (const m of members.slice(0, 40)) {
    if (m.user_id === viewer.sub) continue;
    const memberIsGuest = m.role === "guest";
    // Fun Peeps plans: skip guests. Guest plans: notify everyone who can see them.
    if (audience === "fun_peeps" && memberIsGuest) continue;
    await notify({
      userId: m.user_id,
      kind: "plan",
      title: `On the calendar: ${plan.title}`,
      body: `${viewer.name} added a ${audience === "guest" ? "Guest" : "Fun Peeps"} plan`,
      href: `/plans/${plan.id}`,
    });
  }

  return Response.json(
    { plan: planForViewer(plan) },
    { status: 201, headers: noStore },
  );
}
