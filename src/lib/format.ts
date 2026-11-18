export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Time TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Start → end on the same day, or full start if end missing/elsewhere. */
export function formatWhenRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string {
  if (!startsAt) return "Time TBD";
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Time TBD";
  if (!endsAt) return formatWhen(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return formatWhen(startsAt);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (!sameDay) {
    return `${formatWhen(startsAt)} – ${formatWhen(endsAt)}`;
  }
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(start)} – ${t(end)}`;
}

export function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Combine YYYY-MM-DD + HH:MM in the browser's local timezone → ISO. */
export function combineLocalDateAndTime(
  dateKey: string,
  time: string,
): string | null {
  if (!dateKey || !time) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match || !timeMatch) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const da = Number(match[3]);
  const h = Number(timeMatch[1]);
  const mi = Number(timeMatch[2]);
  const d = new Date(y, mo - 1, da, h, mi, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatDayChip(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
