import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { FRIEND_COLORS, SAMPLE_EMOJIS } from './seed'
import {
  addActivity,
  addFriend,
  addRoutine,
  formatRecurrence,
  loadData,
  nextOccurrenceLabel,
  relativeTime,
  removeActivity,
  removeFriend,
  removeRoutine,
  resetToSample,
  updateFriend,
  updateRoutine,
} from './storage'
import type {
  Activity,
  AppData,
  Friend,
  Recurrence,
  Routine,
  View,
  Weekday,
} from './types'
import './App.css'

const WEEKDAY_OPTIONS: { value: Weekday; label: string }[] = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

function friendById(data: AppData, id: string) {
  return data.friends.find((f) => f.id === id)
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [view, setView] = useState<View>({ kind: 'home' })

  const feed = useMemo(() => {
    return [...data.activities].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
  }, [data.activities])

  const selectedFriend =
    view.kind === 'friend' || view.kind === 'edit-friend'
      ? friendById(data, view.friendId ?? '')
      : undefined

  const friendActivities = useMemo(() => {
    if (view.kind !== 'friend') return []
    return feed.filter((a) => a.friendId === view.friendId)
  }, [feed, view])

  const friendRoutines = useMemo(() => {
    if (view.kind !== 'friend') return []
    return data.routines.filter((r) => r.friendId === view.friendId)
  }, [data.routines, view])

  function handleReset() {
    if (
      !confirm(
        'Reset to sample friends and activities? Your current data will be replaced.',
      )
    ) {
      return
    }
    setData(resetToSample())
    setView({ kind: 'home' })
  }

  const sheetOpen =
    view.kind === 'edit-friend' ||
    view.kind === 'log-activity' ||
    view.kind === 'edit-routine'

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="grain" />
      </div>

      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => setView({ kind: 'home' })}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            <span className="brand-name">Bottenheimer</span>
            <span className="brand-sub">friends log</span>
          </span>
        </button>
        <div className="top-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={handleReset}
            title="Reset sample data"
          >
            Reset
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => setView({ kind: 'edit-friend' })}
          >
            Add friend
          </button>
        </div>
      </header>

      <main className="shell">
        {view.kind === 'home' && (
          <HomeView
            data={data}
            feed={feed}
            onOpenFriend={(id) => setView({ kind: 'friend', friendId: id })}
            onLog={() => setView({ kind: 'log-activity' })}
            onAddFriend={() => setView({ kind: 'edit-friend' })}
            onAddRoutine={() => setView({ kind: 'edit-routine' })}
            onEditRoutine={(routineId) =>
              setView({ kind: 'edit-routine', routineId })
            }
          />
        )}

        {view.kind === 'friend' && selectedFriend && (
          <FriendDetail
            friend={selectedFriend}
            activities={friendActivities}
            routines={friendRoutines}
            onBack={() => setView({ kind: 'home' })}
            onEdit={() =>
              setView({ kind: 'edit-friend', friendId: selectedFriend.id })
            }
            onLog={() =>
              setView({ kind: 'log-activity', friendId: selectedFriend.id })
            }
            onAddRoutine={() =>
              setView({ kind: 'edit-routine', friendId: selectedFriend.id })
            }
            onEditRoutine={(routineId) =>
              setView({
                kind: 'edit-routine',
                friendId: selectedFriend.id,
                routineId,
              })
            }
            onRemoveRoutine={(id) => setData(removeRoutine(data, id))}
            onRemove={() => {
              if (!confirm(`Remove ${selectedFriend.name} and their activities?`))
                return
              setData(removeFriend(data, selectedFriend.id))
              setView({ kind: 'home' })
            }}
            onRemoveActivity={(id) => setData(removeActivity(data, id))}
          />
        )}

        {sheetOpen && (
          <div className="sheet-backdrop" role="presentation">
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sheet-title"
            >
              {view.kind === 'edit-friend' && (
                <FriendForm
                  friend={
                    view.friendId
                      ? friendById(data, view.friendId)
                      : undefined
                  }
                  onCancel={() =>
                    setView(
                      view.friendId
                        ? { kind: 'friend', friendId: view.friendId }
                        : { kind: 'home' },
                    )
                  }
                  onSave={(input) => {
                    if (view.friendId) {
                      const next = updateFriend(data, view.friendId, input)
                      setData(next)
                      setView({ kind: 'friend', friendId: view.friendId })
                    } else {
                      const next = addFriend(data, input)
                      const newest = next.friends[next.friends.length - 1]
                      setData(next)
                      setView({ kind: 'friend', friendId: newest.id })
                    }
                  }}
                />
              )}

              {view.kind === 'log-activity' && (
                <ActivityForm
                  friends={data.friends}
                  presetFriendId={view.friendId}
                  onCancel={() =>
                    setView(
                      view.friendId
                        ? { kind: 'friend', friendId: view.friendId }
                        : { kind: 'home' },
                    )
                  }
                  onSave={(input) => {
                    const next = addActivity(data, input)
                    setData(next)
                    setView({ kind: 'friend', friendId: input.friendId })
                  }}
                />
              )}

              {view.kind === 'edit-routine' && (
                <RoutineForm
                  friends={data.friends}
                  routine={
                    view.routineId
                      ? data.routines.find((r) => r.id === view.routineId)
                      : undefined
                  }
                  presetFriendId={view.friendId}
                  onCancel={() =>
                    setView(
                      view.friendId
                        ? { kind: 'friend', friendId: view.friendId }
                        : { kind: 'home' },
                    )
                  }
                  onSave={(input) => {
                    if (view.routineId) {
                      const next = updateRoutine(data, view.routineId, input)
                      setData(next)
                    } else {
                      const next = addRoutine(data, input)
                      setData(next)
                    }
                    setView({ kind: 'friend', friendId: input.friendId })
                  }}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function HomeView({
  data,
  feed,
  onOpenFriend,
  onLog,
  onAddFriend,
  onAddRoutine,
  onEditRoutine,
}: {
  data: AppData
  feed: Activity[]
  onOpenFriend: (id: string) => void
  onLog: () => void
  onAddFriend: () => void
  onAddRoutine: () => void
  onEditRoutine: (routineId: string) => void
}) {
  const latest = feed[0]
  const latestFriend = latest ? friendById(data, latest.friendId) : undefined

  return (
    <div className="home fade-in">
      <section className="hero-block">
        <p className="eyebrow">
          <span className="live-dot" aria-hidden="true" />
          What’s everyone up to
        </p>
        <h1 className="hero-title">
          {latestFriend ? (
            <>
              <span className="hero-name">{latestFriend.name.split(' ')[0]}</span>
              <span className="hero-rest"> is {latest?.what.toLowerCase()}</span>
            </>
          ) : (
            <>Your circle is quiet — log something.</>
          )}
        </h1>
        {latest && (
          <p className="hero-meta">
            {[latest.place, latest.whenLabel, relativeTime(latest.timestamp)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="hero-ctas">
          <button type="button" className="primary-btn" onClick={onLog}>
            Log activity
          </button>
          <button type="button" className="ghost-btn" onClick={onAddRoutine}>
            Repeating
          </button>
          <button type="button" className="ghost-btn" onClick={onAddFriend}>
            New friend
          </button>
        </div>
      </section>

      <section className="friends-rail" aria-label="Friends">
        <div className="section-head">
          <h2>Circle</h2>
          <span>{data.friends.length}</span>
        </div>
        <div className="rail">
          {data.friends.map((friend) => (
            <button
              key={friend.id}
              type="button"
              className="friend-chip"
              onClick={() => onOpenFriend(friend.id)}
              style={{ '--friend': friend.color } as CSSProperties}
            >
              <span className="avatar" aria-hidden="true">
                {friend.emoji || friend.name.slice(0, 1)}
              </span>
              <span className="friend-chip-name">{friend.name.split(' ')[0]}</span>
            </button>
          ))}
          {data.friends.length === 0 && (
            <p className="empty-inline">No friends yet — add someone.</p>
          )}
        </div>
      </section>

      <section className="feed-section" aria-label="Repeating">
        <div className="section-head">
          <h2>Repeating</h2>
          <span>{data.routines.length}</span>
        </div>
        <ul className="routine-list">
          {data.routines.map((routine) => {
            const friend = friendById(data, routine.friendId)
            if (!friend) return null
            return (
              <li key={routine.id}>
                <button
                  type="button"
                  className="routine-row"
                  onClick={() => onEditRoutine(routine.id)}
                  style={{ '--friend': friend.color } as CSSProperties}
                >
                  <span className="routine-mark" aria-hidden="true">
                    ↻
                  </span>
                  <span className="routine-body">
                    <span className="timeline-who">{friend.name}</span>
                    <span className="timeline-what">{routine.what}</span>
                    <span className="timeline-meta">
                      {[
                        formatRecurrence(routine),
                        routine.place,
                        `Next: ${nextOccurrenceLabel(routine)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {data.routines.length === 0 && (
            <li className="empty-inline">
              No repeating events yet — add tennis class, run club, and so on.
            </li>
          )}
        </ul>
      </section>

      <section className="feed-section" aria-label="Recent activity">
        <div className="section-head">
          <h2>Recent</h2>
          <span>{feed.length}</span>
        </div>
        <ol className="timeline">
          {feed.map((activity, index) => {
            const friend = friendById(data, activity.friendId)
            if (!friend) return null
            return (
              <li
                key={activity.id}
                className="timeline-item"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <button
                  type="button"
                  className="timeline-row"
                  onClick={() => onOpenFriend(friend.id)}
                  style={{ '--friend': friend.color } as CSSProperties}
                >
                  <span className="timeline-mark" aria-hidden="true">
                    {activity.routineId ? '↻' : friend.emoji || '·'}
                  </span>
                  <span className="timeline-body">
                    <span className="timeline-who">{friend.name}</span>
                    <span className="timeline-what">{activity.what}</span>
                    <span className="timeline-meta">
                      {[
                        activity.routineId ? 'Repeating' : null,
                        activity.place,
                        activity.whenLabel,
                        relativeTime(activity.timestamp),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {feed.length === 0 && (
            <li className="empty-inline">Nothing logged yet.</li>
          )}
        </ol>
      </section>
    </div>
  )
}

function FriendDetail({
  friend,
  activities,
  routines,
  onBack,
  onEdit,
  onLog,
  onAddRoutine,
  onEditRoutine,
  onRemoveRoutine,
  onRemove,
  onRemoveActivity,
}: {
  friend: Friend
  activities: Activity[]
  routines: Routine[]
  onBack: () => void
  onEdit: () => void
  onLog: () => void
  onAddRoutine: () => void
  onEditRoutine: (id: string) => void
  onRemoveRoutine: (id: string) => void
  onRemove: () => void
  onRemoveActivity: (id: string) => void
}) {
  return (
    <div
      className="friend-detail fade-in"
      style={{ '--friend': friend.color } as CSSProperties}
    >
      <button type="button" className="back-link" onClick={onBack}>
        ← All friends
      </button>

      <header className="friend-hero">
        <div className="friend-hero-avatar" aria-hidden="true">
          {friend.emoji || friend.name.slice(0, 1)}
        </div>
        <div>
          <h1>{friend.name}</h1>
          {friend.note && <p className="friend-note">{friend.note}</p>}
        </div>
      </header>

      <div className="detail-actions">
        <button type="button" className="primary-btn" onClick={onLog}>
          Log activity
        </button>
        <button type="button" className="ghost-btn" onClick={onAddRoutine}>
          Repeating
        </button>
        <button type="button" className="ghost-btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="danger-btn" onClick={onRemove}>
          Remove
        </button>
      </div>

      <section className="feed-section">
        <div className="section-head">
          <h2>Repeating</h2>
          <span>{routines.length}</span>
        </div>
        <ul className="routine-list">
          {routines.map((routine) => (
            <li key={routine.id}>
              <div className="routine-row static">
                <span className="routine-mark" aria-hidden="true">
                  ↻
                </span>
                <button
                  type="button"
                  className="routine-body as-button"
                  onClick={() => onEditRoutine(routine.id)}
                >
                  <span className="timeline-what">{routine.what}</span>
                  <span className="timeline-meta">
                    {[
                      formatRecurrence(routine),
                      routine.place,
                      `Next: ${nextOccurrenceLabel(routine)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Delete repeating event"
                  onClick={() => onRemoveRoutine(routine.id)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
          {routines.length === 0 && (
            <li className="empty-inline">
              No repeating events for {friend.name}.
            </li>
          )}
        </ul>
      </section>

      <section className="feed-section">
        <div className="section-head">
          <h2>History</h2>
          <span>{activities.length}</span>
        </div>
        <ol className="timeline">
          {activities.map((activity, index) => (
            <li
              key={activity.id}
              className="timeline-item"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <div className="timeline-row static">
                <span className="timeline-mark" aria-hidden="true">
                  {activity.routineId ? '↻' : '·'}
                </span>
                <span className="timeline-body">
                  <span className="timeline-what">{activity.what}</span>
                  <span className="timeline-meta">
                    {[
                      activity.routineId ? 'Repeating' : null,
                      activity.place,
                      activity.whenLabel,
                      relativeTime(activity.timestamp),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Delete activity"
                  onClick={() => onRemoveActivity(activity.id)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
          {activities.length === 0 && (
            <li className="empty-inline">No activities yet for {friend.name}.</li>
          )}
        </ol>
      </section>
    </div>
  )
}

function FriendForm({
  friend,
  onCancel,
  onSave,
}: {
  friend?: Friend
  onCancel: () => void
  onSave: (input: {
    name: string
    note?: string
    emoji?: string
    color: string
  }) => void
}) {
  const [name, setName] = useState(friend?.name ?? '')
  const [note, setNote] = useState(friend?.note ?? '')
  const [emoji, setEmoji] = useState(friend?.emoji ?? '')
  const [color, setColor] = useState(friend?.color ?? FRIEND_COLORS[0])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name, note, emoji, color })
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2 id="sheet-title">{friend ? 'Edit friend' : 'Add friend'}</h2>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Friend’s name"
          required
          autoFocus
        />
      </label>
      <label>
        Note <span className="optional">optional</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A short reminder about them"
        />
      </label>
      <fieldset className="emoji-field">
        <legend>
          Emoji <span className="optional">optional</span>
        </legend>
        <div className="emoji-row">
          {SAMPLE_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              className={`emoji-pick ${emoji === em ? 'selected' : ''}`}
              onClick={() => setEmoji(emoji === em ? '' : em)}
            >
              {em}
            </button>
          ))}
        </div>
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
          placeholder="or type one"
          aria-label="Custom emoji"
        />
      </fieldset>
      <fieldset className="color-field">
        <legend>Color</legend>
        <div className="color-row">
          {FRIEND_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-pick ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-btn">
          {friend ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  )
}

function ActivityForm({
  friends,
  presetFriendId,
  onCancel,
  onSave,
}: {
  friends: Friend[]
  presetFriendId?: string
  onCancel: () => void
  onSave: (input: {
    friendId: string
    what: string
    place?: string
    whenLabel?: string
    timestamp?: string
  }) => void
}) {
  const [friendId, setFriendId] = useState(
    presetFriendId || friends[0]?.id || '',
  )
  const [what, setWhat] = useState('')
  const [place, setPlace] = useState('')
  const [whenLabel, setWhenLabel] = useState('')
  const [timestamp, setTimestamp] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!friendId || !what.trim()) return
    onSave({
      friendId,
      what,
      place,
      whenLabel,
      timestamp: new Date(timestamp).toISOString(),
    })
  }

  if (friends.length === 0) {
    return (
      <div className="form">
        <h2 id="sheet-title">Log activity</h2>
        <p className="empty-inline">Add a friend first, then log what they’re doing.</p>
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2 id="sheet-title">Log activity</h2>
      <label>
        Friend
        <select
          value={friendId}
          onChange={(e) => setFriendId(e.target.value)}
          required
        >
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.emoji ? `${f.emoji} ` : ''}
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        What are they doing?
        <input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="Hiking, cooking, at a show…"
          required
          autoFocus
        />
      </label>
      <label>
        Place <span className="optional">optional</span>
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Where?"
        />
      </label>
      <label>
        Time label <span className="optional">optional</span>
        <input
          value={whenLabel}
          onChange={(e) => setWhenLabel(e.target.value)}
          placeholder="tonight, morning, weekend…"
        />
      </label>
      <label>
        Timestamp
        <input
          type="datetime-local"
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
          required
        />
      </label>
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-btn">
          Log it
        </button>
      </div>
    </form>
  )
}

function RoutineForm({
  friends,
  routine,
  presetFriendId,
  onCancel,
  onSave,
}: {
  friends: Friend[]
  routine?: Routine
  presetFriendId?: string
  onCancel: () => void
  onSave: (input: {
    friendId: string
    what: string
    place?: string
    whenLabel?: string
    recurrence: Recurrence
    weekdays?: Weekday[]
    time?: string
  }) => void
}) {
  const [friendId, setFriendId] = useState(
    routine?.friendId || presetFriendId || friends[0]?.id || '',
  )
  const [what, setWhat] = useState(routine?.what ?? '')
  const [place, setPlace] = useState(routine?.place ?? '')
  const [whenLabel, setWhenLabel] = useState(routine?.whenLabel ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(
    routine?.recurrence ?? 'weekly',
  )
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    routine?.weekdays ?? [2],
  )
  const [time, setTime] = useState(routine?.time ?? '18:00')

  function toggleDay(day: Weekday) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!friendId || !what.trim()) return
    if (recurrence === 'weekly' && weekdays.length === 0) return
    onSave({
      friendId,
      what,
      place,
      whenLabel,
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : undefined,
      time: time || undefined,
    })
  }

  if (friends.length === 0) {
    return (
      <div className="form">
        <h2 id="sheet-title">Repeating event</h2>
        <p className="empty-inline">Add a friend first, then set a repeating event.</p>
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2 id="sheet-title">
        {routine ? 'Edit repeating' : 'Repeating event'}
      </h2>
      <label>
        Friend
        <select
          value={friendId}
          onChange={(e) => setFriendId(e.target.value)}
          required
        >
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.emoji ? `${f.emoji} ` : ''}
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        What repeats?
        <input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="Tennis class, yoga, choir…"
          required
          autoFocus
        />
      </label>
      <label>
        Place <span className="optional">optional</span>
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Where?"
        />
      </label>
      <label>
        Time label <span className="optional">optional</span>
        <input
          value={whenLabel}
          onChange={(e) => setWhenLabel(e.target.value)}
          placeholder="after work, mornings…"
        />
      </label>
      <fieldset>
        <legend>Repeats</legend>
        <div className="segmented">
          <button
            type="button"
            className={`segment ${recurrence === 'weekly' ? 'selected' : ''}`}
            onClick={() => setRecurrence('weekly')}
          >
            Weekly
          </button>
          <button
            type="button"
            className={`segment ${recurrence === 'daily' ? 'selected' : ''}`}
            onClick={() => setRecurrence('daily')}
          >
            Daily
          </button>
        </div>
      </fieldset>
      {recurrence === 'weekly' && (
        <fieldset>
          <legend>Days</legend>
          <div className="weekday-row">
            {WEEKDAY_OPTIONS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`weekday-pick ${weekdays.includes(day.value) ? 'selected' : ''}`}
                onClick={() => toggleDay(day.value)}
                aria-pressed={weekdays.includes(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label>
        Time of day <span className="optional">optional</span>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <p className="form-hint">
        Matching days from the last few weeks show up in Recent automatically.
      </p>
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-btn"
          disabled={recurrence === 'weekly' && weekdays.length === 0}
        >
          {routine ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  )
}

export default App
