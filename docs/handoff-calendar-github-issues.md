# Handoff: Work Calendar Sync via GitHub Issues

## Goal

Add Microsoft 365 work calendar events to the Dashy dashboard's Calendar panel, which currently only shows personal Google Calendar events.

## What Was Tried and Ruled Out

| Approach | Outcome |
|---|---|
| Outlook iCal publish URL | Blocked by org policy — "Shared calendars" option not visible in Outlook |
| Power Automate → Google Calendar connector | Blocked by org DLP policy |
| Power Automate → GitHub Gist | Gist is not an available action in the Power Automate GitHub connector |
| Power Automate → GitHub repo file | No file create/update actions in the connector at all |
| Microsoft Graph Device Code flow | User prefers not to create a new personal Microsoft account for Azure app registration |

## Chosen Approach: Power Automate → GitHub Issue body → Dashy polls

**How it works:**

1. A Power Automate recurrence flow (every 30 min) fetches upcoming Outlook calendar events and writes them as a JSON string into the body of a GitHub issue in the `dashy-v2` repo (public)
2. Dashy's `/api/calendar` route fetches that issue from the GitHub public API (no auth needed), parses the body as JSON, merges with existing Google Calendar events, and returns the top 3 sorted by date

**Why this works around all the blockers:**

- Power Automate "Update an Issue" is a standard (non-premium) GitHub connector action — not blocked by DLP
- Public repo means no auth needed on the Pi side — simple fetch, permanent URL, no expiring links
- Rate limit is 60 req/hour unauthenticated; Dashy polls every 5 min = 12 req/hour, well within limits

## Current Codebase State

`pages/api/calendar.js` — currently Google Calendar only (clean, no MS changes). Needs to be updated to also fetch from the GitHub issue URL and merge results.

`config/credentials.json` — contains Google OAuth creds only. No changes needed for this approach.

`config/settings.json` — needs a new field for the GitHub issue API URL (added once the issue number is known).

## User's One-Time Setup (must be done before code changes)

1. Make `dashy-v2` public on GitHub (Settings → Danger Zone → Change visibility)
2. Create an issue in `dashy-v2` — title: "Dashy Calendar Data", body: `[]` — note the issue number
3. Set up Power Automate flow (see below)

### Power Automate Flow

1. **Recurrence trigger** — every 30 minutes
2. **Get calendar view of events (V3)** (Office 365 Outlook) — `startDateTime`: `utcNow()`, `endDateTime`: `addDays(utcNow(), 30)`
3. **Select** action — map each event to:

   ```json
   {
     "title": "item()?['subject']",
     "start": "item()?['start']",
     "end": "item()?['end']"
   }
   ```

4. **Update an Issue** (GitHub connector) — owner: `lthaws`, repo: `dashy-v2`, issue number: `<from step 2>`, body: `string(body('Select'))`

## Code Changes Needed

### 1. `config/settings.json`

Add a field for the GitHub issue API URL:

```json
{
  "githubCalendarIssueUrl": "https://api.github.com/repos/lthaws/dashy-v2/issues/ISSUE_NUMBER"
}
```

### 2. `pages/api/calendar.js`

Update to:

- Read `settings.githubCalendarIssueUrl`
- Fetch the issue with no auth (public API) — `https://api.github.com/repos/lthaws/dashy-v2/issues/ISSUE_NUMBER`
- Parse `response.body` field as a JSON array of MS events
- Map MS events: each item has `title`, `start.dateTime`/`start.date`, `end.dateTime`
- Merge with Google Calendar events, sort all by datetime, return first 3
- MS events should use color `#0078d4` (Microsoft blue) to visually distinguish them
- If the GitHub fetch fails or the URL is not set, fall back to Google-only silently
- Cache TTL: 5 minutes (same as current)

### Event shape from Power Automate Select output

```json
[
  {
    "title": "Team standup",
    "start": { "dateTime": "2026-05-29T14:00:00.0000000Z", "timeZone": "UTC" },
    "end":   { "dateTime": "2026-05-29T14:30:00.0000000Z", "timeZone": "UTC" }
  }
]
```

All-day events from Outlook will have `start.date` (no `dateTime`) — handle both cases, same as the existing Google Calendar mapping.

## Existing `calendar.js` for Reference

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

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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
      { calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 3 },
      { timeout: 8000 }
    );

    cache = {
      events: (r.data.items || []).map(e => {
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

## Project Context

- Next.js 16.2.6 (Pages Router), React 19, inline styles throughout (no CSS modules/Tailwind)
- API routes are ESM (`import` only, no `require`)
- Running on Raspberry Pi 3B+ at `192.168.68.59:3000`
- `config/credentials.json` is gitignored
- `config/settings.json` is tracked in git (non-sensitive config)
- AGENTS.md says: read `node_modules/next/dist/docs/` before writing Next.js code
