import { noStore, requireViewer } from "@/lib/auth";
import {
  inviteFriend,
  listFriends,
  listPending,
  respondInvite,
  searchPeople,
} from "@/lib/friends";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q) {
    const people = await searchPeople(viewer.sub, q);
    return Response.json({ people }, { headers: noStore });
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
  const body = (await request.json()) as {
    action?: string;
    emailOrName?: string;
    friendshipId?: string;
    accept?: boolean;
  };

  if (body.action === "invite") {
    const result = await inviteFriend(viewer.sub, body.emailOrName || "");
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
    const ok = await respondInvite(
      body.friendshipId || "",
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
