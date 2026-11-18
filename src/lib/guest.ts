import { createHmac, timingSafeEqual } from "node:crypto";
import { id } from "./ids";

const COOKIE = "fp_guest";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function secret(): string {
  const fromEnv = process.env.SESSION_COOKIE_SECRET?.trim();
  if (!fromEnv) {
    throw new Error("SESSION_COOKIE_SECRET is required");
  }
  return fromEnv;
}

function sign(sessionId: string): string {
  return createHmac("sha256", secret()).update(sessionId).digest("base64url");
}

export function newGuestId(): string {
  return `guest:${id()}`;
}

export function newFriendId(): string {
  return `friend:${id()}`;
}

export const FOUNDER_ID = "friend:founder";

function isSessionId(value: string): boolean {
  return (
    value.startsWith("guest:") ||
    value.startsWith("friend:") ||
    value.startsWith("user:")
  );
}

/** Signed who-am-I cookie (friend, guest, or founder). */
export function readGuestId(request: Request): string | null {
  const raw = request.headers.get("cookie") || "";
  const match = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(COOKIE.length + 1));
  const [sessionId, sig] = value.split(".");
  if (!sessionId || !sig || !isSessionId(sessionId)) return null;
  let expected: string;
  try {
    expected = sign(sessionId);
  } catch {
    return null;
  }
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return sessionId;
}

export function guestCookieHeader(sessionId: string): string {
  const value = encodeURIComponent(`${sessionId}.${sign(sessionId)}`);
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearGuestCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
