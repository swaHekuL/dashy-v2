# Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 improvements to dashy-v2: rotation timer increase, Calendar date grouping, Weather hourly forecast cards, 5-category News expansion, Steam panel split, and a new Stocks panel.

**Architecture:** All changes are isolated to `pages/api/` routes and `screens/` components. `pages/index.js` is updated incrementally — each task leaves the dashboard in a working state. No new npm dependencies needed.

**Tech Stack:** Next.js 16 (Pages Router), React 19, rss-parser (already installed), googleapis (already installed), Open-Meteo API, Yahoo Finance unofficial API (no key required).

---

## File Map

**Modified:**
- `pages/index.js` — panel list, timer, imports, data state, fetch logic, render
- `pages/api/calendar.js` — look-ahead query, add `date` field to events
- `pages/api/weather.js` — add hourly weathercode + windspeed, return 4 forecast slots
- `pages/api/steam.js` — return 4 `sales` + 4 `newReleases` instead of 3 deals + 1 release
- `screens/Calendar.jsx` — date group headers with TODAY/TOMORROW prefixes
- `screens/Weather.jsx` — replace right stats column with 4 horizontal forecast cards
- `screens/News.jsx` — accept `category` prop, replace hardcoded "Top Stories" header
- `config/settings.json` — add `tickers` array

**Created:**
- `pages/api/news/[category].js` — dynamic route for 5 news categories
- `pages/api/stocks.js` — Yahoo Finance ticker fetcher with TTL cache
- `screens/SteamSales.jsx` — Steam deals panel (4 items)
- `screens/SteamReleases.jsx` — Steam new releases panel (4 items)
- `screens/Stocks.jsx` — stocks panel with 3×2 card grid, auto-scroll

**Deleted:**
- `pages/api/news.js` — replaced by dynamic route
- `screens/Steam.jsx` — replaced by SteamSales.jsx and SteamReleases.jsx

---

## Task 1: Rotation Timer

**Files:**
- Modify: `pages/index.js:10`

- [ ] **Step 1: Update PANEL_MS**

In `pages/index.js`, change line 10:

```js
const PANEL_MS = 10000;
```

- [ ] **Step 2: Verify**

Run `npm run dev`, open `http://localhost:3000`. Confirm panels cycle at ~10s.

- [ ] **Step 3: Commit**

```bash
git add pages/index.js
git commit -m "feat: increase panel rotation interval to 10s"
```

---

## Task 2: Calendar API

**Files:**
- Modify: `pages/api/calendar.js`

- [ ] **Step 1: Rewrite `pages/api/calendar.js`**

```js
import { google } from 'googleapis';
import creds from '../../config/credentials.json';

let cache = null;
let cacheAt = 0;
const TTL = 5 * 60 * 1000;

const COLOR_MAP = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73',
  '5': '#f6c026', '6': '#f5511d', '7': '#039be5', '8': '#616161',
  '9': '#3f51b5', '10': '#0b8043', '11': '#d60000',
};

function getAuth() {
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });
  return auth;
}

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const calendar = google.calendar({ version: 'v3', auth: getAuth() });
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const r = await calendar.events.list(
      {
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 3,
      },
      { timeout: 8000 }
    );

    cache = {
      events: (r.data.items || []).map(e => {
        const dateStr = e.start?.dateTime
          ? new Date(e.start.dateTime).toISOString().slice(0, 10)
          : e.start?.date ?? '';
        return {
          id: e.id,
          title: e.summary || '(no title)',
          date: dateStr,
          time: e.start?.dateTime
            ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : 'All day',
          color: e.colorId ? COLOR_MAP[e.colorId] : '#1a73e8',
        };
      }),
    };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[calendar]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 2: Verify**

Visit `http://localhost:3000/api/calendar`. Confirm the response has up to 3 events, each with a `date` field like `"2026-05-22"`, spanning potentially multiple days.

- [ ] **Step 3: Commit**

```bash
git add pages/api/calendar.js
git commit -m "feat: calendar API returns next 3 upcoming events with date field"
```

---

## Task 3: Calendar Component

**Files:**
- Modify: `screens/Calendar.jsx`

