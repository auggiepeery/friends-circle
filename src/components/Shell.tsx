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
  via?: "cursor" | "guest" | "friend";
  member?: boolean;
};

type PickerFriend = { id: string; name: string };

const GUEST = "__guest__";
const FOUNDER = "__founder__";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [friends, setFriends] = useState<PickerFriend[]>([]);
  const [empty, setEmpty] = useState(false);
  const [founderAvailable, setFounderAvailable] = useState(true);
  const [who, setWho] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const data = await fetch("/api/me").then((r) => r.json());
    setMe(data.viewer);
    setLoaded(true);
    return data.viewer as Me | null;
  }

  async function loadRoster() {
    const data = await fetch("/api/signin").then((r) => r.json());
    setFriends(data.friends || []);
    setEmpty(Boolean(data.empty));
    setFounderAvailable(data.founderAvailable !== false);
    if (!who) {
      if ((data.friends || []).length) setWho(data.friends[0].id);
      else if (data.empty) setWho(FOUNDER);
      else setWho(GUEST);
    }
  }

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/signin").then((r) => r.json()),
    ])
      .then(([meData, roster]) => {
        if (!alive) return;
        setMe(meData.viewer);
        setFriends(roster.friends || []);
        setEmpty(Boolean(roster.empty));
        setFounderAvailable(roster.founderAvailable !== false);
        const list: PickerFriend[] = roster.friends || [];
        if (list.length) setWho(list[0].id);
        else if (roster.empty) setWho(FOUNDER);
        else setWho(GUEST);
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
    if (code === "bad_password") return "Password didn’t match — try again.";
    if (code === "unknown_friend") return "That friend isn’t on the list.";
    if (code === "name_required") return "Enter a name (at least 2 characters).";
    if (code === "setup_unavailable") {
      return "Founder setup isn’t ready yet — add the founder secret first.";
    }
    if (code === "friend_required") return "Pick who you are.";
    return "Couldn’t sign in";
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    let body: Record<string, string>;
    if (who === FOUNDER) {
      body = { mode: "founder", password, name };
    } else if (who === GUEST) {
      body = { mode: "guest", name };
    } else {
      body = { mode: "friend", friendId: who, password };
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
    setName("");
    await refresh();
    await loadRoster();
  }

  async function signOut() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sign_out" }),
    });
    await refresh();
    await loadRoster();
  }

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const member = Boolean(me?.member);
  const showGuestName = who === GUEST || who === FOUNDER;
  const showPassword = who !== GUEST;

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
                  ? "Signed in as guest"
                  : me?.via === "friend"
                    ? "Signed in as friend"
                    : me?.simulated
                      ? "Simulated local viewer"
                      : me?.email
              }
            >
              {me?.name}
              {me?.via === "guest"
                ? " · guest"
                : me?.via === "friend"
                  ? ""
                  : me?.simulated
                    ? " · local"
                    : ""}
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
                Pick your name and enter your password
                {empty
                  ? " — or sign in as founder to start the circle."
                  : ". Guests can type a name with no password."}
              </p>
            </div>
            <label className={styles.gateLabel}>
              I am
              <select
                className={styles.gateInput}
                value={who}
                onChange={(e) => setWho(e.target.value)}
                required
              >
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                <option value={GUEST}>Guest</option>
                {founderAvailable ? (
                  <option value={FOUNDER}>Founder</option>
                ) : null}
              </select>
            </label>
            {showGuestName ? (
              <input
                className={styles.gateInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  who === FOUNDER ? "Your display name (optional)" : "Your name"
                }
                required={who === GUEST}
                minLength={who === GUEST ? 2 : undefined}
                maxLength={120}
              />
            ) : null}
            {showPassword ? (
              <input
                className={styles.gateInput}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  who === FOUNDER
                    ? "Founder password"
                    : "Password (your name, same spelling)"
                }
                required
                maxLength={200}
                autoComplete="current-password"
              />
            ) : null}
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
        </nav>
      ) : null}
    </div>
  );
}
