import { noStore } from "@/lib/auth";
import { guestCookieHeader } from "@/lib/guest";
import { MAX_TITLE, clip, readJsonBounded } from "@/lib/http";
import {
  previewHangInvite,
  redeemHangInvite,
} from "@/lib/plan-guest-invites";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Public hang-invite preview — no circle leakage on bad tokens. */
export async function GET(request: Request, ctx: Ctx) {
  if (!rateLimit(clientKey(request, "hang-preview"), 40, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }
  const { token } = await ctx.params;
  const preview = await previewHangInvite(decodeURIComponent(token || ""));
  if (preview.status !== "ok") {
    return Response.json(
      { status: preview.status },
      { status: 410, headers: noStore },
    );
  }
  return Response.json(preview, { headers: noStore });
}

/** Redeem hang invite → guest session. */
export async function POST(request: Request, ctx: Ctx) {
  if (!rateLimit(clientKey(request, "hang-join"), 12, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }

  const { token } = await ctx.params;
  const body = await readJsonBounded<{ name?: string }>(request);
  if (body instanceof Response) return body;

  const result = await redeemHangInvite(
    clip(body.name, MAX_TITLE),
    decodeURIComponent(token || ""),
  );
  if (!result.ok) {
    const status =
      result.error === "name_required"
        ? 400
        : result.error === "expired" || result.error === "revoked"
          ? 410
          : 403;
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
      planId: result.planId,
    },
    {
      status: 201,
      headers: {
        ...noStore,
        "set-cookie": guestCookieHeader(result.userId, result.sessionVersion),
      },
    },
  );
}
