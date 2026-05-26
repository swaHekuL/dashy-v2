# Status Bar + Gas Prices Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 28px status bar at the bottom of the dashboard showing which panel is active, and add a Gas Prices panel showing regular unleaded prices at two Maverik locations via Google Maps Places API.

**Architecture:** StatusBar is a pure presentational component that receives the current panel key and renders 7 grouped segments — active segment highlights white with an optional sub-label for multi-panel groups (News, Steam). The Gas Prices API route fetches Place Details from Google Maps Places API (New) for two hardcoded station Place IDs, maintains a module-level price cache to compute deltas, and returns a simple array to the GasPrices screen component.

**Tech Stack:** Next.js (Pages Router), React, Google Maps Places API (New) REST, inline styles (matches existing codebase convention), no test framework in this project.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `screens/StatusBar.jsx` | Segment bar UI, SEGMENT_MAP, active highlight |
| Create | `screens/GasPrices.jsx` | Two-card gas price layout |
| Create | `pages/api/gas.js` | Google Maps Places fetch + delta cache |
| Modify | `config/settings.json` | Add `gasPrices.stations` with Place IDs |
| Modify | `pages/index.js` | Add StatusBar, GasPrices, gas to PANELS/REFRESH_MS/data |
| Create | `.env.local` (if absent) | `GOOGLE_MAPS_API_KEY` (gitignored) |

---

## Task 1: StatusBar component

**Files:**
- Create: `screens/StatusBar.jsx`

- [ ] **Step 1: Create the file**

```jsx
const SEGMENT_MAP = {
  weather:          { segment: 'WEATHER' },
  calendar:         { segment: 'CALENDAR' },
  gmail:            { segment: 'GMAIL' },
  'news-world':     { segment: 'NEWS', sub: 'WORLD' },
  'news-gaming':    { segment: 'NEWS', sub: 'GAMING' },
  'news-tech':      { segment: 'NEWS', sub: 'TECH' },
  'news-sports':    { segment: 'NEWS', sub: 'SPORTS' },
  'news-utah':      { segment: 'NEWS', sub: 'UTAH' },
  'steam-sales':    { segment: 'STEAM', sub: 'SALES' },
  'steam-releases': { segment: 'STEAM', sub: 'RELEASES' },
  stocks:           { segment: 'STOCKS' },
  gas:              { segment: 'GAS' },
};

const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'NEWS', 'STEAM', 'STOCKS', 'GAS'];

export default function StatusBar({ currentPanel }) {
  const active = SEGMENT_MAP[currentPanel] ?? { segment: 'WEATHER' };

  return (
    <div style={{
      height: '28px',
      background: '#000',
      display: 'flex',
      gap: '4px',
      padding: '4px',
      flexShrink: 0,
      borderTop: '1px solid #1a1a1a',
    }}>
      {SEGMENTS.map(seg => {
        const isActive = active.segment === seg;
        return (
          <div key={seg} style={{
            flex: 1,
            background: isActive ? '#fff' : '#111',
            borderRadius: '2px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '6px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: isActive ? '#000' : '#555',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}>
              {seg}
            </span>
            {isActive && active.sub && (
              <span style={{
                fontFamily: 'monospace',
                fontSize: '5px',
                letterSpacing: '0.08em',
                color: '#444',
                textTransform: 'uppercase',
                marginTop: '1px',
                lineHeight: 1,
              }}>
                {active.sub}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add screens/StatusBar.jsx
git commit -m "feat: add StatusBar component"
```

---

## Task 2: Wire StatusBar into the layout

**Files:**
- Modify: `pages/index.js`

- [ ] **Step 1: Add the import at the top of `pages/index.js` alongside the other screen imports**

```js
import StatusBar from '../screens/StatusBar';
```

- [ ] **Step 2: Replace the return statement in `pages/index.js`**

The only change is adding `<StatusBar currentPanel={current} />` below the panel div:

```jsx
return (
  <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Clock />
    <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
      {current === 'weather'        && <Weather       data={data.weather}  />}
      {current === 'calendar'       && <Calendar      data={data.calendar} />}
      {current === 'gmail'          && <Gmail         data={data.gmail}    />}
      {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
      {current === 'steam-sales'    && <SteamSales    data={data.steamData}    />}
      {current === 'steam-releases' && <SteamReleases data={data.steamData}    />}
      {current === 'stocks'         && <Stocks        data={data.stocks}   />}
    </div>
    <StatusBar currentPanel={current} />
  </div>
);
```

- [ ] **Step 3: Start dev server and verify the status bar appears**

```bash
npm run dev
```

Open `http://localhost:3000`. You should see a thin dark bar at the bottom with 7 segments. The active segment (starting on WEATHER) should be white. Watch it cycle through panels — NEWS should show a sub-label (WORLD, GAMING, etc.) and STEAM should show SALES / RELEASES.

- [ ] **Step 4: Commit**

```bash
git add pages/index.js
git commit -m "feat: wire StatusBar into dashboard layout"
```

---

## Task 3: Add gas station config and API key

