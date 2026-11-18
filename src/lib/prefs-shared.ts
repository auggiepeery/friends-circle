/** Shared prefs types + normalization (safe for client and server). */

export type ThemeId = "night" | "dusk" | "day" | "reef" | "citrus";
export type CalDefaultView = "month" | "week" | "list";

export type ClientPrefs = {
  theme: ThemeId;
  calendarView: CalDefaultView;
  showUnreadBadge: boolean;
  reduceMotion: boolean;
};

export const THEME_OPTIONS: { id: ThemeId; label: string; blurb: string }[] = [
  { id: "night", label: "Night lagoon", blurb: "Deep teal night" },
  { id: "dusk", label: "Warm dusk", blurb: "Ember afterglow" },
  { id: "day", label: "Day mist", blurb: "Soft daylight" },
  { id: "reef", label: "Deep reef", blurb: "Navy abyss + seafoam" },
  { id: "citrus", label: "Lamp citrus", blurb: "Charcoal + amber lamp" },
];

export const DEFAULT_PREFS: ClientPrefs = {
  theme: "night",
  calendarView: "month",
  showUnreadBadge: true,
  reduceMotion: false,
};

export function isThemeId(value: unknown): value is ThemeId {
  return (
    value === "night" ||
    value === "dusk" ||
    value === "day" ||
    value === "reef" ||
    value === "citrus"
  );
}

export function isCalDefaultView(value: unknown): value is CalDefaultView {
  return value === "month" || value === "week" || value === "list";
}

export function normalizePrefs(raw: unknown): ClientPrefs {
  const parsed =
    raw && typeof raw === "object" ? (raw as Partial<ClientPrefs>) : {};
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
}
