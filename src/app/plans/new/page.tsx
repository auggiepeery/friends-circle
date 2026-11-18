"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PLAN_TEMPLATES } from "@/lib/templates";
import {
  combineLocalDateAndTime,
  formatDayChip,
  localDateKey,
} from "@/lib/format";
import ui from "@/components/ui.module.css";

type Audience = "fun_peeps" | "guest";

const MAX_DAYS = 14;

function upcomingDayKeys(count: number): string[] {
  const keys: string[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    keys.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export default function NewPlanPage() {
  const router = useRouter();
  const [template, setTemplate] = useState("custom");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [extraDate, setExtraDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [outdoor, setOutdoor] = useState(false);
  const [recurringRule, setRecurringRule] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Fri 7pm\nSat 6pm\nSun afternoon");
  const [pollKind, setPollKind] = useState("time");
  const [audience, setAudience] = useState<Audience>("fun_peeps");
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const dayChoices = useMemo(() => upcomingDayKeys(14), []);

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

  function toggleDay(key: string) {
    setSelectedDays((prev) => {
      if (prev.includes(key)) return prev.filter((d) => d !== key);
      if (prev.length >= MAX_DAYS) return prev;
      return [...prev, key].sort();
    });
  }

  function addExtraDate() {
    if (!extraDate) return;
    toggleDay(extraDate);
    setExtraDate("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (selectedDays.length === 0) {
      setSaving(false);
      setError("Pick at least one day.");
      return;
    }
    if (!startTime) {
      setSaving(false);
      setError("Add a start time.");
      return;
    }

    const slots: { startsAt: string; endsAt: string | null }[] = [];
    for (const day of selectedDays) {
      const startsAt = combineLocalDateAndTime(day, startTime);
      if (!startsAt) {
        setSaving(false);
        setError("Couldn’t read one of the days or times.");
        return;
      }
      let endsAt: string | null = null;
      if (endTime) {
        endsAt = combineLocalDateAndTime(day, endTime);
        if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
          setSaving(false);
          setError("End time needs to be after start time.");
          return;
        }
      }
      slots.push({ startsAt, endsAt });
    }

    const options = pollQuestion
      ? pollOptions
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        place,
        template,
        outdoor,
        slots,
        recurringRule,
        pollQuestion: pollQuestion || undefined,
        pollOptions: options,
        pollKind,
        audience: isGuest ? "guest" : audience,
        lat: outdoor ? 40.76 : null,
        lon: outdoor ? -111.89 : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Couldn’t create plan");
      return;
    }
    router.push(`/plans/${data.plan.id}`);
  }

  const sortedSelected = [...selectedDays].sort();

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          Add to the calendar
        </h1>
        <p className={ui.lede}>
          Pick one or more days, set start and end times, and choose Guest or Fun
          Peeps. Optional poll if timing is still fuzzy.
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
          <h2 className={ui.panelTitle}>Days</h2>
          <p className={ui.muted} style={{ marginBottom: "0.75rem" }}>
            Tap every day this hang should show up
            {recurringRule ? " (first dates for the repeat)" : ""}. Same start
            and end times apply to each.
          </p>
          <div className={ui.dayGrid} role="group" aria-label="Pick days">
            {dayChoices.map((key) => (
              <button
                key={key}
                type="button"
                className={ui.dayChip}
                data-active={selectedDays.includes(key)}
                aria-pressed={selectedDays.includes(key)}
                onClick={() => toggleDay(key)}
              >
                {formatDayChip(key)}
              </button>
            ))}
          </div>
          <div className={ui.dayAddRow}>
            <label className={ui.label} style={{ flex: 1, margin: 0 }}>
              Another date
              <input
                className={ui.input}
                type="date"
                value={extraDate}
                onChange={(e) => setExtraDate(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnGhost}`}
              onClick={addExtraDate}
              disabled={!extraDate}
              style={{ alignSelf: "end" }}
            >
              Add day
            </button>
          </div>
          {sortedSelected.length > 0 ? (
            <p className={ui.meta} style={{ marginTop: "0.75rem" }}>
              {sortedSelected.length === 1
                ? `1 day · ${formatDayChip(sortedSelected[0])}`
                : `${sortedSelected.length} days · ${sortedSelected
                    .map(formatDayChip)
                    .join(" · ")}`}
            </p>
          ) : (
            <p className={ui.muted} style={{ marginTop: "0.75rem" }}>
              No days selected yet.
            </p>
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

        <label className={ui.label}>
          Repeats
          <select
            className={ui.select}
            value={recurringRule}
            onChange={(e) => setRecurringRule(e.target.value)}
          >
            <option value="">Doesn’t repeat</option>
            <option value="weekly">Every week</option>
            <option value="biweekly">Every other week</option>
            <option value="monthly">Every month</option>
          </select>
        </label>
        {recurringRule ? (
          <p className={ui.muted}>
            Each selected day becomes its own calendar entry and then repeats
            from there.
          </p>
        ) : null}

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
            : selectedDays.length > 1
              ? `Add ${selectedDays.length} days to calendar`
              : "Add to calendar"}
        </button>
      </form>
    </>
  );
}
