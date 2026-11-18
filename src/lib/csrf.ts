import { noStore } from "./auth";

/**
 * Reject cross-site state changes that arrive with the session cookie.
 * Same-origin fetch sends Origin; we also accept a matching Referer.
 */
export function requireSameOrigin(request: Request): Response | null {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === expected) return null;
    return Response.json(
      { error: "csrf_origin" },
      { status: 403, headers: noStore },
    );
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === expected) return null;
    } catch {
      /* fall through */
    }
    return Response.json(
      { error: "csrf_origin" },
      { status: 403, headers: noStore },
    );
  }
  // No Origin/Referer — refuse cookie-authenticated writes (blocks opaque CSRF).
  return Response.json(
    { error: "csrf_origin" },
    { status: 403, headers: noStore },
  );
}
