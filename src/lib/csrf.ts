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

/** Lowercase host without port (handles IPv6 brackets loosely). */
function normalizeHost(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[") && value.includes("]")) {
    return value.slice(0, value.indexOf("]") + 1);
  }
  // hostname:port → hostname (but leave bare IPv4 as-is)
  const colon = value.lastIndexOf(":");
  if (colon > -1 && value.indexOf(":") === colon) {
    return value.slice(0, colon);
  }
  return value;
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
    const value = normalizeHost(firstHeaderValue(raw));
    if (value) hosts.add(value);
  };
  add(request.headers.get("x-forwarded-host"));
  add(request.headers.get("x-original-host"));
  add(request.headers.get("host"));
  try {
    hosts.add(normalizeHost(new URL(request.url).host));
  } catch {
    /* ignore bad request.url */
  }
  const configured = normalizeHost(
    (process.env.PUBLIC_APP_HOST || process.env.VERCEL_URL || "").trim(),
  );
  if (configured) hosts.add(configured);
  return hosts;
}

/** Public site origin for invite links (not the internal listen URL). */
export function publicRequestOrigin(request: Request): string {
  const host =
    normalizeHost(firstHeaderValue(request.headers.get("x-forwarded-host"))) ||
    normalizeHost(firstHeaderValue(request.headers.get("host")));
  if (host) {
    const proto =
      firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
      (new URL(request.url).protocol === "https:" ? "https" : "http");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

function originHost(originOrReferer: string): string | null {
  try {
    return normalizeHost(new URL(originOrReferer).host);
  } catch {
    return null;
  }
}

/**
 * Cursor/app hosting sometimes omits X-Forwarded-Host, so requestHosts only
 * contains 127.0.0.1 while the browser Origin is https://slug.apps.grok.bot.
 * Cookies are host-only (no Domain=), so accepting *.apps.grok.bot Origin is
 * still same-site for CSRF — other apps.grok.bot hosts do not send our cookie.
 */
function isCursorAppHost(host: string): boolean {
  return host === "apps.grok.bot" || host.endsWith(".apps.grok.bot");
}

function originAllowed(originOrReferer: string, allowed: Set<string>): boolean {
  const host = originHost(originOrReferer);
  if (!host) return false;
  if (allowed.has(host)) return true;
  try {
    const url = new URL(originOrReferer);
    if (url.protocol === "https:" && isCursorAppHost(host)) return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Reject cross-site state changes that arrive with the session cookie.
 * Same-origin fetch sends Origin; we also accept a matching Referer.
 *
 * Compare browser Origin/Referer host to Host / X-Forwarded-Host (and
 * request.url host as a fallback). Also accept https://*.apps.grok.bot when
 * the reverse proxy does not forward the public hostname.
 */
export function requireSameOrigin(request: Request): Response | null {
  const allowed = requestHosts(request);
  if (allowed.size === 0) return csrfReject();

  const origin = request.headers.get("origin");
  if (origin) {
    return originAllowed(origin, allowed) ? null : csrfReject();
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return originAllowed(referer, allowed) ? null : csrfReject();
  }

  // No Origin/Referer — refuse cookie-authenticated writes (blocks opaque CSRF).
  return csrfReject();
}
