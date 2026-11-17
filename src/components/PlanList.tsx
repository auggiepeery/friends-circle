"use client";

import Link from "next/link";
import { formatWhen } from "@/lib/format";
import ui from "./ui.module.css";

export type PlanListItem = {
  id: string;
  title: string;
  place: string;
  starts_at: string | null;
  outdoor: boolean;
  my_rsvp?: string | null;
  going_count?: number;
  template?: string;
};

export function PlanList({
  plans,
  empty = "No plans yet — start one.",
}: {
  plans: PlanListItem[];
  empty?: string;
}) {
  if (!plans.length) {
    return <p className={ui.empty}>{empty}</p>;
  }
  return (
    <div className={ui.list}>
      {plans.map((plan) => (
        <Link key={plan.id} href={`/plans/${plan.id}`} className={ui.planRow}>
          <div>
            <div className={ui.planTitle}>{plan.title}</div>
            <div className={ui.meta}>
              <span>{formatWhen(plan.starts_at)}</span>
              {plan.place ? <span>{plan.place}</span> : null}
              {plan.outdoor ? <span className={ui.chip}>Outdoor</span> : null}
              {plan.template && plan.template !== "custom" ? (
                <span className={ui.chip}>{plan.template.replace("_", " ")}</span>
              ) : null}
            </div>
          </div>
          <div>
            {plan.my_rsvp ? (
              <span
                className={`${ui.chip} ${
                  plan.my_rsvp === "going"
                    ? ui.chipGoing
                    : plan.my_rsvp === "maybe"
                      ? ui.chipMaybe
                      : ""
                }`}
              >
                {plan.my_rsvp}
              </span>
            ) : null}
            {typeof plan.going_count === "number" ? (
              <div className={ui.muted} style={{ marginTop: "0.35rem", textAlign: "right" }}>
                {plan.going_count} going
              </div>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
