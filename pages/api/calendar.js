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
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const r = await calendar.events.list(
      {
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 3,
      },
      { timeout: 8000 }
    );

    cache = {
      events: (r.data.items || []).map(e => ({
        id: e.id,
        title: e.summary || '(no title)',
        time: e.start?.dateTime
          ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'All day',
        color: e.colorId ? COLOR_MAP[e.colorId] : '#1a73e8',
      })),
    };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[calendar]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
