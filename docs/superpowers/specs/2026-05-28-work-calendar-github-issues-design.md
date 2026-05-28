# Design: Work Calendar Sync via GitHub Issues

**Date:** 2026-05-28
**Status:** Approved

## Goal

Add Microsoft 365 work calendar events to the Dashy Calendar panel, which currently shows only personal Google Calendar events. Display the next 3 upcoming events total across both sources.

## Approach

Power Automate writes upcoming Outlook events as a JSON array into the body of GitHub issue #1 (`swaHekuL/dashy-v2`) every 30 minutes. The `/api/calendar` route fetches that issue from the public GitHub API (no auth required), parses the event list, merges with Google Calendar events, and returns the top 3 sorted by start time.

All other approaches were ruled out: Outlook iCal blocked by org policy, Power Automate → Google Calendar blocked by DLP, GitHub Gist and repo file write not available in the PA connector, Microsoft Graph device-code flow requires a personal Azure app registration the user prefers not to create.

## Changes

### `config/settings.json`

Add one field:

```json
"githubCalendarIssueUrl": "https://api.github.com/repos/swaHekuL/dashy-v2/issues/1"
```

### `pages/api/calendar.js`

- Import `settings.json` to read `githubCalendarIssueUrl`
- Run Google fetch (up to 10 results) and GitHub issue fetch **in parallel** via `Promise.allSettled`
- Map Google events to the existing event shape with color `#1a73e8`
- Parse the GitHub issue `body` field as JSON; map each MS event to the same shape with color `#0078d4` (Microsoft blue)
- MS events use `start.dateTime` for timed events or `start.date` for all-day events — same handling as Google
- Merge both arrays, sort ascending by start datetime, slice to 3
- If the GitHub fetch fails, `githubCalendarIssueUrl` is unset, or the body is not valid JSON: silently fall back to Google-only; never surface an error from the MS path
- Cache the merged result at 5-minute TTL (unchanged from today)

## Event Shape from Power Automate

```json
[
  {
    "title": "Team standup",
    "start": { "dateTime": "2026-05-29T14:00:00.0000000Z", "timeZone": "UTC" },
    "end":   { "dateTime": "2026-05-29T14:30:00.0000000Z", "timeZone": "UTC" }
  }
]
```

All-day events have `start.date` instead of `start.dateTime`.

## Output Shape (unchanged)

```json
{
  "events": [
    { "id": "...", "title": "...", "date": "YYYY-MM-DD", "time": "9:00 AM", "color": "#0078d4" }
  ]
}
```

No frontend changes required — the Calendar panel already renders whatever events the API returns.

## Power Automate Flow (user-managed, already set up)

1. Recurrence trigger — every 30 minutes
2. Get calendar view of events (V3) — `utcNow()` to `addDays(utcNow(), 30)`
3. Select action — maps each event to `{ title, start, end }`
4. Update an Issue (GitHub connector) — owner: `swaHekuL`, repo: `dashy-v2`, issue: `1`, body: `string(body('Select'))`

## Constraints

- GitHub public API rate limit: 60 req/hour unauthenticated; Dashy polls every 5 min = 12 req/hour
- Calendar panel displays exactly 3 events total (screen constraint on 800×480 display)
- `credentials.json` is unchanged; no new secrets or env vars required
