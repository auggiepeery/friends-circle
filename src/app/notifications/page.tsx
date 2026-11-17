"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";

type N = {
  id: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<N[]>([]);

  async function load() {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    setItems(data.notifications || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    });
    await load();
  }

  async function openItem(n: N) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read", id: n.id }),
    });
  }

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          Alerts
        </h1>
        <p className={ui.lede}>Invites, RSVPs, and notes on plans — all in one place.</p>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={markAll}>
          Mark all read
        </button>
      </section>
      <section className={ui.section}>
        {items.length === 0 ? (
          <p className={ui.empty}>You’re caught up.</p>
        ) : (
          <div className={ui.list}>
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href || "/"}
                className={ui.planRow}
                onClick={() => openItem(n)}
                style={{ opacity: n.read ? 0.65 : 1 }}
              >
                <div>
                  <div className={ui.planTitle}>{n.title}</div>
                  <div className={ui.meta}>
                    <span>{n.body}</span>
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
                {!n.read ? <span className={ui.chip}>New</span> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
