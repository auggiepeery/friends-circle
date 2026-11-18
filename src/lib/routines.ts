import { sql } from "./db";
import { id } from "./ids";
import {
  MAX_ROUTINES_PER_USER,
  type DailyRoutine,
  type RoutineInput,
} from "./routines-shared";

export {
  MAX_ROUTINES_PER_USER,
  MAX_ROUTINE_LABEL,
  describeRoutine,
  formatMinuteRange,
  isMinuteOfDay,
  isWeekday,
  minuteToTime,
  parseTimeToMinute,
  validateRoutineInput,
  weekdayFromDayKey,
  type DailyRoutine,
  type RoutineInput,
} from "./routines-shared";

export async function listRoutinesForUser(userId: string): Promise<DailyRoutine[]> {
  return sql(
    `select id, user_id, weekday, start_minute, end_minute, label, created_at
     from daily_routines
     where user_id = $1
     order by weekday asc, start_minute asc, created_at asc
     limit $2`,
    [userId, MAX_ROUTINES_PER_USER],
  );
}

export async function countRoutinesForUser(userId: string): Promise<number> {
  const rows = await sql<{ count: number }>(
    `select count(*)::int as count from daily_routines where user_id = $1`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

export async function hasRoutines(userId: string): Promise<boolean> {
  return (await countRoutinesForUser(userId)) > 0;
}

export async function listRoutinesForUsers(
  userIds: string[],
): Promise<DailyRoutine[]> {
  if (userIds.length === 0) return [];
  return sql(
    `select id, user_id, weekday, start_minute, end_minute, label, created_at
     from daily_routines
     where user_id = any($1::text[])
     order by weekday asc, start_minute asc`,
    [userIds],
  );
}

export async function createRoutine(
  userId: string,
  input: RoutineInput,
): Promise<
  | { ok: true; routine: DailyRoutine }
  | { ok: false; error: string }
> {
  const count = await countRoutinesForUser(userId);
  if (count >= MAX_ROUTINES_PER_USER) {
    return { ok: false, error: "routine_limit" };
  }
  const routineId = id("rtn");
  await sql(
    `insert into daily_routines
       (id, user_id, weekday, start_minute, end_minute, label)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      routineId,
      userId,
      input.weekday,
      input.start_minute,
      input.end_minute,
      input.label,
    ],
  );
  const rows = await sql<DailyRoutine>(
    `select id, user_id, weekday, start_minute, end_minute, label, created_at
     from daily_routines where id = $1`,
    [routineId],
  );
  const routine = rows[0];
  if (!routine) return { ok: false, error: "create_failed" };
  return { ok: true, routine };
}

export async function updateRoutine(
  userId: string,
  routineId: string,
  input: RoutineInput,
): Promise<
  | { ok: true; routine: DailyRoutine }
  | { ok: false; error: string }
> {
  const updated = await sql<DailyRoutine>(
    `update daily_routines
     set weekday = $3, start_minute = $4, end_minute = $5, label = $6
     where id = $1 and user_id = $2
     returning id, user_id, weekday, start_minute, end_minute, label, created_at`,
    [
      routineId,
      userId,
      input.weekday,
      input.start_minute,
      input.end_minute,
      input.label,
    ],
  );
  if (!updated[0]) return { ok: false, error: "not_found" };
  return { ok: true, routine: updated[0] };
}

export async function deleteRoutine(
  userId: string,
  routineId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql<{ id: string }>(
    `delete from daily_routines
     where id = $1 and user_id = $2
     returning id`,
    [routineId, userId],
  );
  if (!rows[0]) return { ok: false, error: "not_found" };
  return { ok: true };
}
