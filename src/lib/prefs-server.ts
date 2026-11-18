import { sql } from "./db";
import {
  type ClientPrefs,
  DEFAULT_PREFS,
  normalizePrefs,
} from "./prefs-shared";

function isEmptyPrefsBlob(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t === "" || t === "{}";
  }
  if (typeof raw === "object") {
    return Object.keys(raw as object).length === 0;
  }
  return true;
}

export async function getUiPrefs(userId: string): Promise<{
  prefs: ClientPrefs;
  empty: boolean;
}> {
  const rows = await sql<{ ui_prefs: unknown }>(
    `select ui_prefs from profiles where id = $1`,
    [userId],
  );
  if (!rows[0]) return { prefs: { ...DEFAULT_PREFS }, empty: true };
  const raw = rows[0].ui_prefs;
  return {
    prefs: normalizePrefs(raw),
    empty: isEmptyPrefsBlob(raw),
  };
}

export async function setUiPrefs(
  userId: string,
  prefs: ClientPrefs,
): Promise<ClientPrefs> {
  const next = normalizePrefs(prefs);
  await sql(
    `update profiles
     set ui_prefs = $2::jsonb
     where id = $1`,
    [userId, JSON.stringify(next)],
  );
  return next;
}
