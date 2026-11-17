"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlanList, type PlanListItem } from "@/components/PlanList";
import ui from "@/components/ui.module.css";

export default function HomePage() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [name, setName] = useState("friend");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/plans").then((r) => r.json()),
    ])
      .then(([me, data]) => {
        if (me.viewer?.name) setName(me.viewer.name.split(" ")[0]);
        if (me.viewer?.availability_hint) setHint(me.viewer.availability_hint);
        setPlans(data.plans || []);
      })
      .catch(() => setError("Couldn’t load plans"));
  }, []);

  async function saveHint(value: string) {
    setHint(value);
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ availability_hint: value }),
    });
  }

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.brandMark}>Fun Peepers</h1>
        <p className={`${ui.headline} rise rise-delay-1`}>
          Hey {name} — make the plan, then make it easy.
        </p>
        <p className={`${ui.lede} rise rise-delay-2`}>
          RSVPs, time polls, chat on the hang, share links, and a clear look at
          what’s this weekend. Built for friends who actually show up.
        </p>
        <div className={`${ui.ctaRow} rise rise-delay-3`}>
          <Link href="/plans/new" className={`${ui.btn} ${ui.btnPrimary}`}>
            Start a plan
          </Link>
          <Link href="/weekend" className={`${ui.btn} ${ui.btnGhost}`}>
            What’s this weekend
          </Link>
        </div>
      </section>

      <section className={`${ui.section} rise rise-delay-2`}>
        <div className={ui.sectionHead}>
          <h2 className={ui.sectionTitle}>Coming up</h2>
          <Link href="/plans/new" className={ui.muted}>
            + New
          </Link>
        </div>
        {error ? <p className={ui.error}>{error}</p> : null}
        <PlanList plans={plans} />
      </section>

      <section className={ui.section}>
        <div className={ui.sectionHead}>
          <h2 className={ui.sectionTitle}>Your availability</h2>
        </div>
        <label className={ui.label}>
          Short hint friends can see
          <input
            className={ui.input}
            value={hint}
            placeholder="Free after 6 · busy Thu · open to outdoor"
            onChange={(e) => setHint(e.target.value)}
            onBlur={(e) => saveHint(e.target.value)}
          />
        </label>
      </section>
    </>
  );
}
