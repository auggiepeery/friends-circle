"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlanList, type PlanListItem } from "@/components/PlanList";
import ui from "@/components/ui.module.css";

export default function WeekendPage() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekend")
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <p className={ui.muted}>This weekend</p>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          What’s on
        </h1>
        <p className={ui.lede}>
          Friday through Sunday — everything you’re in on, invited to, or your
          friends kicked off.
        </p>
        <div className={ui.ctaRow}>
          <Link href="/plans/new" className={`${ui.btn} ${ui.btnLamp}`}>
            Fill the blank spots
          </Link>
        </div>
      </section>
      <section className={ui.section}>
        {loading ? (
          <p className={ui.muted}>Loading…</p>
        ) : (
          <PlanList
            plans={plans}
            empty="Nothing scheduled this weekend yet. Movie night? Food run? Hang?"
          />
        )}
      </section>
    </>
  );
}
