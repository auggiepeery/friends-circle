"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PREFS_EVENT,
  applyPrefsToDocument,
  readPrefs,
} from "@/lib/prefs";
import styles from "./Shell.module.css";

type Me = {
  name: string;
  email: string;
  simulated: boolean;
  unread: number;
  via?: "cursor" | "guest" | "friend";
  member?: boolean;
};

type Mode = "friend" | "guest" | "founder";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [founderAvailable, setFounderAvailable] = useState(true);
  const [mode, setMode] = useState<Mode>("friend");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showUnreadBadge, setShowUnreadBadge] = useState(true);

  async function refresh() {
    const data = await fetch("/api/me").then((r) => r.json());
    setMe(data.viewer);
    setLoaded(true);
    return data.viewer as Me | null;
  }

  useEffect(() => {
    applyPrefsToDocument();
    const sync = () => {
      const prefs = readPrefs();
      applyPrefsToDocument(prefs);
      setShowUnreadBadge(prefs.showUnreadBadge);
    };
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
      fetch("/api/signin").then((r) => r.json()),
    ])
      .then(([meData, status]) => {
        if (!alive) return;
        setMe(meData.viewer);
        setEmpty(Boolean(status.empty));
        setFounderAvailable(status.founderAvailable !== false);
        setMode(status.empty ? "founder" : "friend");
        setLoaded(true);
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

  function errorMessage(code: string | undefined): string {
    if (code === "bad_credentials" || code === "bad_password") {
      return "Name or password didn’t match.";
    }
    if (code === "invalid_invite") {
      return "Need a valid guest invite code from someone in the circle.";
    }
    if (code === "name_required") return "Enter a name (at least 2 characters).";
    if (code === "setup_unavailable") {
      return "Auggie setup isn’t ready yet — add the setup secret first.";
    }
    if (code === "rate_limited") return "Too many tries — wait a minute.";
    return "Couldn’t sign in";
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const body: Record<string, string> = { mode };
    if (mode === "friend") {
      body.name = name;
      body.password = password;
    } else if (mode === "guest") {
      body.name = name;
      body.inviteCode = inviteCode;
    } else {
      body.password = password;
      body.name = name;
    }

    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(data.error));
      return;
    }
    setPassword("");
    setInviteCode("");
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
              {me && showUnreadBadge && me.unread > 0 ? (
                <span className={styles.badge}>{me.unread}</span>
              ) : null}
            </Link>
            <Link href="/plans/new" data-active={active("/plans/new")}>
              Add plan
            </Link>
            <Link href="/settings" data-active={active("/settings")}>
              Settings
            </Link>
            <span className={styles.who}>
              {me?.name}
              {me?.via === "guest" ? " · guest" : ""}
            </span>
          </nav>
        ) : null}
      </header>

      {loaded && !member ? (
        <div className={styles.gate}>
          <form className={styles.gateForm} onSubmit={signIn}>
            <div>
              <strong>Who’s peeping?</strong>
              <p>
                Friends sign in with their name and password. Guests need an
                invite code. Auggie uses the setup secret.
              </p>
            </div>
            <label className={styles.gateLabel}>
              Sign in as
              <select
                className={styles.gateInput}
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                {!empty ? <option value="friend">Friend</option> : null}
                {!empty ? <option value="guest">Guest (invite)</option> : null}
                {founderAvailable ? (
                  <option value="founder">Auggie</option>
                ) : null}
              </select>
            </label>
            <input
              className={styles.gateInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "founder" ? "Display name (optional)" : "Your name"
              }
              required={mode !== "founder"}
              minLength={mode === "founder" ? undefined : 2}
              maxLength={120}
              autoComplete="username"
            />
            {mode === "guest" ? (
              <input
                className={styles.gateInput}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Guest invite code"
                required
                maxLength={80}
                autoComplete="off"
              />
            ) : (
              <input
                className={styles.gateInput}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "founder" ? "Auggie password" : "Password"
                }
                required
                minLength={mode === "friend" ? 4 : undefined}
                maxLength={200}
                autoComplete="current-password"
              />
            )}
            {error ? <p className={styles.gateError}>{error}</p> : null}
            <button type="submit" className={styles.gateBtn} disabled={busy}>
              {busy ? "Signing in…" : "Enter"}
            </button>
          </form>
        </div>
      ) : null}

      <main className={styles.main}>
        {member
          ? children
          : loaded
            ? null
            : <p className={styles.loading}>Loading…</p>}
      </main>

      {me && member ? (
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
          <Link href="/settings" data-active={active("/settings")}>
            Set
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
