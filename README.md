# Fun Peepers (friends-circle)

Shared calendar for a small group of friends. Everyone in the circle sees every plan — no “send to friends” step. RSVP, chat, and polls live on each plan (including polls added after the plan is created).

**Who’s free** — tap a calendar day to see who’s free vs busy (routines + plans). **Daily routines** — Fun Peeps set recurring weekday busy blocks (sports, church, school) in Settings; they feed Who’s free. Guests can add routines optionally.

## Stack

- Next.js App Router + TypeScript + CSS Modules
- Postgres via `DATABASE_URL` (PGlite locally when unset)
- Guest display-name sign-in for Public; Cursor identity when available
- Progressive Web App (manifest + service worker + Home Screen icons)
- Per-profile UI prefs stored on the signed-in `profiles` row

## Develop

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3000

## Brand & themes

**Fun Peepers** — full appearance systems (Syne + Manrope). Home is a shared month/week/list calendar with a single glass control chrome on iPhone.

Appearance themes (Settings → Appearance, saved on your signed-in profile):

| Theme | Feel |
| --- | --- |
| Night lagoon | Default — teal glass, deep water glow |
| Warm dusk | Ember sky, copper rails |
| Lamp citrus | Charcoal night, amber lamp |
| Ice pier | Slate harbor, glacial cyan |
| Moss hollow | Forest floor, lichen green |
| Cobalt vault | Ink navy, electric blue |

Removed themes (Day mist, Deep reef, etc.) migrate to **Night lagoon**.

## Install as an app (PWA)

Live: https://friends-circle.apps.grok.bot

Install from the **home/calendar** page so the Home Screen icon always launches the same Fun Peepers app (`start_url` `/`, `scope` `/`, `display: standalone`) — not Safari with other tabs.

### iPhone (Safari)

1. Open Fun Peepers home in **Safari**.
2. Tap **Share** (square with ↑).
3. Tap **Add to Home Screen** → **Add**.
4. Open from the Peepers icon for a full-screen standalone app.

### Android (Chrome)

1. Open Fun Peepers in **Chrome**.
2. Tap **⋮** → **Install app** or **Add to Home screen**.
3. Confirm — open from the app drawer.

iPhone Safari: `viewport-fit=cover`, safe-area insets, 44px touch targets, 16px inputs (no focus zoom), sticky header/nav, keyboard hides bottom nav.
