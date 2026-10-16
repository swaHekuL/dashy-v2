# Dashy v2 — Passive Auto-Rotating Dashboard

**Date:** 2026-05-19
**Status:** Approved

## Overview

Complete rewrite of Dashy as a passive, always-on display dashboard. Voice control is removed entirely. The dashboard shows a persistent clock header at the top of the screen and automatically cycles through five data panels below it. No user input required.

New directory: `dashy-v2` (sibling to the current `Pi Dash` repo). Pure Next.js — no Python, no voice pipeline.

## Display

- **Screen:** 800×480 (7" Pi touchscreen) — 1vw = 8px, 1vh = 4.8px
- **Clock header:** ~42vh (~202px) — always visible, never changes
- **Panel zone:** ~58vh (~278px) — rotates through 5 panels
- **Rotation:** 7 seconds per panel, instant cut, no transition animation
- **Panel order:** Weather → Calendar → Gmail → News → Steam (cycles continuously)

## Visual Design

**Background:** Pure `#000` across the entire screen at all times. No exceptions — no dark navy, no off-black for individual panels.

**Clock header (consistent across all panels):**
- Time: white (`#fff`), light font weight, wide letter-spacing
- Date: `#aaa`, uppercase, consistent regardless of which panel is active

**Panels:** Each panel uses its source platform's dark-mode color palette — accent colors, text hierarchy, and fonts — applied on top of the black background. No global style is imposed on panels beyond the black background.

| Panel | Accent / text palette |
|-------|-----------------------|
| Weather | OpenWeatherMap blue (`#7ec8e3`), neutral grays |
| Calendar | Google blue (`#1a73e8`), Material dark grays (`#e8eaed`, `#9aa0a6`), event color chips |
| Gmail | Gmail red (`#ea4335`), Material dark grays |
| News | Red lead accent (`#e63946`) for top story, neutral grays |
| Steam | Steam blue (`#66c0f4`), `#c6d4df` text, green sale badges (`#a4d007` on `#4c6b22`) |

## Architecture

Pure Next.js app. No Python. No inter-process communication.

```
dashy-v2/
  pages/
    index.js          ← single page: clock header + rotating panel, polling loop
    api/
      calendar.js     ← fetches Google Calendar, caches in memory
      gmail.js        ← fetches Gmail, caches in memory
      weather.js      ← fetches OpenWeatherMap, caches in memory
      news.js         ← fetches RSS feed via rss2json, caches in memory
      steam.js        ← fetches Steam featured API, caches in memory
  screens/
    Clock.jsx         ← clock header (always rendered, local setInterval tick)
    Calendar.jsx
    Gmail.jsx
    Weather.jsx
    News.jsx
    Steam.jsx
  config/
    credentials.json  ← gitignored; stores Google OAuth refresh token + OWM API key
  scripts/
    google-auth.js    ← one-time CLI: prints OAuth URL, accepts code, writes token
```

## Data Layer

All external API calls happen server-side in Next.js API routes. Each route caches its last successful response in module-level memory and only re-fetches after its TTL expires. The frontend never calls external APIs directly.

| Panel | Source | Auth | Cache TTL |
|-------|--------|------|-----------|
| Weather | OpenWeatherMap `/data/2.5/weather` | API key in credentials.json | 10 min |
| Calendar | Google Calendar API v3 `/calendars/primary/events` | OAuth refresh token | 5 min |
| Gmail | Gmail API v1 `/users/me/messages` | same OAuth token | 2 min |
| News | RSS feed (AP or BBC) via rss2json public API | none | 15 min |
| Steam | `store.steampowered.com/api/featured` | none (public) | 1 hour |

**Frontend polling:** `index.js` fetches all five API routes on mount, then sets up per-route intervals matching the TTLs above. Panel rotation (`setInterval` at 7s) is independent of data fetching.

## Panel Content

**Weather:** Large current temperature, condition label, high/low, rain %, humidity, wind speed.

**Calendar:** Today's label, up to 3 events with colored left-border chips (Google Calendar event colors) showing time and title.

**Gmail:** Unread count badge, 3 most recent unread subject lines (bold for unread, sender as subtitle on top item).

**News:** "Top Stories" label, 3 headlines — top story with red left-border accent, remaining two with muted border.

**Steam:** "Featured & Deals" label, up to 3 discounted games with name and discount badge, plus one new release line below.

## Google OAuth Setup

Calendar and Gmail share a single Google OAuth 2.0 client (same credentials, same refresh token). Setup is a one-time process:

1. Create a Google Cloud project, enable Calendar API and Gmail API, create OAuth 2.0 credentials (Desktop app type).
2. Add client ID and secret to `config/credentials.json`.
3. Run `node scripts/google-auth.js` — prints an authorization URL.
4. Open URL in browser, approve, copy the code back into the terminal.
5. Script writes the refresh token to `config/credentials.json`.
6. API routes handle all future token refreshes automatically.

Required scopes: `https://www.googleapis.com/auth/calendar.readonly`, `https://www.googleapis.com/auth/gmail.readonly`

## Boot & Deployment

- Production: `npm run build && npm start` (same pattern as current Dashy)
- Autostart via `~/.bash_profile` on tty1 (same mechanism as current Dashy)
- After any frontend change: `npm run build` on the Pi before rebooting
- Node via nvm — SSH commands must prefix `export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH`

## What's Removed vs. Current Repo

| Removed | Reason |
|---------|--------|
| Entire `core/voice/` pipeline | Voice control dropped |
| openWakeWord / Vosk / Piper / webrtcvad | Voice deps |
| `core/actions/`, `core/state.py` | No longer needed |
| Python `main.py` and all Python deps | No Python in v2 |
| Spotify screen and `core/spotify.py` | User controls Spotify from computer instead |
| Wake word model (`hey_dashy.onnx`) | Voice dropped |
| Voice glow animation | No voice state |
