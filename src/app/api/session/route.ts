import { noStore, optionalViewer } from "@/lib/auth";
import {
  clearGuestCookieHeader,
  guestCookieHeader,
} from "@/lib/guest";
import {
  isCircleMember,
  signInAsFounder,
  signInAsFriend,
  signInAsGuest,
} from "@/lib/group";
import { MAX_TITLE, clip, readJsonBounded } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return Response.json({ viewer: null }, { headers: noStore });
  }
  const member = await isCircleMember(viewer.sub);
  return Response.json(
    {
      viewer: {
        sub: viewer.sub,
        name: viewer.name,
        email: viewer.email,
        simulated: viewer.simulated,
        via: viewer.via,
        member,
      },
    },
    { headers: noStore },
  );
}

type SessionBody = {
  action?: string;
  mode?: "friend" | "guest" | "founder";
  friendId?: string;
  name?: string;
  password?: string;
};

/** Picker sign-in: friend (+ password=name), guest (typed name), or founder secret. */
export async function POST(request: Request) {
  const body = await readJsonBounded<SessionBody>(request);
  if (body instanceof Response) return body;

  if (body.action === "sign_out") {
    return Response.json(
      { ok: true },
      {
        headers: {
          ...noStore,
          "set-cookie": clearGuestCookieHeader(),
        },
      },
    );
  }

  const mode = body.mode;
  const password = clip(body.password, 200);

  if (mode === "friend") {
    const friendId = clip(body.friendId, 80);
    if (!friendId) {
      return Response.json(
        { error: "friend_required" },
        { status: 400, headers: noStore },
      );
    }
    const result = await signInAsFriend(friendId, password);
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: 403, headers: noStore },
      );
    }
    const member = await isCircleMember(friendId);
    return Response.json(
      {
        viewer: {
          sub: friendId,
          name: result.name,
          email: "",
          simulated: false,
          via: "friend",
          member,
        },
      },
      {
        headers: {
          ...noStore,
          "set-cookie": guestCookieHeader(friendId),
        },
      },
    );
  }

  if (mode === "guest") {
    const name = clip(body.name, MAX_TITLE);
    const result = await signInAsGuest(name);
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: 400, headers: noStore },
      );
    }
    return Response.json(
      {
        viewer: {
          sub: result.userId,
          name: result.name,
          email: "",
          simulated: false,
          via: "guest",
          member: true,
        },
      },
      {
        status: 201,
        headers: {
          ...noStore,
          "set-cookie": guestCookieHeader(result.userId),
        },
      },
    );
  }

  if (mode === "founder") {
    const name = clip(body.name, MAX_TITLE);
    const result = await signInAsFounder(password, name || undefined);
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: 403, headers: noStore },
      );
    }
    return Response.json(
      {
        viewer: {
          sub: result.userId,
          name: result.name,
          email: "",
          simulated: false,
          via: "friend",
          member: true,
        },
        founded: result.founded,
      },
      {
        headers: {
          ...noStore,
          "set-cookie": guestCookieHeader(result.userId),
        },
      },
    );
  }

  return Response.json(
    { error: "mode_required" },
    { status: 400, headers: noStore },
  );
}
