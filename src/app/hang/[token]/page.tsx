"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ui from "@/components/ui.module.css";

type Preview =
  | {
      status: "ok";
      title: string;
      whenLabel: string | null;
      expiresAt: string;
    }
  | { status: "expired" | "revoked" | "invalid" }
  | null;

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Hang-specific guest invite — valid until shortly after the plan ends. */
export default function HangInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params?.token === "string" ? params.token : "";
  const [preview, setPreview] = useState<Preview>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setPreview({ status: "invalid" });
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/hang/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({ status: "invalid" }));
        if (!alive) return;
        if (!res.ok) {
          setPreview({
            status:
              data.status === "expired" || data.status === "revoked"
                ? data.status
                : "invalid",
          });
          return;
        }
        setPreview(data as Preview);
      })
      .catch(() => {
        if (alive) setPreview({ status: "invalid" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!token || preview?.status !== "ok") return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/hang/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (data.error === "expired") {
        setPreview({ status: "expired" });
        setError("This invite expired after the hang ended.");
      } else if (data.error === "revoked") {
        setPreview({ status: "revoked" });
        setError("This invite was revoked.");
      } else if (data.error === "rate_limited") {
        setError("Too many tries — wait a minute and try again.");
      } else if (data.error === "name_required") {
        setError("Enter your name (at least 2 characters).");
      } else {
        setPreview({ status: "invalid" });
        setError("This invite isn’t valid.");
      }
      return;
    }
    const planId = typeof data.planId === "string" ? data.planId : "";
    router.replace(planId ? `/plans/${planId}` : "/");
  }

  if (loading) {
    return (
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline}>Guest invite</h1>
        <p className={ui.muted}>Checking invite…</p>
      </section>
    );
  }

  if (!preview || preview.status === "invalid") {
    return (
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline}>Invite unavailable</h1>
        <p className={ui.lede}>
          This guest invite isn’t valid. Ask someone in the circle for a fresh
          hang link.
        </p>
      </section>
    );
  }

  if (preview.status === "expired") {
    return (
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline}>Invite expired</h1>
        <p className={ui.lede}>
          This hang invite expired after the plan ended. Ask the host for a new
          one if you still need to join.
        </p>
      </section>
    );
  }

  if (preview.status === "revoked") {
    return (
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline}>Invite revoked</h1>
        <p className={ui.lede}>
          The host turned off this guest link. Ask them for an updated invite.
        </p>
      </section>
    );
  }

  if (preview.status !== "ok") {
    return (
      <section className={`${ui.hero} rise`}>
        <h1 className={ui.headline}>Invite unavailable</h1>
        <p className={ui.lede}>
          This guest invite isn’t valid. Ask someone in the circle for a fresh
          hang link.
        </p>
      </section>
    );
  }

  const hang = preview;

  return (
    <section className={`${ui.hero} rise`}>
      <p className={ui.muted}>Guest hang invite</p>
      <h1 className={ui.headline}>{hang.title}</h1>
      <p className={ui.lede}>
        Enter your name to join this hang as a guest. The link stops working
        shortly after the hang ends
        {hang.expiresAt ? ` (until ${formatExpiry(hang.expiresAt)})` : ""}.
      </p>
      {hang.whenLabel ? (
        <p className={ui.meta} style={{ marginBottom: "1rem" }}>
          <span className={ui.chip}>{hang.whenLabel}</span>
        </p>
      ) : null}
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
          autoComplete="nickname"
        />
        {error ? <p className={ui.error}>{error}</p> : null}
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnLamp}`}
          disabled={busy || !token}
        >
          {busy ? "Joining…" : "Join this hang"}
        </button>
      </form>
    </section>
  );
}
