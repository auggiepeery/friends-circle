import { noStore, requireViewer } from "@/lib/auth";
import { createPlan, listUpcomingForUser, notify } from "@/lib/plans";
import { listFriends } from "@/lib/friends";
import { templateById } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const plans = await listUpcomingForUser(viewer.sub);
  return Response.json({ plans }, { headers: noStore });
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const body = (await request.json()) as {
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
  };

  const tmpl = body.template ? templateById(body.template) : undefined;
  const title = (body.title || tmpl?.title || "").trim();
  if (!title) {
    return Response.json(
      { error: "title_required" },
      { status: 400, headers: noStore },
    );
  }

  const plan = await createPlan({
    creatorId: viewer.sub,
    title,
    description: body.description ?? tmpl?.description ?? "",
    place: body.place ?? tmpl?.place ?? "",
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    template: body.template || tmpl?.id || "custom",
    outdoor: body.outdoor ?? tmpl?.outdoor ?? false,
    lat: body.lat,
    lon: body.lon,
    reminderAt: body.reminderAt,
    recurringRule: body.recurringRule,
  });

  if (body.pollQuestion && body.pollOptions?.length) {
    const { createPoll } = await import("@/lib/plans");
    await createPoll({
      planId: plan.id,
      kind: body.pollKind || "time",
      question: body.pollQuestion,
      options: body.pollOptions,
    });
  }

  const friends = await listFriends(viewer.sub);
  for (const f of friends) {
    const friendId = f.user_id === viewer.sub ? f.friend_id : f.user_id;
    await notify({
      userId: friendId,
      kind: "plan",
      title: `New plan: ${plan.title}`,
      body: `${viewer.name} started a plan`,
      href: `/plans/${plan.id}`,
    });
  }

  return Response.json({ plan }, { status: 201, headers: noStore });
}
