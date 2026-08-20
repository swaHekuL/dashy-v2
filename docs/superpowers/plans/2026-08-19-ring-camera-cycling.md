# Ring Doorbell Snapshot + Multi-Camera Cycling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Ring doorbell snapshot feed and enable Left/Right arrow key cycling between camera feeds while in camera mode.

**Architecture:** A singleton `RingApi` (module-level) authenticates once per server process via refresh token; `/api/ring-snapshot` fetches and returns a fresh JPEG on each poll. `Camera.jsx` renders either the Tapo MJPEG stream or a Ring snapshot that auto-refreshes every 7 seconds, with a `← LABEL →` bar overlay. Key cycling in `index.js` checks `showCamera` to route arrow keys to camera cycling vs. panel navigation.

**Tech Stack:** `ring-client-api` (npm), Next.js 16.2.6 ESM API routes, React 19

## Global Constraints

- Next.js 16.2.6 with Turbopack; API routes use ESM (`import`/`export default`) only — `require()` throws at runtime
- Pi target: Node v20.20.2 via nvm; prefix SSH commands with `export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH`
- Screen: 800×480; monospace font; dark (#000) background aesthetic throughout
- `RING_REFRESH_TOKEN` stored in `.env.local` (gitignored, never committed)
- Camera labels: Tapo = `BACK PATIO`, Ring = `FRONT DOOR`

---

### Task 1: Install ring-client-api and generate refresh token

**Files:**
- Modify: `package.json` (dependency added by npm install)
- Create: `scripts/get-ring-token.mjs`
- Modify: `.env.local`

**Interfaces:**
- Produces: `RING_REFRESH_TOKEN` in `.env.local`, consumed by Task 2's API route

- [ ] **Step 1: Install ring-client-api**

```
npm install ring-client-api
```

Verify `package.json` now lists `ring-client-api` under `dependencies`.

- [ ] **Step 2: Create `scripts/get-ring-token.mjs`**

```js
import { RingApi } from 'ring-client-api';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const email    = await ask('Ring email: ');
const password = await ask('Ring password: ');

let token = null;

const mkApi = (extra = {}) => new RingApi({
  email,
  password,
  ...extra,
  onRefreshTokenUpdated: (t) => { token = t; },
});

// First attempt — Ring will send a 2FA code to your phone/email
try {
  await mkApi().getProfile();
} catch (e) {
  if (!/two.factor|verification|code/i.test(e.message)) throw e;
  const code = await ask('2FA code sent to your phone: ');
  await mkApi({ twoFactorAuthCode: code }).getProfile();
}

rl.close();

if (!token) {
  console.error('ERROR: no refresh token received — check credentials and try again');
  process.exit(1);
}

const envPath = resolve(process.cwd(), '.env.local');
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
if (/^RING_REFRESH_TOKEN=/m.test(env)) {
  env = env.replace(/^RING_REFRESH_TOKEN=.*/m, `RING_REFRESH_TOKEN=${token}`);
} else {
  env = env.trimEnd() + `\nRING_REFRESH_TOKEN=${token}\n`;
}
writeFileSync(envPath, env);
console.log(`✓ RING_REFRESH_TOKEN written to .env.local`);
```

- [ ] **Step 3: Run the script**

```
node scripts/get-ring-token.mjs
```

Enter your Ring email, password, and the 2FA code sent to your phone.

Verify: `.env.local` now contains a `RING_REFRESH_TOKEN=<long-token>` line.

- [ ] **Step 4: Commit**

```bash
git add scripts/get-ring-token.mjs package.json package-lock.json
git commit -m "feat: add ring-client-api and token generation script"
```

---

### Task 2: Ring snapshot API route

**Files:**
- Create: `pages/api/ring-snapshot.js`

**Interfaces:**
- Consumes: `process.env.RING_REFRESH_TOKEN`
- Produces: `GET /api/ring-snapshot?t=<timestamp>` → `image/jpeg` (consumed by Task 3's Camera component)

- [ ] **Step 1: Create `pages/api/ring-snapshot.js`**

```js
import { RingApi } from 'ring-client-api';

let ringApi = null;

function getApi() {
  if (!ringApi) {
    ringApi = new RingApi({
      refreshToken: process.env.RING_REFRESH_TOKEN,
      onRefreshTokenUpdated: () => {},
    });
  }
  return ringApi;
}

export default async function handler(req, res) {
  if (!process.env.RING_REFRESH_TOKEN) {
    return res.status(503).end('Ring not configured');
  }

  try {
    const cameras = await getApi().getCameras();
    if (!cameras.length) return res.status(503).end('No Ring cameras found');

    const snapshot = await cameras[0].getSnapshot();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(snapshot);
  } catch (e) {
    console.error('[ring-snapshot]', e.message);
    ringApi = null; // reset so next request re-authenticates
    res.status(503).end('Ring snapshot failed');
  }
}
```

- [ ] **Step 2: Start dev server and hit the endpoint**

```
npm run dev
```

Open `http://localhost:3000/api/ring-snapshot` in a browser. It should display a JPEG of your Ring doorbell's current view.

If it returns 503, check that:
1. `.env.local` contains `RING_REFRESH_TOKEN`
2. The dev server was restarted after adding the env var

- [ ] **Step 3: Commit**

```bash
git add pages/api/ring-snapshot.js
git commit -m "feat: add Ring doorbell snapshot API route"
```

---

### Task 3: Update Camera.jsx for multi-camera rendering

**Files:**
- Modify: `screens/Camera.jsx`

**Interfaces:**
- Consumes: `activeCam: 'tapo' | 'ring'` prop from `index.js` (hardcode during this task's testing)
- Produces: renders the correct feed + `← LABEL →` overlay; `● LIVE` or `● 7s` badge

- [ ] **Step 1: Replace `screens/Camera.jsx`**

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';

const CAM_META = {
  tapo: { label: 'BACK PATIO', badge: 'LIVE' },
  ring: { label: 'FRONT DOOR', badge: '7s'   },
};

export default function Camera({ activeCam = 'tapo' }) {
  const [loaded, setLoaded] = useState(false);
  const [key, setKey]       = useState(0);
  const intervalRef         = useRef(null);
  const meta                = CAM_META[activeCam] ?? CAM_META.tapo;

  useEffect(() => {
    setLoaded(false);
    setKey(k => k + 1);
    clearInterval(intervalRef.current);

    if (activeCam === 'ring') {
      intervalRef.current = setInterval(() => setKey(k => k + 1), 7000);
    }

    return () => clearInterval(intervalRef.current);
  }, [activeCam]);

  const handleError = useCallback(() => {
    setLoaded(false);
    setTimeout(() => setKey(k => k + 1), 1000);
  }, []);

  const src = activeCam === 'tapo'
    ? '/api/camera'
    : `/api/ring-snapshot?t=${key}`;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', fontSize: 13, color: '#444', letterSpacing: 3,
        }}>
          CONNECTING...
        </div>
      )}
      <img
        key={key}
        src={src}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }}
        alt=""
      />
      {loaded && (
        <div style={{
          position: 'absolute', top: 8, right: 12,
          fontFamily: 'monospace', fontSize: 11, color: '#f33',
          fontWeight: 700, letterSpacing: 2,
          textShadow: '0 0 6px rgba(255,51,51,0.6)',
        }}>
          ● {meta.badge}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.55)', padding: '6px 0',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontFamily: 'monospace', fontSize: 13, color: '#ccc', letterSpacing: 2,
      }}>
        ← {meta.label} →
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Temporarily hardcode activeCam in index.js to test Ring feed**