- [ ] **Step 1: Rewrite `screens/Calendar.jsx`**

```jsx
import { Roboto } from 'next/font/google';

const roboto = Roboto({ weight: ['300', '400', '500'], subsets: ['latin'] });

function dateLabel(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids DST edge cases
  const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (dateStr === today) return `TODAY — ${formatted}`;
  if (dateStr === tomorrow) return `TOMORROW — ${formatted}`;
  return formatted;
}

export default function Calendar({ data }) {
  if (!data) return <PanelLoading label="CALENDAR" />;

  const events = data.events ?? [];

  const groups = [];
  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.date]) {
      byDate[ev.date] = [];
      groups.push({ date: ev.date, events: byDate[ev.date] });
    }
    byDate[ev.date].push(ev);
  }

  return (
    <div className={roboto.className} style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
    }}>
      {events.length === 0 && (
        <div style={{ color: '#9aa0a6', fontSize: '3vw', marginTop: '2vh' }}>No upcoming events</div>
      )}
      {groups.map(({ date, events: evs }) => (
        <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
          <div style={{ color: '#8ab4f8', fontSize: '2vw', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {dateLabel(date)}
          </div>
          {evs.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '2vw' }}>
              <div style={{ width: '4px', height: '5vh', background: ev.color, borderRadius: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ color: '#e8eaed', fontSize: '3.5vw', fontWeight: 500 }}>{ev.title}</div>
                <div style={{ color: '#9aa0a6', fontSize: '2.2vw', marginTop: '0.3vh' }}>{ev.time}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Open `http://localhost:3000`. Wait for the Calendar panel. Confirm events are grouped under date headers — today shows `TODAY — [date]`, tomorrow shows `TOMORROW — [date]`, further dates show the date alone.

- [ ] **Step 3: Commit**

```bash
git add screens/Calendar.jsx
git commit -m "feat: calendar groups events by date with TODAY/TOMORROW headers"
```

---

## Task 4: Weather API

**Files:**
- Modify: `pages/api/weather.js`

- [ ] **Step 1: Rewrite `pages/api/weather.js`**

