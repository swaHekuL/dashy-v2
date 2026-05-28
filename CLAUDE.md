@AGENTS.md

## Project

Passive auto-rotating Next.js 16.2.6 (Turbopack) dashboard for Raspberry Pi 3B+ (800×480). 12 panels cycle every 10s:

- **weather** — current temp/condition/wind + 4-slot hourly forecast cards (Open-Meteo)
- **calendar** — next 3 Google Calendar events grouped by date with TODAY/TOMORROW headers
- **gmail** — unread count + message previews (Google Gmail API)
- **news-world / news-gaming / news-tech / news-sports / news-utah** — 3 headlines each from RSS feeds (BBC, IGN, The Verge, ESPN, Deseret News)
- **steam-sales** — up to 4 discounted Steam games
- **steam-releases** — up to 4 new Steam releases
- **stocks** — AAPL, VTI, NVDA price cards with change % (Yahoo Finance)
- **gas** — Maverik regular unleaded prices at two stations with delta vs. last check (Google Maps Places API)

A **StatusBar** at the bottom highlights which segment (WEATHER / CALENDAR / GMAIL / NEWS / STEAM / STOCKS / GAS) is active.

## Config Files

- `config/credentials.json` — gitignored, Google OAuth secrets (client_id, client_secret, refresh_token)
- `config/settings.json` — tracked in git, non-sensitive: lat/lon for Open-Meteo weather, `tickers` array for Stocks panel, `gasPrices.stations` array with Place IDs for Gas panel
- `.env.local` — gitignored, `GOOGLE_MAPS_API_KEY` for the gas prices Places API

## Pi Deployment

- SSH: `ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59`
- Node via nvm: prefix commands with `export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH &&`
- Deploy from PowerShell (single quotes prevent $PATH expansion):
  `ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'`
- Logs: `~/dashy.log` on Pi

## Gotchas

- **SSR hydration**: Never `useState(new Date())` — use `useState(null)` + useEffect to set client-side
- **setData + await**: Resolve before updater: `const json = await res.json(); setData(prev => ({ ...prev, [panel]: json }))`
- **API routes are ESM**: `import x from '...'` only — `require()` throws ReferenceError at runtime
- **googleapis timeout**: Second argument only: `client.method(params, { timeout: 8000 })` — silently ignored inside params
