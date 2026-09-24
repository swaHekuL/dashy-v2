# Claude Notify Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Task 3 is an exception:** it makes real, hard-to-reverse changes to
> external infrastructure (installs software on the physical Pi, creates a
> public Cloudflare Tunnel + DNS record, edits a systemd service). Execute
> Task 3 interactively with the user confirming each command — do not
> dispatch it to a detached/background subagent that would run those
> commands unsupervised.

**Goal:** Let any Claude Code session on another machine notify this
dashboard, via a `Stop`/`UserPromptSubmit` hook pair and a Cloudflare
Tunnel, that it's waiting for the user — shown as a small badge in the
Clock's corner.

**Architecture:** A new `pages/api/claude-notify.js` route holds an
in-memory `Map` of currently-waiting sessions. `pages/index.js` polls it
every 15s and passes the list into `screens/Clock.jsx`, which renders one
badge per entry. A Cloudflare Tunnel on the Pi exposes only that one API
path publicly so the hook (already specified, on the other machine) can
reach it without a VPN or port-forward.

**Tech Stack:** Next.js 16.2.6 Pages Router API routes, in-memory state (no
DB), Cloudflare Tunnel (`cloudflared`), plain `fetch`/`curl`.

**Spec:** [`docs/superpowers/specs/2026-09-17-claude-notify-hook-design.md`](../specs/2026-09-17-claude-notify-hook-design.md)

## Global Constraints

- The tunnel's ingress must route **only** the path `/api/claude-notify` to
  the Pi's Next server; every other path returns 404 — the rest of the
  dashboard is never exposed publicly.
- `POST /api/claude-notify` requires `Authorization: Bearer <token>`
  checked against `process.env.CLAUDE_NOTIFY_TOKEN`; a missing/wrong token
  is a 401. `GET /api/claude-notify` requires no auth.
- State is a plain in-memory `Map`, swept of entries older than 30 minutes
  (`TTL_MS = 30 * 60 * 1000`) on every request. No persistence — losing it
  on process restart is acceptable.
- API routes in this project are ESM (`import`, not `require`) — see
  `CLAUDE.md` gotchas.
- No test framework exists in this repo (`package.json` has no test
  runner) — verification is manual `curl`/browser checks, matching every
  other panel/API route here. Do not introduce a new test framework as
  part of this feature.
- Follow existing API route conventions (see `pages/api/stocks.js`,
  `pages/api/portfolio.js`): `export default function handler(req, res)`,
  guard-clause env var checks, `res.status(n).json(...)`.

---

## File Structure

- **Create** `pages/api/claude-notify.js` — the receive endpoint: in-memory
  map, POST (start/clear, token-gated), GET (status, open), TTL sweep.
- **Modify** `pages/index.js` — add a polling effect for
  `/api/claude-notify` and pass the result into `<Clock />`.
- **Modify** `screens/Clock.jsx` — accept a `notifications` prop and render
  one badge per entry, top-left, absolutely positioned.
- **Modify** `.env.local` (gitignored, both local machine and Pi) — add
  `CLAUDE_NOTIFY_TOKEN`.
- **Modify** `CLAUDE.md` — document the new endpoint, env var, and the
  Cloudflare Tunnel setup under Pi Deployment.

---

### Task 1: `claude-notify` API route

**Files:**
- Create: `pages/api/claude-notify.js`
- Modify: `.env.local` (create if absent; gitignored, not committed)

**Interfaces:**
- Produces: `GET /api/claude-notify` → `200 { waiting: [{ session_id, machine, project, since }] }`
- Produces: `POST /api/claude-notify` with header `Authorization: Bearer <token>` and JSON body `{ event: "start"|"clear", session_id, machine, project }` → `200 { ok: true }` on success, `401 { error: "unauthorized" }` on bad/missing token, `400 { error: "invalid payload" }` on malformed body.

- [ ] **Step 1: Add a local test token to `.env.local`**

Create `.env.local` in the project root if it doesn't exist, and add:

```
CLAUDE_NOTIFY_TOKEN=local-dev-test-token
```

(This file is gitignored — confirmed by the existing `.env*` rule in
`.gitignore`. Nothing here gets committed.)

- [ ] **Step 2: Write the API route**

Create `pages/api/claude-notify.js`:

