<!-- Last updated: 2026-10-02 -->
# dashy-v2

Passive auto-rotating dashboard built with Next.js 16.2.6 (Turbopack), designed for a Raspberry Pi 3B+ at 800×480.

## Panels

Panels rotate every 10 seconds. The active set is `PANELS` in `pages/index.js`: currently Weather, Calendar, Gmail, Portfolio and JKMC. The others below are still in the code but commented out.

| Panel | Source | Refresh |
| --- | --- | --- |
| Weather | Open-Meteo (free, no key) | 10 min |
| Calendar | Google Calendar API + Outlook ICS | 5 min |
| Gmail | Google Gmail API | 2 min |
| Portfolio | SnapTrade | 60 min |
| JKMC (Minecraft) | Server List Ping + Prometheus exporter + Proxmox API (all LAN) | 30 s |
| World News | BBC RSS | 15 min |
| Gaming News | IGN RSS | 15 min |
| Tech / AI | The Verge RSS | 15 min |
| Sports | ESPN RSS | 15 min |
| Utah News | Deseret News RSS | 15 min |
| Steam Deals | Steam Featured API | 60 min |
| Steam Releases | Steam Featured Categories API | 60 min |
| Stocks | Yahoo Finance (no key) | 5 min |
| Gas Prices | Google Maps Places API (New) | 2 hr |

A status bar at the bottom highlights the active segment group (WEATHER / CALENDAR / GMAIL / PORTFOLIO / JKMC / CAMERA).

## Setup

### 1. Google OAuth (Calendar + Gmail)

```bash
node scripts/google-auth.js
```

Follow the prompts. Saves credentials to `config/credentials.json` (gitignored).

### 2. Settings

Edit `config/settings.json`:

```json
{
  "lat": "YOUR_LATITUDE",
  "lon": "YOUR_LONGITUDE",
  "tickers": ["AAPL", "VTI", "NVDA"],
  "gasPrices": {
    "stations": [
      { "label": "STATION 1", "placeId": "ChIJ..." },
      { "label": "STATION 2", "placeId": "ChIJ..." }
    ]
  }
}
```

### 3. Google Maps API Key (Gas Prices)

```bash
echo "GOOGLE_MAPS_API_KEY=AIza..." > .env.local
```

Enable **Places API (New)** in Google Cloud Console. See `docs/superpowers/plans/2026-05-25-status-bar-gas-prices.md` Task 7 for how to find Place IDs.

### 4. JKMC (Minecraft) panel

Shows who's online on the Minecraft server (avatars, time online, Bedrock badge, daily peak, last seen) next to TPS and CPU/RAM/disk/uptime for both the `minecraft` LXC container and the Proxmox host. Each source fails independently: the panel shows OFFLINE or "—" instead of erroring.

It needs:

- A `minecraft` block in `config/settings.json`: `{ "host": "192.168.68.151", "port": 25565, "metricsPort": 19565, "container": "minecraft" }`
- The [`prometheus-exporter-paper`](https://github.com/drewburr/minecraft-prometheus-exporter) plugin on the MC server, listening on the LAN only (port 19565, not forwarded)
- A read-only Proxmox API token (`dashy@pve!dashy`, role `PVEAuditor`) in `.env.local` as `PROXMOX_URL`, `PROXMOX_TOKEN_ID` and `PROXMOX_TOKEN_SECRET`
- `config/pve-root-ca.pem`, copied from the Proxmox host's `/etc/pve/pve-root-ca.pem`. TLS is verified against it; verification is never disabled.

The token and CA aren't in git, so put them on the Pi by hand. `/api/minecraft` is LAN-only: the Cloudflare tunnel only exposes `/api/claude-notify`.

### 5. Run locally

```bash
npm run dev
# open http://localhost:3000
npm test   # node:test unit tests in lib/__tests__/
```

## Pi Deployment

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

Check logs: `ssh ... 'tail -20 ~/dashy.log'`

## Project Structure

```text
pages/
  index.js              — panel rotation, data fetching, layout
  api/
    weather.js          — Open-Meteo current + hourly forecast
    calendar.js         — Google Calendar next 3 events
    gmail.js            — Gmail unread count + previews
    news/[category].js  — Dynamic RSS route (world/gaming/tech/sports/utah)
    steam.js            — Steam sales + new releases
    stocks.js           — Yahoo Finance ticker quotes
    gas.js              — Google Maps Places fuel prices + delta cache
    minecraft.js        — JKMC: merges SLP, exporter, Proxmox + player history
lib/
  slp.js                — Minecraft Server List Ping client
  mcMetrics.js          — Prometheus exporter scrape + TPS
  mcPlayers.js          — player normalization, Bedrock detection
  mcHistory.js          — time online / daily peak / last seen (data/mc-history.json)
  proxmox.js            — read-only Proxmox client (CA-pinned TLS)
  mcFormat.js           — display formatters for the JKMC screen
  __tests__/            — node:test unit tests
screens/
  Clock.jsx             — top clock bar
  StatusBar.jsx         — bottom segment indicator
  Weather.jsx
  Calendar.jsx
  Gmail.jsx
  News.jsx
  SteamSales.jsx
  SteamReleases.jsx
  Stocks.jsx
  GasPrices.jsx
  Minecraft.jsx         — JKMC panel
config/
  settings.json         — lat/lon, tickers, gas station Place IDs, minecraft (tracked)
  credentials.json      — Google OAuth secrets (gitignored)
  pve-root-ca.pem       — Proxmox CA cert (gitignored)
```
