import { audienceFilterSql } from "./audience";
import { sql } from "./db";
import { DEFAULT_CIRCLE_ID, listCircleMembers, type CircleMember } from "./group";
import { expandRecurringOccurrences } from "./recurrence";
import { formatMinuteRange, weekdayFromDayKey } from "./routines-shared";
import { listRoutinesForUsers, type DailyRoutine } from "./routines";

export type BusyBlock = {
  kind: "routine" | "plan";
  label: string;
  start_minute: number | null;
  end_minute: number | null;
  time_label: string;
  plan_id?: string;
};

export type MemberAvailability = {
  user_id: string;
  display_name: string;
  role: string;
  /** free = no blocks; busy = has blocks; unknown = Fun Peep with no routines yet */
  status: "free" | "busy" | "unknown";
  blocks: BusyBlock[];
  has_routines: boolean;
};

export type DayAvailability = {
  day: string;
  members: MemberAvailability[];
  free_count: number;
  busy_count: number;
  unknown_count: number;
};

type PlanBusyRow = {
  id: string;
  title: string;
  creator_id: string;
  starts_at: string | null;
  ends_at: string | null;
  recurring_rule: string;
  busy_user_id: string;
};

function parseDayBounds(dayKey: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const from = new Date(y, mo - 1, da, 0, 0, 0, 0);
  const to = new Date(y, mo - 1, da + 1, 0, 0, 0, 0);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

function minuteOnDay(iso: string, dayFrom: Date, dayTo: Date): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d < dayFrom) return 0;
  if (d >= dayTo) return 1440;
  return d.getHours() * 60 + d.getMinutes();
}

function planBlockForDay(
  title: string,
  planId: string,
  startsAt: string,
  endsAt: string | null,
  dayFrom: Date,
  dayTo: Date,
): BusyBlock {
  const start = minuteOnDay(startsAt, dayFrom, dayTo);
  const endRaw = endsAt
    ? minuteOnDay(endsAt, dayFrom, dayTo)
    : start !== null
      ? Math.min(1440, start + 60)
      : null;
  const start_minute = start;
  const end_minute =
    endRaw !== null && start !== null && endRaw > start ? endRaw : endRaw;
  const time_label =
    start_minute !== null && end_minute !== null && end_minute > start_minute
      ? formatMinuteRange(start_minute, end_minute)
      : "Time TBD";
  return {
    kind: "plan",
    label: title,
    start_minute,
    end_minute:
      end_minute !== null && start_minute !== null && end_minute > start_minute
        ? end_minute
        : start_minute !== null
          ? Math.min(1440, start_minute + 60)
          : null,
    time_label,
    plan_id: planId,
  };
}

async function loadPlanBusyForDay(
  viewerId: string,
  dayFrom: Date,
  dayTo: Date,
): Promise<Map<string, BusyBlock[]>> {
  const fromIso = dayFrom.toISOString();
  const toIso = dayTo.toISOString();
  const inRange = await sql<PlanBusyRow>(
    `select p.id, p.title, p.creator_id, p.starts_at, p.ends_at, p.recurring_rule,
            coalesce(r.user_id, p.creator_id) as busy_user_id
     from plans p
     left join plan_rsvps r
       on r.plan_id = p.id and r.response = 'going'
     where p.status = 'open'
       and coalesce(p.circle_id, $3) = $3
       and ${audienceFilterSql("p", "$1")}
       and p.starts_at is not null
       and p.starts_at >= $2::timestamptz
       and p.starts_at < $4::timestamptz`,
    [viewerId, fromIso, DEFAULT_CIRCLE_ID, toIso],
  );

  const recurringSeries = await sql<{
    id: string;
    title: string;
    creator_id: string;
    starts_at: string;
    ends_at: string | null;
    recurring_rule: string;
  }>(
    `select p.id, p.title, p.creator_id, p.starts_at, p.ends_at, p.recurring_rule
     from plans p
     where p.status = 'open'
       and coalesce(p.circle_id, $3) = $3
       and ${audienceFilterSql("p", "$1")}
       and p.starts_at is not null
       and p.starts_at < $2::timestamptz
       and coalesce(p.recurring_rule, '') <> ''
     limit 120`,
    [viewerId, toIso, DEFAULT_CIRCLE_ID],
  );

  const goingByPlan = await sql<{ plan_id: string; user_id: string }>(
    `select r.plan_id, r.user_id
     from plan_rsvps r
     join plans p on p.id = r.plan_id
     where r.response = 'going'
       and p.status = 'open'
       and coalesce(p.circle_id, $1) = $1`,
    [DEFAULT_CIRCLE_ID],
  );
  const goingMap = new Map<string, string[]>();
  for (const row of goingByPlan) {
    const list = goingMap.get(row.plan_id) || [];
    list.push(row.user_id);
    goingMap.set(row.plan_id, list);
  }

  const byUser = new Map<string, BusyBlock[]>();
  const push = (userId: string, block: BusyBlock) => {
    const list = byUser.get(userId) || [];
    list.push(block);
    byUser.set(userId, list);
  };

  for (const row of inRange) {
    if (!row.starts_at) continue;
    const block = planBlockForDay(
      row.title,
      row.id,
      row.starts_at,
      row.ends_at,
      dayFrom,
      dayTo,
    );
    push(row.busy_user_id, block);
  }

  for (const series of recurringSeries) {
    const occurrences = expandRecurringOccurrences({
      startsAt: series.starts_at,
      endsAt: series.ends_at,
      recurringRule: series.recurring_rule,
      rangeStart: dayFrom,
      rangeEnd: dayTo,
      limit: 8,
    });
    const people = new Set<string>([
      series.creator_id,
      ...(goingMap.get(series.id) || []),
    ]);
    for (const occ of occurrences) {
      const block = planBlockForDay(
        series.title,
        series.id,
        occ.startsAt,
        occ.endsAt,
        dayFrom,
        dayTo,
      );
      for (const uid of people) push(uid, block);
    }
  }

  return byUser;
}

