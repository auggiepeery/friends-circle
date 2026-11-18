"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";

type Member = {
  user_id: string;
  display_name: string;
  availability_hint: string;
  role?: string;
};

export default function CirclePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [newFriend, setNewFriend] = useState("");
  const [friendPassword, setFriendPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    const circle = await fetch("/api/circle").then(async (r) => {
      if (!r.ok) throw new Error("forbidden");
      return r.json();
    });
    setMembers(circle.members || []);
    setInviteUrl(circle.inviteUrl || "");
    setInviteCode(circle.inviteCode || "");
    setCanManage(Boolean(circle.canManage));
  }

  useEffect(() => {
    load().catch(() => setError("Sign in to see the circle."));
  }, []);

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "add_friend",
        name: newFriend,
        password: friendPassword,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "name_taken"
          ? "That name is already taken."
          : data.error === "password_short"
            ? "Password must be at least 6 characters."
            : "Couldn’t add friend",
      );
      return;
    }
    setMessage(`Added ${data.friend.name}. Share their password privately.`);
    setNewFriend("");
    setFriendPassword("");
    await load();
  }

  function copyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function rotateInvite() {
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rotate_invite" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError("Couldn’t rotate invite code");
      return;
    }
    setInviteCode(data.inviteCode || "");
    setInviteUrl(data.inviteUrl || "");
    setMessage("Guest invite code rotated — old links no longer work.");
  }

  if (error && members.length === 0) {
    return (
      <section className={ui.hero}>
        <h1 className={ui.headline}>Circle</h1>
        <p className={ui.error}>{error}</p>
      </section>
    );
  }

  const friends = members.filter(
    (m) => m.role === "friend" || m.role === "founder" || !m.role,
  );
  const guests = members.filter((m) => m.role === "guest");

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          The circle
        </h1>
        <p className={ui.lede}>
          Friends sign in with their own password. Guests use this circle invite
          code, or a 4-digit hang code from a Guest plan (expires when that hang
          ends). Profile, password, and theme live in{" "}
          <Link href="/settings" style={{ color: "var(--lamp-hot)" }}>
            Settings
          </Link>
          .
        </p>
        {canManage && inviteUrl ? (
          <div className={ui.ctaRow}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnLamp}`}
              onClick={copyInvite}
            >
              {copied ? "Copied" : "Copy guest invite link"}
            </button>
            <button
              type="button"
              className={ui.btn}
              onClick={() => void rotateInvite()}
              disabled={busy}
            >
              Rotate invite
            </button>
            <span className={ui.chip}>Code {inviteCode}</span>
          </div>
        ) : null}
      </section>

      {message ? (
        <p className={ui.meta} style={{ margin: "0 0 1rem" }}>
          {message}
        </p>
      ) : null}
      {error && members.length > 0 ? (
        <p className={ui.error} style={{ margin: "0 0 1rem" }}>
          {error}
        </p>
      ) : null}

      {canManage ? (
        <section className={ui.section}>
          <h2 className={ui.sectionTitle}>Add a friend</h2>
          <form
            onSubmit={addFriend}
            style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}
          >
            <input
              className={ui.input}
              value={newFriend}
              onChange={(e) => setNewFriend(e.target.value)}
              placeholder="Friend’s display name"
              required
              minLength={2}
              maxLength={120}
            />
            <input
              className={ui.input}
              type="password"
              value={friendPassword}
              onChange={(e) => setFriendPassword(e.target.value)}
              placeholder="Initial password (min 6)"
              required
              minLength={6}
              maxLength={200}
              autoComplete="new-password"
            />
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnLamp}`}
              disabled={busy}
              style={{ justifySelf: "start" }}
            >
              {busy ? "Adding…" : "Add friend"}
            </button>
          </form>
        </section>
      ) : null}

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Named friends</h2>
        {friends.length === 0 ? (
          <p className={ui.empty}>No named friends yet.</p>
        ) : (
          <div className={ui.list}>
            {friends.map((m) => (
              <div key={m.user_id} className={ui.planRow}>
                <div>
                  <div className={ui.planTitle}>{m.display_name || "Friend"}</div>
                  <div className={ui.meta}>
                    {m.role === "founder" ? (
                      <span className={ui.chip}>Auggie</span>
                    ) : null}
                    {m.availability_hint ? (
                      <span className={ui.chip}>{m.availability_hint}</span>
                    ) : (
                      <span className={ui.muted}>No availability hint</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {guests.length > 0 ? (
        <section className={ui.section}>
          <h2 className={ui.sectionTitle}>Guests</h2>
          <div className={ui.list}>
            {guests.map((m) => (
              <div key={m.user_id} className={ui.planRow}>
                <div className={ui.planTitle}>{m.display_name || "Guest"}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
