import { createSeedData } from './seed'
import type { Activity, AppData, Friend } from './types'

const STORAGE_KEY = 'bottenheimer.friends-activity.v1'

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = createSeedData()
      saveData(seed)
      return seed
    }
    const parsed = JSON.parse(raw) as AppData
    if (!parsed?.friends || !parsed?.activities) {
      const seed = createSeedData()
      saveData(seed)
      return seed
    }
    return parsed
  } catch {
    const seed = createSeedData()
    saveData(seed)
    return seed
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetToSample(): AppData {
  const seed = createSeedData()
  saveData(seed)
  return seed
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
