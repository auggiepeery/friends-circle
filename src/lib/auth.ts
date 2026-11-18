import { getIdentity, type VerifiedIdentity } from "../../cursor/identity";
import { sql } from "./db";
import { getProfile } from "./plans";
import { readGuestId } from "./guest";

export type Viewer = {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
  kind: "person" | "key";
  via: "cursor" | "guest" | "friend";
};

export const noStore = { "cache-control": "private, no-store" } as const;

function viaForId(id: string): "guest" | "friend" {
  return id.startsWith("guest:") ? "guest" : "friend";
}

/** Prefer signed picker/guest cookie; Cursor identity is a local fallback only. */
export async function optionalViewer(request: Request): Promise<Viewer | null> {
  const sessionId = readGuestId(request);
  if (sessionId) {
    const profile = await getProfile(sessionId);
    return {
      sub: sessionId,
      email: profile?.email || "",
      name: profile?.display_name || "Friend",
      simulated: false,
      kind: "person",
      via: viaForId(sessionId),
    };
  }

  const identity = await getIdentity(request);
  if (identity.verified && identity.kind === "person") {
    const viewer = toViewer(identity);
    await ensureProfile(viewer);
    return viewer;
  }

  return null;
}

export async function requireViewer(
  request: Request,
): Promise<Viewer | Response> {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return Response.json(
      { error: "sign_in_required" },
      { status: 401, headers: noStore },
    );
  }
  return viewer;
}

function toViewer(identity: VerifiedIdentity): Viewer {
  return {
    sub: identity.sub,
    email: identity.email,
    name: identity.name || identity.email.split("@")[0] || "Friend",
    simulated: identity.simulated,
    kind: identity.kind,
    via: "cursor",
  };
}

async function ensureProfile(viewer: Viewer): Promise<void> {
  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, $2, $3)
     on conflict (id) do update set
       email = excluded.email,
       display_name = case
         when profiles.display_name = '' then excluded.display_name
         else profiles.display_name
       end`,
    [viewer.sub, viewer.email, viewer.name],
  );
}
