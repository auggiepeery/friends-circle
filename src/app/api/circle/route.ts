import { noStore, requireViewer } from "@/lib/auth";
import {
  addNamedFriend,
  getInviteCode,
  listCircleMembers,
  requireCircleMember,
} from "@/lib/group";
import { MAX_TITLE, clip, readJsonBounded } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const members = await listCircleMembers();
  const inviteCode = await getInviteCode();
  const origin = new URL(request.url).origin;
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

/** Add a named friend to the sign-in picker (password = their display name). */
export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const body = await readJsonBounded<{ name?: string; action?: string }>(
    request,
  );
  if (body instanceof Response) return body;

  const action = body.action || "add_friend";
  if (action !== "add_friend") {
    return Response.json(
      { error: "unsupported" },
      { status: 400, headers: noStore },
    );
  }

  const result = await addNamedFriend(clip(body.name, MAX_TITLE));
  if (!result.ok) {
    const status = result.error === "name_taken" ? 409 : 400;
    return Response.json({ error: result.error }, { status, headers: noStore });
  }

  return Response.json(
    { ok: true, friend: { id: result.id, name: result.name } },
    { status: 201, headers: noStore },
  );
}
