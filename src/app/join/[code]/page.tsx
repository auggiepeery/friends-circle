"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";

export default function JoinInvitePage() {
  const params = useParams<{ code: string }>();
  const code = params.code || "";
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(async (data) => {
        if (data.viewer?.member) {
          router.replace("/");
          return;
        }
        if (data.viewer) {
          setName(data.viewer.name || "");
          setBusy(true);
          const res = await fetch("/api/circle", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ inviteCode: code }),
          });
          setBusy(false);
          if (res.ok) {
            router.replace("/");
            return;
          }
          const err = await res.json();
          setError(err.error === "invalid_invite" ? "That invite isn’t valid." : "Couldn’t join");
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [code, router]);

  async function submit(e: React.FormEvent) {
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
      body: JSON.stringify({ inviteCode: code }),
    });
    setBusy(false);
    if (!join.ok) {
      setError("That invite isn’t valid.");
      return;
    }
    router.replace("/");
  }

  if (!ready) return <p className={ui.muted}>Opening invite…</p>;

  return (
    <section className={`${ui.hero} rise`}>
      <h1 className={ui.headline} style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}>
        You’re invited
      </h1>
      <p className={ui.lede}>
        Join the Fun Peepers circle to see the shared calendar. Pick the name your
        friends will recognize.
      </p>
      <form className={ui.form} onSubmit={submit}>
        <label className={ui.label}>
          Your name
          <input
            className={ui.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        {error ? <p className={ui.error}>{error}</p> : null}
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={busy}>
          {busy ? "Joining…" : "Join calendar"}
        </button>
      </form>
    </section>
  );
}
