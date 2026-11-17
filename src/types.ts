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
}

export type AppData = {
  friends: Friend[]
  activities: Activity[]
  version: 1
}

export type View =
  | { kind: 'home' }
  | { kind: 'friend'; friendId: string }
  | { kind: 'edit-friend'; friendId?: string }
  | { kind: 'log-activity'; friendId?: string }
