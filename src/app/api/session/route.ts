import { noStore, optionalViewer } from "@/lib/auth";
import {
  clearGuestCookieHeader,
  guestCookieHeader,
  newGuestId,
} from "@/lib/guest";
import { MAX_TITLE, clip, readJsonBounded } from "@/lib/http";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await optionalViewer(request);
  return Response.json(
    {
      viewer: viewer
        ? {
            sub: viewer.sub,
            name: viewer.name,
            email: viewer.email,
            simulated: viewer.simulated,
            via: viewer.via,
          }
        : null,
    },
    { headers: noStore },
  );
}

/** Public friend sign-in: pick a display name; cookie-bound guest profile. */
export async function POST(request: Request) {
  const body = await readJsonBounded<{
    action?: string;
    name?: string;
  }>(request);
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

  const name = clip(body.name, MAX_TITLE);
  if (name.length < 2) {
    return Response.json(
      { error: "name_required" },
      { status: 400, headers: noStore },
    );
  }

  const existing = await optionalViewer(request);
  if (existing?.via === "cursor") {
    return Response.json(
      {
        viewer: {
          sub: existing.sub,
          name: existing.name,
          email: existing.email,
          simulated: existing.simulated,
          via: existing.via,
        },
      },
      { headers: noStore },
    );
  }

  const guestId = existing?.via === "guest" ? existing.sub : newGuestId();
  await sql(
    `insert into profiles (id, email, display_name)
     values ($1, '', $2)
     on conflict (id) do update set display_name = excluded.display_name`,
    [guestId, name],
  );

  return Response.json(
    {
      viewer: {
        sub: guestId,
        name,
        email: "",
        simulated: false,
        via: "guest",
      },
    },
    {
      status: existing ? 200 : 201,
      headers: {
        ...noStore,
        "set-cookie": guestCookieHeader(guestId),
      },
    },
  );
}