**Files:**
- Modify: `config/settings.json`
- Create: `.env.local` (if it doesn't exist)

- [ ] **Step 1: Update `config/settings.json`**

Add the `gasPrices` key. Replace `PLACE_ID_HERE` with real Place IDs once you have them (see Task 6 for how to find them):

```json
{
  "lat": "41.324308283562615",
  "lon": "-111.84161823646542",
  "tickers": ["AAPL", "VTI", "NVDA"],
  "gasPrices": {
    "stations": [
      { "label": "N OGDEN", "placeId": "PLACE_ID_HERE" },
      { "label": "EDEN",    "placeId": "PLACE_ID_HERE" }
    ]
  }
}
```

- [ ] **Step 2: Create `.env.local` if it doesn't exist and add the API key**

```bash
# In the project root:
echo "GOOGLE_MAPS_API_KEY=your_key_here" >> .env.local
```

Replace `your_key_here` with the actual key from Google Cloud Console. See Task 6 for how to get it. `.env.local` is already gitignored by Next.js defaults.

- [ ] **Step 3: Commit settings.json (not .env.local)**

```bash
git add config/settings.json
git commit -m "config: add gas prices station config stubs"
```

---

## Task 4: Gas Prices API route

**Files:**
- Create: `pages/api/gas.js`

- [ ] **Step 1: Create the file**

```js
import settings from '../../config/settings.json';

// Persists between requests in the same server process.
// Keyed by placeId, stores last known price to compute deltas.
const priceCache = {};

export default async function handler(req, res) {
  const { stations } = settings.gasPrices;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const results = await Promise.all(
    stations.map(async ({ label, placeId }) => {
      try {
        const response = await fetch(
          `https://places.googleapis.com/v1/places/${placeId}`,
          {
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'fuelOptions',
            },
          }
        );
        if (!response.ok) return { label, price: null, delta: null, updatedAt: null };

        const body = await response.json();
        const fuelPrices = body.fuelOptions?.fuelPrices ?? [];
        const regular = fuelPrices.find(f => f.type === 'REGULAR');
        if (!regular) return { label, price: null, delta: null, updatedAt: null };

        const price = Math.round(
          (parseInt(regular.price.units, 10) + regular.price.nanos / 1e9) * 100
        ) / 100;
        const updatedAt = regular.updateTime;

        const prev = priceCache[placeId];
        const delta = prev !== undefined ? Math.round((price - prev) * 100) / 100 : null;
        priceCache[placeId] = price;

        return { label, price, delta, updatedAt };
      } catch {
        return { label, price: null, delta: null, updatedAt: null };
      }
    })
  );

  res.status(200).json(results);
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/api/gas.js
git commit -m "feat: add gas prices API route with Places API and delta cache"
```

---

## Task 5: GasPrices panel component

**Files:**
- Create: `screens/GasPrices.jsx`

- [ ] **Step 1: Create the file**

```jsx
function formatDelta(delta) {
  if (delta === null) return null;
  if (delta === 0) return { text: '— no change', color: '#666' };
  const abs = Math.abs(delta).toFixed(2);
  return delta < 0
    ? { text: `▼ $${abs} from prev`, color: '#3a7d44' }
    : { text: `▲ $${abs} from prev`, color: '#c0392b' };
}

