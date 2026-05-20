const { google } = require('googleapis');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const CREDS_PATH = path.join(__dirname, '../config/credentials.json');
const PORT = 3333;

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    `http://127.0.0.1:${PORT}/callback`
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    prompt: 'consent',
  });

  console.log('\nOpen this URL in your browser:\n\n' + authUrl + '\n');

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const code = parsed.searchParams.get('code');
      if (!code) { res.end('No code in request.'); return; }
      res.end('Auth complete — you can close this tab.');
      server.close();
      try {
        const { tokens } = await oauth2Client.getToken(code);
        creds.refresh_token = tokens.refresh_token;
        fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
        console.log('\nRefresh token saved to config/credentials.json');
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Waiting for OAuth callback on http://127.0.0.1:${PORT}/callback ...`);
    });
  });
}

main().catch(err => { console.error(err); process.exit(1); });