```js
import settings from '../../config/settings.json';

let cache = null;
let cacheAt = 0;
const TTL = 10 * 60 * 1000;

const WMO = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
  80: 'Showers', 81: 'Heavy Showers', 82: 'Violent Showers',
  85: 'Snow Showers', 86: 'Heavy Snow Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ Hail', 99: 'Severe Thunderstorm',
};

export default async function handler(req, res) {
  if (!settings.lat || settings.lat === 'YOUR_LATITUDE' ||
      !settings.lon || settings.lon === 'YOUR_LONGITUDE') {
    return res.status(503).json({ error: 'weather not configured' });
  }

  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${settings.lat}&longitude=${settings.lon}&current_weather=true&hourly=temperature_2m,weathercode,windspeed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2`;
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const d = await r.json();

    const temps = d.hourly?.temperature_2m ?? [];
    const codes = d.hourly?.weathercode ?? [];
    const winds = d.hourly?.windspeed_10m ?? [];
    const times = d.hourly?.time ?? [];

    const curH = new Date().getHours();
    const startH = (Math.floor(curH / 3) + 1) * 3;

    const forecast = [startH, startH + 3, startH + 6, startH + 9]
      .filter(i => i < times.length)
      .map(i => ({
        time: new Date(times[i]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        temp: Math.round(temps[i]),
        conditionCode: codes[i],
        wind: Math.round(winds[i]),
      }));

    cache = {
      temp: Math.round(d.current_weather.temperature),
      condition: WMO[d.current_weather.weathercode] ?? 'Unknown',
      wind: Math.round(d.current_weather.windspeed),
      high: temps.length ? Math.round(Math.max(...temps)) : null,
      low: temps.length ? Math.round(Math.min(...temps)) : null,
      forecast,
    };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    clearTimeout(timer);
    console.error('[weather]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 2: Verify**

Visit `http://localhost:3000/api/weather`. Confirm the response includes a `forecast` array of 4 objects, each with `time`, `temp`, `conditionCode`, and `wind`.

- [ ] **Step 3: Commit**

```bash
git add pages/api/weather.js
git commit -m "feat: weather API adds 4-slot hourly forecast"
```

---

## Task 5: Weather Component

**Files:**
- Modify: `screens/Weather.jsx`

- [ ] **Step 1: Rewrite `screens/Weather.jsx`**

```jsx
const WMO_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export default function Weather({ data }) {
  if (!data) return <PanelLoading label="WEATHER" />;

  const { temp, condition, high, low, wind, forecast = [] } = data;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      display: 'flex', alignItems: 'center', padding: '0 6vw', gap: '6vw',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div>
        <div style={{ color: '#fff', fontSize: '18vw', fontWeight: 200, lineHeight: 1 }}>
          {temp}°
        </div>
        <div style={{ color: '#7ec8e3', fontSize: '3vw', marginTop: '1vh', textTransform: 'capitalize', letterSpacing: '0.05em' }}>
          {condition}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh', marginTop: '1.5vh' }}>
          {high !== null && <Row label="High / Low" value={`${high}° / ${low}°`} />}
          <Row label="Wind" value={`${wind} mph`} />
        </div>
      </div>

      <div style={{ width: '1px', height: '50%', background: '#222', flexShrink: 0 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
        <div style={{ color: '#9aa0a6', fontSize: '1.8vw', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Next 12 Hours
        </div>
        <div style={{ display: 'flex', gap: '1.5vw' }}>
          {forecast.map((slot, i) => (
            <div key={i} style={{
              flex: 1, background: '#111', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.5vh 0',
            }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4vw' }}>
                {WMO_EMOJI[slot.conditionCode] ?? '🌡️'}
              </div>
              <div style={{ width: '1px', height: '5vh', background: '#222', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3vh' }}>
                <span style={{ color: '#fff', fontSize: '2.5vw', fontWeight: 500 }}>{slot.temp}°</span>
                <span style={{ color: '#9aa0a6', fontSize: '1.5vw' }}>{slot.time}</span>
                <span style={{ color: '#9aa0a6', fontSize: '1.5vw' }}>{slot.wind} mph</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <span style={{ color: '#9aa0a6', fontSize: '2.5vw', letterSpacing: '0.05em' }}>{label} </span>
      <span style={{ color: '#fff', fontSize: '2.5vw', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Open `http://localhost:3000`. Wait for the Weather panel. Confirm right side shows 4 horizontal cards, each with a large emoji on the left and temp/time/wind centered on the right.

- [ ] **Step 3: Commit**

```bash
git add screens/Weather.jsx
git commit -m "feat: weather panel shows 4 hourly forecast cards"
```

---

## Task 6: News — Dynamic API + Component + Rotation

**Files:**
- Create: `pages/api/news/[category].js`
- Delete: `pages/api/news.js`
- Modify: `screens/News.jsx`
- Modify: `pages/index.js`

- [ ] **Step 1: Verify RSS feed URLs**

Open each URL in a browser and confirm it returns valid XML:
- `https://feeds.bbci.co.uk/news/rss.xml`
- `https://feeds.ign.com/ign/all`
- `https://www.theverge.com/rss/index.xml`
- `https://www.espn.com/espn/rss/news`
- `https://www.deseret.com/arc/outboundfeeds/rss/`

If any URL returns an error or no content, find a working RSS URL for that source and substitute it in the FEEDS map in step 2 before continuing.

- [ ] **Step 2: Create `pages/api/news/[category].js`**

```js
import Parser from 'rss-parser';

const TTL = 15 * 60 * 1000;
const parser = new Parser();

const FEEDS = {
  world:  'https://feeds.bbci.co.uk/news/rss.xml',
  gaming: 'https://feeds.ign.com/ign/all',
  tech:   'https://www.theverge.com/rss/index.xml',
  sports: 'https://www.espn.com/espn/rss/news',
  utah:   'https://www.deseret.com/arc/outboundfeeds/rss/',
};

const caches = {};

export default async function handler(req, res) {
  const { category } = req.query;
  const feedUrl = FEEDS[category];
  if (!feedUrl) return res.status(404).json({ error: 'unknown category' });

  if (!caches[category]) caches[category] = { data: null, at: 0 };
  const c = caches[category];
  const now = Date.now();
  if (c.data && now - c.at < TTL) return res.json(c.data);

  try {
    const feed = await parser.parseURL(feedUrl);
    c.data = { headlines: feed.items.slice(0, 3).map(item => ({ title: item.title })) };
    c.at = now;
    res.json(c.data);
  } catch {
    if (c.data) return res.json(c.data);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 3: Delete the old route**

```bash
git rm pages/api/news.js
```

- [ ] **Step 4: Verify new API routes**

With the dev server running, visit each in the browser:
- `http://localhost:3000/api/news/world`
- `http://localhost:3000/api/news/gaming`
- `http://localhost:3000/api/news/tech`
- `http://localhost:3000/api/news/sports`
- `http://localhost:3000/api/news/utah`

Each should return `{ "headlines": [{ "title": "..." }, { "title": "..." }, { "title": "..." }] }`.

- [ ] **Step 5: Update `screens/News.jsx`**

```jsx
export default function News({ data, category = 'NEWS' }) {
  if (!data) return <PanelLoading label={category} />;

  const headlines = data?.headlines ?? [];
  if (!headlines.length) return <PanelLoading label={category} />;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.8vh',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        color: '#aaa', fontSize: '2vw', letterSpacing: '0.15em',
        textTransform: 'uppercase', fontFamily: 'Arial, sans-serif', marginBottom: '0.5vh',
      }}>
        {category}
      </div>
      {headlines.map((h, i) => (
        <div key={h.title} style={{
          borderLeft: `3px solid ${i === 0 ? '#e63946' : '#333'}`,
          paddingLeft: '2vw',
        }}>
          <div style={{
            color: i === 0 ? '#f5f5f5' : '#ccc',
            fontSize: i === 0 ? '3.2vw' : '2.8vw',
            lineHeight: 1.35,
          }}>
            {h.title}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 6: Update `pages/index.js`** (interim state — Steam still single panel)

```js
import { useState, useEffect } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import Steam from '../screens/Steam';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';

const PANELS = [
  'weather', 'calendar', 'gmail',
  'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  'steam',
];

const PANEL_MS = 10000;

const REFRESH_MS = {
  weather:        10 * 60 * 1000,
  calendar:        5 * 60 * 1000,
  gmail:           2 * 60 * 1000,
  'news-world':   15 * 60 * 1000,
  'news-gaming':  15 * 60 * 1000,
  'news-tech':    15 * 60 * 1000,
  'news-sports':  15 * 60 * 1000,
  'news-utah':    15 * 60 * 1000,
  steam:          60 * 60 * 1000,
};

const NEWS_LABELS = {
  'news-world':  'World News',
  'news-gaming': 'Gaming News',
  'news-tech':   'Tech / AI',
  'news-sports': 'Sports',
  'news-utah':   'Utah News',
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steam: null,
  });

  const fetchPanel = async (panel) => {
    const apiUrl = panel.startsWith('news-') ? `/api/news/${panel.slice(5)}` : `/api/${panel}`;
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [panel]: json }));
    } catch (e) {
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPanelIndex(i => (i + 1) % PANELS.length), PANEL_MS);
    return () => clearInterval(id);
  }, []);

  const current = PANELS[panelIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Clock />
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {current === 'weather'       && <Weather  data={data.weather}  />}
        {current === 'calendar'      && <Calendar data={data.calendar} />}
        {current === 'gmail'         && <Gmail    data={data.gmail}    />}
        {current.startsWith('news-') && <News     data={data[current]} category={NEWS_LABELS[current]} />}
        {current === 'steam'         && <Steam    data={data.steam}    />}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Open `http://localhost:3000`. Confirm 5 distinct news panels appear in rotation, each showing the category label (World News, Gaming News, Tech / AI, Sports, Utah News) and 3 headlines.

- [ ] **Step 8: Commit**

```bash
git add pages/api/news/ screens/News.jsx pages/index.js
git commit -m "feat: expand news to 5 category panels with dynamic API route"
```

---

## Task 7: Steam — Split Into Two Panels

**Files:**
- Modify: `pages/api/steam.js`
- Create: `screens/SteamSales.jsx`
- Create: `screens/SteamReleases.jsx`
- Delete: `screens/Steam.jsx`
- Modify: `pages/index.js`

- [ ] **Step 1: Update `pages/api/steam.js`**

```js
let cache = null;
let cacheAt = 0;
const TTL = 60 * 60 * 1000;

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const [featRes, catRes] = await Promise.all([
      fetch('https://store.steampowered.com/api/featured/?cc=us&l=en', { signal: ac.signal }),
      fetch('https://store.steampowered.com/api/featuredcategories/?cc=us&l=en', { signal: ac.signal }),
    ]);
    clearTimeout(timer);

    const feat = featRes.ok ? await featRes.json() : null;
    const cat = catRes.ok ? await catRes.json() : null;

    const sales = [];
    const seen = new Set();
    const allFeatured = [
      ...(feat?.large_capsules || []),
      ...(feat?.featured_win || []),
    ];
    for (const item of allFeatured) {
      if (item.discount_percent > 0 && sales.length < 4 && !seen.has(item.name)) {
        seen.add(item.name);
        sales.push({ name: item.name, discount: item.discount_percent });
      }
    }

    const newReleases = (cat?.new_releases?.items || [])
      .slice(0, 4)
      .map(item => ({ name: item.name }));

    cache = { sales, newReleases };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    clearTimeout(timer);
    console.error('[steam]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 2: Verify the API**

Visit `http://localhost:3000/api/steam`. Confirm `sales` is an array of up to 4 objects with `name` + `discount`, and `newReleases` is an array of up to 4 objects with `name`.

- [ ] **Step 3: Create `screens/SteamSales.jsx`**

```jsx
export default function SteamSales({ data }) {
  if (!data) return <PanelLoading label="STEAM DEALS" />;

  const sales = data.sales ?? [];

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{
        color: '#66c0f4', fontSize: '2vw', fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5vh',
      }}>
        Steam Deals
      </div>
      {sales.length === 0 && (
        <div style={{ color: '#8f98a0', fontSize: '2.8vw' }}>No featured deals right now</div>
      )}
      {sales.map(d => (
        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1vh' }}>
          <span style={{ color: '#c6d4df', fontSize: '3vw' }}>{d.name}</span>
          <span style={{
            background: '#4c6b22', color: '#a4d007',
            fontSize: '2.5vw', fontWeight: 700,
            padding: '0.2vh 1.2vw', borderRadius: '3px',
          }}>
            -{d.discount}%
          </span>
        </div>
      ))}
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Create `screens/SteamReleases.jsx`**

```jsx
export default function SteamReleases({ data }) {
  if (!data) return <PanelLoading label="NEW RELEASES" />;

  const newReleases = data.newReleases ?? [];

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{
        color: '#66c0f4', fontSize: '2vw', fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5vh',
      }}>
        New Releases
      </div>
      {newReleases.length === 0 && (
        <div style={{ color: '#8f98a0', fontSize: '2.8vw' }}>No new releases available</div>
      )}
      {newReleases.map(r => (
        <div key={r.name} style={{ paddingBottom: '1vh' }}>
          <span style={{ color: '#c6d4df', fontSize: '3vw' }}>▸ {r.name}</span>
        </div>
      ))}
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 5: Delete the old Steam component**

```bash
git rm screens/Steam.jsx
```

- [ ] **Step 6: Update `pages/index.js`** (interim — no Stocks yet)

```js
import { useState, useEffect } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import SteamSales from '../screens/SteamSales';
import SteamReleases from '../screens/SteamReleases';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';

const PANELS = [
  'weather', 'calendar', 'gmail',
  'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  'steam-sales', 'steam-releases',
];

const PANEL_MS = 10000;

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
};

const NEWS_LABELS = {
  'news-world':  'World News',
  'news-gaming': 'Gaming News',
  'news-tech':   'Tech / AI',
  'news-sports': 'Sports',
  'news-utah':   'Utah News',
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steam: null,
  });

  const fetchPanel = async (panel) => {
    let apiUrl, dataKey;
    if (panel.startsWith('news-')) {
      apiUrl = `/api/news/${panel.slice(5)}`;
      dataKey = panel;
    } else if (panel === 'steam-sales' || panel === 'steam-releases') {
      apiUrl = '/api/steam';
      dataKey = 'steam';
    } else {
      apiUrl = `/api/${panel}`;
      dataKey = panel;
    }
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [dataKey]: json }));
    } catch (e) {
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPanelIndex(i => (i + 1) % PANELS.length), PANEL_MS);
    return () => clearInterval(id);
  }, []);

  const current = PANELS[panelIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Clock />
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {current === 'weather'        && <Weather       data={data.weather}  />}
        {current === 'calendar'       && <Calendar      data={data.calendar} />}
        {current === 'gmail'          && <Gmail         data={data.gmail}    />}
        {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
        {current === 'steam-sales'    && <SteamSales    data={data.steam}    />}
        {current === 'steam-releases' && <SteamReleases data={data.steam}    />}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Open `http://localhost:3000`. Confirm two distinct Steam panels appear in rotation: "Steam Deals" shows up to 4 discounted games with green discount badges, and "New Releases" shows up to 4 game titles with arrow prefixes.

- [ ] **Step 8: Commit**

```bash
git add pages/api/steam.js screens/SteamSales.jsx screens/SteamReleases.jsx pages/index.js
git commit -m "feat: split Steam into deals and new releases panels"
```

---

## Task 8: Stocks — Config, API, Component, and Final Rotation

**Files:**
- Modify: `config/settings.json`
- Create: `pages/api/stocks.js`
- Create: `screens/Stocks.jsx`
- Modify: `pages/index.js`

- [ ] **Step 1: Add tickers to `config/settings.json`**

```json
{
  "lat": "41.324308283562615",
  "lon": "-111.84161823646542",
  "tickers": ["AAPL", "VTI", "NVDA"]
}
```

Edit the tickers list to your actual holdings before deploying.

- [ ] **Step 2: Create `pages/api/stocks.js`**

```js
import settings from '../../config/settings.json';

let cache = null;
let cacheAt = 0;
const TTL = 5 * 60 * 1000;

function isMarketOpen() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export default async function handler(req, res) {
  const tickers = settings.tickers ?? [];
  if (!tickers.length) return res.json({ tickers: [], asOf: null });

  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const marketOpen = isMarketOpen();

  try {
    const results = await Promise.all(
      tickers.map(async (symbol) => {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return null;
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (!meta) return null;
        const price = meta.regularMarketPrice ?? 0;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change = price - prevClose;
        const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
        return {
          symbol,
          price: price.toFixed(2),
          change: (change >= 0 ? '+' : '') + change.toFixed(2),
          changePct: (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%',
          up: change >= 0,
          marketOpen,
        };
      })
    );

    cache = { tickers: results.filter(Boolean), asOf: new Date().toISOString() };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[stocks]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 3: Verify the API**

Visit `http://localhost:3000/api/stocks`. Confirm the response has a `tickers` array with entries containing `symbol`, `price`, `change`, `changePct`, `up`, and `marketOpen`.

If it returns 503, the Yahoo Finance endpoint may be rate-limiting. Retry after a few seconds. If it consistently fails, the Finnhub free tier (`https://finnhub.io/api/v1/quote?symbol={ticker}&token={key}`) is the fallback — it requires a free API key stored in `config/settings.json` as `"finnhubKey"`.

- [ ] **Step 4: Create `screens/Stocks.jsx`**

```jsx
export default function Stocks({ data }) {
  if (!data) return <PanelLoading />;

  const tickers = data.tickers ?? [];
  if (!tickers.length) return <PanelLoading />;

  const shouldScroll = tickers.length > 6;
  const rows = Math.ceil(tickers.length / 3);
  const scrollDuration = Math.round((rows * 80) / 30);

  const cards = tickers.map(t => (
    <div key={t.symbol} style={{
      background: '#111', borderRadius: '8px',
      overflow: 'hidden', display: 'flex', height: '70px',
    }}>
      <div style={{
        width: '5px', flexShrink: 0,
        background: t.marketOpen ? (t.up ? '#4caf50' : '#f44336') : '#444',
      }} />
      <div style={{
        flex: 1, padding: '0 2vw',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: '#e8eaed', fontSize: '2.5vw', fontWeight: 700, letterSpacing: '0.05em' }}>
          {t.symbol}
        </span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fff', fontSize: '2.5vw', fontWeight: 500 }}>${t.price}</div>
          <div style={{
            fontSize: '1.8vw', fontWeight: 500,
            color: t.marketOpen ? (t.up ? '#4caf50' : '#f44336') : '#9aa0a6',
          }}>
            {t.change} · {t.changePct}{!t.marketOpen ? ' (closed)' : ''}
          </div>
        </div>
      </div>
    </div>
  ));

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      {shouldScroll && (
        <style>{`@keyframes stocksScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }`}</style>
      )}
      <div style={{
        color: '#9aa0a6', fontSize: '2vw', fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        Stocks
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px',
          animation: shouldScroll ? `stocksScroll ${scrollDuration}s linear infinite` : 'none',
        }}>
          {cards}
          {shouldScroll && cards}
        </div>
      </div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>STOCKS</span>
    </div>
  );
}
```

