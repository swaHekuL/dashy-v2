import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

let cache = null;
let cacheAt = 0;
const TTL = 2 * 60 * 1000;

function getAuth() {
  const creds = JSON.parse(readFileSync(join(process.cwd(), 'config/credentials.json'), 'utf8'));
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });
  return auth;
}

export default async function handler(req, res) {
  // The Pi view shows 3 messages; the TV view asks for more with ?limit=. The cache holds the full list.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 3, 1), 8);
  const reply = (c) => res.json({ ...c, previews: c.previews.slice(0, limit) });
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return reply(cache);

  try {
    const gmail = google.gmail({ version: 'v1', auth: getAuth() });

    const [listRes, labelRes] = await Promise.all([
      gmail.users.messages.list(
        { userId: 'me', labelIds: ['UNREAD', 'INBOX'], maxResults: 8 },
        { timeout: 8000 }
      ),
      gmail.users.labels.get(
        { userId: 'me', id: 'INBOX' },
        { timeout: 8000 }
      ),
    ]);

    const unreadCount = labelRes.data.messagesUnread ?? 0;
    const messages = listRes.data.messages || [];

    const previews = await Promise.all(
      messages.map(async ({ id }) => {
        const msg = await gmail.users.messages.get(
          { userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From'] },
          { timeout: 8000 }
        );
        const headers = msg.data.payload?.headers ?? [];
        const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)';
        const from = headers.find(h => h.name === 'From')?.value ?? '';
        const sender = from.replace(/<.*>/, '').trim() || from;
        return { id, subject, sender };
      })
    );

    cache = { unreadCount, previews };
    cacheAt = now;
    reply(cache);
  } catch (e) {
    console.error('[gmail]', e);
    if (cache) return reply(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
