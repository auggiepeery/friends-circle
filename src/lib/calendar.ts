export type CalView = "month" | "week" | "list";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun
  return addDays(x, -day);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/** Inclusive grid: 6 weeks starting Sunday before month start. */
export function monthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatMonthTitle(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWeekTitle(d: Date): string {
  const days = weekDays(d);
  const a = days[0];
  const b = days[6];
  const left = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = b.toLocaleDateString(undefined, {
    month: a.getMonth() === b.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${left} – ${right}`;
}

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function rangeForView(view: CalView, anchor: Date): { from: Date; to: Date } {
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  if (view === "month") {
    const grid = monthGrid(anchor);
    return { from: grid[0], to: addDays(grid[41], 1) };
  }
  // list: from today through ~8 weeks
  const from = startOfDay(new Date());
  return { from, to: addDays(from, 56) };
}
