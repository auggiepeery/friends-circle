import { noStore, requireViewer } from "@/lib/auth";
import { requireCircleMember } from "@/lib/group";
import { listWeekendForUser } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  try {
    const plans = await listWeekendForUser(viewer.sub);
    return Response.json({ plans }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "calendar_failed" },
      { status: 500, headers: noStore },
    );
  }
}