```js
const TTL_MS = 30 * 60 * 1000;

let waiting = new Map();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of waiting) {
    if (entry.since < cutoff) waiting.delete(id);
  }
}

export default function handler(req, res) {
  sweep();

  if (req.method === 'POST') {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!process.env.CLAUDE_NOTIFY_TOKEN || token !== process.env.CLAUDE_NOTIFY_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { event, session_id, machine, project } = req.body ?? {};
    if (!session_id || (event !== 'start' && event !== 'clear')) {
      return res.status(400).json({ error: 'invalid payload' });
    }

    if (event === 'start') {
      waiting.set(session_id, {
        machine: machine || 'unknown',
        project: project || 'unknown',
        since: Date.now(),
      });
    } else {
      waiting.delete(session_id);
    }
    return res.status(200).json({ ok: true });
  }

  const list = Array.from(waiting, ([session_id, entry]) => ({ session_id, ...entry }));
  return res.status(200).json({ waiting: list });
}
```

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000` with no errors.

- [ ] **Step 4: Verify GET returns an empty list**

Run: `curl -s http://localhost:3000/api/claude-notify`
Expected: `{"waiting":[]}`

- [ ] **Step 5: Verify POST without a token is rejected**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/claude-notify \
  -H "Content-Type: application/json" \
  -d '{"event":"start","session_id":"t1","machine":"m","project":"p"}'
```
Expected: `401`

- [ ] **Step 6: Verify POST with the correct token creates an entry**

Run:
```bash
curl -s -X POST http://localhost:3000/api/claude-notify \
  -H "Authorization: Bearer local-dev-test-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"start","session_id":"t1","machine":"laptop","project":"dashy-v2"}'
curl -s http://localhost:3000/api/claude-notify
```
Expected: first call returns `{"ok":true}`; second returns
`{"waiting":[{"session_id":"t1","machine":"laptop","project":"dashy-v2","since":<number>}]}`

- [ ] **Step 7: Verify POST clear removes the entry**

Run:
```bash
curl -s -X POST http://localhost:3000/api/claude-notify \
  -H "Authorization: Bearer local-dev-test-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"clear","session_id":"t1"}'
curl -s http://localhost:3000/api/claude-notify
```
Expected: `{"waiting":[]}`

- [ ] **Step 8: Verify the stale-entry sweep**

Temporarily change `TTL_MS` at the top of `pages/api/claude-notify.js` to
`5 * 1000` (5 seconds), save (dev server hot-reloads), then:

```bash
curl -s -X POST http://localhost:3000/api/claude-notify \
  -H "Authorization: Bearer local-dev-test-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"start","session_id":"t2","machine":"m","project":"p"}'
# wait 6+ seconds
curl -s http://localhost:3000/api/claude-notify
```
Expected: the second call returns `{"waiting":[]}` — the entry was swept.

Revert `TTL_MS` back to `30 * 60 * 1000` afterward.

- [ ] **Step 9: Stop the dev server and commit**

```bash
git add pages/api/claude-notify.js
git commit -m "feat: add claude-notify API route for cross-machine waiting indicator"
```

(`.env.local` is gitignored and intentionally not staged.)

---

### Task 2: Wire the badge into the Clock and polling loop

**Files:**
- Modify: `screens/Clock.jsx`
- Modify: `pages/index.js`

**Interfaces:**
- Consumes: `GET /api/claude-notify` from Task 1 → `{ waiting: [{session_id, machine, project, since}] }`
- Produces: `<Clock notifications={Array<{session_id, machine, project, since}>} />` prop contract, consumed only by `pages/index.js`.

- [ ] **Step 1: Add the `notifications` prop and badge rendering to `Clock.jsx`**

Modify `screens/Clock.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Bebas_Neue } from 'next/font/google';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'] });

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n) { return String(n).padStart(2, '0'); }

