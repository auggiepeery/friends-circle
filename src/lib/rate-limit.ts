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

export function clientKey(request: Request, suffix: string): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${fwd || "local"}:${suffix}`;
}
