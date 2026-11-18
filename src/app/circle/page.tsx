"use client";

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
  const [hint, setHint] = useState("");
  const [newFriend, setNewFriend] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [circle, me] = await Promise.all([
      fetch("/api/circle").then(async (r) => {
        if (!r.ok) throw new Error("forbidden");
        return r.json();
      }),
      fetch("/api/me").then((r) => r.json()),
    ]);
    setMembers(circle.members || []);
    if (me.viewer?.availability_hint) setHint(me.viewer.availability_hint);
  }

  useEffect(() => {
    load().catch(() => setError("Sign in to see the circle."));
  }, []);

  async function saveHint() {
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ availability_hint: hint }),
    });
  }

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add_friend", name: newFriend }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "name_taken"
          ? "That name is already on the list."
          : "Couldn’t add friend",
      );
      return;
    }
    setMessage(
      `Added ${data.friend.name} — their password is exactly that name.`,
    );
    setNewFriend("");
    await load();
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
          Named friends show up on the sign-in picker. Their password is their
          display name, spelled the same way. Guests type a name with no
          password.
        </p>
      </section>

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
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnLamp}`}
            disabled={busy}
            style={{ justifySelf: "start" }}
          >
            {busy ? "Adding…" : "Add to picker"}
          </button>
          {message ? <p className={ui.meta}>{message}</p> : null}
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Your availability</h2>
        <label className={ui.label} style={{ marginTop: "0.75rem" }}>
          Short hint on the circle
          <input
            className={ui.input}
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onBlur={saveHint}
            placeholder="Free after 6 · busy Thu"
          />
        </label>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Named friends</h2>
        {friends.length === 0 ? (
          <p className={ui.empty}>No named friends yet — add one above.</p>
        ) : (
          <div className={ui.list}>
            {friends.map((m) => (
              <div key={m.user_id} className={ui.planRow}>
                <div>
                  <div className={ui.planTitle}>{m.display_name || "Friend"}</div>
                  <div className={ui.meta}>
                    {m.role === "founder" ? (
                      <span className={ui.chip}>Founder</span>
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
          <h2 className={ui.sectionTitle}>Recent guests</h2>
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
