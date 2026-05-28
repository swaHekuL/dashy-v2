<!-- Last updated: 2026-05-25 -->
# dashy-v2

Passive auto-rotating dashboard built with Next.js 16.2.6 (Turbopack), designed for a Raspberry Pi 3B+ at 800×480.

## Panels

12 panels rotate every 10 seconds:

| Panel | Source | Refresh |
| --- | --- | --- |
| Weather | Open-Meteo (free, no key) | 10 min |
| Calendar | Google Calendar API | 5 min |
| Gmail | Google Gmail API | 2 min |
| World News | BBC RSS | 15 min |
| Gaming News | IGN RSS | 15 min |
| Tech / AI | The Verge RSS | 15 min |
| Sports | ESPN RSS | 15 min |
| Utah News | Deseret News RSS | 15 min |
| Steam Deals | Steam Featured API | 60 min |
| Steam Releases | Steam Featured Categories API | 60 min |
| Stocks | Yahoo Finance (no key) | 5 min |
| Gas Prices | Google Maps Places API (New) | 2 hr |

A status bar at the bottom highlights the active segment group (WEATHER / CALENDAR / GMAIL / NEWS / STEAM / STOCKS / GAS).

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

### 4. Run locally

```bash
npm run dev
# open http://localhost:3000
```

## Pi Deployment

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
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
config/
  settings.json         — lat/lon, tickers, gas station Place IDs (tracked)
  credentials.json      — Google OAuth secrets (gitignored)
```
