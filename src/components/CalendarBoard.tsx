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
import { formatWhen } from "@/lib/format";
import { isCalDefaultView, readPrefs } from "@/lib/prefs";
import styles from "./Calendar.module.css";

export type CalPlan = {
  id: string;
  title: string;
  place: string;
  starts_at: string | null;
  my_rsvp: string | null;
  going_count: number;
  creator_name?: string;
  audience?: string;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarBoard() {
  const [view, setView] = useState<CalView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [plans, setPlans] = useState<CalPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const preferred = readPrefs().calendarView;
    if (isCalDefaultView(preferred)) setView(preferred);
  }, []);

  const { from, to } = useMemo(() => rangeForView(view, anchor), [view, anchor]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    fetch(`/api/calendar?${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (alive) setPlans(data.plans || []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalPlan[]>();
    for (const p of plans) {
      if (!p.starts_at) continue;
      const key = dayKey(new Date(p.starts_at));
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
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

  return (
    <section className={`${styles.hero} rise`}>
      <h1 className={styles.brand}>Fun Peepers</h1>
      <p className={`${styles.lede} rise rise-delay-1`}>
        Invite-only shared calendar — everyone in the circle sees every plan.
        RSVP, chat, and poll right on the hang.
      </p>

      <div className={`${styles.toolbar} rise rise-delay-2`}>
        <div className={styles.title}>{title}</div>
        <button type="button" className={styles.navBtn} onClick={() => shift(-1)}>
          ←
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setAnchor(view === "month" ? startOfMonth(today) : today)}
        >
          Today
        </button>
        <button type="button" className={styles.navBtn} onClick={() => shift(1)}>
          →
        </button>
        <div className={styles.seg} role="tablist" aria-label="Calendar view">
          {(["month", "week", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-active={view === v}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <Link href="/plans/new" className={styles.cta}>
          Add plan
        </Link>
      </div>

      {loading ? <p className={styles.empty}>Loading calendar…</p> : null}

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
              return (
                <div
                  key={key}
                  className={`${styles.cell} ${inMonth ? "" : styles.cellMuted} ${
                    sameDay(day, today) ? styles.cellToday : ""
                  }`}
                >
                  <span className={styles.dayNum}>{day.getDate()}</span>
                  {events.slice(0, 3).map((e) => (
                    <Link key={e.id} href={`/plans/${e.id}`} className={styles.event}>
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
                if (events.length === 0 && !sameDay(day, today)) return null;
                return (
                  <div key={key} className={styles.agendaDay}>
                    <div className={styles.agendaDate}>
                      {day.getDate()}
                      <span className={styles.agendaDow}>{DOW[day.getDay()]}</span>
                    </div>
                    <div className={styles.agendaEvents}>
                      {events.length === 0 ? (
                        <p className={styles.empty} style={{ padding: 0 }}>
                          Today — nothing yet
                        </p>
                      ) : (
                        events.map((e) => (
                          <Link
                            key={e.id}
                            href={`/plans/${e.id}`}
                            className={styles.agendaEvent}
                          >
                            <strong>{e.title}</strong>
                            <div className={styles.weekMeta}>
                              {e.audience === "guest" ? "Guest · " : "Fun Peeps · "}
                              {formatWhen(e.starts_at)}
                              {e.place ? ` · ${e.place}` : ""}
                            </div>
                          </Link>
                        ))
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
            return (
              <div key={key} className={styles.weekCol}>
                <div className={styles.weekDow}>{DOW[day.getDay()]}</div>
                <div className={styles.weekDate}>{day.getDate()}</div>
                {events.length === 0 ? (
                  <p className={styles.empty} style={{ padding: 0 }}>
                    —
                  </p>
                ) : (
                  events.map((e) => (
                    <Link key={e.id} href={`/plans/${e.id}`} className={styles.weekEvent}>
                      <strong>{e.title}</strong>
                      <div className={styles.weekMeta}>
                        {e.audience === "guest" ? "Guest · " : "Fun Peeps · "}
                        {formatWhen(e.starts_at)}
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
              <Link key={e.id} href={`/plans/${e.id}`} className={styles.listRow}>
                <div className={styles.listWhen}>{formatWhen(e.starts_at)}</div>
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
        </div>
      ) : null}
    </section>
  );
}
