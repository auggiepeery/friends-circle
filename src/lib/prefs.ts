/** Client-only Fun Peepers preferences (localStorage). */

export type ThemeId = "night" | "dusk" | "day";
export type CalDefaultView = "month" | "week" | "list";

export type ClientPrefs = {
  theme: ThemeId;
  calendarView: CalDefaultView;
  showUnreadBadge: boolean;
  reduceMotion: boolean;
};

export const PREFS_KEY = "fp_prefs_v1";
export const PREFS_EVENT = "fp-prefs-change";

export const DEFAULT_PREFS: ClientPrefs = {
  theme: "night",
  calendarView: "month",
  showUnreadBadge: true,
  reduceMotion: false,
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === "night" || value === "dusk" || value === "day";
}

export function isCalDefaultView(value: unknown): value is CalDefaultView {
  return value === "month" || value === "week" || value === "list";
}

export function readPrefs(): ClientPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ClientPrefs>;
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_PREFS.theme,
      calendarView: isCalDefaultView(parsed.calendarView)
        ? parsed.calendarView
        : DEFAULT_PREFS.calendarView,
      showUnreadBadge:
        typeof parsed.showUnreadBadge === "boolean"
          ? parsed.showUnreadBadge
          : DEFAULT_PREFS.showUnreadBadge,
      reduceMotion:
        typeof parsed.reduceMotion === "boolean"
          ? parsed.reduceMotion
          : DEFAULT_PREFS.reduceMotion,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(next: ClientPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  applyPrefsToDocument(next);
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
}

export function patchPrefs(patch: Partial<ClientPrefs>): ClientPrefs {
  const next = { ...readPrefs(), ...patch };
  writePrefs(next);
  return next;
}

export function applyPrefsToDocument(prefs: ClientPrefs = readPrefs()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.reduceMotion = prefs.reduceMotion ? "true" : "false";
}

/** Inline boot script — keeps first paint matching saved theme. */
export const PREFS_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  PREFS_KEY,
)};var r=localStorage.getItem(k);var t="night";var m=false;if(r){var p=JSON.parse(r);if(p&&(p.theme==="night"||p.theme==="dusk"||p.theme==="day"))t=p.theme;if(p&&p.reduceMotion===true)m=true;}var d=document.documentElement;d.dataset.theme=t;d.dataset.reduceMotion=m?"true":"false";}catch(e){}})();`;