In `pages/index.js`, find `<Camera />` and change it to:
```jsx
<Camera activeCam="ring" />
```

Press Escape in the browser. Verify:
- `CONNECTING...` placeholder appears briefly
- Ring JPEG snapshot loads (your front door)
- `● 7s` badge appears top-right
- `← FRONT DOOR →` bar appears at bottom of feed
- Image refreshes automatically every 7 seconds (watch the image update)

- [ ] **Step 3: Test Tapo feed**

Change to `<Camera activeCam="tapo" />`. Press Escape and verify:
- Tapo MJPEG stream loads
- `● LIVE` badge appears top-right
- `← BACK PATIO →` bar appears at bottom

- [ ] **Step 4: Revert hardcoded activeCam**

Change back to `<Camera />` (no prop) — Task 4 wires it up properly.

- [ ] **Step 5: Commit**

```bash
git add screens/Camera.jsx
git commit -m "feat: multi-camera rendering and overlay UI in Camera panel"
```

---

### Task 4: Update index.js for camera cycling

**Files:**
- Modify: `pages/index.js`

**Interfaces:**
- Consumes: `Camera` with `activeCam: 'tapo' | 'ring'` prop (Task 3)
- Produces: Escape enters/exits camera mode; Left/Right cycle `camIndex` when in camera mode; `camIndex` resets to 0 on exit

