import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { Shell } from "@/components/Shell";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fun Peepers — shared calendar for friends",
  description:
    "A small-group shared calendar: add plans everyone can see, RSVP, chat, and poll.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className={`${syne.variable} ${manrope.variable}`}>
        <div className="atmosphere" aria-hidden />
        <div className="orb orb--lagoon" aria-hidden />
        <div className="orb orb--lamp" aria-hidden />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
