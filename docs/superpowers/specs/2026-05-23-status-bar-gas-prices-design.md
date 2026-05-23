# Design Spec: Status Bar + Gas Prices Panel

**Date:** 2026-05-23  
**Status:** Approved — pending implementation

---

## 1. Status Bar

### Purpose
A fixed bar at the bottom of the screen showing all panel groups in the rotation. The active group is highlighted white. When the active panel belongs to a multi-panel group (News or Steam), the active segment expands to show a sub-label identifying the current sub-panel.

### Layout Change
Current layout stack (top → bottom):
- `<Clock>` — 42vh
- `<Panel area>` — flex: 1

New layout stack:
- `<Clock>` — 42vh
- `<Panel area>` — flex: 1
- `<StatusBar>` — fixed 28px height, `flexShrink: 0`

### Segments (7 total)
| Segment | Covers | Sub-label values |
|---|---|---|
| WEATHER | `weather` | — |
| CALENDAR | `calendar` | — |
| GMAIL | `gmail` | — |
| NEWS | `news-world`, `news-gaming`, `news-tech`, `news-sports`, `news-utah` | WORLD / GAMING / TECH / SPORTS / UTAH |
| STEAM | `steam-sales`, `steam-releases` | SALES / RELEASES |
| STOCKS | `stocks` | — |
| GAS | `gas` | — |

### Active State
- Background: `#fff`
- Text: `#000`
- When the active panel is a sub-panel (News or Steam), the segment shows two lines:
  - Line 1: group name (e.g. `NEWS`) — small, uppercase
  - Line 2: sub-label (e.g. `GAMING`) — smaller, dimmer

### Inactive State
- Background: `#111`
- Text: `#555`
- Single line: group name only

### Component
New file: `screens/StatusBar.jsx`  
Props: `currentPanel: string` (the current value from `PANELS[panelIndex]`)

### Mapping (currentPanel → segment + sub-label)
```js
const SEGMENT_MAP = {
  weather:         { segment: 'WEATHER' },
  calendar:        { segment: 'CALENDAR' },
  gmail:           { segment: 'GMAIL' },
  'news-world':    { segment: 'NEWS', sub: 'WORLD' },
  'news-gaming':   { segment: 'NEWS', sub: 'GAMING' },
  'news-tech':     { segment: 'NEWS', sub: 'TECH' },
  'news-sports':   { segment: 'NEWS', sub: 'SPORTS' },
  'news-utah':     { segment: 'NEWS', sub: 'UTAH' },
  'steam-sales':   { segment: 'STEAM', sub: 'SALES' },
  'steam-releases':{ segment: 'STEAM', sub: 'RELEASES' },
  stocks:          { segment: 'STOCKS' },
  gas:             { segment: 'GAS' },
};

const SEGMENTS = ['WEATHER','CALENDAR','GMAIL','NEWS','STEAM','STOCKS','GAS'];
```

---

## 2. Gas Prices Panel

### Purpose
Show current regular unleaded price at two specific Maverik locations, with a delta vs. the previous reported price and a timestamp of when each price was last updated by the station.

### Data Source
**Google Maps Places API (New)** — Place Details endpoint  
Field mask: `fuelOptions`  
Pricing tier: Enterprise SKU — 1,000 free requests/month per billing account

### Stations
Hardcoded Place IDs stored in `config/settings.json`:
```json
"gasPrices": {
  "stations": [
    { "label": "N OGDEN", "placeId": "PLACE_ID_HERE" },
    { "label": "EDEN",    "placeId": "PLACE_ID_HERE" }
  ]
}
```
Place IDs must be looked up once via the Google Maps Places API or maps.google.com before deployment.

### API Key
`GOOGLE_MAPS_API_KEY` — stored in `.env.local` on both dev machine and Pi (not committed to git).

### API Route
New file: `pages/api/gas.js`

- Reads station configs from `config/settings.json`
- Fetches Place Details for each station with `fuelOptions` field mask
- Extracts `REGULAR` fuel type price and `updateTime`
- Maintains a **module-level previous-price cache** (object keyed by `placeId`) to compute deltas
- Delta: `current price - previous price`, only updated when the price actually changes
- Returns:
```json
[
  {
    "label": "N OGDEN",
    "price": 3.19,
    "delta": -0.05,
    "updatedAt": "2026-05-23T09:14:00Z"
  },
  {
    "label": "EDEN",
    "price": 3.29,
    "delta": 0,
    "updatedAt": "2026-05-23T07:52:00Z"
  }
]
```

### Refresh Interval
**2 hours** — gas prices rarely change more than once a day; 2h keeps well within the 1,000 free requests/month limit (2 stations × 12 fetches/day × 30 days = 720 requests/month).

### Panel Component
New file: `screens/GasPrices.jsx`

**Layout (A4 with per-card timestamp):**
- Shared header centered at top: `MAVERIK · REGULAR UNLEADED` — small, dim, uppercase, letter-spaced
- Two equal cards side by side, black background `#111`, rounded corners
- Each card (centered, column):
  - Location label (e.g. `N OGDEN`) — small, `#888`, uppercase, letter-spaced
  - Price — large white, bold (e.g. `$3.19`)
  - Delta indicator — `▼ $0.05 from prev` in green (`#3a7d44`) / `▲ $0.10 from prev` in red (`#c0392b`) / `— no change` in gray (`#666`). Hidden on first load (no previous price yet).
  - Timestamp — `as of 9:14 AM` in very dim gray (`#444`), small

### Unavailable Price Handling
If a station's Place Details response omits `fuelOptions` or has no `REGULAR` entry, that card shows `—` in place of the price, no delta, and no timestamp. The panel still renders with both cards visible.

### Rotation Placement
Added at end of `PANELS` array, after `stocks`:
```js
const PANELS = [
  'weather', 'calendar', 'gmail',
  'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  'steam-sales', 'steam-releases',
  'stocks', 'gas',
];
```

Refresh interval entry:
```js
gas: 2 * 60 * 60 * 1000,
```

### index.js Changes
- Import `GasPrices` screen
- Add `gas: null` to initial data state
- Add fetch logic for `gas` panel (straightforward: `apiUrl = '/api/gas'`, `dataKey = 'gas'`)
- Render `{current === 'gas' && <GasPrices data={data.gas} />}`

---

## 3. One-Time Setup Steps (not in code)

1. **Get Google Maps API key** — create a project in Google Cloud Console, enable Places API (New), copy key to `.env.local`
2. **Find Place IDs** — search for each Maverik in Google Maps, grab the Place ID from the URL or Places API, add to `config/settings.json`
3. **Verify fuelOptions coverage** — make a test Places API call for each Place ID to confirm `fuelOptions` returns `REGULAR` price data before deploying
4. **Add `.env.local` to Pi** — SSH in and add `GOOGLE_MAPS_API_KEY=...` to `~/.env.local` or export in the startup script

---

## Out of Scope
- Multiple fuel grades (only REGULAR shown)
- More than 2 stations
- Historical price chart
- GAS prices panel-specific refresh button
