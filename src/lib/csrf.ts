import { noStore } from "./auth";

function csrfReject(): Response {
  return Response.json(
    { error: "csrf_origin" },
    { status: 403, headers: noStore },
  );
}

/** First hop of a possibly comma-separated forwarded header. */
function firstHeaderValue(raw: string | null): string {
  if (!raw) return "";
  return raw.split(",")[0]?.trim() || "";
}

/**
 * Hostnames this request is considered to be for.
 * Prefer proxy-forwarded Host over request.url — on Cursor/app hosting the
 * internal URL is often http://127.0.0.1:… while the browser Origin is the
 * public https://….apps.grok.bot host.
 */
export function requestHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (raw: string | null) => {
    const value = firstHeaderValue(raw).toLowerCase();
    if (value) hosts.add(value);
  };
  add(request.headers.get("x-forwarded-host"));
  add(request.headers.get("host"));
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    /* ignore bad request.url */
  }
  return hosts;
}

/** Public site origin for invite links (not the internal listen URL). */
export function publicRequestOrigin(request: Request): string {
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host"));
  if (host) {
    const proto =
      firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
      (new URL(request.url).protocol === "https:" ? "https" : "http");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

function originHostAllowed(originOrReferer: string, allowed: Set<string>): boolean {
  try {
    const host = new URL(originOrReferer).host.toLowerCase();
    return allowed.has(host);
  } catch {
    return false;
  }
}

/**
 * Reject cross-site state changes that arrive with the session cookie.
 * Same-origin fetch sends Origin; we also accept a matching Referer.
 *
 * Compare browser Origin/Referer host to Host / X-Forwarded-Host (and
 * request.url host as a fallback). Do not require a full origin string match
 * against request.url — that breaks behind reverse proxies.
 */
export function requireSameOrigin(request: Request): Response | null {
  const allowed = requestHosts(request);
  if (allowed.size === 0) return csrfReject();

  const origin = request.headers.get("origin");
  if (origin) {
    return originHostAllowed(origin, allowed) ? null : csrfReject();
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return originHostAllowed(referer, allowed) ? null : csrfReject();
  }

  // No Origin/Referer — refuse cookie-authenticated writes (blocks opaque CSRF).
  return csrfReject();
}
