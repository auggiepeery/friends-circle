import { createHmac, timingSafeEqual } from "node:crypto";
import { id } from "./ids";

const COOKIE = "fp_guest";
/** Session lifetime — short enough that password changes + expiry revoke access. */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export type GuestSession = {
  sessionId: string;
  sessionVersion: number;
  exp: number;
};

function secret(): string {
  const fromEnv = process.env.SESSION_COOKIE_SECRET?.trim();
  if (!fromEnv) {
    throw new Error("SESSION_COOKIE_SECRET is required");
  }
  return fromEnv;
}

function signPayload(sessionId: string, exp: number, sessionVersion: number): string {
  const payload = `${sessionId}|${exp}|${sessionVersion}`;
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
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

function parseCookieValue(rawCookie: string): string | null {
  const match = rawCookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(COOKIE.length + 1));
}

/**
 * Verified signed session from the cookie (HMAC + expiry).
 * Does not check DB session_version — callers that authorize must.
 */
export function readGuestSession(request: Request): GuestSession | null {
  const value = parseCookieValue(request.headers.get("cookie") || "");
  if (!value) return null;
  const parts = value.split(".");
  // sessionId.exp.sv.sig
  if (parts.length !== 4) return null;
  const [sessionId, expRaw, svRaw, sig] = parts;
  if (!sessionId || !sig || !isSessionId(sessionId)) return null;
  const exp = Number(expRaw);
  const sessionVersion = Number(svRaw);
  if (!Number.isFinite(exp) || !Number.isFinite(sessionVersion)) return null;
  if (exp * 1000 <= Date.now()) return null;
  let expected: string;
  try {
    expected = signPayload(sessionId, exp, sessionVersion);
  } catch {
    return null;
  }
  if (!safeEqual(sig, expected)) return null;
  return { sessionId, sessionVersion, exp };
}

/** @deprecated Prefer readGuestSession — kept as id-only helper after verify. */
export function readGuestId(request: Request): string | null {
  return readGuestSession(request)?.sessionId ?? null;
}

export function guestCookieHeader(
  sessionId: string,
  sessionVersion = 0,
): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const sig = signPayload(sessionId, exp, sessionVersion);
  const value = encodeURIComponent(
    `${sessionId}.${exp}.${sessionVersion}.${sig}`,
  );
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export function clearGuestCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
