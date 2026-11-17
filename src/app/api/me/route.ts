import { noStore, optionalViewer, requireViewer } from "@/lib/auth";
import { setAvailability } from "@/lib/friends";
import { MAX_HINT, clip, readJsonBounded } from "@/lib/http";
import { getProfile } from "@/lib/plans";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return Response.json({ viewer: null }, { headers: noStore });
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
        via: viewer.via,
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
  const body = await readJsonBounded<{ availability_hint?: string }>(request);
  if (body instanceof Response) return body;
  if (typeof body.availability_hint === "string") {
    await setAvailability(viewer.sub, clip(body.availability_hint, MAX_HINT));
  }
  const profile = await getProfile(viewer.sub);
  return Response.json(
    {
      profile: profile
        ? {
            id: profile.id,
            display_name: profile.display_name,
            availability_hint: profile.availability_hint,
          }
        : null,
    },
    { headers: noStore },
  );
}
