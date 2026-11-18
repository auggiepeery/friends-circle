import { noStore, requireViewer } from "@/lib/auth";
import {
  getInviteCode,
  isCircleMember,
  joinWithInvite,
  listCircleMembers,
  requireCircleMember,
} from "@/lib/group";
import { clip, readJsonBounded } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const members = await listCircleMembers();
  const inviteCode = await getInviteCode();
  const url = new URL(request.url);
  const origin = url.origin;
  return Response.json(
    {
      circle: { id: "circle_default", name: "Fun Peepers" },
      members,
      inviteCode,
      inviteUrl: `${origin}/join/${inviteCode}`,
    },
    { headers: noStore },
  );
}

/** Redeem invite code (or founder bootstrap when circle is empty). */
export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const body = await readJsonBounded<{ inviteCode?: string }>(request);
  if (body instanceof Response) return body;

  const result = await joinWithInvite(
    viewer.sub,
    clip(body.inviteCode, 80),
  );
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: 403, headers: noStore },
    );
  }

  const member = await isCircleMember(viewer.sub);
  const inviteCode = result.founder ? await getInviteCode() : undefined;
  return Response.json(
    {
      ok: true,
      founder: result.founder,
      member,
      inviteCode,
      inviteUrl: inviteCode
        ? `${new URL(request.url).origin}/join/${inviteCode}`
        : undefined,
    },
    { headers: noStore },
  );
}
