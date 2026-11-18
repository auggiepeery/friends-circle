import { noStore, requireViewer } from "@/lib/auth";
import { joinDefaultCircle, listCircleMembers } from "@/lib/group";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  await joinDefaultCircle(viewer.sub);
  const members = await listCircleMembers();
  return Response.json(
    { circle: { id: "circle_default", name: "Fun Peepers" }, members },
    { headers: noStore },
  );
}
