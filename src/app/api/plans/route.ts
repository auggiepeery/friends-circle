import { planForViewer } from "@/lib/access";
import { normalizeAudience, type PlanAudience } from "@/lib/audience";
import { noStore, requireViewer } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/csrf";
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
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isReasonablePlanTime } from "@/lib/recurrence";
import { templateById } from "@/lib/templates";

export const dynamic = "force-dynamic";

const MAX_SLOTS = 14;

type SlotInput = { startsAt?: string | null; endsAt?: string | null };

function normalizeSlots(
  body: {
    slots?: SlotInput[];
    startsAt?: string | null;
    endsAt?: string | null;
  },
): { startsAt: string | null; endsAt: string | null }[] {
  if (Array.isArray(body.slots) && body.slots.length > 0) {
    return body.slots.slice(0, MAX_SLOTS).map((slot) => ({
      startsAt:
        typeof slot.startsAt === "string" ? slot.startsAt.slice(0, 40) : null,
      endsAt: typeof slot.endsAt === "string" ? slot.endsAt.slice(0, 40) : null,
    }));
  }
  return [
    {
      startsAt:
        typeof body.startsAt === "string" ? body.startsAt.slice(0, 40) : body.startsAt ?? null,
      endsAt:
        typeof body.endsAt === "string" ? body.endsAt.slice(0, 40) : body.endsAt ?? null,
    },
  ];
}

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  try {
    const plans = await listUpcomingForUser(viewer.sub);
    return Response.json({ plans }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "calendar_failed" },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  if (!rateLimit(clientKey(request, "plans-write"), 20, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }
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
    slots?: SlotInput[];
    template?: string;
    outdoor?: boolean;
    lat?: number | null;
    lon?: number | null;
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

  const slots = normalizeSlots(body);
  for (const slot of slots) {
    if (!isReasonablePlanTime(slot.startsAt) || !isReasonablePlanTime(slot.endsAt)) {
      return Response.json(
        { error: "bad_time_range" },
        { status: 400, headers: noStore },
      );
    }
  }
  const shared = {
    creatorId: viewer.sub,
    title,
    description: clip(body.description ?? tmpl?.description ?? "", MAX_TEXT),
    place: clip(body.place ?? tmpl?.place ?? "", MAX_PLACE),
    template: clip(body.template || tmpl?.id || "custom", 32),
    outdoor: Boolean(body.outdoor ?? tmpl?.outdoor ?? false),
    lat: typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null,
    lon: typeof body.lon === "number" && Number.isFinite(body.lon) ? body.lon : null,
    recurringRule: clip(body.recurringRule, 32),
    audience,
  };

  const plans = [];
  for (const slot of slots) {
    plans.push(
      await createPlan({
        ...shared,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      }),
    );
  }

  const primary = plans[0];
  if (!primary) {
    return Response.json(
      { error: "create_failed" },
      { status: 500, headers: noStore },
    );
  }

  if (body.pollQuestion) {
    const options = Array.isArray(body.pollOptions)
      ? body.pollOptions
          .slice(0, MAX_POLL_OPTIONS)
          .map((o) => clip(o, MAX_POLL_OPTION))
          .filter(Boolean)
      : [];
    if (options.length >= 2) {
      // Attach the optional poll to the first occurrence only.
      await createPoll({
        planId: primary.id,
        kind: clip(body.pollKind, 16) || "time",
        question: clip(body.pollQuestion, 200),
        options,
      });
    }
  }

  const members = await listCircleMembers();
  const audienceLabel = audience === "guest" ? "Guest" : "Fun Peeps";
  const notifyTitle =
    plans.length > 1
      ? `On the calendar: ${primary.title} (${plans.length} days)`
      : `On the calendar: ${primary.title}`;
  const notifyBody =
    plans.length > 1
      ? `${viewer.name} added ${plans.length} ${audienceLabel} plans`
      : `${viewer.name} added a ${audienceLabel} plan`;

  for (const m of members.slice(0, 40)) {
    if (m.user_id === viewer.sub) continue;
    const memberIsGuest = m.role === "guest";
    if (audience === "fun_peeps" && memberIsGuest) continue;
    await notify({
      userId: m.user_id,
      kind: "plan",
      title: notifyTitle,
      body: notifyBody,
      href: `/plans/${primary.id}`,
    });
  }

  return Response.json(
    {
      plan: planForViewer(primary),
      plans: plans.map(planForViewer),
      count: plans.length,
    },
    { status: 201, headers: noStore },
  );
}
