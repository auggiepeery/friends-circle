"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./Shell.module.css";

type Me = {
  name: string;
  email: string;
  simulated: boolean;
  unread: number;
  via?: "cursor" | "guest";
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const data = await fetch("/api/me").then((r) => r.json());
    setMe(data.viewer);
    setLoaded(true);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((data: { viewer: Me | null }) => {
        if (alive) {
          setMe(data.viewer);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) {
          setMe(null);
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    setName("");
    await refresh();
  }

  async function signOut() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sign_out" }),
    });
    await refresh();
  }

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>
          Fun <span>Peepers</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" data-active={active("/")}>
            Calendar
          </Link>
          <Link href="/circle" data-active={active("/circle")}>
            Circle
          </Link>
          <Link href="/notifications" data-active={active("/notifications")}>
            Alerts
            {me && me.unread > 0 ? (
              <span className={styles.badge}>{me.unread}</span>
            ) : null}
          </Link>
          <Link href="/plans/new" data-active={active("/plans/new")}>
            Add plan
          </Link>
          {me ? (
            <span
              className={styles.who}
              title={
                me.via === "guest"
                  ? "Signed in as a friend (cookie)"
                  : me.simulated
                    ? "Simulated local viewer"
                    : me.email
              }
            >
              {me.name}
              {me.via === "guest" ? " · friend" : me.simulated ? " · local" : ""}
            </span>
          ) : null}
        </nav>
      </header>

      {loaded && !me ? (
        <div className={styles.gate}>
          <form className={styles.gateForm} onSubmit={signIn}>
            <div>
              <strong>Join the circle</strong>
              <p>
                Fun Peepers is a shared calendar for a small group of friends.
                Pick a display name to see everyone’s plans.
              </p>
            </div>
            <input
              className={styles.gateInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              minLength={2}
              maxLength={120}
            />
            <button type="submit" className={styles.gateBtn} disabled={busy}>
              {busy ? "Joining…" : "Enter calendar"}
            </button>
          </form>
        </div>
      ) : null}

      <main className={styles.main}>
        {me ? children : loaded ? null : <p className={styles.loading}>Loading…</p>}
      </main>

      {me?.via === "guest" ? (
        <div className={styles.signOutRow}>
          <button type="button" className={styles.signOut} onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : null}

      <nav className={styles.mobile} aria-label="Mobile">
        <Link href="/" data-active={active("/")}>
          Cal
        </Link>
        <Link href="/circle" data-active={active("/circle")}>
          Circle
        </Link>
        <Link href="/plans/new" data-active={active("/plans/new")}>
          Add
        </Link>
        <Link href="/notifications" data-active={active("/notifications")}>
          Alerts
        </Link>
      </nav>
    </div>
  );
}
