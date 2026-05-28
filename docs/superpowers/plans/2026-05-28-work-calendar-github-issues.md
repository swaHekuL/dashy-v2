# Work Calendar GitHub Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Microsoft 365 work calendar events (sourced from a GitHub issue updated by Power Automate) into the Calendar panel alongside Google Calendar events, showing the next 3 events total.

**Architecture:** `fetchMsEvents()` fetches the public GitHub issue, parses its `body` field as JSON, and maps events to the same shape used by Google Calendar events. The handler runs both fetches in parallel (`Promise.all`), merges the arrays, sorts ascending by start time, and slices to 3. MS failures are silently swallowed — Google-only result is returned.

**Tech Stack:** Next.js 16.2.6 Pages Router (ESM only), `googleapis` npm package, native `fetch` (Node 18+)

---

## File Map

| File | Change |
|---|---|
| `config/settings.json` | Add `githubCalendarIssueUrl` field |
| `pages/api/calendar.js` | Add `fetchMsEvents()`, update handler to parallel-fetch and merge |

---

### Task 1: Add GitHub issue URL to settings

**Files:**
- Modify: `config/settings.json`

- [ ] **Step 1: Add the field**

Open `config/settings.json`. Add `githubCalendarIssueUrl` at the top level so the file reads:

```json
{
  "lat": "41.32",
  "lon": "-111.84",
  "tickers": ["AAPL", "VTI", "NVDA"],
  "githubCalendarIssueUrl": "https://api.github.com/repos/swaHekuL/dashy-v2/issues/1",
  "gasPrices": {
    "stations": [
      { "label": "N OGDEN", "placeId": "PLACE_ID_HERE" },
      { "label": "EDEN",    "placeId": "PLACE_ID_HERE" }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add config/settings.json
git commit -m "config: add githubCalendarIssueUrl for MS calendar sync"
```

---

### Task 2: Update calendar API route to merge MS events

**Files:**
- Modify: `pages/api/calendar.js`

- [ ] **Step 1: Replace the file with the updated implementation**

Replace the entire contents of `pages/api/calendar.js` with:

```js
import { google } from 'googleapis';
import creds from '../../config/credentials.json';
import settings from '../../config/settings.json';

let cache = null;
let cacheAt = 0;
const TTL = 5 * 60 * 1000;

const COLOR_MAP = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73',
  '5': '#f6c026', '6': '#f5511d', '7': '#039be5', '8': '#616161',
  '9': '#3f51b5', '10': '#0b8043', '11': '#d60000',
};

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getAuth() {
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });
  return auth;
}

async function fetchMsEvents() {
  try {
    const url = settings.githubCalendarIssueUrl;
    if (!url) return [];
    const res = await fetch(url, { headers: { 'User-Agent': 'dashy-v2' } });
    if (!res.ok) return [];
    const issue = await res.json();
    const events = JSON.parse(issue.body);
    if (!Array.isArray(events)) return [];
    return events.map(e => {
      const dateStr = e.start?.dateTime
        ? toLocalDateStr(new Date(e.start.dateTime))
        : e.start?.date ?? '';
      return {
        id: `ms-${e.start?.dateTime || e.start?.date || Math.random()}`,
        title: e.title || '(no title)',
        date: dateStr,
        time: e.start?.dateTime
          ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'All day',
        color: '#0078d4',
        _sort: new Date(e.start?.dateTime || e.start?.date || 0).getTime(),
      };
    });
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const calendar = google.calendar({ version: 'v3', auth: getAuth() });
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const [googleResult, msEvents] = await Promise.all([
      calendar.events.list(
        { calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 10 },
        { timeout: 8000 }
      ),
      fetchMsEvents(),
    ]);

    const googleEvents = (googleResult.data.items || []).map(e => {
      const dateStr = e.start?.dateTime
        ? toLocalDateStr(new Date(e.start.dateTime))
        : e.start?.date ?? '';
      return {
        id: e.id,
        title: e.summary || '(no title)',
        date: dateStr,
        time: e.start?.dateTime
          ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'All day',
        color: e.colorId ? COLOR_MAP[e.colorId] : '#1a73e8',
        _sort: new Date(e.start?.dateTime || e.start?.date || 0).getTime(),
      };
    });

    const merged = [...googleEvents, ...msEvents]
      .sort((a, b) => a._sort - b._sort)
      .slice(0, 3)
      .map(({ _sort, ...e }) => e);

    cache = { events: merged };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[calendar]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000`

- [ ] **Step 3: Verify the endpoint returns events**

In a separate terminal:

```bash
curl -s http://localhost:3000/api/calendar | jq .
```

Expected: `{ "events": [...] }` with 0–3 items. If the GitHub issue body is still `[]`, only Google events appear. MS events show `"color": "#0078d4"`.

- [ ] **Step 4: Verify MS fallback is silent**

Temporarily set `githubCalendarIssueUrl` to an invalid URL in `settings.json` (e.g., `"https://api.github.com/repos/nobody/nothing/issues/99999"`), restart the dev server, and hit the endpoint again.

Expected: response still returns Google events with no error. No `503`.

Revert `settings.json` to the correct URL after confirming.

- [ ] **Step 5: Commit**

```bash
git add pages/api/calendar.js
git commit -m "feat: merge MS work calendar events from GitHub issue into Calendar panel"
```
