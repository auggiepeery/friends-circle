/** Tiny in-memory rate limit for auth / write abuse on a single instance. */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Rate-limit key that does not trust client-supplied forwarding headers.
 * Uses the signed session cookie when present; otherwise a shared
 * anonymous bucket per route (single-instance global throttle).
 */
export function clientKey(request: Request, suffix: string): string {
  const raw = request.headers.get("cookie") || "";
  const match = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("fp_guest="));
  if (match) {
    const value = decodeURIComponent(match.slice("fp_guest=".length));
    const sessionId = value.split(".")[0];
    if (
      sessionId &&
      (sessionId.startsWith("guest:") ||
        sessionId.startsWith("friend:") ||
        sessionId.startsWith("user:"))
    ) {
      return `session:${sessionId}:${suffix}`;
    }
  }
  return `anon:${suffix}`;
}
