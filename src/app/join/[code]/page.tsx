"use client";

import Link from "next/link";
import ui from "@/components/ui.module.css";

/** Invite links are optional now — sign-in uses the friend picker. */
export default function JoinPage() {
  return (
    <section className={`${ui.hero} rise`}>
      <h1 className={ui.headline}>Join Fun Peepers</h1>
      <p className={ui.lede}>
        Pick your name on the home screen and enter your password (for named
        friends, that’s your display name). Guests can choose Guest and type a
        name. Ask the founder to add you to the picker if you’re new.
      </p>
      <div className={ui.ctaRow}>
        <Link href="/" className={`${ui.btn} ${ui.btnLamp}`}>
          Go to sign-in
        </Link>
      </div>
    </section>
  );
}
