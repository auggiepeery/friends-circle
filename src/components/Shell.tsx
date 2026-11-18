"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./Shell.module.css";

type Me = {
  name: string;
  email: string;
  simulated: boolean;
  unread: number;
  via?: "cursor" | "guest";
  member?: boolean;
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ code?: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [founderInvite, setFounderInvite] = useState("");

  const isJoinPath = pathname.startsWith("/join/");

  async function refresh() {
    const data = await fetch("/api/me").then((r) => r.json());
    setMe(data.viewer);
    setLoaded(true);
    return data.viewer as Me | null;
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

  useEffect(() => {
    if (typeof params?.code === "string" && params.code) {
      setInviteCode(params.code);
    }
  }, [params]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const session = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!session.ok) {
      setBusy(false);
      setError("Couldn’t save your name");
      return;
    }
    const join = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    const joinData = await join.json();
    setBusy(false);
    if (!join.ok) {
      setError(
        joinData.error === "invalid_invite"
          ? "Need a valid invite code from a friend in the circle."
          : "Couldn’t join the circle",
      );
      await refresh();
      return;
    }
    if (joinData.founder && joinData.inviteUrl) {
      setFounderInvite(joinData.inviteUrl);
    }
    setName("");
    await refresh();
  }

  async function redeemInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const join = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    const joinData = await join.json();
    setBusy(false);
    if (!join.ok) {
      setError("Need a valid invite code from a friend in the circle.");
      return;
    }
    if (joinData.founder && joinData.inviteUrl) {
      setFounderInvite(joinData.inviteUrl);
    }
    await refresh();
  }

  async function signOut() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sign_out" }),
    });
    setFounderInvite("");
    await refresh();
  }

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const member = Boolean(me?.member);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>
          Fun <span>Peepers</span>
        </Link>
        {member ? (
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
            <span
              className={styles.who}
              title={
                me?.via === "guest"
                  ? "Signed in as a friend (cookie)"
                  : me?.simulated
                    ? "Simulated local viewer"
                    : me?.email
              }
            >
              {me?.name}
              {me?.via === "guest" ? " · friend" : me?.simulated ? " · local" : ""}
            </span>
          </nav>
        ) : null}
      </header>

      {loaded && !me && !isJoinPath ? (
        <div className={styles.gate}>
          <form className={styles.gateForm} onSubmit={signIn}>
            <div>
              <strong>Invite-only circle</strong>
              <p>
                Fun Peepers is a shared calendar for a couple of friends. Enter
                your name and the invite code (or open an invite link).
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
            <input
              className={styles.gateInput}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code (skip if you’re starting the circle)"
              maxLength={80}
            />
            {error ? <p className={styles.gateError}>{error}</p> : null}
            <button type="submit" className={styles.gateBtn} disabled={busy}>
              {busy ? "Joining…" : "Continue"}
            </button>
          </form>
        </div>
      ) : null}

      {loaded && me && !member && !isJoinPath ? (
        <div className={styles.gate}>
          <form className={styles.gateForm} onSubmit={redeemInvite}>
            <div>
              <strong>Enter invite code</strong>
              <p>
                Hi {me.name} — you need an invite from someone already in the
                circle. If you’re the first, leave it blank to start the circle.
              </p>
            </div>
            <input
              className={styles.gateInput}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code"
              maxLength={80}
            />
            {error ? <p className={styles.gateError}>{error}</p> : null}
            <button type="submit" className={styles.gateBtn} disabled={busy}>
              {busy ? "Checking…" : "Join circle"}
            </button>
          </form>
        </div>
      ) : null}

      {founderInvite ? (
        <div className={styles.gate}>
          <div className={styles.gateForm}>
            <strong>You’re the founder</strong>
            <p>Share this invite link with your friends:</p>
            <code className={styles.inviteCode}>{founderInvite}</code>
            <button
              type="button"
              className={styles.gateBtn}
              onClick={() => {
                void navigator.clipboard.writeText(founderInvite);
              }}
            >
              Copy invite link
            </button>
          </div>
        </div>
      ) : null}

      <main className={styles.main}>
        {isJoinPath || member
          ? children
          : loaded
            ? null
            : <p className={styles.loading}>Loading…</p>}
      </main>

      {me?.via === "guest" ? (
        <div className={styles.signOutRow}>
          <button type="button" className={styles.signOut} onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : null}

      {member ? (
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
      ) : null}
    </div>
  );
}
