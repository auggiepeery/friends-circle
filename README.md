# Bottenheimer — Friends log

A single-user personal web app for tracking what your friends are up to.

## Features

- Add, edit, and remove friends (name, optional note, emoji, color)
- Log activities (what, optional place/time label, timestamp)
- Repeating events (daily or weekly, e.g. tennis class) that auto-appear in Recent
- Home feed of recent activity across friends
- Friend detail with activity history and routines
- Persisted in `localStorage`, with sample data on first open and a Reset option

## Develop

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Build

```bash
npm run build
npm run preview
```

## Stack

Vite + React + TypeScript. No backend; data stays in the browser.
