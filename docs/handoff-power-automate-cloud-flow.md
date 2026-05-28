# Handoff: Power Automate Cloud Flow Setup

## Context

The Dashy dashboard (Next.js, running on a Raspberry Pi) shows a Calendar panel with Google Calendar events. We've already added code to also show Microsoft 365 work calendar events. The mechanism: a Power Automate **cloud flow** writes upcoming Outlook events as JSON into a GitHub issue body every 30 minutes, and Dashy polls that issue.

The Dashy code is already deployed and working — this handoff is **only about setting up the Power Automate cloud flow**.

## What's Already Done (no changes needed)

- `config/settings.json` has `"githubCalendarIssueUrl": "https://api.github.com/repos/swaHekuL/dashy-v2/issues/1"`
- `pages/api/calendar.js` fetches that GitHub issue, parses the body as a JSON array, merges with Google Calendar events, and returns the top 3 sorted by start time
- The code reads `e.subject || e.title` for the event title (handles both Outlook and the simplified format)
- GitHub issue #1 exists at `https://github.com/swaHekuL/dashy-v2/issues/1` with body `[]`
- The repo `swaHekuL/dashy-v2` is public — no auth needed for Dashy to read the issue

## Important: Use the Web Version

Go to **make.powerautomate.com** in a browser and sign in with the work Microsoft account. This is Power Automate cloud flows — completely different from the Power Automate Desktop Windows app. All the actions described below exist only in the cloud (web) version.

## The Flow to Build

### Step 1: Create the flow

At make.powerautomate.com: **Create → Scheduled cloud flow**
- Name: `Dashy Calendar Sync`
- Recurrence: every **30 minutes**
- Click **Create**

### Step 2: Get calendar view of events (V3)

Add action: **Office 365 Outlook → Get calendar view of events (V3)**
- **Calendar ID:** Calendar (primary)
- **Start time:** Expression: `utcNow()`
- **End time:** Expression: `addDays(utcNow(), 14)`
- **Advanced options → Top Count:** `10`

### Step 3: Select (transform fields)

Add action: **Data Operation → Select**
- **From:** Dynamic content → `value` from the previous step
- Switch map to **Text mode** (the `T` icon)
- Paste:
```json
{
  "title": "@{item()?['subject']}",
  "start": "@{item()?['start']}",
  "end": "@{item()?['end']}"
}
```

This strips out the full HTML meeting body and all other metadata, keeping only what Dashy needs.

### Step 4: Update an Issue (GitHub)

Add action: **GitHub → Update an Issue**
- Connect with the `swaHekuL` GitHub account if prompted
- **Repository Owner:** `swaHekuL`
- **Repository Name:** `dashy-v2`
- **Issue Number:** `1`
- **Body:** Expression: `string(body('Select'))`

### Step 5: Save and test

Click **Save**, then **Test → Manually → Run flow**.

After it completes, open https://github.com/swaHekuL/dashy-v2/issues/1 and confirm the body looks like a clean JSON array:
```json
[{"title":"Team standup","start":{"dateTime":"2026-05-29T14:00:00.0000000Z","timeZone":"UTC"},"end":{...}},...]
```

If it does, the Dashy calendar panel will show work events within 5 minutes (the cache TTL).

## Fallback: If Select Action Is Not Available

If "Data Operation → Select" doesn't exist, use this instead for Step 3:

**Step 3a: Initialize variable**
- **Name:** `Events`
- **Type:** String
- **Value:** (empty)

**Step 3b: Apply to each**
- **Select an output:** Expression: `body('Get_calendar_view_of_events_(V3)')?['value']`

**Step 3c (inside loop): Append to string variable**
- **Name:** `Events`
- **Value** (plain text field, not expression):
```
,{"title":"@{items('Apply_to_each')?['subject']}","start":@{string(items('Apply_to_each')?['start'])},"end":@{string(items('Apply_to_each')?['end'])}}
```

**Step 4: Update an Issue**
- **Body:** Expression: `concat('[', substring(variables('Events'), 1), ']')`

## Pi Timezone Note

The Pi should be set to `America/Denver` for dates to display correctly. Check with `timedatectl` over SSH if events appear under the wrong day.