function formatTime(updatedAt) {
  if (!updatedAt) return null;
  return new Date(updatedAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function StationCard({ label, price, delta, updatedAt }) {
  const deltaInfo = formatDelta(delta);
  const timeStr = formatTime(updatedAt);

  return (
    <div style={{
      flex: 1,
      background: '#111',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      padding: '16px 12px',
    }}>
      <span style={{
        color: '#888',
        fontSize: '1.6vw',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
      }}>
        {label}
      </span>
      <span style={{
        color: '#fff',
        fontSize: '6vw',
        fontWeight: 700,
        lineHeight: 1,
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}>
        {price != null ? `$${price.toFixed(2)}` : '—'}
      </span>
      {deltaInfo && (
        <span style={{
          color: deltaInfo.color,
          fontSize: '1.2vw',
          letterSpacing: '0.1em',
          fontFamily: 'monospace',
        }}>
          {deltaInfo.text}
        </span>
      )}
      {timeStr && (
        <span style={{
          color: '#444',
          fontSize: '1vw',
          letterSpacing: '0.08em',
          fontFamily: 'monospace',
          marginTop: '2px',
        }}>
          as of {timeStr}
        </span>
      )}
    </div>
  );
}

function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>GAS</span>
    </div>
  );
}

export default function GasPrices({ data }) {
  if (!data) return <PanelLoading />;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      padding: '3vh 4vw',
      gap: '2vh',
    }}>
      <div style={{
        color: '#444',
        fontSize: '1.2vw',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        textAlign: 'center',
        fontFamily: 'monospace',
      }}>
        MAVERIK · REGULAR UNLEADED
      </div>
      <div style={{ flex: 1, display: 'flex', gap: '4vw' }}>
        {data.map(station => (
          <StationCard key={station.label} {...station} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add screens/GasPrices.jsx
git commit -m "feat: add GasPrices panel component"
```

---

## Task 6: Wire GasPrices into the rotation

**Files:**
- Modify: `pages/index.js`

- [ ] **Step 1: Add the import alongside the other screen imports**

```js
import GasPrices from '../screens/GasPrices';
```

- [ ] **Step 2: Add `'gas'` to the PANELS array (after `'stocks'`)**

```js
const PANELS = [
  'weather', 'calendar', 'gmail',
  'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  'steam-sales', 'steam-releases',
  'stocks', 'gas',
];
```

- [ ] **Step 3: Add the refresh interval to REFRESH_MS**

```js
const REFRESH_MS = {
  weather:          10 * 60 * 1000,
  calendar:          5 * 60 * 1000,
  gmail:             2 * 60 * 1000,
  'news-world':     15 * 60 * 1000,
  'news-gaming':    15 * 60 * 1000,
  'news-tech':      15 * 60 * 1000,
  'news-sports':    15 * 60 * 1000,
  'news-utah':      15 * 60 * 1000,
  'steam-sales':    60 * 60 * 1000,
  'steam-releases': 60 * 60 * 1000,
  stocks:            5 * 60 * 1000,
  gas:               2 * 60 * 60 * 1000,
};
```

- [ ] **Step 4: Add `gas: null` to the initial data state**

```js
const [data, setData] = useState({
  weather: null, calendar: null, gmail: null,
  'news-world': null, 'news-gaming': null, 'news-tech': null,
  'news-sports': null, 'news-utah': null,
  steamData: null,
  stocks: null,
  gas: null,
});
```

- [ ] **Step 5: Add the render condition inside the panel div (after the stocks line)**

```jsx
{current === 'stocks' && <Stocks     data={data.stocks} />}
{current === 'gas'    && <GasPrices  data={data.gas}    />}
```

- [ ] **Step 6: Verify in dev server**

With real Place IDs and API key in place: open `http://localhost:3000` and let it cycle to the GAS panel. You should see two Maverik cards with prices. On first load `delta` is `null` so no delta row appears — that's correct. Cycle through a few times to confirm the StatusBar highlights GAS when the gas panel is active.

If Place IDs aren't set up yet, the cards will show `—` for price — that's the expected unavailable state.

- [ ] **Step 7: Commit**

```bash
git add pages/index.js
git commit -m "feat: add gas prices panel to rotation"
```

---

## Task 7: One-time setup — API key and Place IDs

These steps are done once manually, not in code. Complete before deploying.

- [ ] **Step 1: Get a Google Maps API key**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Places API (New)** — search for it in "APIs & Services → Library"
4. Go to "APIs & Services → Credentials" → Create credentials → API key
5. (Optional but recommended) Restrict the key to "Places API (New)" only
6. Copy the key into `.env.local`:
   ```
   GOOGLE_MAPS_API_KEY=AIza...
   ```

- [ ] **Step 2: Find the Place ID for North Ogden Washington Ave Maverik**

Open this URL in a browser (replace `YOUR_KEY`):
```
https://places.googleapis.com/v1/places:searchText
```

Or simpler — go to `https://maps.google.com`, search "Maverik North Ogden Washington Blvd", click the result, and copy the Place ID from the URL (it looks like `ChIJ...`).

Alternatively use the Places API Text Search:
```bash
curl -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: YOUR_KEY" \
  -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress" \
  -d '{"textQuery": "Maverik 3950 Washington Blvd North Ogden UT"}'
```

Copy the `id` field from the response into `config/settings.json`.

- [ ] **Step 3: Find the Place ID for Eden Maverik**

```bash
curl -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: YOUR_KEY" \
  -H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress" \
  -d '{"textQuery": "Maverik Eden Utah"}'
```

Copy the `id` into `config/settings.json`.

- [ ] **Step 4: Verify fuelOptions coverage for both stations**

```bash
curl "https://places.googleapis.com/v1/places/PLACE_ID_HERE" \
  -H "X-Goog-Api-Key: YOUR_KEY" \
  -H "X-Goog-FieldMask: fuelOptions"
```

Expected response includes `fuelOptions.fuelPrices` with a `REGULAR` entry. If the response has no `fuelOptions` key, the station doesn't report prices to Google — you'll need to find an alternative Place ID for a nearby Maverik that does.

- [ ] **Step 5: Commit updated settings.json with real Place IDs**

```bash
git add config/settings.json
git commit -m "config: add real Maverik Place IDs for gas prices"
```

- [ ] **Step 6: Add API key to Pi**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59
echo "GOOGLE_MAPS_API_KEY=AIza..." >> ~/dashy-v2/.env.local
```

---

## Task 8: Deploy to Pi

- [ ] **Step 1: Deploy**

From PowerShell on your dev machine:
```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

- [ ] **Step 2: Verify on Pi**

Open `http://192.168.68.59:3000` in a browser. Confirm:
- Status bar appears at the bottom and highlights the correct segment
- Gas panel appears at the end of the rotation with Maverik prices
- No errors in `~/dashy.log`

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59 'tail -20 ~/dashy.log'
```
