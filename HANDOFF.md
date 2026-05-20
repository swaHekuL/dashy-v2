# Dashy v2 — Agent Handoff

## What This Project Is

Passive auto-rotating Next.js dashboard for a Raspberry Pi 3B+ (800×480 display). No voice control, no Python. Shows a persistent clock header (42vh) at the top and cycles through 5 data panels (58vh) every 7 seconds with instant cuts.

**Panels (in rotation order):** Weather → Calendar → Gmail → News → Steam

## Current State

Tasks 1 and 2 are complete. Task 3 onward is ready to implement.

| Task | Status |
|------|--------|
| Task 1: Scaffold Next.js project | ✅ Done (`0ac5934`, `a07f410`, fixes) |
| Task 2: Google OAuth script | ✅ Script created (`151e482`) — **user must run auth flow manually** |
| Task 3: Clock component + index.js shell | ⏳ Ready |
| Task 4: Weather API route + panel | ⏳ Waiting on OWM credentials |
| Task 5: Calendar API route + panel | ⏳ Waiting on Google OAuth token |
| Task 6: Gmail API route + panel | ⏳ Waiting on Google OAuth token |
| Task 7: News API route + panel | ⏳ Ready |
| Task 8: Steam API route + panel | ⏳ Ready |
| Task 9: Pi deployment | ⏳ Last step |

## Before Continuing — User Must Complete

The following manual steps are required before Tasks 4–6 can be implemented:

1. **Google Cloud setup**: Create a project, enable Calendar API + Gmail API, create OAuth 2.0 Desktop App credentials, add `http://127.0.0.1:3333/callback` as an authorized redirect URI.

2. **Fill in `config/credentials.json`**:
   ```json
   {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "client_secret": "YOUR_CLIENT_SECRET",
     "refresh_token": "",
     "owm_api_key": "YOUR_OWM_KEY",
     "owm_lat": "YOUR_LAT",
     "owm_lon": "YOUR_LON"
   }
   ```
   OWM key: openweathermap.org/api (free tier). Lat/lon from Google Maps right-click.

3. **Run the auth flow** (from this directory):
   ```bash
   node scripts/google-auth.js
   ```
   Open the printed URL, approve Calendar + Gmail scopes, wait for "Auth complete". Terminal should print "Refresh token saved." Verify `config/credentials.json` now has a non-empty `refresh_token`.

**Tasks 3, 7, and 8 do not require credentials and can be implemented immediately.**

## Full Implementation Plan

The complete plan is at:
`c:\Users\lthaw\Documents\Personal Projects\Pi Dash\docs\superpowers\plans\2026-05-19-dashy-v2.md`

The design spec is at:
`c:\Users\lthaw\Documents\Personal Projects\Pi Dash\docs\superpowers\specs\2026-05-19-dashy-v2-design.md`

## Key Design Decisions (baked into the plan)

- **Background:** Pure `#000` everywhere — no dark navy, no off-black
- **Clock header:** Bebas Neue font, time in `#fff`, date in `#aaa`, always consistent
- **Panels:** Each uses its platform's dark-mode palette on top of black
  - Weather: OWM blue `#7ec8e3`, neutral grays
  - Calendar: Google blue `#1a73e8`, Material dark (`#e8eaed`, `#9aa0a6`), event color chips
  - Gmail: Gmail red `#ea4335`, Material dark grays
  - News: Red lead accent `#e63946`, Georgia serif font
  - Steam: Steam blue `#66c0f4`, `#c6d4df` text, green sale badges (`#a4d007` on `#4c6b22`)
- **Screen:** 800×480 → 1vw=8px, 1vh=4.8px — always sanity-check font sizes against these
- **Fonts:** Bebas Neue (clock), Roboto (Calendar/Gmail), system sans (Weather/Steam), Georgia (News)

## Pi SSH Access

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@10.0.0.86 "<command>"
```
- Node via nvm: prefix all SSH commands with `export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH &&`
- Always `npm run build` before rebooting
- Logs: `~/dashy.log`

## File Map

```
dashy-v2/
  pages/
    index.js          ← single page: Clock + rotating panel (replace placeholder in Task 3)
    _app.js           ✅ done — minimal, imports globals.css
    _document.js      ✅ done — Next.js default
    api/
      weather.js      ← Task 4
      calendar.js     ← Task 5
      gmail.js        ← Task 6
      news.js         ← Task 7
      steam.js        ← Task 8
  screens/
    Clock.jsx         ← Task 3
    Weather.jsx       ← Task 4
    Calendar.jsx      ← Task 5
    Gmail.jsx         ← Task 6
    News.jsx          ← Task 7
    Steam.jsx         ← Task 8
  config/
    credentials.json  ← gitignored, fill in manually
  scripts/
    google-auth.js    ✅ done — run once to get OAuth token
  styles/
    globals.css       ✅ done — black reset
```

## How to Continue

Tell the new agent:

> "Continue implementing dashy-v2 from Task 3. Read HANDOFF.md for full context. The plan is at `c:\Users\lthaw\Documents\Personal Projects\Pi Dash\docs\superpowers\plans\2026-05-19-dashy-v2.md`. Use subagent-driven development. Start with Tasks 3, 7, and 8 (no credentials needed), then 4, 5, 6 after I confirm credentials are filled in, then Task 9."
