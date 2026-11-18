"use client";

import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";
import {
  type CalDefaultView,
  type ClientPrefs,
  type ThemeId,
  DEFAULT_PREFS,
  PREFS_EVENT,
  THEME_OPTIONS,
  patchPrefs,
  readPrefs,
} from "@/lib/prefs";
import {
  formatMinuteRange,
  parseTimeToMinute,
  type DailyRoutine,
} from "@/lib/routines-shared";

const WEEKDAY_LABELS = [
  { d: 0, label: "Sun" },
  { d: 1, label: "Mon" },
  { d: 2, label: "Tue" },
  { d: 3, label: "Wed" },
  { d: 4, label: "Thu" },
  { d: 5, label: "Fri" },
  { d: 6, label: "Sat" },
];

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<ClientPrefs>(DEFAULT_PREFS);
  const [displayName, setDisplayName] = useState("");
  const [hint, setHint] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [routines, setRoutines] = useState<DailyRoutine[]>([]);
  const [routineWeekday, setRoutineWeekday] = useState(1);
  const [routineStart, setRoutineStart] = useState("09:00");
  const [routineEnd, setRoutineEnd] = useState("10:00");
  const [routineLabel, setRoutineLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
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
    Promise.all([
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/circle").then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      }),
      fetch("/api/routines").then(async (r) => {
        if (!r.ok) return { routines: [] };
        return r.json();
      }),
    ])
      .then(([me, circle, routinesData]) => {
        if (!alive) return;
        setDisplayName(me.viewer?.name || "");
        setHint(me.viewer?.availability_hint || "");
        setRole(me.viewer?.role || null);
        setRoutines(routinesData.routines || []);
        if (circle) {
          setCanManage(Boolean(circle.canManage));
          setInviteUrl(circle.inviteUrl || "");
          setInviteCode(circle.inviteCode || "");
        }
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setError("Couldn’t load settings");
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#routines") return;
    const el = document.getElementById("routines");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  function updatePref<K extends keyof ClientPrefs>(key: K, value: ClientPrefs[K]) {
    setPrefs(patchPrefs({ [key]: value }));
    setMessage("Saved to your profile.");
    setError("");
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: displayName,
        availability_hint: hint,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "name_taken"
          ? "That display name is already taken."
          : data.error === "name_required"
            ? "Display name needs at least 2 characters."
            : "Couldn’t save profile",
      );
      return;
    }
    if (data.profile?.display_name) setDisplayName(data.profile.display_name);
    setMessage("Profile saved.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "change_password",
        currentPassword,
        newPassword,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "bad_password"
          ? "Current password is wrong."
          : data.error === "forbidden"
            ? "Only named friends can change a password here."
            : "Couldn’t change password",
      );
      return;
    }
    setMessage("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function addRoutine(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const start_minute = parseTimeToMinute(routineStart);
    const end_minute = parseTimeToMinute(routineEnd);
    if (start_minute === null || end_minute === null) {
      setBusy(false);
      setError("Use valid start and end times.");
      return;
    }
    const res = await fetch("/api/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weekday: routineWeekday,
        start_minute,
        end_minute,
        label: routineLabel,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "end_before_start"
          ? "End time must be after start."
          : data.error === "label_required"
            ? "Add a label (sports, church, school…)."
            : data.error === "routine_limit"
              ? "Routine limit reached — remove one first."
              : "Couldn’t add routine",
      );
      return;
    }
    setRoutines((prev) =>
      [...prev, data.routine as DailyRoutine].sort(
        (a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute,
      ),
    );
    setRoutineLabel("");
    setMessage("Routine saved — it blocks Who’s free on that weekday.");
  }

  async function removeRoutine(id: string) {
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch(`/api/routines?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn’t remove routine");
      return;
    }
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    setMessage("Routine removed.");
  }

  function copyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function rotateInvite() {
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rotate_invite" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError("Couldn’t rotate invite code");
      return;
    }
    setInviteCode(data.inviteCode || "");
    setInviteUrl(data.inviteUrl || "");
    setMessage("Guest invite code rotated — old links no longer work.");
  }

  if (!loaded) return <p className={ui.muted}>Loading settings…</p>;

  const isFriend = role === "friend";
  const isFunPeep = role === "friend" || role === "founder";
  const needsRoutines = isFunPeep && routines.length === 0;

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          Settings
        </h1>
        <p className={ui.lede}>
          Theme and calendar prefs save to your Fun Peepers profile (follow you
          when you sign in). Circle controls sync for everyone.
        </p>
        {message ? <p className={ui.meta}>{message}</p> : null}
        {error ? <p className={ui.error}>{error}</p> : null}
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Appearance</h2>
        <p className={ui.muted} style={{ marginBottom: "0.85rem" }}>
          Pick a look — saved on your signed-in profile, not shared with others
          on this phone.
        </p>
        <div className={ui.themeGrid} role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(({ id, label, blurb }) => (
            <button
              key={id}
              type="button"
              className={ui.themeCard}
              data-theme-id={id}
              data-active={prefs.theme === id}
              aria-checked={prefs.theme === id}
              role="radio"
              onClick={() => updatePref("theme", id as ThemeId)}
            >
              <span className={ui.themeSwatch} aria-hidden />
              <strong>{label}</strong>
              <span>{blurb}</span>
            </button>
          ))}
        </div>
        <label className={ui.toggleRow}>
          <input
            type="checkbox"
            checked={prefs.reduceMotion}
            onChange={(e) => updatePref("reduceMotion", e.target.checked)}
          />
          <span>Reduce motion</span>
        </label>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Install as an app</h2>
        <p className={ui.muted} style={{ marginBottom: "0.85rem" }}>
          Fun Peepers is a PWA — add it to your Home Screen for a full-screen
          icon, no Safari chrome.
        </p>
        <div className={ui.installSteps}>
          <div className={ui.installCard}>
            <h3>iPhone (Safari)</h3>
            <ol>
              <li>
                Open the Fun Peepers <strong>home/calendar</strong> in Safari
                (not Chrome or in-app browsers).
              </li>
              <li>Tap the Share button (square with ↑).</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>
                Tap Add — the icon always opens Fun Peepers alone (standalone),
                not Safari with other tabs.
              </li>
            </ol>
          </div>
          <div className={ui.installCard}>
            <h3>Android (Chrome)</h3>
            <ol>
              <li>Open Fun Peepers in Chrome.</li>
              <li>Tap the ⋮ menu → <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>.</li>
              <li>Confirm Install — open from your app drawer like any app.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Calendar</h2>
        <p className={ui.muted} style={{ marginBottom: "0.85rem" }}>
          Default view when you open the shared calendar.
        </p>
        <div className={ui.segRow} role="radiogroup" aria-label="Default calendar view">
          {(["month", "week", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={ui.segBtn}
              data-active={prefs.calendarView === v}
              aria-checked={prefs.calendarView === v}
              role="radio"
              onClick={() => updatePref("calendarView", v as CalDefaultView)}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Alerts</h2>
        <label className={ui.toggleRow}>
          <input
            type="checkbox"
            checked={prefs.showUnreadBadge}
            onChange={(e) => updatePref("showUnreadBadge", e.target.checked)}
          />
          <span>Show unread badge on Alerts</span>
        </label>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Profile</h2>
        <form className={ui.form} onSubmit={saveProfile}>
          <label className={ui.label}>
            Display name
            <input
              className={ui.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              autoComplete="nickname"
            />
          </label>
          <label className={ui.label}>
            Availability hint
            <input
              className={ui.input}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              maxLength={160}
              placeholder="Free after 6 · busy Thu"
            />
          </label>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnLamp}`}
            disabled={busy}
            style={{ justifySelf: "start" }}
          >
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className={ui.section} id="routines">
        <h2 className={ui.sectionTitle}>Daily routines</h2>
        <p className={ui.muted} style={{ marginBottom: "0.85rem" }}>
          {isFunPeep
            ? "Recurring busy blocks (sports, church, school) feed Who’s free on the calendar. Fun Peeps need at least one."
            : "Optional for guests — add a recurring block if you want the circle to see when you’re busy."}
        </p>
        {needsRoutines ? (
          <p className={ui.meta} style={{ marginBottom: "0.85rem" }}>
            Add your first routine so friends don’t plan over you.
          </p>
        ) : null}

        {routines.length === 0 ? (
          <p className={ui.empty} style={{ paddingTop: 0 }}>
            {isFunPeep
              ? "No routines yet — pick a weekday, time range, and label."
              : "No routines yet. Guests can skip this."}
          </p>
        ) : (
          <ul className={ui.list} style={{ marginBottom: "1rem" }}>
            {routines.map((r) => {
              const day =
                WEEKDAY_LABELS.find((w) => w.d === r.weekday)?.label || "?";
              return (
                <li key={r.id} className={ui.planRow}>
                  <div>
                    <strong>
                      {day} · {r.label}
                    </strong>
                    <div className={ui.muted}>
                      {formatMinuteRange(r.start_minute, r.end_minute)}
                      <span className={ui.chip} style={{ marginLeft: "0.45rem" }}>
                        Busy
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnGhost}`}
                    disabled={busy}
                    onClick={() => void removeRoutine(r.id)}
                    aria-label={`Remove ${r.label}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form className={ui.form} onSubmit={addRoutine}>
          <div className={ui.dayGrid} role="group" aria-label="Weekday">
            {WEEKDAY_LABELS.map((w) => (
              <button
                key={w.d}
                type="button"
                className={ui.dayChip}
                data-active={routineWeekday === w.d}
                aria-pressed={routineWeekday === w.d}
                onClick={() => setRoutineWeekday(w.d)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className={ui.timeRow}>
            <label className={ui.label}>
              Starts
              <input
                className={ui.input}
                type="time"
                value={routineStart}
                onChange={(e) => setRoutineStart(e.target.value || "09:00")}
                required
              />
            </label>
            <label className={ui.label}>
              Ends
              <input
                className={ui.input}
                type="time"
                value={routineEnd}
                onChange={(e) => setRoutineEnd(e.target.value || "10:00")}
                required
              />
            </label>
          </div>
          <label className={ui.label}>
            Label
            <input
              className={ui.input}
              value={routineLabel}
              onChange={(e) => setRoutineLabel(e.target.value)}
              maxLength={80}
              required
              placeholder="Soccer · Church · Math lab"
            />
          </label>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnLamp}`}
            disabled={busy}
            style={{ justifySelf: "start" }}
          >
            {busy ? "Saving…" : "Add routine"}
          </button>
        </form>
      </section>

      {isFriend ? (
        <section className={ui.section}>
          <h2 className={ui.sectionTitle}>Password</h2>
          <form className={ui.form} onSubmit={changePassword}>
            <label className={ui.label}>
              Current password
              <input
                className={ui.input}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                maxLength={200}
                autoComplete="current-password"
              />
            </label>
            <label className={ui.label}>
              New password
              <input
                className={ui.input}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnLamp}`}
              disabled={busy}
              style={{ justifySelf: "start" }}
            >
              Update password
            </button>
          </form>
        </section>
      ) : null}

      {canManage ? (
        <section className={ui.section}>
          <h2 className={ui.sectionTitle}>Guest invite</h2>
          <p className={ui.muted} style={{ marginBottom: "0.85rem" }}>
            Share the invite with guests. Rotate anytime to invalidate old links.
          </p>
          <div className={ui.ctaRow}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnLamp}`}
              onClick={copyInvite}
              disabled={!inviteUrl}
            >
              {copied ? "Copied" : "Copy invite link"}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnGhost}`}
              onClick={() => void rotateInvite()}
              disabled={busy}
            >
              Rotate invite
            </button>
            {inviteCode ? <span className={ui.chip}>Code {inviteCode}</span> : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
