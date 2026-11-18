import { noStore, requireViewer } from "@/lib/auth";
import { listPlansInRange, listUpcomingForUser } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;

  const url = new URL(request.url);
  const from = (url.searchParams.get("from") || "").slice(0, 40);
  const to = (url.searchParams.get("to") || "").slice(0, 40);

  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return Response.json(
        { error: "bad_range" },
        { status: 400, headers: noStore },
      );
    }
    // Cap range to ~70 days to bound load
    const maxMs = 70 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > maxMs) {
      return Response.json(
        { error: "range_too_large" },
        { status: 400, headers: noStore },
      );
    }
    const plans = await listPlansInRange(
      viewer.sub,
      fromDate.toISOString(),
      toDate.toISOString(),
    );
    return Response.json({ plans }, { headers: noStore });
  }

  const plans = await listUpcomingForUser(viewer.sub);
  return Response.json({ plans }, { headers: noStore });
}