- [ ] **Step 1: Add CAMERAS array after the PANELS constant**

In `pages/index.js`, directly after the `PANELS` array, add:

```js
const CAMERAS = ['tapo', 'ring'];
```

- [ ] **Step 2: Add camIndex state inside the Home component**

After the existing `useState` calls inside `Home`, add:

```js
const [camIndex, setCamIndex] = useState(0);
```

- [ ] **Step 3: Replace the handleKey function**

Find the `handleKey` function inside the `useEffect` that calls `window.addEventListener('keydown', handleKey)` and replace it entirely:

```js
const handleKey = (e) => {
  if (e.key === CAMERA_KEY) {
    e.preventDefault();
    if (showCamera) {
      setShowCamera(false);
      setCamIndex(0);
      startRotation();
    } else {
      setShowCamera(true);
    }
    return;
  }

  const isRight = e.key === 'ArrowRight' || e.key === 'PageDown';
  const isLeft  = e.key === 'ArrowLeft'  || e.key === 'PageUp';
  if (!isRight && !isLeft) return;

  if (showCamera) {
    if (isRight) setCamIndex(i => (i + 1) % CAMERAS.length);
    if (isLeft)  setCamIndex(i => (i - 1 + CAMERAS.length) % CAMERAS.length);
  } else {
    if (isRight) setPanelIndex(i => (i + 1) % PANELS.length);
    if (isLeft)  setPanelIndex(i => (i - 1 + PANELS.length) % PANELS.length);
    setShowCamera(false);
    resetInactivityTimer();
  }
};
```

- [ ] **Step 4: Pass activeCam to Camera in JSX**

Find `<Camera />` in the JSX return and change it to:

```jsx
<Camera activeCam={CAMERAS[camIndex]} />
```

- [ ] **Step 5: Test the full cycling flow**

With `npm run dev` running at `http://localhost:3000`:

1. Press `Escape` → camera mode opens on Tapo (`← BACK PATIO →`, `● LIVE`)
2. Press `ArrowRight` → switches to Ring (`← FRONT DOOR →`, `● 7s`)
3. Press `ArrowRight` again → wraps back to Tapo
4. Press `ArrowLeft` → switches back to Ring
5. Press `Escape` → exits camera mode, panel rotation resumes
6. Press `Escape` again → re-enters on Tapo (index 0 reset confirmed)
7. Press `ArrowRight` / `ArrowLeft` while NOT in camera mode → cycles panels as before (no camera effect)

- [ ] **Step 6: Commit**

```bash
git add pages/index.js
git commit -m "feat: Left/Right cycles camera feeds in camera mode"
```

---

### Task 5: Deploy to Pi

**Files:**
- Modify: `~/dashy-v2/.env.local` on Pi (via SSH)

- [ ] **Step 1: Copy RING_REFRESH_TOKEN to Pi**

From your local `.env.local`, copy the `RING_REFRESH_TOKEN` value. SSH to the Pi:

```
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
```

On the Pi, append the token (replace `<token>` with the actual value):

```bash
echo "RING_REFRESH_TOKEN=<token>" >> ~/dashy-v2/.env.local
```

Verify it's there:
```bash
grep RING_REFRESH_TOKEN ~/dashy-v2/.env.local
```

Exit SSH.

- [ ] **Step 2: Deploy**

From Windows PowerShell (single quotes prevent `$PATH` expansion):

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm install && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

`npm install` is required here to install `ring-client-api` on the Pi for the first time.

- [ ] **Step 3: Verify on Pi**

Open a browser pointed at `http://192.168.68.62:3000`. Test the full camera cycling flow:
1. Press Escape → Tapo feed with `← BACK PATIO →`
2. Press ArrowRight → Ring feed with `← FRONT DOOR →`
3. Press Escape → returns to rotation

If Ring shows 503, check Pi logs:
```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'tail -20 ~/dashy.log'
```
