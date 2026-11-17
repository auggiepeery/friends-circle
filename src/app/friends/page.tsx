"use client";

import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";

type Friend = {
  id: string;
  display_name?: string;
  email?: string;
  availability_hint?: string;
  status: string;
};

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Friend[]>([]);
  const [emailOrName, setEmailOrName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/friends");
    const data = await res.json();
    setFriends(data.friends || []);
    setPending(data.pending || []);
  }

  useEffect(() => {
    load().catch(() => setError("Couldn’t load friends"));
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "invite", emailOrName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Invite failed");
      return;
    }
    setMessage("Invite sent");
    setEmailOrName("");
    await load();
  }

  async function respond(friendshipId: string, accept: boolean) {
    await fetch("/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "respond", friendshipId, accept }),
    });
    await load();
  }

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          Your circle
        </h1>
        <p className={ui.lede}>
          Invite friends by email or name. See who’s free, then plan together.
        </p>
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Invite</h2>
        <form className={ui.form} onSubmit={invite} style={{ marginTop: "0.75rem" }}>
          <label className={ui.label}>
            Email or display name
            <input
              className={ui.input}
              value={emailOrName}
              onChange={(e) => setEmailOrName(e.target.value)}
              placeholder="friend@example.com"
              required
            />
          </label>
          {error ? <p className={ui.error}>{error}</p> : null}
          {message ? <p className={ui.muted}>{message}</p> : null}
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Send invite
          </button>
        </form>
      </section>

      {pending.length > 0 ? (
        <section className={ui.section}>
          <h2 className={ui.sectionTitle}>Incoming</h2>
          <div className={ui.list}>
            {pending.map((p) => (
              <div key={p.id} className={ui.planRow}>
                <div>
                  <div className={ui.planTitle}>{p.display_name || "Friend"}</div>
                  <div className={ui.meta}>{p.email}</div>
                </div>
                <div className={ui.ctaRow}>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    onClick={() => respond(p.id, true)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnGhost}`}
                    onClick={() => respond(p.id, false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Friends</h2>
        {friends.length === 0 ? (
          <p className={ui.empty}>No friends yet — invite someone.</p>
        ) : (
          <div className={ui.list}>
            {friends.map((f) => (
              <div key={f.id} className={ui.planRow}>
                <div>
                  <div className={ui.planTitle}>{f.display_name || "Friend"}</div>
                  <div className={ui.meta}>
                    <span>{f.email}</span>
                    {f.availability_hint ? (
                      <span className={ui.chip}>{f.availability_hint}</span>
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
    </>
  );
}
