/** Compact recurring_rule encoding, max ~32 chars:
 *  - "" | "weekly" | "biweekly" | "monthly" (legacy)
 *  - "weekly:2" | "weekly:1,3" | "biweekly:2" (0=Sun … 6=Sat)
 */

export type RecurFreq = "weekly" | "biweekly" | "monthly";

export type ParsedRecurrence = {
  freq: RecurFreq;
  /** Empty = use starts_at weekday (legacy weekly/biweekly). */
  weekdays: number[];
};

const FREQS: RecurFreq[] = ["weekly", "biweekly", "monthly"];

/** Reject absurd anchors that would explode expansion or storage. */
export const PLAN_TIME_MIN_MS = Date.UTC(2020, 0, 1);
export const PLAN_TIME_MAX_MS = Date.UTC(2100, 0, 1);

export function isReasonablePlanTime(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= PLAN_TIME_MIN_MS && t < PLAN_TIME_MAX_MS;
}

export function parseRecurringRule(rule: string | null | undefined): ParsedRecurrence | null {
  const raw = (rule || "").trim();
  if (!raw) return null;
  const [head, daysPart] = raw.split(":");
  if (!FREQS.includes(head as RecurFreq)) return null;
  const freq = head as RecurFreq;
  const weekdays: number[] = [];
  if (daysPart) {
    for (const piece of daysPart.split(",")) {
      const n = Number(piece.trim());
      if (Number.isInteger(n) && n >= 0 && n <= 6 && !weekdays.includes(n)) {
        weekdays.push(n);
      }
    }
    weekdays.sort((a, b) => a - b);
  }
  return { freq, weekdays };
}

