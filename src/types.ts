export type Friend = {
  id: string
  name: string
  note?: string
  emoji?: string
  color: string
  createdAt: string
}

export type Activity = {
  id: string
  friendId: string
  what: string
  place?: string
  whenLabel?: string
  timestamp: string
  /** Set when this entry was generated from a repeating event */
  routineId?: string
}

/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Recurrence = 'weekly' | 'daily'

export type Routine = {
  id: string
  friendId: string
  what: string
  place?: string
  /** Human label like "after work" or "7:30pm" */
  whenLabel?: string
  recurrence: Recurrence
  /** Required when recurrence is weekly */
  weekdays?: Weekday[]
  /** Local time HH:MM for generated occurrences */
  time?: string
  createdAt: string
  /** ISO date (YYYY-MM-DD) of last day we logged an occurrence */
  lastMaterializedDate?: string
}

export type AppData = {
  friends: Friend[]
  activities: Activity[]
  routines: Routine[]
  version: 1
}

export type View =
  | { kind: 'home' }
  | { kind: 'friend'; friendId: string }
  | { kind: 'edit-friend'; friendId?: string }
  | { kind: 'log-activity'; friendId?: string }
  | { kind: 'edit-routine'; friendId?: string; routineId?: string }
