import { readGuestSession } from "./guest";

/** Tiny in-memory rate limit for auth / write abuse on a single instance. */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 4_000;

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;
  const ordered = [...buckets.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt,
  );
  const drop = buckets.size - MAX_BUCKETS;
  for (let i = 0; i < drop; i++) {
    buckets.delete(ordered[i][0]);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS / 2) prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_BUCKETS) prune(now);
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Client address from proxy-trusted headers only.
 * Prefer x-real-ip; otherwise the rightmost X-Forwarded-For hop
 * (typically appended by the reverse proxy, not the client).
 */
function clientAddress(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 128);
  }
  return "unknown";
}

/**
 * Rate-limit key from a verified signed session, else proxy client address.
 * Never trusts an unsigned cookie value.
 */
export function clientKey(request: Request, suffix: string): string {
  const session = readGuestSession(request);
  if (session) return `session:${session.sessionId}:${suffix}`;
  return `ip:${clientAddress(request)}:${suffix}`;
}
