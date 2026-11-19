"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type CalView,
  addDays,
  dayKey,
  formatMonthTitle,
  formatWeekTitle,
  monthGrid,
  rangeForView,
  sameDay,
  startOfMonth,
  weekDays,
} from "@/lib/calendar";
import { formatWhenRange } from "@/lib/format";
import {
  PREFS_EVENT,
  isCalDefaultView,
  patchPrefs,
  readPrefs,
} from "@/lib/prefs";
import styles from "./Calendar.module.css";

export type CalPlan = {
  id: string;
  title: string;
  place: string;
  starts_at: string | null;
  ends_at?: string | null;
  my_rsvp: string | null;
  going_count: number;
  creator_name?: string;
  audience?: string;
  occurrence_key?: string;
};

type BusyBlock = {
  kind: "routine" | "plan";
  label: string;
  time_label: string;
  plan_id?: string;
};

type MemberAvail = {
  user_id: string;
  display_name: string;
  role: string;
  status: "free" | "busy" | "unknown";
  blocks: BusyBlock[];
  has_routines: boolean;
};

type DayAvailPayload = {
  day: string;
  members: MemberAvail[];
  free_count: number;
  busy_count: number;
  unknown_count: number;
  viewer?: {
    role: string | null;
    has_routines: boolean;
    needs_routines: boolean;
  };
};

