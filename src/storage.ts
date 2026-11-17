import { createSeedData } from './seed'
import type {
  Activity,
  AppData,
  Friend,
  Recurrence,
  Routine,
  Weekday,
} from './types'

const STORAGE_KEY = 'bottenheimer.friends-activity.v1'
const LOOKBACK_DAYS = 21

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseTime(time?: string): { hours: number; minutes: number } {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return { hours: 12, minutes: 0 }
  const [h, m] = time.split(':').map(Number)
  return {
    hours: Math.min(23, Math.max(0, h)),
    minutes: Math.min(59, Math.max(0, m)),
  }
}

function occurrenceTimestamp(dateKey: string, time?: string): string {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const { hours, minutes } = parseTime(time)
  return new Date(y, mo - 1, d, hours, minutes, 0, 0).toISOString()
}

function routineMatchesDay(routine: Routine, day: Date): boolean {
  if (routine.recurrence === 'daily') return true
  const weekday = day.getDay() as Weekday
  return (routine.weekdays ?? []).includes(weekday)
}

function eachDayInclusive(from: Date, to: Date): Date[] {
  const days: Date[] = []
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/** Create activity rows for due routine occurrences (idempotent). */
export function materializeRoutines(data: AppData): AppData {
  const today = new Date()
  const lookbackStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - LOOKBACK_DAYS,
  )

  const existingKeys = new Set(
    data.activities
      .filter((a) => a.routineId)
      .map((a) => `${a.routineId}|${localDateKey(new Date(a.timestamp))}`),
  )

  const newActivities: Activity[] = []
  const routines = data.routines.map((routine) => {
    const created = new Date(routine.createdAt)
    const start = new Date(
      Math.max(
        lookbackStart.getTime(),
        new Date(
          created.getFullYear(),
          created.getMonth(),
          created.getDate(),
        ).getTime(),
      ),
    )

    let lastDate = routine.lastMaterializedDate
    for (const day of eachDayInclusive(start, today)) {
      if (!routineMatchesDay(routine, day)) continue
      const dateKey = localDateKey(day)
      const key = `${routine.id}|${dateKey}`
      if (existingKeys.has(key)) {
        lastDate = dateKey
        continue
      }
      newActivities.push({
        id: uid('a'),
        friendId: routine.friendId,
        what: routine.what,
        place: routine.place,
        whenLabel: routine.whenLabel,
        timestamp: occurrenceTimestamp(dateKey, routine.time),
        routineId: routine.id,
      })
      existingKeys.add(key)
      lastDate = dateKey
    }

    return lastDate === routine.lastMaterializedDate
      ? routine
      : { ...routine, lastMaterializedDate: lastDate }
  })

  if (newActivities.length === 0) {
    const routinesChanged = routines.some(
      (r, i) => r !== data.routines[i],
    )
    if (!routinesChanged) return data
    const next = { ...data, routines }
    saveData(next)
    return next
  }

  const next = {
    ...data,
    routines,
    activities: [...newActivities, ...data.activities],
  }
  saveData(next)
  return next
}

