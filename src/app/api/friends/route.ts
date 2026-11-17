import { noStore, requireViewer } from "@/lib/auth";
import {
  inviteFriend,
  listFriends,
  listPending,
  respondInvite,
} from "@/lib/friends";
import { MAX_QUERY, clip, readJsonBounded } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  // Substring people-search removed: it leaked emails to any signed-in visitor.
  // Invites use exact email/name match server-side via POST only.
  if (new URL(request.url).searchParams.has("q")) {
    return Response.json(
      { error: "search_disabled" },
      { status: 400, headers: noStore },
    );
  }
  const [friends, pending] = await Promise.all([
    listFriends(viewer.sub),
    listPending(viewer.sub),
  ]);
  return Response.json({ friends, pending }, { headers: noStore });
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const body = await readJsonBounded<{
    action?: string;
    emailOrName?: string;
    friendshipId?: string;
    accept?: boolean;
  }>(request);
  if (body instanceof Response) return body;

  if (body.action === "invite") {
    const result = await inviteFriend(
      viewer.sub,
      clip(body.emailOrName, MAX_QUERY),
    );
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: 400, headers: noStore },
      );
    }
    return Response.json(
      { friendship: result.friendship },
      { status: 201, headers: noStore },
    );
  }

  if (body.action === "respond") {
    const friendshipId = clip(body.friendshipId, 80);
    if (!friendshipId) {
      return Response.json(
        { error: "not_found" },
        { status: 404, headers: noStore },
      );
    }
    const ok = await respondInvite(
      friendshipId,
      viewer.sub,
      Boolean(body.accept),
    );
    if (!ok) {
      return Response.json(
        { error: "not_found" },
        { status: 404, headers: noStore },
      );
    }
    return Response.json({ ok: true }, { headers: noStore });
  }

  return Response.json(
    { error: "unknown_action" },
    { status: 400, headers: noStore },
  );
}
