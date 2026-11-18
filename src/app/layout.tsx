import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
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
  applicationName: "Fun Peepers",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fun Peepers",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07161c" },
    { media: "(prefers-color-scheme: light)", color: "#07161c" },
  ],
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
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Fun Peepers" />
        <meta name="theme-color" content="#07161c" />
      </head>
      <body className={`${syne.variable} ${manrope.variable}`}>
        <div className="atmosphere" aria-hidden />
        <div className="orb orb--lagoon" aria-hidden />
        <div className="orb orb--lamp" aria-hidden />
        <Shell>{children}</Shell>
        <PwaRegister />
      </body>
    </html>
  );
}
