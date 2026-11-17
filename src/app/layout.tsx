import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { Shell } from "@/components/Shell";
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
  title: "Fun Peepers — plans with friends",
  description:
    "Create hangouts, RSVP, poll times and places, chat on plans, and see what’s this weekend.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${manrope.variable}`}>
        <div className="atmosphere" aria-hidden />
        <div className="orb orb--lagoon" aria-hidden />
        <div className="orb orb--lamp" aria-hidden />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