export default function Clock({ notifications = [] }) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div style={{ height: '42vh', background: '#000', flexShrink: 0 }} />;

  const h = now.getHours() % 12 || 12;
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';
  const day = DAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];
  const date = now.getDate();

  return (
    <div className={bebas.className} style={{
      height: '42vh',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderBottom: '1px solid #1a1a1a',
      flexShrink: 0,
      position: 'relative',
    }}>
      {notifications.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {notifications.map(n => (
            <div key={n.session_id} style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              fontWeight: 400,
              letterSpacing: '0.02em',
              color: '#0f0',
              background: '#111',
              border: '1px solid #333',
              borderRadius: '3px',
              padding: '3px 6px',
            }}>
              {n.machine} · {n.project}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5vw' }}>
        <span style={{ fontSize: '18vw', color: '#fff', lineHeight: 1, letterSpacing: '0.04em' }}>
          {h}:{m}:{s}
        </span>
        <span style={{ fontSize: '4vw', color: '#aaa', letterSpacing: '0.1em' }}>
          {ampm}
        </span>
      </div>
      <div style={{
        fontSize: '2.8vw',
        color: '#aaa',
        letterSpacing: '0.2em',
        marginTop: '0.5vh',
        textTransform: 'uppercase',
      }}>
        {day} · {month} {date}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add polling and prop wiring to `pages/index.js`**

In `pages/index.js`, add a `notifications` state and polling effect, and
pass it to `<Clock />`. Insert the new state declaration next to the
existing `data` state (around line 55):

```js
  const [notifications, setNotifications] = useState([]);
```

Add a new effect near the existing panel-fetching effect (after the block
ending around line 90):

```js
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/claude-notify');
        if (!res.ok) return;
        const json = await res.json();
        setNotifications(json.waiting ?? []);
      } catch (e) {
        console.error('[fetchNotifications]', e);
      }
    };
    fetchNotifications();
    const id = setInterval(fetchNotifications, 15000);
    return () => clearInterval(id);
  }, []);
```

Change the Clock render line:

```jsx
      {!showCamera && <Clock />}
```

to:

```jsx
      {!showCamera && <Clock notifications={notifications} />}
```

- [ ] **Step 3: Manual verification**

With Task 1's dev server running and `.env.local`'s
`CLAUDE_NOTIFY_TOKEN=local-dev-test-token` still in place:

1. Run `npm run dev` (if not already running) and open `http://localhost:3000` in a browser.
2. From a terminal, POST a start event:
   ```bash
   curl -s -X POST http://localhost:3000/api/claude-notify \
     -H "Authorization: Bearer local-dev-test-token" \
     -H "Content-Type: application/json" \
     -d '{"event":"start","session_id":"t3","machine":"work-vm","project":"dashy-v2"}'
   ```
3. Within 15 seconds, confirm a badge reading `work-vm · dashy-v2` appears in the top-left of the clock area.
4. POST the matching clear:
   ```bash
   curl -s -X POST http://localhost:3000/api/claude-notify \
     -H "Authorization: Bearer local-dev-test-token" \
     -H "Content-Type: application/json" \
     -d '{"event":"clear","session_id":"t3"}'
   ```
5. Confirm the badge disappears within 15 seconds.

- [ ] **Step 4: Commit**

```bash
git add pages/index.js screens/Clock.jsx
git commit -m "feat: poll claude-notify and render waiting-session badges in Clock"
```

---

### Task 3: Cloudflare Tunnel + Pi secret (infrastructure — interactive only)

This task makes real changes outside the repo: installs software on the
Pi, creates a public Cloudflare Tunnel and DNS record, and adds a systemd
service. Run every command interactively and confirm each step with the
user before proceeding — do not run this task via a detached/background
subagent.

**Files:**
- Modify: `CLAUDE.md` (documents the new setup — the only repo file this task touches)

**Prerequisites to ask the user for, before starting:**
- The Cloudflare-managed domain to use (e.g. `example.com`) and the
  subdomain to dedicate to this (e.g. `notify.example.com`).
- Confirmation they're OK running `cloudflared` as a background service on
  the Pi (it will auto-start with the system going forward).

- [ ] **Step 1: SSH to the Pi and install `cloudflared`**

Using the SSH command from `CLAUDE.md`'s Pi Deployment section:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 \
  'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm -o cloudflared && chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/cloudflared && cloudflared --version'
```
Expected: prints a `cloudflared` version string.

- [ ] **Step 2: Authenticate and create the tunnel**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'cloudflared tunnel login'
```
This prints a URL — open it in a browser, log into the Cloudflare account
that owns the domain, and authorize. Then:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'cloudflared tunnel create dashy-notify'
```
Expected: prints a tunnel UUID and the path to a credentials JSON file
under `~/.cloudflared/` on the Pi — note the UUID for the next step.

- [ ] **Step 3: Write the ingress config, scoped to one path**

On the Pi, create `~/.cloudflared/config.yml` (replace `<TUNNEL_UUID>` and
`<subdomain>.<domain>` with the values from Step 2 and the user's answer):

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/swahekul/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: <subdomain>.<domain>
    path: ^/api/claude-notify$
    service: http://localhost:3000
  - hostname: <subdomain>.<domain>
    service: http_status:404
  - service: http_status:404
```

- [ ] **Step 4: Create the public DNS record and run the tunnel as a service**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'cloudflared tunnel route dns dashy-notify <subdomain>.<domain>'
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'sudo cloudflared --config /home/swahekul/.cloudflared/config.yml service install'
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'sudo systemctl enable --now cloudflared'
```
Expected: `systemctl status cloudflared` (run the same way) shows `active (running)`.

- [ ] **Step 5: Generate the shared secret and add it to the Pi's env**

```bash
openssl rand -hex 32
```
Copy the output. SSH to the Pi and append it to `~/dashy-v2/.env.local`:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 "echo 'CLAUDE_NOTIFY_TOKEN=<paste the generated value>' >> ~/dashy-v2/.env.local"
```

**Save this same token value** — the other machine's hook setup (via
`docs/claude-notify-hook-agent-brief.md`) needs it, and it's only shown
once here.

- [ ] **Step 6: Verify the public endpoint end-to-end**

```bash
curl -s https://<subdomain>.<domain>/api/claude-notify
```
Expected (once Task 4 has deployed the code): `{"waiting":[]}`. Until
Task 4 is done this will 502/404 since the app isn't serving the route
through the tunnel's target port yet — that's expected at this point.

```bash
curl -s https://<subdomain>.<domain>/nonexistent-path
```
Expected: `404` — confirms only the one path is routed.

- [ ] **Step 7: Document the setup and commit**

Add a new subsection under "Pi Deployment" in `CLAUDE.md`:

```markdown
### Claude Notify Hook

- Public endpoint: `https://<subdomain>.<domain>/api/claude-notify` (Cloudflare Tunnel `dashy-notify`, config at `~/.cloudflared/config.yml` on the Pi, routes only this one path)
- Tunnel runs as a systemd service: `cloudflared` (check with `systemctl status cloudflared` on the Pi)
- `CLAUDE_NOTIFY_TOKEN` in the Pi's `.env.local` is the shared secret the hook script authenticates with — regenerate with `openssl rand -hex 32` if it ever leaks, and update it on every hook-side machine (see `docs/claude-notify-hook-agent-brief.md`)
```

```bash
git add CLAUDE.md
git commit -m "docs: document Cloudflare Tunnel setup for claude-notify hook"
```

---

### Task 4: Deploy and end-to-end verification

**Files:** none (deployment + verification only)

- [ ] **Step 1: Deploy the latest code to the Pi**

Using the deploy command from `CLAUDE.md`:

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

Per the existing "Pi deploy requires reboot" note, if the app doesn't
pick up the change after this, reboot the Pi fully rather than assuming
the `pkill`/`npm start` cycle applied it.

- [ ] **Step 2: Verify the public endpoint now works**

```bash
curl -s https://<subdomain>.<domain>/api/claude-notify
```
Expected: `{"waiting":[]}`

- [ ] **Step 3: End-to-end test through the real tunnel**

```bash
curl -s -X POST https://<subdomain>.<domain>/api/claude-notify \
  -H "Authorization: Bearer <the CLAUDE_NOTIFY_TOKEN value>" \
  -H "Content-Type: application/json" \
  -d '{"event":"start","session_id":"e2e-1","machine":"test","project":"e2e"}'
```
Confirm the badge `test · e2e` appears on the physical dashboard screen
within 15 seconds. Then clear it:

```bash
curl -s -X POST https://<subdomain>.<domain>/api/claude-notify \
  -H "Authorization: Bearer <the CLAUDE_NOTIFY_TOKEN value>" \
  -H "Content-Type: application/json" \
  -d '{"event":"clear","session_id":"e2e-1"}'
```
Confirm it disappears.

- [ ] **Step 4: Hand off the hook-side setup**

Give the user the endpoint URL and token (from Task 3, Step 5) and point
them at `docs/claude-notify-hook-agent-brief.md` to run on the other
machine — that document is self-contained and already asks for these two
values itself.
