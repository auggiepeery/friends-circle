import { noStore, requireViewer } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/csrf";
import { guestCookieHeader } from "@/lib/guest";
import {
  addNamedFriend,
  changeOwnPassword,
  getInviteCode,
  getSessionVersion,
  listCircleMembers,
  requireCircleMember,
  requireNamedMember,
  rotateInviteCode,
} from "@/lib/group";
import { MAX_TITLE, clip, readJsonBounded } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const members = await listCircleMembers();
  const named = await requireNamedMember(viewer.sub);
  const inviteCode = named === true ? await getInviteCode() : "";
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      circle: { id: "circle_default", name: "Fun Peepers" },
      members,
      inviteCode,
      inviteUrl: inviteCode ? `${origin}/join/${inviteCode}` : "",
      canManage: named === true,
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  if (!rateLimit(clientKey(request, "circle-write"), 30, 60_000)) {
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
    action?: string;
    name?: string;
    password?: string;
    currentPassword?: string;
    newPassword?: string;
  }>(request);
  if (body instanceof Response) return body;

  const action = body.action || "add_friend";

  if (action === "change_password") {
    const result = await changeOwnPassword(
      viewer.sub,
      clip(body.currentPassword, 200),
      clip(body.newPassword, 200),
    );
    if (!result.ok) {
      const status = result.error === "forbidden" ? 403 : 400;
      return Response.json({ error: result.error }, { status, headers: noStore });
    }
    // Issue a fresh cookie with the bumped session_version; old cookies fail.
    const sessionVersion = await getSessionVersion(viewer.sub);
    return Response.json(
      { ok: true },
      {
        headers: {
          ...noStore,
          "set-cookie": guestCookieHeader(viewer.sub, sessionVersion),
        },
      },
    );
  }

  if (action === "rotate_invite") {
    const named = await requireNamedMember(viewer.sub);
    if (named !== true) return named;
    const inviteCode = await rotateInviteCode();
    const origin = new URL(request.url).origin;
    return Response.json(
      {
        ok: true,
        inviteCode,
        inviteUrl: `${origin}/join/${inviteCode}`,
      },
      { headers: noStore },
    );
  }

  if (action === "add_friend") {
    const named = await requireNamedMember(viewer.sub);
    if (named !== true) return named;

    const result = await addNamedFriend(
      clip(body.name, MAX_TITLE),
      clip(body.password, 200),
    );
    if (!result.ok) {
      const status =
        result.error === "name_taken"
          ? 409
          : result.error === "password_short"
            ? 400
            : 400;
      return Response.json({ error: result.error }, { status, headers: noStore });
    }

    return Response.json(
      { ok: true, friend: { id: result.id, name: result.name } },
      { status: 201, headers: noStore },
    );
  }

  return Response.json(
    { error: "unsupported" },
    { status: 400, headers: noStore },
  );
}