export function formatRecurringRule(
  freq: RecurFreq | "",
  weekdays: number[] = [],
): string {
  if (!freq) return "";
  const days = [...new Set(weekdays.filter((d) => d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  if (freq === "monthly" || days.length === 0) return freq;
  return `${freq}:${days.join(",")}`;
}

export function describeRecurringRule(
  rule: string | null | undefined,
  startsAt?: string | null,
): string | null {
  const parsed = parseRecurringRule(rule);
  if (!parsed) return null;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let days = parsed.weekdays;
  if (days.length === 0 && startsAt) {
    const d = new Date(startsAt);
    if (!Number.isNaN(d.getTime())) days = [d.getDay()];
  }
  const dayLabel =
    days.length === 0
      ? ""
      : days.length === 1
        ? names[days[0]]
        : days.map((d) => names[d]).join(", ");
  if (parsed.freq === "monthly") return "Repeats every month";
  if (parsed.freq === "biweekly") {
    return dayLabel
      ? `Repeats every other ${dayLabel}`
      : "Repeats every other week";
  }
  return dayLabel ? `Repeats every ${dayLabel}` : "Repeats every week";
}

function atLocalYmd(y: number, m: number, d: number, h: number, mi: number): Date {
  return new Date(y, m, d, h, mi, 0, 0);
}

function copyTime(from: Date, onto: Date): Date {
  return atLocalYmd(
    onto.getFullYear(),
    onto.getMonth(),
    onto.getDate(),
    from.getHours(),
    from.getMinutes(),
  );
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function dayKeyLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type OccurrenceTimes = {
  startsAt: string;
  endsAt: string | null;
  occurrenceKey: string;
};

/** Max day-steps inside one expansion call (hard ceiling). */
const MAX_SCAN_DAYS = 120;

/** Expand a recurring plan into occurrence times overlapping [rangeStart, rangeEnd). */
export function expandRecurringOccurrences(input: {
  startsAt: string;
  endsAt?: string | null;
  recurringRule: string;
  rangeStart: Date;
  rangeEnd: Date;
  /** Cap generated occurrences (safety). */
  limit?: number;
}): OccurrenceTimes[] {
  const parsed = parseRecurringRule(input.recurringRule);
  if (!parsed) return [];
  const anchor = new Date(input.startsAt);
  if (Number.isNaN(anchor.getTime())) return [];
  if (!isReasonablePlanTime(input.startsAt)) return [];

  const endAnchor = input.endsAt ? new Date(input.endsAt) : null;
  const durationMs =
    endAnchor && !Number.isNaN(endAnchor.getTime())
      ? Math.max(0, endAnchor.getTime() - anchor.getTime())
      : null;

  const weekdays =
    parsed.weekdays.length > 0 ? parsed.weekdays : [anchor.getDay()];
  const limit = Math.min(input.limit ?? 80, 80);
  const out: OccurrenceTimes[] = [];
  const rangeStartMs = input.rangeStart.getTime();
  const rangeEndMs = input.rangeEnd.getTime();
  if (!(rangeEndMs > rangeStartMs)) return [];

  // Never scan before the series starts or before the requested window.
  const windowStartMs = Math.max(rangeStartMs, anchor.getTime());
  if (windowStartMs >= rangeEndMs) return [];

  function pushOccurrence(starts: Date): void {
    if (out.length >= limit) return;
    if (starts.getTime() < anchor.getTime() - 60_000) return;
    const ends =
      durationMs != null ? new Date(starts.getTime() + durationMs) : null;
    if (starts.getTime() >= rangeEndMs) return;
    if ((ends ?? starts).getTime() < rangeStartMs) return;
    out.push({
      startsAt: starts.toISOString(),
      endsAt: ends ? ends.toISOString() : null,
      occurrenceKey: dayKeyLocal(starts),
    });
  }

  if (parsed.freq === "monthly") {
    // Jump to the first month that can hit the window (O(1) vs walking from year 1).
    const win = new Date(windowStartMs);
    let cursor = new Date(
      win.getFullYear(),
      win.getMonth(),
      anchor.getDate(),
      anchor.getHours(),
      anchor.getMinutes(),
      0,
      0,
    );
    if (cursor.getTime() < windowStartMs) {
      cursor = new Date(
        win.getFullYear(),
        win.getMonth() + 1,
        anchor.getDate(),
        anchor.getHours(),
        anchor.getMinutes(),
        0,
        0,
      );
    }
    // If day overflowed (e.g. Jan 31 → Mar), skip until valid.
    let guard = 0;
    while (cursor.getTime() < rangeEndMs && out.length < limit && guard < 48) {
      guard += 1;
      if (cursor.getDate() === anchor.getDate() && cursor.getTime() >= anchor.getTime() - 60_000) {
        pushOccurrence(cursor);
      }
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        anchor.getDate(),
        anchor.getHours(),
        anchor.getMinutes(),
        0,
        0,
      );
    }
    return out;
  }

  const stepDays = parsed.freq === "biweekly" ? 14 : 7;

  if (parsed.freq === "weekly") {
    // Bound day-scan to the request window only (plus 1 day pad), never from ancient anchor.
    const scanStart = addDaysLocal(new Date(windowStartMs), -1);
    const scanEnd = addDaysLocal(new Date(rangeEndMs), 1);
    let steps = 0;
    for (
      let cursor = scanStart;
      cursor.getTime() <= scanEnd.getTime() &&
      out.length < limit &&
      steps < MAX_SCAN_DAYS;
      cursor = addDaysLocal(cursor, 1), steps += 1
    ) {
      if (!weekdays.includes(cursor.getDay())) continue;
      pushOccurrence(copyTime(anchor, cursor));
    }
    return out;
  }

  // biweekly: advance from first on/after windowStart for each weekday, step 14.
  for (const wd of weekdays) {
    const winDay = new Date(
      new Date(windowStartMs).getFullYear(),
      new Date(windowStartMs).getMonth(),
      new Date(windowStartMs).getDate(),
      12,
      0,
      0,
      0,
    );
    let cursor = addDaysLocal(winDay, (wd - winDay.getDay() + 7) % 7);
    // Align to the biweekly phase of the original anchor weekday occurrence.
    const anchorDay = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
      12,
      0,
      0,
      0,
    );
    const firstOfWd = addDaysLocal(anchorDay, (wd - anchorDay.getDay() + 7) % 7);
    const diffDays = Math.round(
      (cursor.getTime() - firstOfWd.getTime()) / 86_400_000,
    );
    const phase = ((diffDays % stepDays) + stepDays) % stepDays;
    if (phase !== 0) cursor = addDaysLocal(cursor, stepDays - phase);

    let steps = 0;
    while (
      cursor.getTime() < rangeEndMs + 86_400_000 &&
      out.length < limit &&
      steps < MAX_SCAN_DAYS
    ) {
      pushOccurrence(copyTime(anchor, cursor));
      cursor = addDaysLocal(cursor, stepDays);
      steps += 1;
    }
  }

  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return out;
}

/** Next local date key (YYYY-MM-DD) on or after `from` matching weekday 0–6. */
export function nextDateKeyForWeekday(weekday: number, from = new Date()): string {
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  const delta = (weekday - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + delta);
  return dayKeyLocal(cursor);
}
