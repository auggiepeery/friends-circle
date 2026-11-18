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
import { clientKey, rateLimit } from "@/lib/rate-limit";

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
  name?: string;
  password?: string;
  inviteCode?: string;
};

/** Sign-in: friend (name+password), guest (invite+name), or founder secret. */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "session"), 20, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }

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
  const name = clip(body.name, MAX_TITLE);

  if (mode === "friend") {
    const result = await signInAsFriend(name, password);
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: 403, headers: noStore },
      );
    }
    const member = await isCircleMember(result.userId);
    return Response.json(
      {
        viewer: {
          sub: result.userId,
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
          "set-cookie": guestCookieHeader(
            result.userId,
            result.sessionVersion,
          ),
        },
      },
    );
  }

  if (mode === "guest") {
    const result = await signInAsGuest(name, clip(body.inviteCode, 80));
    if (!result.ok) {
      const status = result.error === "name_required" ? 400 : 403;
      return Response.json(
        { error: result.error },
        { status, headers: noStore },
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
          "set-cookie": guestCookieHeader(
            result.userId,
            result.sessionVersion,
          ),
        },
      },
    );
  }

  if (mode === "founder") {
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
          "set-cookie": guestCookieHeader(
            result.userId,
            result.sessionVersion,
          ),
        },
      },
    );
  }

  return Response.json(
    { error: "mode_required" },
    { status: 400, headers: noStore },
  );
}
