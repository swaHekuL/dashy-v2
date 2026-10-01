import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchIcsEvents } from '../../lib/ics';

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

const OUTLOOK_COLOR = '#cc0000';

function icsFeeds() {
  const split = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
  return [
    ...split(process.env.OUTLOOK_ICS_URLS).map(url => ({ url, busyOnly: false })),
    ...split(process.env.OUTLOOK_ICS_BUSY_URLS).map(url => ({ url, busyOnly: true })),
  ];
}

function getAuth() {
  const creds = JSON.parse(readFileSync(join(process.cwd(), 'config/credentials.json'), 'utf8'));
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

    const from = new Date(timeMin);
    const to = new Date(timeMax);

    const [googleSettled, ...icsSettled] = await Promise.allSettled([
      calendar.events.list(
        { calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime', showHiddenInvitations: true, maxResults: 10 },
        { timeout: 8000 }
      ),
      ...icsFeeds().map((f, i) =>
        fetchIcsEvents(f.url, { from, to, color: OUTLOOK_COLOR, busyOnly: f.busyOnly, idPrefix: `ics${i}` })
      ),
    ]);

    // Google is the primary source; ICS feeds are best-effort.
    if (googleSettled.status === 'rejected') throw googleSettled.reason;
    icsSettled.filter(r => r.status === 'rejected').forEach(r => console.error('[calendar:ics]', r.reason?.message));

    const googleEvents = (googleSettled.value.data.items || []).map(e => {
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
        color: COLOR_MAP[e.colorId] ?? '#1a73e8',
        _sort: new Date(e.start?.dateTime || e.start?.date || 0).getTime(),
      };
    });

    const events = [...googleEvents, ...icsSettled.flatMap(r => r.status === 'fulfilled' ? r.value : [])];

    const merged = events
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
