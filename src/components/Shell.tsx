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
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((data: { viewer: Me | null }) => {
        if (alive) setMe(data.viewer);
      })
      .catch(() => {
        if (alive) setMe(null);
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>
          Fun <span>Peepers</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" data-active={active("/")}>
            Home
          </Link>
          <Link href="/weekend" data-active={active("/weekend")}>
            Weekend
          </Link>
          <Link href="/friends" data-active={active("/friends")}>
            Friends
          </Link>
          <Link href="/notifications" data-active={active("/notifications")}>
            Alerts
            {me && me.unread > 0 ? (
              <span className={styles.badge}>{me.unread}</span>
            ) : null}
          </Link>
          <Link href="/plans/new" data-active={active("/plans/new")}>
            New plan
          </Link>
          {me ? (
            <span className={styles.who} title={me.simulated ? "Simulated local viewer" : me.email}>
              {me.name}
              {me.simulated ? " · local" : ""}
            </span>
          ) : null}
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
      <nav className={styles.mobile} aria-label="Mobile">
        <Link href="/" data-active={active("/")}>
          Home
        </Link>
        <Link href="/weekend" data-active={active("/weekend")}>
          Weekend
        </Link>
        <Link href="/plans/new" data-active={active("/plans/new")}>
          New
        </Link>
        <Link href="/friends" data-active={active("/friends")}>
          Friends
        </Link>
        <Link href="/notifications" data-active={active("/notifications")}>
          Alerts
        </Link>
      </nav>
    </div>
  );
}
