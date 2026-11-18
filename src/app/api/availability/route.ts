import { noStore, requireViewer } from "@/lib/auth";
import { getDayAvailability } from "@/lib/availability";
import { memberRole, requireCircleMember } from "@/lib/group";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { hasRoutines } from "@/lib/routines";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!rateLimit(clientKey(request, "availability-read"), 90, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const url = new URL(request.url);
  const day = (url.searchParams.get("day") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return Response.json(
      { error: "bad_day" },
      { status: 400, headers: noStore },
    );
  }

  const result = await getDayAvailability(viewer.sub, day);
  if ("error" in result) {
    return Response.json(
      { error: result.error },
      { status: 400, headers: noStore },
    );
  }

  const role = await memberRole(viewer.sub);
  const viewerHasRoutines = await hasRoutines(viewer.sub);
  const needsRoutines =
    (role === "founder" || role === "friend") && !viewerHasRoutines;

  return Response.json(
    {
      ...result,
      viewer: {
        role,
        has_routines: viewerHasRoutines,
        needs_routines: needsRoutines,
      },
    },
    { headers: noStore },
  );
}
