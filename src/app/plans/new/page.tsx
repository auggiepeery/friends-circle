"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLAN_TEMPLATES } from "@/lib/templates";
import {
  combineLocalDateAndTime,
  formatDayChip,
  localDateKey,
} from "@/lib/format";
import {
  formatRecurringRule,
  nextDateKeyForWeekday,
  type RecurFreq,
} from "@/lib/recurrence";
import ui from "@/components/ui.module.css";

type Audience = "fun_peeps" | "guest";
type ScheduleMode = "dates" | "weekly";

const MAX_DAYS = 14;
const WEEKDAY_LABELS = [
  { d: 0, label: "Sun" },
  { d: 1, label: "Mon" },
  { d: 2, label: "Tue" },
  { d: 3, label: "Wed" },
  { d: 4, label: "Thu" },
  { d: 5, label: "Fri" },
  { d: 6, label: "Sat" },
];

export default function NewPlanPage() {
  const router = useRouter();
  const [template, setTemplate] = useState("custom");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("dates");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [extraDate, setExtraDate] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeklyStart, setWeeklyStart] = useState(() => localDateKey(new Date()));
  const [recurFreq, setRecurFreq] = useState<RecurFreq | "">("weekly");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [outdoor, setOutdoor] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Fri 7pm\nSat 6pm\nSun afternoon");
  const [pollKind, setPollKind] = useState("time");
  const [audience, setAudience] = useState<Audience>("fun_peeps");
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        const guest = data.viewer?.role === "guest" || data.viewer?.via === "guest";
        setIsGuest(Boolean(guest));
        if (guest) setAudience("guest");
      })
      .catch(() => undefined);
  }, []);

  function applyTemplate(id: string) {
    setTemplate(id);
    const t = PLAN_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description);
    setPlace(t.place);
    setOutdoor(t.outdoor);
  }

  function addExtraDate() {
    if (!extraDate) return;
    setSelectedDays((prev) => {
      if (prev.includes(extraDate)) return prev;
      if (prev.length >= MAX_DAYS) return prev;
      return [...prev, extraDate].sort();
    });
    setExtraDate("");
  }

  function removeDay(key: string) {
    setSelectedDays((prev) => prev.filter((d) => d !== key));
  }

  function toggleWeekday(d: number) {
    setWeekdays((prev) => {
      if (prev.includes(d)) return prev.filter((x) => x !== d);
      return [...prev, d].sort((a, b) => a - b);
    });
  }

  function buildSlots():
    | { slots: { startsAt: string; endsAt: string | null }[]; recurringRule: string }
    | { error: string } {
    if (!startTime) return { error: "Add a start time." };

    if (scheduleMode === "weekly") {
      if (weekdays.length === 0) {
        return { error: "Pick at least one weekday." };
      }
      if (!recurFreq) {
        return { error: "Choose how often it repeats." };
      }
      const from = weeklyStart
        ? new Date(`${weeklyStart}T12:00:00`)
        : new Date();
      if (Number.isNaN(from.getTime())) {
        return { error: "Couldn’t read the start date." };
      }
      // One series plan per weekday so each has a clean anchor + rule.
      const slots: { startsAt: string; endsAt: string | null }[] = [];
      for (const wd of weekdays) {
        const day = nextDateKeyForWeekday(wd, from);
        const startsAt = combineLocalDateAndTime(day, startTime);
        if (!startsAt) return { error: "Couldn’t read one of the days or times." };
        let endsAt: string | null = null;
        if (endTime) {
          endsAt = combineLocalDateAndTime(day, endTime);
          if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
            return { error: "End time needs to be after start time." };
          }
        }
        slots.push({ startsAt, endsAt });
      }
      // Same rule on each series (weekday encoded; expansion uses each plan’s weekday).
      const recurringRule = formatRecurringRule(recurFreq, weekdays);
      return { slots, recurringRule };
    }

    if (selectedDays.length === 0) {
      return { error: "Add at least one date." };
    }
    const slots: { startsAt: string; endsAt: string | null }[] = [];
    for (const day of selectedDays) {
      const startsAt = combineLocalDateAndTime(day, startTime);
      if (!startsAt) return { error: "Couldn’t read one of the days or times." };
      let endsAt: string | null = null;
      if (endTime) {
        endsAt = combineLocalDateAndTime(day, endTime);
        if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
          return { error: "End time needs to be after start time." };
        }
      }
      slots.push({ startsAt, endsAt });
    }
    return { slots, recurringRule: "" };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const built = buildSlots();
    if ("error" in built) {
      setSaving(false);
      setError(built.error);
      return;
    }

    // Weekly multi-weekday: each slot gets a rule scoped to that weekday only.
    const payloads =
      scheduleMode === "weekly"
        ? built.slots.map((slot, i) => ({
            slots: [slot],
            recurringRule: formatRecurringRule(
              (recurFreq || "weekly") as RecurFreq,
              [weekdays[i]],
            ),
          }))
        : [{ slots: built.slots, recurringRule: built.recurringRule }];

    const options = pollQuestion
      ? pollOptions
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    let primaryId: string | null = null;
    let total = 0;
    for (let i = 0; i < payloads.length; i++) {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          place,
          template,
          outdoor,
          slots: payloads[i].slots,
          recurringRule: payloads[i].recurringRule,
          pollQuestion: i === 0 ? pollQuestion || undefined : undefined,
          pollOptions: i === 0 ? options : undefined,
          pollKind,
          audience: isGuest ? "guest" : audience,
          lat: outdoor ? 40.76 : null,
          lon: outdoor ? -111.89 : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaving(false);
        setError(data.error || "Couldn’t create plan");
        return;
      }
      if (!primaryId) primaryId = data.plan.id;
      total += data.count || payloads[i].slots.length;
    }

    setSaving(false);
    if (primaryId) router.push(`/plans/${primaryId}`);
  }

  const sortedSelected = [...selectedDays].sort();
  const weekdayNames = weekdays
    .map((d) => WEEKDAY_LABELS.find((w) => w.d === d)?.label)
    .filter(Boolean);

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          Add to the calendar
        </h1>
        <p className={ui.lede}>
          One-off dates or a weekly rhythm — keep start and end times, pick Guest
          or Fun Peeps. Optional poll if timing is still fuzzy.
        </p>
      </section>

      <form className={`${ui.form} rise rise-delay-1`} onSubmit={submit}>
        <div>
          <p className={ui.muted} style={{ marginBottom: "0.55rem" }}>
            Who’s this for?
          </p>
          {isGuest ? (
            <p className={ui.chip}>Guest plan (guests only see Guest plans)</p>
          ) : (
            <div className={ui.segRow} role="radiogroup" aria-label="Plan audience">
              <button
                type="button"
                className={ui.segBtn}
                data-active={audience === "fun_peeps"}
                aria-checked={audience === "fun_peeps"}
                role="radio"
                onClick={() => setAudience("fun_peeps")}
              >
                Fun Peeps
              </button>
              <button
                type="button"
                className={ui.segBtn}
                data-active={audience === "guest"}
                aria-checked={audience === "guest"}
                role="radio"
                onClick={() => setAudience("guest")}
              >
                Guest
              </button>
            </div>
          )}
        </div>

        <div className={ui.templateRow}>
          <button
            type="button"
            className={ui.templateBtn}
            data-active={template === "custom"}
            onClick={() => setTemplate("custom")}
          >
            Custom
          </button>
          {PLAN_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={ui.templateBtn}
              data-active={template === t.id}
              onClick={() => applyTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className={ui.label}>
          Title
          <input
            className={ui.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Saturday hang"
          />
        </label>
        <label className={ui.label}>
          Notes
          <textarea
            className={ui.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Bring snacks, or we’ll figure food there."
          />
        </label>
        <label className={ui.label}>
          Place
          <input
            className={ui.input}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Park / theater / someone’s kitchen"
          />
        </label>

        <div className={ui.panel} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <h2 className={ui.panelTitle}>When</h2>
          <div className={ui.segRow} role="radiogroup" aria-label="Schedule type">
            <button
              type="button"
              className={ui.segBtn}
              data-active={scheduleMode === "dates"}
              aria-checked={scheduleMode === "dates"}
              role="radio"
              onClick={() => setScheduleMode("dates")}
            >
              Specific dates
            </button>
            <button
              type="button"
              className={ui.segBtn}
              data-active={scheduleMode === "weekly"}
              aria-checked={scheduleMode === "weekly"}
              role="radio"
              onClick={() => setScheduleMode("weekly")}
            >
              Weekly repeat
            </button>
          </div>

          {scheduleMode === "dates" ? (
            <>
              <p className={ui.muted} style={{ marginBottom: "0.75rem" }}>
                Add each date this hang should show up. Same start and end times
                apply to each.
              </p>
              <div className={ui.dayAddStack}>
                <label className={ui.label}>
                  Date
                  <input
                    className={ui.input}
                    type="date"
                    value={extraDate}
                    onChange={(e) => setExtraDate(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnGhost} ${ui.dayAddBtn}`}
                  onClick={addExtraDate}
                  disabled={!extraDate}
                >
                  Add day
                </button>
              </div>
              {sortedSelected.length > 0 ? (
                <div className={ui.dayGrid} role="list" aria-label="Selected dates">
                  {sortedSelected.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={ui.dayChip}
                      data-active="true"
                      onClick={() => removeDay(key)}
                      aria-label={`Remove ${formatDayChip(key)}`}
                      title="Tap to remove"
                    >
                      {formatDayChip(key)} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className={ui.muted} style={{ marginTop: "0.75rem" }}>
                  No dates yet — pick one above and tap Add day.
                </p>
              )}
            </>
          ) : (
            <>
              <p className={ui.muted} style={{ marginBottom: "0.75rem" }}>
                Pick weekdays and how often — e.g. every Tuesday. Times below
                apply to each occurrence.
              </p>
              <div className={ui.dayGrid} role="group" aria-label="Weekdays">
                {WEEKDAY_LABELS.map((w) => (
                  <button
                    key={w.d}
                    type="button"
                    className={ui.dayChip}
                    data-active={weekdays.includes(w.d)}
                    aria-pressed={weekdays.includes(w.d)}
                    onClick={() => toggleWeekday(w.d)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <div className={ui.timeRow}>
                <label className={ui.label}>
                  Starts on
                  <input
                    className={ui.input}
                    type="date"
                    value={weeklyStart}
                    onChange={(e) => setWeeklyStart(e.target.value)}
                  />
                </label>
                <label className={ui.label}>
                  Repeats
                  <select
                    className={ui.select}
                    value={recurFreq}
                    onChange={(e) => setRecurFreq(e.target.value as RecurFreq | "")}
                  >
                    <option value="weekly">Every week</option>
                    <option value="biweekly">Every other week</option>
                  </select>
                </label>
              </div>
              {weekdays.length > 0 ? (
                <p className={ui.meta} style={{ marginTop: "0.75rem" }}>
                  {recurFreq === "biweekly" ? "Every other " : "Every "}
                  {weekdayNames.join(" · ")}
                  {weeklyStart ? ` · from ${formatDayChip(weeklyStart)}` : ""}
                </p>
              ) : (
                <p className={ui.muted} style={{ marginTop: "0.75rem" }}>
                  No weekdays selected yet.
                </p>
              )}
            </>
          )}
        </div>

        <div className={ui.timeRow}>
          <label className={ui.label}>
            Start time
            <input
              className={ui.input}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </label>
          <label className={ui.label}>
            End time
            <input
              className={ui.input}
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>

        <label className={ui.label} style={{ flexDirection: "row", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={outdoor}
            onChange={(e) => setOutdoor(e.target.checked)}
          />
          Outdoor plan (shows weather)
        </label>

        <div className={ui.panel}>
          <h2 className={ui.panelTitle}>Optional poll</h2>
          <label className={ui.label}>
            Kind
            <select
              className={ui.select}
              value={pollKind}
              onChange={(e) => setPollKind(e.target.value)}
            >
              <option value="time">Times</option>
              <option value="place">Places</option>
            </select>
          </label>
          <label className={ui.label}>
            Question
            <input
              className={ui.input}
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="When works?"
            />
          </label>
          <label className={ui.label}>
            Options (one per line)
            <textarea
              className={ui.textarea}
              value={pollOptions}
              onChange={(e) => setPollOptions(e.target.value)}
            />
          </label>
        </div>

        {error ? <p className={ui.error}>{error}</p> : null}
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={saving}
        >
          {saving
            ? "Saving…"
            : scheduleMode === "weekly"
              ? weekdays.length > 1
                ? `Add ${weekdays.length} weekly plans`
                : "Add weekly plan"
              : selectedDays.length > 1
                ? `Add ${selectedDays.length} days to calendar`
                : "Add to calendar"}
        </button>
      </form>
    </>
  );
}
