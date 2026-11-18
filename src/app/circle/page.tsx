"use client";

import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";

type Member = {
  user_id: string;
  display_name: string;
  availability_hint: string;
};

export default function CirclePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hint, setHint] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/circle").then(async (r) => {
        if (!r.ok) throw new Error("forbidden");
        return r.json();
      }),
      fetch("/api/me").then((r) => r.json()),
    ])
      .then(([circle, me]) => {
        setMembers(circle.members || []);
        setInviteUrl(circle.inviteUrl || "");
        setInviteCode(circle.inviteCode || "");
        if (me.viewer?.availability_hint) setHint(me.viewer.availability_hint);
      })
      .catch(() => setError("Circle is invite-only — join with a code first."));
  }, []);

  async function saveHint() {
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ availability_hint: hint }),
    });
  }

  function copyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (error) {
    return (
      <section className={ui.hero}>
        <h1 className={ui.headline}>Circle</h1>
        <p className={ui.error}>{error}</p>
      </section>
    );
  }

  return (
    <>
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
          The circle
        </h1>
        <p className={ui.lede}>
          Small group, one shared calendar. Share the invite link with your
          friends — only people with it can see the plans.
        </p>
        {inviteUrl ? (
          <div className={ui.ctaRow}>
            <button type="button" className={`${ui.btn} ${ui.btnLamp}`} onClick={copyInvite}>
              {copied ? "Copied" : "Copy invite link"}
            </button>
            <span className={ui.chip}>Code {inviteCode}</span>
          </div>
        ) : null}
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
        <h2 className={ui.sectionTitle}>Who’s in</h2>
        {members.length === 0 ? (
          <p className={ui.empty}>Just you so far — send the invite link.</p>
        ) : (
          <div className={ui.list}>
            {members.map((m) => (
              <div key={m.user_id} className={ui.planRow}>
                <div>
                  <div className={ui.planTitle}>{m.display_name || "Friend"}</div>
                  <div className={ui.meta}>
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
    </>
  );
}
