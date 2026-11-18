"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLAN_TEMPLATES } from "@/lib/templates";
import { fromLocalInputValue } from "@/lib/format";
import ui from "@/components/ui.module.css";

type Audience = "fun_peeps" | "guest";

export default function NewPlanPage() {
  const router = useRouter();
  const [template, setTemplate] = useState("custom");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [outdoor, setOutdoor] = useState(false);
  const [recurringRule, setRecurringRule] = useState("");
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
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
        startsAt: fromLocalInputValue(startsAt),
        reminderAt: fromLocalInputValue(reminderAt),
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

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          Add to the calendar
        </h1>
        <p className={ui.lede}>
          Choose Guest or Fun Peeps. Guests only see Guest plans; Fun Peeps see
          Fun Peeps plans (and Guest plans they host). Optional poll if timing
          is still fuzzy.
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
        <label className={ui.label}>
          Starts
          <input
            className={ui.input}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label className={ui.label}>
          Reminder
          <input
            className={ui.input}
            type="datetime-local"
            value={reminderAt}
            onChange={(e) => setReminderAt(e.target.value)}
          />
        </label>
        <label className={ui.label}>
          Recurring (simple)
          <select
            className={ui.select}
            value={recurringRule}
            onChange={(e) => setRecurringRule(e.target.value)}
          >
            <option value="">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every other week</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
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
          {saving ? "Saving…" : "Add to calendar"}
        </button>
      </form>
    </>
  );
}
