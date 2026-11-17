import { randomBytes } from "node:crypto";

export function id(prefix = ""): string {
  const body = randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${body}` : body;
}

export function shareToken(): string {
  return randomBytes(9).toString("base64url");
}
