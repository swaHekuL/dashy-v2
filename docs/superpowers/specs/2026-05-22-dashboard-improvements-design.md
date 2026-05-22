# Dashboard Improvements Design
_Last updated: 2026-05-22_

## Overview

A set of improvements to the dashy-v2 Raspberry Pi dashboard. Changes span six areas: rotation timing, Calendar redesign, Weather redesign, News expansion, Steam split, and a new Stocks panel.

---

## 1. General — Rotation Timer

- Change panel rotation interval from 7s to 10s in `pages/index.js`.

---

## 2. Calendar Panel

### Goal
Show the next 3 upcoming events across any dates, not just today's events.

### API changes (`pages/api/calendar.js`)
- Remove the today-only filter from the Google Calendar query.
- Set `timeMin` to now, `timeMax` to 30 days out, `maxResults` to 3, `orderBy: startTime`, `singleEvents: true`.

### Component changes (`screens/Calendar.jsx`)
- Group events by date before rendering.
- For each date group, render a header in the existing blue style:
  - Same day as today → `TODAY — [Weekday, Month Day]`
  - Next day → `TOMORROW — [Weekday, Month Day]`
  - Any other date → `[Weekday, Month Day]` (no prefix)
- Render each event beneath its group header using the existing color-bar + title + time row design.
- If no upcoming events exist, show existing "No events" empty state.

---

## 3. Weather Panel

### Goal
Keep current conditions on the left; replace the right stats column with a 4-slot hourly forecast.

### API changes (`pages/api/weather.js`)
- Add `hourly=temperature_2m,weathercode,windspeed_10m` to the Open-Meteo request.
- Return the next 4 forecast slots starting from the next 3-hour boundary (e.g. if it's 1:45 PM, return 3 PM / 6 PM / 9 PM / 12 AM).
- Each slot: `{ time, temp, condition, wind }`.

### Component changes (`screens/Weather.jsx`)
- Left side: unchanged — big temp, condition, high/low, wind.
- Right side: replace stats rows with a horizontal row of 4 cards.
- Each card layout:
  - Left column: condition emoji icon, large (centered)
  - Subtle vertical divider
  - Right column: temp (large, white), time (small, muted), wind (small, muted) — all centered
- Divider between left and right sides remains.

### Condition icons
Map Open-Meteo WMO weather codes to emoji (same mapping already used for current condition label).

---

## 4. News — 5 Category Panels

### Goal
Replace the single BBC News panel with 5 separate panels, one per category, each showing 3 headlines.

### Panels and feeds
| Panel | RSS Feed |
|---|---|
| World | BBC News — `https://feeds.bbci.co.uk/news/rss.xml` |
| Gaming | IGN — `https://feeds.ign.com/ign/all` |
| Tech/AI | The Verge — `https://www.theverge.com/rss/index.xml` |
| Sports | ESPN — `https://www.espn.com/espn/rss/news` |
| Utah | Deseret News — `https://www.deseret.com/arc/outboundfeeds/rss/` |

> **Note:** All RSS URLs should be verified to return valid feeds before implementation. IGN, The Verge, ESPN, and Deseret News feeds in particular are known to change periodically.

### API changes
- Rename `pages/api/news.js` → `pages/api/news/[category].js` (dynamic route).
- Accept `category` param; map to the corresponding RSS URL.
- Return 3 headlines (title only) with 15-min TTL cache, same as current.

### Component changes (`screens/News.jsx`)
- Accept a `category` prop (e.g. `"GAMING NEWS"`).
- Display category name as panel header in existing style.
- Render 3 headlines using existing design (top headline emphasized with red left border).

### Rotation changes (`pages/index.js`)
- Replace single `news` panel slot with 5 slots: `news-world`, `news-gaming`, `news-tech`, `news-sports`, `news-utah`.
- Each fetches from `/api/news/[category]` independently with its own 15-min interval.

---

## 5. Steam — Two Panels

### Goal
Split the current single Steam panel into two: one for sales, one for new releases.

### API changes (`pages/api/steam.js`)
- Return two separate arrays:
  - `sales`: top 4 featured sale items with title + discount %.
  - `newReleases`: top 4 new releases with title + release date.

### Component changes
- Split `screens/Steam.jsx` into `screens/SteamSales.jsx` and `screens/SteamReleases.jsx`.
- `SteamSales`: header "STEAM DEALS", 4 items showing discount badge + title.
- `SteamReleases`: header "NEW RELEASES", 4 items showing title + release date.
- Both keep existing dark card style.

### Rotation changes
- Replace single `steam` slot with `steam-sales` and `steam-releases`.

---

## 6. Stocks Panel (new)

### Goal
New panel displaying current price and daily change for a user-configured list of tickers.

### Configuration
Add `"tickers": ["AAPL", "VTI", "NVDA"]` to `config/settings.json`. User edits this list manually.

### Data source

- Yahoo Finance unofficial API (`https://query1.finance.yahoo.com/v8/finance/chart/{ticker}`) — free, no key required. This is an undocumented endpoint that may change without notice; if it breaks, Finnhub free tier is the fallback.
- Fetch each ticker individually; aggregate in the API route.
- Fetch interval: 5 minutes.
- Outside market hours (weekdays before 9:30 AM or after 4 PM ET, weekends): show last known prices with a muted "Market closed" indicator.

### API (`pages/api/stocks.js`)
- Read tickers from `config/settings.json`.
- Fetch price + daily change ($ and %) for each ticker.
- Return `{ tickers: [{ symbol, price, change, changePct, marketOpen }], asOf }`.
- TTL cache: 5 min.

### Component (`screens/Stocks.jsx`)
- Header: "STOCKS".
- Layout: 3-column CSS grid, 2 rows visible. If more than 6 tickers, the card container uses a CSS `@keyframes` translateY animation to scroll continuously upward at a slow, readable pace (~30px/s), looping seamlessly by duplicating the list.
- Each card:
  - Left accent bar: green (`#4caf50`) if change ≥ 0, red (`#f44336`) if negative.
  - Left side (vertically centered): ticker symbol, large white bold text.
  - Right side: price (white, large), `+$X.XX · +X.XX%` or `-$X.XX · -X.XX%` in matching green/red below.
- When market is closed: accent bar muted grey, change values shown in muted color with `(closed)` suffix.

---

## Rotation Order (after all changes)

1. Weather
2. Calendar
3. Gmail
4. News — World
5. News — Gaming
6. News — Tech/AI
7. News — Sports
8. News — Utah
9. Steam — Sales
10. Steam — New Releases
11. Stocks

Total panels: 11 × 10s = ~110s full cycle.
