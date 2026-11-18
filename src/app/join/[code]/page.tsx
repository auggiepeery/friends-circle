"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import ui from "@/components/ui.module.css";

/** Guest invite link — redeem with a typed name (invite-gated). */
export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = typeof params?.code === "string" ? params.code : "";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "guest", name, inviteCode: code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "invalid_invite"
          ? "This invite isn’t valid."
          : "Couldn’t join",
      );
      return;
    }
    router.replace("/");
  }

  return (
    <section className={`${ui.hero} rise`}>
      <h1 className={ui.headline}>Guest invite</h1>
      <p className={ui.lede}>
        Enter your name to join the shared calendar as a guest. Friends sign in
        from home with their own password.
      </p>
      <form
        onSubmit={join}
        style={{ display: "grid", gap: "0.75rem", maxWidth: "22rem" }}
      >
        <input
          className={ui.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          minLength={2}
          maxLength={120}
        />
        {error ? <p className={ui.error}>{error}</p> : null}
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnLamp}`}
          disabled={busy || !code}
        >
          {busy ? "Joining…" : "Join as guest"}
        </button>
      </form>
    </section>
  );
}
