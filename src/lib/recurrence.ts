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
  const endAnchor = input.endsAt ? new Date(input.endsAt) : null;
  const durationMs =
    endAnchor && !Number.isNaN(endAnchor.getTime())
      ? Math.max(0, endAnchor.getTime() - anchor.getTime())
      : null;

  const weekdays =
    parsed.weekdays.length > 0 ? parsed.weekdays : [anchor.getDay()];
  const limit = input.limit ?? 80;
  const out: OccurrenceTimes[] = [];
  const rangeStartMs = input.rangeStart.getTime();
  const rangeEndMs = input.rangeEnd.getTime();

  if (parsed.freq === "monthly") {
    // Same calendar day-of-month as the anchor, from the first month that can hit the range.
    let cursor = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
      anchor.getHours(),
      anchor.getMinutes(),
      0,
      0,
    );
    // Walk forward from anchor until past range end.
    while (cursor.getTime() < rangeEndMs && out.length < limit) {
      if (cursor.getTime() >= Math.max(rangeStartMs, anchor.getTime() - 1)) {
        // Skip invalid month rollovers (e.g. Jan 31 → Mar 3); require same day number.
        if (cursor.getDate() === anchor.getDate()) {
          const starts = cursor;
          const ends =
            durationMs != null ? new Date(starts.getTime() + durationMs) : null;
          if (
            starts.getTime() < rangeEndMs &&
            (ends ?? starts).getTime() >= rangeStartMs
          ) {
            out.push({
              startsAt: starts.toISOString(),
              endsAt: ends ? ends.toISOString() : null,
              occurrenceKey: dayKeyLocal(starts),
            });
          }
        }
      }
      const next = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        anchor.getDate(),
        anchor.getHours(),
        anchor.getMinutes(),
        0,
        0,
      );
      cursor = next;
    }
    return out;
  }

  const stepDays = parsed.freq === "biweekly" ? 14 : 7;
  // For multi-weekday weekly: walk day-by-day from anchor date; for biweekly keep
  // week alignment from the anchor's week for each selected weekday.
  const startDay = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
    12,
    0,
    0,
    0,
  );

  if (parsed.freq === "weekly" && weekdays.length > 0) {
    // Scan each calendar day in an extended window.
    const scanStart = addDaysLocal(
      new Date(Math.min(startDay.getTime(), input.rangeStart.getTime())),
      -1,
    );
    const scanEnd = addDaysLocal(input.rangeEnd, 1);
    for (
      let cursor = scanStart;
      cursor.getTime() <= scanEnd.getTime() && out.length < limit;
      cursor = addDaysLocal(cursor, 1)
    ) {
      if (!weekdays.includes(cursor.getDay())) continue;
      const starts = copyTime(anchor, cursor);
      if (starts.getTime() < anchor.getTime() - 60_000) continue;
      const ends =
        durationMs != null ? new Date(starts.getTime() + durationMs) : null;
      if (starts.getTime() >= rangeEndMs) continue;
      if ((ends ?? starts).getTime() < rangeStartMs) continue;
      out.push({
        startsAt: starts.toISOString(),
        endsAt: ends ? ends.toISOString() : null,
        occurrenceKey: dayKeyLocal(starts),
      });
    }
    return out;
  }

  // biweekly (and weekly fallback): step from each weekday's first occurrence on/after anchor.
  for (const wd of weekdays) {
    let cursor = new Date(startDay);
    const delta = (wd - cursor.getDay() + 7) % 7;
    cursor = addDaysLocal(cursor, delta);
    while (cursor.getTime() < rangeEndMs + 86_400_000 && out.length < limit) {
      const starts = copyTime(anchor, cursor);
      if (starts.getTime() >= anchor.getTime() - 60_000) {
        const ends =
          durationMs != null ? new Date(starts.getTime() + durationMs) : null;
        if (
          starts.getTime() < rangeEndMs &&
          (ends ?? starts).getTime() >= rangeStartMs
        ) {
          out.push({
            startsAt: starts.toISOString(),
            endsAt: ends ? ends.toISOString() : null,
            occurrenceKey: dayKeyLocal(starts),
          });
        }
      }
      cursor = addDaysLocal(cursor, stepDays);
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