function routineBlocksForDay(
  routines: DailyRoutine[],
  weekday: number,
): BusyBlock[] {
  return routines
    .filter((r) => r.weekday === weekday)
    .map((r) => ({
      kind: "routine" as const,
      label: r.label,
      start_minute: r.start_minute,
      end_minute: r.end_minute,
      time_label: formatMinuteRange(r.start_minute, r.end_minute),
    }));
}

function dedupeBlocks(blocks: BusyBlock[]): BusyBlock[] {
  const seen = new Set<string>();
  const out: BusyBlock[] = [];
  for (const b of blocks) {
    const key = `${b.kind}|${b.plan_id || ""}|${b.label}|${b.start_minute}|${b.end_minute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  out.sort((a, b) => {
    const aS = a.start_minute ?? 9999;
    const bS = b.start_minute ?? 9999;
    if (aS !== bS) return aS - bS;
    return a.label.localeCompare(b.label);
  });
  return out;
}

function memberStatus(
  member: CircleMember,
  blocks: BusyBlock[],
  hasRoutines: boolean,
): "free" | "busy" | "unknown" {
  if (blocks.length > 0) return "busy";
  const role = member.role || "guest";
  if ((role === "friend" || role === "founder") && !hasRoutines) {
    return "unknown";
  }
  return "free";
}

/** Who in the circle is free / busy on a local calendar day. */
export async function getDayAvailability(
  viewerId: string,
  dayKey: string,
): Promise<DayAvailability | { error: string }> {
  const bounds = parseDayBounds(dayKey);
  const weekday = weekdayFromDayKey(dayKey);
  if (!bounds || weekday === null) return { error: "bad_day" };

  const members = await listCircleMembers();
  const funPeeps = members.filter(
    (m) => m.role === "founder" || m.role === "friend",
  );
  // Guests appear lightly: only if they have routines or plan busy that day.
  const guestIds = members
    .filter((m) => m.role === "guest")
    .map((m) => m.user_id);

  const allIds = members.map((m) => m.user_id);
  const routines = await listRoutinesForUsers(allIds);
  const routinesByUser = new Map<string, DailyRoutine[]>();
  for (const r of routines) {
    const list = routinesByUser.get(r.user_id) || [];
    list.push(r);
    routinesByUser.set(r.user_id, list);
  }

  const planBusy = await loadPlanBusyForDay(
    viewerId,
    bounds.from,
    bounds.to,
  );

  const result: MemberAvailability[] = [];
  for (const member of funPeeps) {
    const ownRoutines = routinesByUser.get(member.user_id) || [];
    const blocks = dedupeBlocks([
      ...routineBlocksForDay(ownRoutines, weekday),
      ...(planBusy.get(member.user_id) || []),
    ]);
    const has_routines = ownRoutines.length > 0;
    result.push({
      user_id: member.user_id,
      display_name: member.display_name,
      role: member.role || "friend",
      status: memberStatus(member, blocks, has_routines),
      blocks,
      has_routines,
    });
  }

  for (const member of members.filter((m) => m.role === "guest")) {
    const ownRoutines = routinesByUser.get(member.user_id) || [];
    const blocks = dedupeBlocks([
      ...routineBlocksForDay(ownRoutines, weekday),
      ...(planBusy.get(member.user_id) || []),
    ]);
    if (blocks.length === 0 && ownRoutines.length === 0) continue;
    result.push({
      user_id: member.user_id,
      display_name: member.display_name,
      role: "guest",
      status: blocks.length > 0 ? "busy" : "free",
      blocks,
      has_routines: ownRoutines.length > 0,
    });
  }

  // Keep guestIds referenced for clarity / future filters
  void guestIds;

  const free_count = result.filter((m) => m.status === "free").length;
  const busy_count = result.filter((m) => m.status === "busy").length;
  const unknown_count = result.filter((m) => m.status === "unknown").length;

  return {
    day: dayKey,
    members: result,
    free_count,
    busy_count,
    unknown_count,
  };
}