function planKey(e: CalPlan): string {
  return e.occurrence_key ? `${e.id}::${e.occurrence_key}` : e.id;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayHeading(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function CalendarBoard() {
  const [view, setView] = useState<CalView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [plans, setPlans] = useState<CalPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [avail, setAvail] = useState<DayAvailPayload | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [needsRoutines, setNeedsRoutines] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [calError, setCalError] = useState("");

  useEffect(() => {
    const sync = () => {
      const prefs = readPrefs();
      if (isCalDefaultView(prefs.calendarView)) setView(prefs.calendarView);
      setPromptDismissed(Boolean(prefs.routinesPromptDismissed));
    };
    sync();
    window.addEventListener(PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREFS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setNeedsRoutines(Boolean(data.viewer?.needs_routines));
      })
      .catch(() => {
        if (alive) setNeedsRoutines(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const { from, to } = useMemo(() => rangeForView(view, anchor), [view, anchor]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCalError("");
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    fetch(`/api/calendar?${q}`, { credentials: "same-origin" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) {
          setPlans([]);
          setCalError(
            data.error === "sign_in_required"
              ? "Sign in again to load plans."
              : "Couldn’t load calendar plans.",
          );
          return;
        }
        setPlans(Array.isArray(data.plans) ? data.plans : []);
      })
      .catch(() => {
        if (alive) {
          setPlans([]);
          setCalError("Couldn’t load calendar plans.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  useEffect(() => {
    if (!selectedDay) {
      setAvail(null);
      return;
    }
    let alive = true;
    setAvailLoading(true);
    fetch(`/api/availability?day=${encodeURIComponent(selectedDay)}`, {
      credentials: "same-origin",
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok || data.error) {
          setAvail(null);
          return;
        }
        setAvail(data as DayAvailPayload);
        if (data.viewer?.needs_routines != null) {
          setNeedsRoutines(Boolean(data.viewer.needs_routines));
        }
      })
      .catch(() => {
        if (alive) setAvail(null);
      })
      .finally(() => {
        if (alive) setAvailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedDay]);

  function dismissRoutinesPrompt() {
    setPromptDismissed(true);
    patchPrefs({ routinesPromptDismissed: true });
  }

  const showRoutinesPrompt = needsRoutines && !promptDismissed;

  const byDay = useMemo(() => {
    const map = new Map<string, CalPlan[]>();
    for (const p of plans) {
      if (!p.starts_at) continue;
      const start = new Date(p.starts_at);
      start.setHours(0, 0, 0, 0);
      const end = new Date(p.ends_at || p.starts_at);
      end.setHours(0, 0, 0, 0);
      // Paint multi-day spans across each calendar cell (cap runaway ranges).
      let cursor = start;
      for (let i = 0; i < 62 && cursor.getTime() <= end.getTime(); i += 1) {
        const key = dayKey(cursor);
        const list = map.get(key) || [];
        if (!list.some((x) => planKey(x) === planKey(p))) list.push(p);
        map.set(key, list);
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [plans]);

  const today = new Date();
  const title =
    view === "month"
      ? formatMonthTitle(anchor)
      : view === "week"
        ? formatWeekTitle(anchor)
        : "Coming up";

  function shift(dir: -1 | 1) {
    if (view === "month") {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    } else if (view === "week") {
      setAnchor(addDays(anchor, dir * 7));
    } else {
      setAnchor(addDays(anchor, dir * 14));
    }
  }

  function selectDay(day: Date) {
    const key = dayKey(day);
    setSelectedDay((prev) => (prev === key ? null : key));
  }

  const freeMembers = avail?.members.filter((m) => m.status === "free") || [];
  const busyMembers = avail?.members.filter((m) => m.status === "busy") || [];
  const unknownMembers =
    avail?.members.filter((m) => m.status === "unknown") || [];

  return (
    <section className={`${styles.hero} rise`}>
      <h1 className={styles.brand}>Fun Peepers</h1>
      <p className={`${styles.lede} rise rise-delay-1`}>
        Invite-only shared calendar — everyone in the circle sees every plan.
        Tap a day to see who&apos;s free before you plan over people.
      </p>

      {showRoutinesPrompt ? (
        <div className={`${styles.routinePrompt} rise rise-delay-1`} role="status">
          <div className={styles.routinePromptBody}>
            <strong>Set your daily routines</strong>
            <p>
              Sports, church, school — weekday + time so Who&apos;s free stays
              honest. Fun Peeps need at least one.
            </p>
            <div className={styles.routinePromptActions}>
              <Link href="/settings#routines" className={styles.routineCta}>
                Add routines
              </Link>
              <button
                type="button"
                className={styles.routineDismiss}
                onClick={dismissRoutinesPrompt}
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            className={styles.routineDismissX}
            onClick={dismissRoutinesPrompt}
            aria-label="Dismiss routines prompt"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className={`${styles.chrome} rise rise-delay-2`}>
        <div className={styles.chromePeriod}>
          <button
            type="button"
            className={styles.chev}
            onClick={() => shift(-1)}
            aria-label="Previous period"
          >
            ‹
          </button>
          <div className={styles.periodBody}>
            <div className={styles.title}>{title}</div>
            <button
              type="button"
              className={styles.todayLink}
              onClick={() =>
                setAnchor(view === "month" ? startOfMonth(today) : today)
              }
            >
              Jump to today
            </button>
          </div>
          <button
            type="button"
            className={styles.chev}
            onClick={() => shift(1)}
            aria-label="Next period"
          >
            ›
          </button>
          <Link href="/plans/new" className={styles.cta} aria-label="Add plan">
            <span className={styles.ctaPlus} aria-hidden>
              +
            </span>
            <span className={styles.ctaLabel}>Add plan</span>
          </Link>
        </div>
        <div className={styles.viewRail} role="tablist" aria-label="Calendar view">
          {(["month", "week", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              data-active={view === v}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {selectedDay ? (
        <div
          className={`${styles.whosFree} rise`}
          aria-live="polite"
          aria-label={`Who's free on ${formatDayHeading(selectedDay)}`}
        >
          <div className={styles.whosFreeHead}>
            <p className={styles.whosFreeTitle}>
              <span className={styles.whosFreeLabel}>Free?</span>
              <span className={styles.whosFreeDay}>{formatDayHeading(selectedDay)}</span>
              {!availLoading && avail ? (
                <span className={styles.whosFreeCounts} aria-hidden="true">
                  {avail.free_count > 0 ? (
                    <span data-tone="free">{avail.free_count} free</span>
                  ) : null}
                  {avail.busy_count > 0 ? (
                    <span data-tone="busy">{avail.busy_count} busy</span>
                  ) : null}
                  {avail.unknown_count > 0 ? (
                    <span data-tone="unknown">{avail.unknown_count} unset</span>
                  ) : null}
                  {avail.free_count === 0 &&
                  avail.busy_count === 0 &&
                  avail.unknown_count === 0 ? (
                    <span data-tone="unknown">none</span>
                  ) : null}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className={styles.whosFreeClose}
              onClick={() => setSelectedDay(null)}
              aria-label="Close who's free"
            >
              ×
            </button>
          </div>

          {availLoading ? (
            <p className={styles.whosFreeHint}>Checking…</p>
          ) : null}

          {!availLoading && avail ? (
            <div className={styles.whosFreeBody}>
              {freeMembers.length === 0 &&
              busyMembers.length === 0 &&
              unknownMembers.length === 0 ? (
                <p className={styles.whosFreeHint}>No Fun Peeps yet.</p>
              ) : null}

              {freeMembers.length > 0 ? (
                <p className={styles.whosFreeInline} data-tone="free">
                  {freeMembers.map((m) => m.display_name).join(" · ")}
                </p>
              ) : null}

              {busyMembers.length > 0 ? (
                <ul className={styles.whosFreeBusyList}>
                  {busyMembers.map((m) => (
                    <li key={m.user_id}>
                      <span className={styles.whosFreeName}>{m.display_name}</span>
                      <span className={styles.busyLine}>
                        {m.blocks
                          .slice(0, 1)
                          .map((b) => `${b.time_label} ${b.label}`)
                          .join("")}
                        {m.blocks.length > 1 ? ` +${m.blocks.length - 1}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {unknownMembers.length > 0 ? (
                <p className={styles.whosFreeHint}>
                  Unset · {unknownMembers.map((m) => m.display_name).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {!availLoading && !avail ? (
            <p className={styles.whosFreeHint}>Couldn&apos;t load who&apos;s free.</p>
          ) : null}
        </div>
      ) : null}

      {loading ? <p className={styles.empty}>Loading calendar…</p> : null}
      {!loading && calError ? <p className={styles.empty}>{calError}</p> : null}

      {!loading && view === "month" ? (
        <>
          <div className={`${styles.month} rise rise-delay-3`}>
            {DOW.map((d) => (
              <div key={d} className={styles.dow}>
                {d}
              </div>
            ))}
            {monthGrid(anchor).map((day) => {
              const key = dayKey(day);
              const events = byDay.get(key) || [];
              const inMonth = day.getMonth() === anchor.getMonth();
              const selected = selectedDay === key;
              const isToday = sameDay(day, today);
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${isToday ? "Today, " : ""}${formatDayHeading(key)}${events.length ? `, ${events.length} plans` : ""} — who's free`}
                  className={`${styles.cell} ${inMonth ? "" : styles.cellMuted} ${
                    isToday ? styles.cellToday : ""
                  } ${selected ? styles.cellSelected : ""}`}
                  onClick={() => selectDay(day)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectDay(day);
                    }
                  }}
                >
                  <span className={isToday ? styles.dayNumToday : styles.dayNum}>
                    {day.getDate()}
                  </span>
                  {events.slice(0, 3).map((e) => (
                    <Link
                      key={planKey(e)}
                      href={`/plans/${e.id}`}
                      className={styles.event}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.audience === "guest" ? "G · " : ""}
                      {e.title}
                    </Link>
                  ))}
                  {events.length > 3 ? (
                    <span className={styles.dayNum}>+{events.length - 3}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={`${styles.monthAgenda} rise rise-delay-3`}>
            {monthGrid(anchor)
              .filter((day) => day.getMonth() === anchor.getMonth())
              .map((day) => {
                const key = dayKey(day);
                const events = byDay.get(key) || [];
                const isToday = sameDay(day, today);
                const isPast = dayKey(day) < dayKey(today);
                // Keep agenda light: plans, today, selected, and upcoming empty days.
                if (
                  events.length === 0 &&
                  !isToday &&
                  selectedDay !== key &&
                  isPast
                ) {
                  return null;
                }
                if (events.length === 0 && !isToday && selectedDay !== key) {
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.agendaDay} ${styles.agendaDayEmpty}`}
                      onClick={() => selectDay(day)}
                    >
                      <div className={styles.agendaDate}>
                        {day.getDate()}
                        <span className={styles.agendaDow}>{DOW[day.getDay()]}</span>
                      </div>
                      <div className={styles.agendaEvents}>
                        <span className={styles.agendaWhosFree}>Who&apos;s free?</span>
                      </div>
                    </button>
                  );
                }
                return (
                  <div
                    key={key}
                    className={`${styles.agendaDay} ${
                      isToday ? styles.agendaDayToday : ""
                    } ${selectedDay === key ? styles.agendaDaySelected : ""}`}
                  >
                    <button
                      type="button"
                      className={styles.agendaDateBtn}
                      onClick={() => selectDay(day)}
                      aria-pressed={selectedDay === key}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={`${isToday ? "Today, " : ""}Who's free on ${formatDayHeading(key)}`}
                    >
                      <span className={styles.agendaDate}>
                        <span className={isToday ? styles.agendaNumToday : undefined}>
                          {day.getDate()}
                        </span>
                        {isToday ? (
                          <span className={styles.agendaTodayLabel}>Today</span>
                        ) : (
                          <span className={styles.agendaDow}>{DOW[day.getDay()]}</span>
                        )}
                      </span>
                    </button>
                    <div className={styles.agendaEvents}>
                      {events.length === 0 ? (
                        <button
                          type="button"
                          className={styles.agendaWhosFree}
                          onClick={() => selectDay(day)}
                        >
                          {isToday ? "Today — tap for who's free" : "Who's free?"}
                        </button>
                      ) : (
                        <>
                          {events.map((e) => (
                            <Link
                              key={planKey(e)}
                              href={`/plans/${e.id}`}
                              className={styles.agendaEvent}
                            >
                              <strong>{e.title}</strong>
                              <div className={styles.weekMeta}>
                                {e.audience === "guest" ? "Guest · " : "Fun Peeps · "}
                                {formatWhenRange(e.starts_at, e.ends_at)}
                                {e.place ? ` · ${e.place}` : ""}
                              </div>
                            </Link>
                          ))}
                          <button
                            type="button"
                            className={styles.agendaWhosFree}
                            onClick={() => selectDay(day)}
                          >
                            Who&apos;s free?
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      ) : null}

      {!loading && view === "week" ? (
        <div className={`${styles.week} rise rise-delay-3`}>
          {weekDays(anchor).map((day) => {
            const key = dayKey(day);
            const events = byDay.get(key) || [];
            const selected = selectedDay === key;
            const isToday = sameDay(day, today);
            return (
              <div
                key={key}
                className={`${styles.weekCol} ${isToday ? styles.weekColToday : ""} ${
                  selected ? styles.weekColSelected : ""
                }`}
              >
                <button
                  type="button"
                  className={styles.weekHeadBtn}
                  onClick={() => selectDay(day)}
                  aria-pressed={selected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${isToday ? "Today, " : ""}Who's free on ${formatDayHeading(key)}`}
                >
                  <div className={styles.weekDow}>
                    {isToday ? "Today" : DOW[day.getDay()]}
                  </div>
                  <div className={isToday ? styles.weekDateToday : styles.weekDate}>
                    {day.getDate()}
                  </div>
                </button>
                {events.length === 0 ? (
                  <button
                    type="button"
                    className={styles.agendaWhosFree}
                    onClick={() => selectDay(day)}
                  >
                    Who&apos;s free?
                  </button>
                ) : (
                  events.map((e) => (
                    <Link key={planKey(e)} href={`/plans/${e.id}`} className={styles.weekEvent}>
                      <strong>{e.title}</strong>
                      <div className={styles.weekMeta}>
                        {e.audience === "guest" ? "Guest · " : "Fun Peeps · "}
                        {formatWhenRange(e.starts_at, e.ends_at)}
                        {e.place ? ` · ${e.place}` : ""}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && view === "list" ? (
        <div className={`${styles.list} rise rise-delay-3`}>
          {plans.length === 0 ? (
            <p className={styles.empty}>Nothing scheduled — add a plan for the circle.</p>
          ) : (
            plans.map((e) => (
              <Link key={planKey(e)} href={`/plans/${e.id}`} className={styles.listRow}>
                <div className={styles.listWhen}>
                  {formatWhenRange(e.starts_at, e.ends_at)}
                </div>
                <div>
                  <div className={styles.listTitle}>{e.title}</div>
                  <div className={styles.listMeta}>
                    {e.audience === "guest" ? "Guest · " : "Fun Peeps · "}
                    {e.place || "Place TBD"}
                    {e.creator_name ? ` · ${e.creator_name}` : ""}
                    {` · ${e.going_count} going`}
                  </div>
                </div>
                {e.my_rsvp ? <span className={styles.chip}>{e.my_rsvp}</span> : null}
              </Link>
            ))
          )}
          <p className={styles.empty} style={{ paddingTop: "0.75rem" }}>
            Switch to month or week and tap a day for Who&apos;s free.
          </p>
        </div>
      ) : null}
    </section>
  );
}
