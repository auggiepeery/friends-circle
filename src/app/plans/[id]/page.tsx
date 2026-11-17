"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatMoney, formatWhen, fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import ui from "@/components/ui.module.css";

type Detail = {
  plan: {
    id: string;
    title: string;
    description: string;
    place: string;
    starts_at: string | null;
    reminder_at: string | null;
    outdoor: boolean;
    share_token?: string;
    recurring_rule: string;
    creator_id: string;
    lat: number | null;
    lon: number | null;
  };
  rsvps: { user_id: string; response: string; display_name?: string }[];
  comments: { id: string; body: string; display_name?: string; created_at: string }[];
  polls: {
    id: string;
    question: string;
    kind: string;
    options: { id: string; label: string; votes: number; voted: boolean }[];
  }[];
  expenses: {
    id: string;
    description: string;
    amount_cents: number;
    display_name?: string;
  }[];
};

type Weather = {
  summary: string;
  high: number;
  low: number;
  precip: number;
  source: string;
};

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [meSub, setMeSub] = useState("");
  const [comment, setComment] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [detailRes, meRes] = await Promise.all([
      fetch(`/api/plans/${id}`),
      fetch("/api/me"),
    ]);
    if (!detailRes.ok) {
      setError("Plan not found");
      return;
    }
    const detail = (await detailRes.json()) as Detail;
    const meData = await meRes.json();
    setData(detail);
    setMeSub(meData.viewer?.sub || "");
    setTitle(detail.plan.title);
    setPlace(detail.plan.place);
    setStartsAt(toLocalInputValue(detail.plan.starts_at));
    if (detail.plan.outdoor) {
      const day = detail.plan.starts_at?.slice(0, 10);
      const q = new URLSearchParams({
        lat: String(detail.plan.lat ?? 40.76),
        lon: String(detail.plan.lon ?? -111.89),
      });
      if (day) q.set("day", day);
      const w = await fetch(`/api/weather?${q}`).then((r) => r.json());
      setWeather(w);
    } else {
      setWeather(null);
    }
  }, [id]);

  useEffect(() => {
    load().catch(() => setError("Couldn’t load plan"));
  }, [load]);

  async function rsvp(response: string) {
    await fetch(`/api/plans/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rsvp", response }),
    });
    await load();
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await fetch(`/api/plans/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "comment", body: comment }),
    });
    setComment("");
    await load();
  }

  async function vote(optionId: string) {
    await fetch(`/api/plans/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "vote", optionId }),
    });
    await load();
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(Number(expenseAmount) * 100);
    await fetch(`/api/plans/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "expense",
        description: expenseDesc || "Shared cost",
        amountCents,
      }),
    });
    setExpenseDesc("");
    setExpenseAmount("");
    await load();
  }

  async function saveEdits(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        place,
        startsAt: fromLocalInputValue(startsAt),
      }),
    });
    setEditing(false);
    await load();
  }

  function copyShare() {
    if (!data?.plan.share_token) return;
    const url = `${window.location.origin}/share/${data.plan.share_token}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (error) return <p className={ui.error}>{error}</p>;
  if (!data) return <p className={ui.muted}>Loading plan…</p>;

  const mine = data.rsvps.find((r) => r.user_id === meSub)?.response;
  const totalCents = data.expenses.reduce((s, e) => s + e.amount_cents, 0);
  const splitN = Math.max(1, data.rsvps.filter((r) => r.response === "going").length);
  const each = Math.round(totalCents / splitN);

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <p className={ui.muted}>
          {data.plan.recurring_rule ? `Recurring · ${data.plan.recurring_rule}` : "Plan"}
        </p>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)" }}>
          {data.plan.title}
        </h1>
        <p className={ui.lede}>{data.plan.description || "No notes yet."}</p>
        <div className={ui.meta}>
          <span>{formatWhen(data.plan.starts_at)}</span>
          {data.plan.place ? <span>{data.plan.place}</span> : null}
          {data.plan.reminder_at ? (
            <span className={ui.chip}>Reminder {formatWhen(data.plan.reminder_at)}</span>
          ) : null}
        </div>
        <div className={ui.ctaRow} style={{ marginTop: "1.25rem" }}>
          {data.plan.share_token ? (
            <button type="button" className={`${ui.btn} ${ui.btnLamp}`} onClick={copyShare}>
              {copied ? "Link copied" : "Copy share link"}
            </button>
          ) : null}
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost}`}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close edit" : "Edit"}
          </button>
        </div>
      </section>

      {editing ? (
        <form className={ui.form} onSubmit={saveEdits}>
          <label className={ui.label}>
            Title
            <input className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className={ui.label}>
            Place
            <input className={ui.input} value={place} onChange={(e) => setPlace(e.target.value)} />
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
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Save
          </button>
        </form>
      ) : null}

      {weather ? (
        <section className={ui.panel}>
          <h2 className={ui.panelTitle}>Outdoor weather</h2>
          <p className={ui.meta}>
            <span>{weather.summary}</span>
            <span>
              High {Math.round(weather.high)}° / low {Math.round(weather.low)}°
            </span>
            <span>{weather.precip}% precip</span>
            {weather.source === "sample" ? (
              <span className={ui.chip}>Sample</span>
            ) : null}
          </p>
        </section>
      ) : null}

      <div className={ui.split}>
        <div>
          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>RSVP</h2>
            <div className={ui.rsvpRow}>
              {(["going", "maybe", "no"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={ui.rsvpBtn}
                  data-kind={r}
                  data-active={mine === r}
                  onClick={() => rsvp(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className={ui.people}>
              {data.rsvps.map((r) => (
                <span key={r.user_id} className={ui.person}>
                  {r.display_name || "Friend"} · {r.response}
                </span>
              ))}
            </div>
          </section>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Chat</h2>
            <div className={ui.chat}>
              {data.comments.length === 0 ? (
                <p className={ui.empty}>No notes yet — say something.</p>
              ) : (
                data.comments.map((c) => (
                  <div key={c.id} className={ui.chatItem}>
                    <strong>{c.display_name || "Friend"}</strong>
                    <div>{c.body}</div>
                    <div className={ui.muted}>{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
            <form className={ui.chatForm} onSubmit={sendComment}>
              <input
                className={ui.input}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note…"
              />
              <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
                Send
              </button>
            </form>
          </section>
        </div>

        <div>
          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Polls</h2>
            {data.polls.length === 0 ? (
              <p className={ui.empty}>No polls on this plan.</p>
            ) : (
              data.polls.map((poll) => (
                <div key={poll.id} style={{ marginBottom: "1rem" }}>
                  <p className={ui.muted}>
                    {poll.kind} · {poll.question}
                  </p>
                  {poll.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={ui.pollOption}
                      data-voted={o.voted}
                      onClick={() => vote(o.id)}
                    >
                      <span>{o.label}</span>
                      <span className={ui.chip}>{o.votes}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </section>

          <section className={ui.panel}>
            <h2 className={ui.panelTitle}>Split (light)</h2>
            {data.expenses.length === 0 ? (
              <p className={ui.empty}>No expenses yet.</p>
            ) : (
              <div className={ui.list}>
                {data.expenses.map((e) => (
                  <div key={e.id} className={ui.planRow}>
                    <div>
                      <div className={ui.planTitle} style={{ fontSize: "1rem" }}>
                        {e.description}
                      </div>
                      <div className={ui.muted}>{e.display_name}</div>
                    </div>
                    <div>{formatMoney(e.amount_cents)}</div>
                  </div>
                ))}
              </div>
            )}
            <p className={ui.muted} style={{ margin: "0.75rem 0" }}>
              Total {formatMoney(totalCents)} · ~{formatMoney(each)} each ({splitN} going)
            </p>
            <form className={ui.form} onSubmit={addExpense}>
              <label className={ui.label}>
                Description
                <input
                  className={ui.input}
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="Snacks / tickets / gas"
                />
              </label>
              <label className={ui.label}>
                Amount (USD)
                <input
                  className={ui.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className={`${ui.btn} ${ui.btnGhost}`}>
                Add expense
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