- [ ] **Step 5: Update `pages/index.js`** (final state — all 11 panels)

```js
import { useState, useEffect } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import SteamSales from '../screens/SteamSales';
import SteamReleases from '../screens/SteamReleases';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';
import Stocks from '../screens/Stocks';

const PANELS = [
  'weather', 'calendar', 'gmail',
  'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  'steam-sales', 'steam-releases',
  'stocks',
];

const PANEL_MS = 10000;

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
};

const NEWS_LABELS = {
  'news-world':  'World News',
  'news-gaming': 'Gaming News',
  'news-tech':   'Tech / AI',
  'news-sports': 'Sports',
  'news-utah':   'Utah News',
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steam: null,
    stocks: null,
  });

  const fetchPanel = async (panel) => {
    let apiUrl, dataKey;
    if (panel.startsWith('news-')) {
      apiUrl = `/api/news/${panel.slice(5)}`;
      dataKey = panel;
    } else if (panel === 'steam-sales' || panel === 'steam-releases') {
      apiUrl = '/api/steam';
      dataKey = 'steam';
    } else {
      apiUrl = `/api/${panel}`;
      dataKey = panel;
    }
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [dataKey]: json }));
    } catch (e) {
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPanelIndex(i => (i + 1) % PANELS.length), PANEL_MS);
    return () => clearInterval(id);
  }, []);

  const current = PANELS[panelIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Clock />
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {current === 'weather'        && <Weather       data={data.weather}  />}
        {current === 'calendar'       && <Calendar      data={data.calendar} />}
        {current === 'gmail'          && <Gmail         data={data.gmail}    />}
        {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
        {current === 'steam-sales'    && <SteamSales    data={data.steam}    />}
        {current === 'steam-releases' && <SteamReleases data={data.steam}    />}
        {current === 'stocks'         && <Stocks        data={data.stocks}   />}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify full rotation**

Open `http://localhost:3000`. Watch the full 11-panel cycle (~110s):

1. Weather — left: temp/condition/high-low/wind; right: 4 forecast cards with emoji
2. Calendar — events grouped under TODAY/TOMORROW/date headers
3. Gmail — unread count + message previews (unchanged)
4. World News — BBC headlines
5. Gaming News — IGN headlines
6. Tech / AI — The Verge headlines
7. Sports — ESPN headlines
8. Utah News — Deseret News headlines
9. Steam Deals — 4 discounted games
10. New Releases — 4 new Steam titles
11. Stocks — 3×2 card grid, green/red accent bars

- [ ] **Step 7: Commit**

```bash
git add config/settings.json pages/api/stocks.js screens/Stocks.jsx pages/index.js
git commit -m "feat: add Stocks panel with Yahoo Finance data and 3x2 card grid"
```