function normalizeData(parsed: Partial<AppData>): AppData | null {
  if (!parsed?.friends || !parsed?.activities) return null
  return {
    version: 1,
    friends: parsed.friends,
    activities: parsed.activities,
    routines: Array.isArray(parsed.routines) ? parsed.routines : [],
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = createSeedData()
      const materialized = materializeRoutines(seed)
      saveData(materialized)
      return materialized
    }
    const normalized = normalizeData(JSON.parse(raw) as Partial<AppData>)
    if (!normalized) {
      const seed = createSeedData()
      const materialized = materializeRoutines(seed)
      saveData(materialized)
      return materialized
    }
    return materializeRoutines(normalized)
  } catch {
    const seed = createSeedData()
    const materialized = materializeRoutines(seed)
    saveData(materialized)
    return materialized
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetToSample(): AppData {
  const seed = createSeedData()
  const materialized = materializeRoutines(seed)
  saveData(materialized)
  return materialized
}

export function addFriend(
  data: AppData,
  input: { name: string; note?: string; emoji?: string; color: string },
): AppData {
  const friend: Friend = {
    id: uid('f'),
    name: input.name.trim(),
    note: input.note?.trim() || undefined,
    emoji: input.emoji?.trim() || undefined,
    color: input.color,
    createdAt: new Date().toISOString(),
  }
  const next = { ...data, friends: [...data.friends, friend] }
  saveData(next)
  return next
}

export function updateFriend(
  data: AppData,
  id: string,
  input: { name: string; note?: string; emoji?: string; color: string },
): AppData {
  const next = {
    ...data,
    friends: data.friends.map((f) =>
      f.id === id
        ? {
            ...f,
            name: input.name.trim(),
            note: input.note?.trim() || undefined,
            emoji: input.emoji?.trim() || undefined,
            color: input.color,
          }
        : f,
    ),
  }
  saveData(next)
  return next
}

export function removeFriend(data: AppData, id: string): AppData {
  const next = {
    ...data,
    friends: data.friends.filter((f) => f.id !== id),
    activities: data.activities.filter((a) => a.friendId !== id),
    routines: data.routines.filter((r) => r.friendId !== id),
  }
  saveData(next)
  return next
}

export function addActivity(
  data: AppData,
  input: {
    friendId: string
    what: string
    place?: string
    whenLabel?: string
    timestamp?: string
  },
): AppData {
  const activity: Activity = {
    id: uid('a'),
    friendId: input.friendId,
    what: input.what.trim(),
    place: input.place?.trim() || undefined,
    whenLabel: input.whenLabel?.trim() || undefined,
    timestamp: input.timestamp || new Date().toISOString(),
  }
  const next = {
    ...data,
    activities: [activity, ...data.activities],
  }
  saveData(next)
  return next
}

export function removeActivity(data: AppData, id: string): AppData {
  const next = {
    ...data,
    activities: data.activities.filter((a) => a.id !== id),
  }
  saveData(next)
  return next
}

export function addRoutine(
  data: AppData,
  input: {
    friendId: string
    what: string
    place?: string
    whenLabel?: string
    recurrence: Recurrence
    weekdays?: Weekday[]
    time?: string
  },
): AppData {
  const routine: Routine = {
    id: uid('r'),
    friendId: input.friendId,
    what: input.what.trim(),
    place: input.place?.trim() || undefined,
    whenLabel: input.whenLabel?.trim() || undefined,
    recurrence: input.recurrence,
    weekdays:
      input.recurrence === 'weekly'
        ? [...new Set(input.weekdays ?? [])].sort()
        : undefined,
    time: input.time?.trim() || undefined,
    createdAt: new Date().toISOString(),
  }
  const next = {
    ...data,
    routines: [...data.routines, routine],
  }
  return materializeRoutines(next)
}

export function updateRoutine(
  data: AppData,
  id: string,
  input: {
    friendId: string
    what: string
    place?: string
    whenLabel?: string
    recurrence: Recurrence
    weekdays?: Weekday[]
    time?: string
  },
): AppData {
  const next = {
    ...data,
    routines: data.routines.map((r) =>
      r.id === id
        ? {
            ...r,
            friendId: input.friendId,
            what: input.what.trim(),
            place: input.place?.trim() || undefined,
            whenLabel: input.whenLabel?.trim() || undefined,
            recurrence: input.recurrence,
            weekdays:
              input.recurrence === 'weekly'
                ? [...new Set(input.weekdays ?? [])].sort()
                : undefined,
            time: input.time?.trim() || undefined,
          }
        : r,
    ),
  }
  saveData(next)
  return next
}

export function removeRoutine(data: AppData, id: string): AppData {
  const next = {
    ...data,
    routines: data.routines.filter((r) => r.id !== id),
  }
  saveData(next)
  return next
}

export function formatRecurrence(routine: Routine): string {
  if (routine.recurrence === 'daily') {
    return routine.time ? `Daily · ${formatClock(routine.time)}` : 'Daily'
  }
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = (routine.weekdays ?? []).map((d) => labels[d]).join(', ')
  const dayPart = days || 'No days set'
  return routine.time
    ? `${dayPart} · ${formatClock(routine.time)}`
    : dayPart
}

function formatClock(time: string): string {
  const { hours, minutes } = parseTime(time)
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function nextOccurrenceLabel(routine: Routine): string {
  const start = new Date()
  for (let i = 0; i < 14; i++) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    )
    if (!routineMatchesDay(routine, day)) continue
    if (i === 0) {
      if (routine.time) {
        const { hours, minutes } = parseTime(routine.time)
        const when = new Date()
        when.setHours(hours, minutes, 0, 0)
        if (when.getTime() < Date.now()) continue
      }
      return routine.time ? `Today · ${formatClock(routine.time)}` : 'Today'
    }
    if (i === 1) {
      return routine.time
        ? `Tomorrow · ${formatClock(routine.time)}`
        : 'Tomorrow'
    }
    const dayName = day.toLocaleDateString(undefined, { weekday: 'short' })
    return routine.time
      ? `${dayName} · ${formatClock(routine.time)}`
      : dayName
  }
  return formatRecurrence(routine)
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
