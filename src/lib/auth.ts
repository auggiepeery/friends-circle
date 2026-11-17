import {
  getIdentity,
  requireIdentity,
  type VerifiedIdentity,
} from "../../cursor/identity";
import { sql } from "./db";

export type Viewer = {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
  kind: "person" | "key";
};

export async function requireViewer(
  request: Request,
): Promise<Viewer | Response> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  if (identity.kind === "key") {
    return Response.json(
      { error: "person_required" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  const viewer = toViewer(identity);
  await ensureProfile(viewer);
  return viewer;
}

export async function optionalViewer(request: Request): Promise<Viewer | null> {
  const identity = await getIdentity(request);
  if (!identity.verified || identity.kind === "key") return null;
  const viewer = toViewer(identity);
  await ensureProfile(viewer);
  return viewer;
}

function toViewer(identity: VerifiedIdentity): Viewer {
  return {
    sub: identity.sub,
    email: identity.email,
    name: identity.name || identity.email.split("@")[0] || "Friend",
    simulated: identity.simulated,
    kind: identity.kind,
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

export const noStore = { "cache-control": "private, no-store" } as const;
