import { createHmac, timingSafeEqual } from "node:crypto";
import { id } from "./ids";

const COOKIE = "fp_guest";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function secret(): string {
  // Stable per deploy when DATABASE_URL is set; otherwise a fixed local fallthrough.
  // Not a third-party credential — only binds guest cookies to this app instance.
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.CURSOR_APP_ID?.trim() ||
    "fun-peepers-local-guest"
  );
}

function sign(guestId: string): string {
  return createHmac("sha256", secret()).update(guestId).digest("base64url");
}

export function newGuestId(): string {
  return `guest:${id()}`;
}

export function readGuestId(request: Request): string | null {
  const raw = request.headers.get("cookie") || "";
  const match = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(COOKIE.length + 1));
  const [guestId, sig] = value.split(".");
  if (!guestId || !sig || !guestId.startsWith("guest:")) return null;
  const expected = sign(guestId);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return guestId;
}

export function guestCookieHeader(guestId: string): string {
  const value = encodeURIComponent(`${guestId}.${sign(guestId)}`);
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearGuestCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
