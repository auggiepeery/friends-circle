import { noStore, optionalViewer, requireViewer } from "@/lib/auth";
import { setAvailability } from "@/lib/friends";
import { getProfile } from "@/lib/plans";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return Response.json(
      { viewer: null },
      { headers: noStore },
    );
  }
  const profile = await getProfile(viewer.sub);
  const unread = await sql<{ count: number }>(
    `select count(*)::int as count from notifications where user_id = $1 and read = false`,
    [viewer.sub],
  );
  return Response.json(
    {
      viewer: {
        sub: viewer.sub,
        name: viewer.name,
        email: viewer.email,
        simulated: viewer.simulated,
        availability_hint: profile?.availability_hint ?? "",
        unread: unread[0]?.count ?? 0,
      },
    },
    { headers: noStore },
  );
}

export async function PATCH(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const body = (await request.json()) as { availability_hint?: string };
  if (typeof body.availability_hint === "string") {
    await setAvailability(viewer.sub, body.availability_hint);
  }
  const profile = await getProfile(viewer.sub);
  return Response.json({ profile }, { headers: noStore });
}
