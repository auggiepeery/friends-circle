export const MAX_ROUTINES_PER_USER = 24;
export const MAX_ROUTINE_LABEL = 80;

export type DailyRoutine = {
  id: string;
  user_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  label: string;
  created_at: string;
};

export type RoutineInput = {
  weekday: number;
  start_minute: number;
  end_minute: number;
  label: string;
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isWeekday(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
}

export function isMinuteOfDay(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 1440;
}

export function parseTimeToMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(mi)) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

export function minuteToTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const mi = minute % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(mi)}`;
}

export function formatMinuteRange(start: number, end: number): string {
  const fmt = (m: number) => {
    const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function describeRoutine(
  r: Pick<DailyRoutine, "weekday" | "start_minute" | "end_minute" | "label">,
): string {
  const day = WEEKDAY_SHORT[r.weekday] || "?";
  return `${day} · ${formatMinuteRange(r.start_minute, r.end_minute)} · ${r.label}`;
}

export function validateRoutineInput(
  input: Partial<RoutineInput>,
): { ok: true; value: RoutineInput } | { ok: false; error: string } {
  if (!isWeekday(input.weekday)) return { ok: false, error: "bad_weekday" };
  if (!isMinuteOfDay(input.start_minute)) return { ok: false, error: "bad_start" };
  if (
    typeof input.end_minute !== "number" ||
    !Number.isInteger(input.end_minute) ||
    input.end_minute <= 0 ||
    input.end_minute > 1440
  ) {
    return { ok: false, error: "bad_end" };
  }
  if (input.end_minute <= input.start_minute) {
    return { ok: false, error: "end_before_start" };
  }
  const label = (input.label || "").trim();
  if (label.length < 1) return { ok: false, error: "label_required" };
  if (label.length > MAX_ROUTINE_LABEL) return { ok: false, error: "label_too_long" };
  return {
    ok: true,
    value: {
      weekday: input.weekday,
      start_minute: input.start_minute,
      end_minute: input.end_minute,
      label,
    },
  };
}

/** Local weekday (0=Sun) for a YYYY-MM-DD key. */
export function weekdayFromDayKey(dayKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}
