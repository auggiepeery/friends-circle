/** Shared prefs types + normalization (safe for client and server). */

export type ThemeId = "night" | "dusk" | "citrus";
export type CalDefaultView = "month" | "week" | "list";

export type ClientPrefs = {
  theme: ThemeId;
  calendarView: CalDefaultView;
  showUnreadBadge: boolean;
  reduceMotion: boolean;
};

export const THEME_OPTIONS: { id: ThemeId; label: string; blurb: string }[] = [
  { id: "night", label: "Night lagoon", blurb: "Teal glass · deep water glow" },
  { id: "dusk", label: "Warm dusk", blurb: "Ember sky · copper rails" },
  { id: "citrus", label: "Lamp citrus", blurb: "Charcoal night · amber lamp" },
];

/** Removed appearance themes — coerce to Night lagoon. */
const REMOVED_THEMES = new Set(["day", "reef"]);

export const DEFAULT_PREFS: ClientPrefs = {
  theme: "night",
  calendarView: "month",
  showUnreadBadge: true,
  reduceMotion: false,
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === "night" || value === "dusk" || value === "citrus";
}

export function coerceThemeId(value: unknown): ThemeId {
  if (isThemeId(value)) return value;
  // Day mist, Deep reef, and any unknown theme → Night lagoon
  if (typeof value === "string" && REMOVED_THEMES.has(value)) {
    return "night";
  }
  return DEFAULT_PREFS.theme;
}

export function isCalDefaultView(value: unknown): value is CalDefaultView {
  return value === "month" || value === "week" || value === "list";
}

export function normalizePrefs(raw: unknown): ClientPrefs {
  const parsed =
    raw && typeof raw === "object" ? (raw as Partial<ClientPrefs>) : {};
  return {
    theme: coerceThemeId(parsed.theme),
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
}

/** True when stored theme was removed and remapped to Night lagoon. */
export function themeWasMigrated(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const theme = (raw as Partial<ClientPrefs>).theme;
  return typeof theme === "string" && !isThemeId(theme);
}
