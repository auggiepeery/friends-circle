import { noStore } from "./auth";

export const MAX_JSON_BYTES = 16_384;
export const MAX_TITLE = 120;
export const MAX_TEXT = 2_000;
export const MAX_PLACE = 200;
export const MAX_HINT = 160;
export const MAX_POLL_OPTIONS = 8;
export const MAX_POLL_OPTION = 80;
export const MAX_QUERY = 80;

export async function readJsonBounded<T = unknown>(
  request: Request,
  maxBytes = MAX_JSON_BYTES,
): Promise<T | Response> {
  const headerLen = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(headerLen) && headerLen > maxBytes) {
    return Response.json(
      { error: "payload_too_large" },
      { status: 413, headers: noStore },
    );
  }
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return Response.json(
      { error: "payload_too_large" },
      { status: 413, headers: noStore },
    );
  }
  if (!raw.trim()) {
    return Response.json(
      { error: "empty_body" },
      { status: 400, headers: noStore },
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return Response.json(
      { error: "invalid_json" },
      { status: 400, headers: noStore },
    );
  }
}

export function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function clipOptional(
  value: unknown,
  max: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max);
}
