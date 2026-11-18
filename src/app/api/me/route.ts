import { noStore, optionalViewer, requireViewer } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/csrf";
import { setAvailability } from "@/lib/friends";
import {
  isCircleMember,
  memberRole,
  requireCircleMember,
  updateDisplayName,
} from "@/lib/group";
import { MAX_HINT, MAX_TITLE, clip, readJsonBounded } from "@/lib/http";
import { getProfile } from "@/lib/plans";
import { hasRoutines } from "@/lib/routines";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return Response.json({ viewer: null }, { headers: noStore });
  }
  const profile = await getProfile(viewer.sub);
  const member = await isCircleMember(viewer.sub);
  const role = member ? await memberRole(viewer.sub) : null;
  const routinesSet = member ? await hasRoutines(viewer.sub) : false;
  const needsRoutines =
    member && (role === "founder" || role === "friend") && !routinesSet;
  const unread = member
    ? await sql<{ count: number }>(
        `select count(*)::int as count
         from notifications n
         where n.user_id = $1
           and n.read = false
           and (
             n.href = ''
             or n.href not like '/plans/%'
             or exists (
               select 1 from plans p
               where n.href = '/plans/' || p.id
                  or n.href like '/plans/' || p.id || '/%'
             )
           )`,
        [viewer.sub],
      )
    : [{ count: 0 }];
  return Response.json(
    {
      viewer: {
        sub: viewer.sub,
        name: viewer.name,
        email: viewer.email,
        simulated: viewer.simulated,
        via: viewer.via,
        member,
        role,
        availability_hint: profile?.availability_hint ?? "",
        has_routines: routinesSet,
        needs_routines: Boolean(needsRoutines),
        unread: unread[0]?.count ?? 0,
      },
    },
    { headers: noStore },
  );
}

export async function PATCH(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  if (!rateLimit(clientKey(request, "me-write"), 30, 60_000)) {
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
    availability_hint?: string;
    display_name?: string;
  }>(request);
  if (body instanceof Response) return body;

  if (typeof body.display_name === "string") {
    const result = await updateDisplayName(
      viewer.sub,
      clip(body.display_name, MAX_TITLE),
    );
    if (!result.ok) {
      const status = result.error === "name_taken" ? 409 : 400;
      return Response.json({ error: result.error }, { status, headers: noStore });
    }
  }

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
