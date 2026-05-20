import { google } from 'googleapis';
import creds from '../../config/credentials.json';

let cache = null;
let cacheAt = 0;
const TTL = 2 * 60 * 1000;

function getAuth() {
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });
  return auth;
}

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const gmail = google.gmail({ version: 'v1', auth: getAuth() });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['UNREAD', 'INBOX'],
      maxResults: 3,
      timeout: 8000,
    });

    const unreadCount = listRes.data.resultSizeEstimate || 0;
    const messages = listRes.data.messages || [];

    const previews = await Promise.all(
      messages.slice(0, 3).map(async ({ id }) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From'],
          timeout: 8000,
        });
        const headers = msg.data.payload?.headers ?? [];
        const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)';
        const from = headers.find(h => h.name === 'From')?.value ?? '';
        const sender = from.replace(/<.*>/, '').trim() || from;
        return { id, subject, sender };
      })
    );

    cache = { unreadCount, previews };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[gmail]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
