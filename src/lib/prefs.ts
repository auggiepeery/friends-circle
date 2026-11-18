/** Client prefs: per-profile server source of truth + local cache for first paint. */

export type {
  CalDefaultView,
  ClientPrefs,
  ThemeId,
} from "./prefs-shared";
export {
  DEFAULT_PREFS,
  THEME_OPTIONS,
  coerceThemeId,
  isCalDefaultView,
  isThemeId,
  normalizePrefs,
  themeWasMigrated,
} from "./prefs-shared";

import {
  type ClientPrefs,
  DEFAULT_PREFS,
  normalizePrefs,
  themeWasMigrated,
} from "./prefs-shared";

export const PREFS_EVENT = "fp-prefs-change";
/** Cache keyed by last signed-in profile — not the shared source of truth. */
export const PREFS_CACHE_KEY = "fp_prefs_cache_v2";
/** Legacy device-wide key (migrated once into the signed-in profile). */
export const PREFS_LEGACY_KEY = "fp_prefs_v1";

type PrefsCache = {
  userId: string | null;
  prefs: ClientPrefs;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let activeUserId: string | null = null;

function readCache(): PrefsCache {
  if (typeof window === "undefined") {
    return { userId: null, prefs: { ...DEFAULT_PREFS } };
  }
  try {
    const raw = window.localStorage.getItem(PREFS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PrefsCache>;
      return {
        userId: typeof parsed.userId === "string" ? parsed.userId : null,
        prefs: normalizePrefs(parsed.prefs),
      };
    }
    // One-time read of legacy device-wide prefs for first-paint only.
    const legacy = window.localStorage.getItem(PREFS_LEGACY_KEY);
    if (legacy) {
      return { userId: null, prefs: normalizePrefs(JSON.parse(legacy)) };
    }
  } catch {
    /* ignore */
  }
  return { userId: null, prefs: { ...DEFAULT_PREFS } };
}

function writeCache(userId: string | null, prefs: ClientPrefs): void {
  if (typeof window === "undefined") return;
  const payload: PrefsCache = { userId, prefs: normalizePrefs(prefs) };
  window.localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(payload));
}

export function readPrefs(): ClientPrefs {
  return readCache().prefs;
}

export function applyPrefsToDocument(prefs: ClientPrefs = readPrefs()): void {
  if (typeof document === "undefined") return;
  const next = normalizePrefs(prefs);
  const root = document.documentElement;
  root.dataset.theme = next.theme;
  root.dataset.reduceMotion = next.reduceMotion ? "true" : "false";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    // Defer so CSS variables for the new theme are applied.
    requestAnimationFrame(() => {
      const ink = getComputedStyle(root).getPropertyValue("--ink").trim();
      if (ink) meta.setAttribute("content", ink);
    });
  }
}

function publish(prefs: ClientPrefs): void {
  applyPrefsToDocument(prefs);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }));
  }
}

function queueServerSave(prefs: ClientPrefs): void {
  if (!activeUserId || typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void fetch("/api/prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefs }),
      credentials: "same-origin",
    }).catch(() => {
      /* keep cache; next hydrate retries */
    });
  }, 280);
}

/** Apply + cache locally; persist to the signed-in profile when known. */
export function writePrefs(next: ClientPrefs): void {
  const prefs = normalizePrefs(next);
  writeCache(activeUserId, prefs);
  publish(prefs);
  queueServerSave(prefs);
}

export function patchPrefs(patch: Partial<ClientPrefs>): ClientPrefs {
  const next = normalizePrefs({ ...readPrefs(), ...patch });
  writePrefs(next);
  return next;
}

/**
 * Load prefs for the signed-in profile from the server.
 * Falls back to cache for that userId, then defaults.
 * Migrates legacy device-wide prefs into an empty server profile once.
 */
export async function hydratePrefsForUser(
  userId: string | null,
): Promise<ClientPrefs> {
  activeUserId = userId;

  if (!userId) {
    const defaults = { ...DEFAULT_PREFS };
    writeCache(null, defaults);
    publish(defaults);
    return defaults;
  }

  try {
    const res = await fetch("/api/prefs", { credentials: "same-origin" });
    if (res.ok) {
      const data = (await res.json()) as {
        prefs?: unknown;
        empty?: boolean;
      };
      let prefs = normalizePrefs(data.prefs);
      let shouldPersist = themeWasMigrated(data.prefs);

      if (data.empty && typeof window !== "undefined") {
        const legacyRaw = window.localStorage.getItem(PREFS_LEGACY_KEY);
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw);
          prefs = normalizePrefs(legacyParsed);
          shouldPersist = true;
          window.localStorage.removeItem(PREFS_LEGACY_KEY);
        }
      }

      if (shouldPersist) {
        await fetch("/api/prefs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prefs }),
          credentials: "same-origin",
        }).catch(() => undefined);
      }

      writeCache(userId, prefs);
      publish(prefs);
      return prefs;
    }
  } catch {
    /* offline / error — use cache below */
  }

  const cache = readCache();
  const prefs =
    cache.userId === userId ? cache.prefs : { ...DEFAULT_PREFS };
  writeCache(userId, prefs);
  publish(prefs);
  return prefs;
}

/** Inline boot script — first paint from last profile cache (not shared truth). */
export const PREFS_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  PREFS_CACHE_KEY,
)};var legacy=${JSON.stringify(PREFS_LEGACY_KEY)};var r=localStorage.getItem(k);if(!r){r=localStorage.getItem(legacy);if(r)r=JSON.stringify({prefs:JSON.parse(r)});}var t="night";var m=false;if(r){var c=JSON.parse(r);var p=c&&c.prefs?c.prefs:c;if(p&&(p.theme==="night"||p.theme==="dusk"||p.theme==="citrus"))t=p.theme;else if(p&&(p.theme==="day"||p.theme==="reef"))t="night";if(p&&p.reduceMotion===true)m=true;}var d=document.documentElement;d.dataset.theme=t;d.dataset.reduceMotion=m?"true":"false";}catch(e){}})();`;
