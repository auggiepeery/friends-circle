"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatWhen } from "@/lib/format";
import ui from "@/components/ui.module.css";

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [planId, setPlanId] = useState("");
  const [rsvps, setRsvps] = useState<
    { user_id: string; response: string; display_name?: string }[]
  >([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch(`/api/share/${token}`);
    if (!res.ok) {
      setError("This share link isn’t valid.");
      return;
    }
    const data = await res.json();
    setTitle(data.plan.title);
    setPlace(data.plan.place);
    setStartsAt(data.plan.starts_at);
    setDescription(data.plan.description);
    setPlanId(data.plan.id);
    setRsvps(data.rsvps || []);
  }

  useEffect(() => {
    load().catch(() => setError("Couldn’t open share link"));
  }, [token]);

  async function rsvp(response: string) {
    const res = await fetch(`/api/share/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response }),
    });
    if (!res.ok) {
      setError("Sign in required to RSVP");
      return;
    }
    const data = await res.json();
    setRsvps(data.rsvps || []);
  }

  if (error) {
    return (
      <section className={ui.hero}>
        <h1 className={ui.headline}>Share link</h1>
        <p className={ui.error}>{error}</p>
        <Link href="/" className={`${ui.btn} ${ui.btnGhost}`}>
          Back home
        </Link>
      </section>
    );
  }

  if (!title) return <p className={ui.muted}>Opening invite…</p>;

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <p className={ui.muted}>You’re invited on Fun Peepers</p>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          {title}
        </h1>
        <p className={ui.lede}>{description || "Join the plan."}</p>
        <div className={ui.meta}>
          <span>{formatWhen(startsAt)}</span>
          {place ? <span>{place}</span> : null}
        </div>
        <div className={ui.rsvpRow}>
          {(["going", "maybe", "no"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={ui.rsvpBtn}
              data-kind={r}
              onClick={() => rsvp(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div className={ui.ctaRow}>
          <Link href={`/plans/${planId}`} className={`${ui.btn} ${ui.btnPrimary}`}>
            Open full plan
          </Link>
        </div>
      </section>
      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Who’s in</h2>
        <div className={ui.people} style={{ marginTop: "0.75rem" }}>
          {rsvps.map((r) => (
            <span key={r.user_id} className={ui.person}>
              {r.display_name || "Friend"} · {r.response}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
