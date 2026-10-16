# Remote Control + Camera + Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RF remote panel navigation, a live on-demand camera panel, rolling MP4 recording with OneDrive sync, a recordings web viewer, and external Cloudflare Tunnel access to the dashy-v2 Pi dashboard.

**Architecture:** A browser-side `keydown` listener drives both panel navigation and a 30-second inactivity timer that auto-resumes rotation. The Tapo C120 RTSP sub-stream is used two ways independently: MJPEG via ffmpeg for the live panel (only while the camera panel is active), and stream-copied segmented MP4s via a persistent systemd service for continuous recording. The Next.js app serves both the live feed and the recordings viewer, exposed externally via a Cloudflare Tunnel with an email-gated Access policy.

**Tech Stack:** Next.js 16.2.6 (Pages Router), Node.js `child_process` (ffmpeg), systemd + cron (Pi services), rclone (OneDrive sync), cloudflared (Cloudflare Tunnel)

## Global Constraints

- Pages Router only — all pages in `pages/`, API routes in `pages/api/`
- API routes use ESM: `import` only — `require()` throws `ReferenceError` at runtime
- No `useState(new Date())` — use `useState(null)` + `useEffect` for client-side values
- Camera credentials in `.env.local` (gitignored): `CAMERA_IP`, `CAMERA_USER`, `CAMERA_PASS`
- Pi: Raspberry Pi 3B+, ARM Cortex-A53, 29GB SD (22GB free), Node via nvm at `/home/swahekul/.nvm/versions/node/v20.20.2/bin`
- Always use sub-stream: RTSP path `/stream2` (~640×360) — never `/stream1` (2K+, too heavy)
- ffmpeg hardware decode flag: `-c:v h264_v4l2m2m` — if unavailable, omit the flag (software fallback)
- Recording filenames: `%Y-%m-%d_%H-%M-%S.mp4` (ffmpeg strftime format)
- Recordings directory: `/home/swahekul/recordings/`
- Pi static IP: `192.168.68.62`; SSH key: `~/.ssh/id_ed25519_dashy`; user: `swahekul`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `pages/index.js` | Modify | keydown listener, `showCamera` state, 30s inactivity/resume timer, camera panel rendering |
| `screens/StatusBar.jsx` | Modify | Add `camera` to `SEGMENT_MAP`, add `'CAMERA'` to `SEGMENTS` array |
| `screens/Camera.jsx` | Create | Live camera panel — full-bleed MJPEG img + LIVE badge |
| `pages/api/camera.js` | Create | Spawn ffmpeg, pipe MJPEG stdout to HTTP response, kill on disconnect |
| `pages/recordings.jsx` | Create | Recordings web viewer — file list sidebar + video player |
| `pages/api/recordings/index.js` | Create | Read `~/recordings/`, return sorted JSON array of MP4 metadata |
| `pages/api/recordings/[file].js` | Create | Stream MP4 with HTTP range request support for seeking |

Pi system (not committed to repo):
- `/home/swahekul/dashy-recorder.sh` — wrapper script for ffmpeg recorder
- `/etc/systemd/system/dashy-recorder.service` — systemd unit for continuous recording
- Two crontab entries (rolling deletion + rclone sync)
- rclone OneDrive remote config
- `~/recordings/` directory

---

### Task 1: Remote Navigation + 30-Second Inactivity Timer

**Files:**
- Modify: `pages/index.js`

**Interfaces:**
- Produces: `startRotation()`, `resetInactivityTimer()` — referenced in Task 3 when `showCamera` is added

**Prerequisites:** None. No hardware required — test with keyboard.

- [ ] **Step 1: Replace `pages/index.js` with the updated version below**

This replaces the bare `setInterval` effect with ref-based rotation that can be paused and resumed, and adds a `keydown` listener for Left/Right navigation. The camera toggle key (`CAMERA_KEY`) is a placeholder — it will be filled in during Task 3 after running the key logger on the physical remote.

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import SteamSales from '../screens/SteamSales';
import SteamReleases from '../screens/SteamReleases';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';
import Stocks from '../screens/Stocks';
import GasPrices from '../screens/GasPrices';
import StatusBar from '../screens/StatusBar';

const PANELS = [
  'weather', 'calendar', 'gmail',
  // 'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  // 'steam-sales', 'steam-releases',
  'stocks', 'gas',
];

const PANEL_MS = 10000;
const INACTIVITY_MS = 30000;

const REFRESH_MS = {
  weather:          10 * 60 * 1000,
  calendar:          5 * 60 * 1000,
  gmail:             2 * 60 * 1000,
  'news-world':     15 * 60 * 1000,
  'news-gaming':    15 * 60 * 1000,
  'news-tech':      15 * 60 * 1000,
  'news-sports':    15 * 60 * 1000,
  'news-utah':      15 * 60 * 1000,
  'steam-sales':    60 * 60 * 1000,
  'steam-releases': 60 * 60 * 1000,
  stocks:            5 * 60 * 1000,
  gas:               2 * 60 * 60 * 1000,
};

const NEWS_LABELS = {
  'news-world':  'World News',
  'news-gaming': 'Gaming News',
  'news-tech':   'Tech / AI',
  'news-sports': 'Sports',
  'news-utah':   'Utah News',
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steamData: null, stocks: null, gas: null,
  });
  const rotationRef = useRef(null);
  const resumeTimerRef = useRef(null);

  const fetchPanel = async (panel) => {
    let apiUrl, dataKey;
    if (panel.startsWith('news-')) {
      apiUrl = `/api/news/${panel.slice(5)}`;
      dataKey = panel;
    } else if (panel === 'steam-sales' || panel === 'steam-releases') {
      apiUrl = '/api/steam';
      dataKey = 'steamData';
    } else {
      apiUrl = `/api/${panel}`;
      dataKey = panel;
    }
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [dataKey]: json }));
    } catch (e) {
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  const startRotation = useCallback(() => {
    clearInterval(rotationRef.current);
    rotationRef.current = setInterval(
      () => setPanelIndex(i => (i + 1) % PANELS.length),
      PANEL_MS
    );
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInterval(rotationRef.current);
    rotationRef.current = null;
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(startRotation, INACTIVITY_MS);
  }, [startRotation]);

  useEffect(() => {
    startRotation();
    return () => {
      clearInterval(rotationRef.current);
      clearTimeout(resumeTimerRef.current);
    };
  }, [startRotation]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPanelIndex(i => (i + 1) % PANELS.length);
        resetInactivityTimer();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPanelIndex(i => (i - 1 + PANELS.length) % PANELS.length);
        resetInactivityTimer();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [resetInactivityTimer]);

  const current = PANELS[panelIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Clock />
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {current === 'weather'        && <Weather       data={data.weather}  />}
        {current === 'calendar'       && <Calendar      data={data.calendar} />}
        {current === 'gmail'          && <Gmail         data={data.gmail}    />}
        {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
        {current === 'steam-sales'    && <SteamSales    data={data.steamData} />}
        {current === 'steam-releases' && <SteamReleases data={data.steamData} />}
        {current === 'stocks'         && <Stocks        data={data.stocks}   />}
        {current === 'gas'            && <GasPrices     data={data.gas}      />}
      </div>
      <StatusBar currentPanel={current} />
    </div>
  );
}
```

- [ ] **Step 2: Start dev server and verify auto-rotation still works**

```
npm run dev
```

Open the dashboard. Panels should still cycle every 10 seconds automatically.

- [ ] **Step 3: Verify keyboard navigation and inactivity timer**

With the dashboard open, press `ArrowRight` and `ArrowLeft` on the keyboard. The panel should jump immediately. Auto-rotation should pause. After 30 seconds of no keypresses, rotation should resume.

To confirm the 30s timer is wired: press a key, watch the panel freeze, wait ~30 seconds, confirm cycling resumes on its own.

- [ ] **Step 4: Commit**

```bash
git add pages/index.js
git commit -m "feat: remote navigation with 30s inactivity timer"
```

---

### Task 2: StatusBar CAMERA Segment

**Files:**
- Modify: `screens/StatusBar.jsx`

**Interfaces:**
- Consumes: `currentPanel` prop (string) — now also accepts `'camera'`
- Produces: CAMERA segment highlighted when `currentPanel === 'camera'`

- [ ] **Step 1: Replace `screens/StatusBar.jsx`**

```jsx
const SEGMENT_MAP = {
  weather:          { segment: 'WEATHER' },
  calendar:         { segment: 'CALENDAR' },
  gmail:            { segment: 'GMAIL' },
  'news-world':     { segment: 'NEWS', sub: 'WORLD' },
  'news-gaming':    { segment: 'NEWS', sub: 'GAMING' },
  'news-tech':      { segment: 'NEWS', sub: 'TECH' },
  'news-sports':    { segment: 'NEWS', sub: 'SPORTS' },
  'news-utah':      { segment: 'NEWS', sub: 'UTAH' },
  'steam-sales':    { segment: 'STEAM', sub: 'SALES' },
  'steam-releases': { segment: 'STEAM', sub: 'RELEASES' },
  stocks:           { segment: 'STOCKS' },
  gas:              { segment: 'GAS' },
  camera:           { segment: 'CAMERA' },
};

const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'STOCKS', 'GAS', 'CAMERA'];
// const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'NEWS', 'STEAM', 'STOCKS', 'GAS', 'CAMERA'];

export default function StatusBar({ currentPanel }) {
  const active = SEGMENT_MAP[currentPanel] ?? { segment: 'WEATHER' };

  return (
    <div style={{
      height: '28px',
      background: '#000',
      display: 'flex',
      gap: '4px',
      padding: '4px',
      flexShrink: 0,
      borderTop: '1px solid #1a1a1a',
    }}>
      {SEGMENTS.map(seg => {
        const isActive = active.segment === seg;
        return (
          <div key={seg} style={{
            flex: 1,
            background: isActive ? '#fff' : '#111',
            borderRadius: '2px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '14px',
              fontWeight: 700,
              color: isActive ? '#000' : '#555',
              lineHeight: 1,
            }}>
              {seg}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify CAMERA segment appears**

With the dev server running, open the dashboard. The status bar should now have 6 segments: WEATHER, CALENDAR, GMAIL, STOCKS, GAS, CAMERA. The CAMERA segment sits at the right end and is inactive (dark). WEATHER is still highlighted on load.

- [ ] **Step 3: Commit**

```bash
git add screens/StatusBar.jsx
git commit -m "feat: add CAMERA segment to StatusBar"
```

---

### Task 3: Live Camera Panel + API Route

**Files:**
- Create: `screens/Camera.jsx`
- Create: `pages/api/camera.js`
- Modify: `pages/index.js`

**Interfaces:**
- Consumes: `startRotation()`, `resetInactivityTimer()` from Task 1 (already in `pages/index.js`)
- Consumes: CAMERA StatusBar segment from Task 2

**Prerequisites (hardware):** The Tapo C120 must be:
1. Powered on and connected to WiFi with a static IP reserved in the router
2. RTSP enabled via Tapo app: Settings → Advanced Settings → RTSP → Enable, set username + password
3. `CAMERA_IP`, `CAMERA_USER`, `CAMERA_PASS` added to `.env.local` on the Pi

If the camera isn't set up yet: complete Steps 1–4 (code only), deploy, and run the key logger. Come back for Steps 5–7 once hardware is ready.

**Key logger — do this before writing the camera toggle key into the code:**

Plug the AMERTEER USB receiver into the Pi. On the Pi's browser, open the DevTools console on the dashboard page and run:

```js
window.addEventListener('keydown', e => console.log(e.key, e.code))
```

Press the Top button, Bottom button, and Laser button one at a time. Note the `e.key` value for each. Pick the one you want for the camera toggle and substitute it for `'CAMERA_KEY_PLACEHOLDER'` in Step 4 below.

- [ ] **Step 1: Create `screens/Camera.jsx`**

```jsx
export default function Camera() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <img
        src="/api/camera"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        alt="Live camera feed"
      />
      <div style={{
        position: 'absolute',
        top: 8,
        right: 12,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#f33',
        fontWeight: 700,
        letterSpacing: 2,
        textShadow: '0 0 6px rgba(255,51,51,0.6)',
      }}>
        ● LIVE
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `pages/api/camera.js`**

```js
import { spawn } from 'child_process';

export default function handler(req, res) {
  const { CAMERA_IP, CAMERA_USER, CAMERA_PASS } = process.env;

  if (!CAMERA_IP || !CAMERA_USER || !CAMERA_PASS) {
    res.status(503).end('Camera not configured');
    return;
  }

  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=mjpeg');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'close');

  const rtspUrl = `rtsp://${CAMERA_USER}:${CAMERA_PASS}@${CAMERA_IP}/stream2`;

  const ffmpeg = spawn('ffmpeg', [
    '-c:v', 'h264_v4l2m2m',
    '-i', rtspUrl,
    '-f', 'mpjpeg',
    '-q:v', '5',
    '-r', '10',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  ffmpeg.stdout.pipe(res);
  req.socket.on('close', () => ffmpeg.kill('SIGTERM'));
  ffmpeg.on('exit', () => res.end());
}
```

- [ ] **Step 3: Add camera credentials to `.env.local` on the Pi**

SSH in and append (replace angle-bracket values with your actual Tapo RTSP settings):

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
echo 'CAMERA_IP=192.168.68.XXX' >> ~/dashy-v2/.env.local
echo 'CAMERA_USER=your_rtsp_username' >> ~/dashy-v2/.env.local
echo 'CAMERA_PASS=your_rtsp_password' >> ~/dashy-v2/.env.local
```

- [ ] **Step 4: Replace `pages/index.js` with the camera-integrated version**

Replace `'CAMERA_KEY_PLACEHOLDER'` with the actual key value found from the key logger step above (e.g. `'F5'`, `'MediaPlayPause'`, `'b'`).

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import SteamSales from '../screens/SteamSales';
import SteamReleases from '../screens/SteamReleases';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';
import Stocks from '../screens/Stocks';
import GasPrices from '../screens/GasPrices';
import Camera from '../screens/Camera';
import StatusBar from '../screens/StatusBar';

const PANELS = [
  'weather', 'calendar', 'gmail',
  // 'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  // 'steam-sales', 'steam-releases',
  'stocks', 'gas',
];

const PANEL_MS = 10000;
const INACTIVITY_MS = 30000;
const CAMERA_KEY = 'CAMERA_KEY_PLACEHOLDER';

const REFRESH_MS = {
  weather:          10 * 60 * 1000,
  calendar:          5 * 60 * 1000,
  gmail:             2 * 60 * 1000,
  'news-world':     15 * 60 * 1000,
  'news-gaming':    15 * 60 * 1000,
  'news-tech':      15 * 60 * 1000,
  'news-sports':    15 * 60 * 1000,
  'news-utah':      15 * 60 * 1000,
  'steam-sales':    60 * 60 * 1000,
  'steam-releases': 60 * 60 * 1000,
  stocks:            5 * 60 * 1000,
  gas:               2 * 60 * 60 * 1000,
};

const NEWS_LABELS = {
  'news-world':  'World News',
  'news-gaming': 'Gaming News',
  'news-tech':   'Tech / AI',
  'news-sports': 'Sports',
  'news-utah':   'Utah News',
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steamData: null, stocks: null, gas: null,
  });
  const rotationRef = useRef(null);
  const resumeTimerRef = useRef(null);

  const fetchPanel = async (panel) => {
    let apiUrl, dataKey;
    if (panel.startsWith('news-')) {
      apiUrl = `/api/news/${panel.slice(5)}`;
      dataKey = panel;
    } else if (panel === 'steam-sales' || panel === 'steam-releases') {
      apiUrl = '/api/steam';
      dataKey = 'steamData';
    } else {
      apiUrl = `/api/${panel}`;
      dataKey = panel;
    }
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [dataKey]: json }));
    } catch (e) {
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  const startRotation = useCallback(() => {
    clearInterval(rotationRef.current);
    rotationRef.current = setInterval(
      () => setPanelIndex(i => (i + 1) % PANELS.length),
      PANEL_MS
    );
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInterval(rotationRef.current);
    rotationRef.current = null;
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setShowCamera(false);
      startRotation();
    }, INACTIVITY_MS);
  }, [startRotation]);

  useEffect(() => {
    startRotation();
    return () => {
      clearInterval(rotationRef.current);
      clearTimeout(resumeTimerRef.current);
    };
  }, [startRotation]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setShowCamera(false);
        setPanelIndex(i => (i + 1) % PANELS.length);
        resetInactivityTimer();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setShowCamera(false);
        setPanelIndex(i => (i - 1 + PANELS.length) % PANELS.length);
        resetInactivityTimer();
      } else if (e.key === CAMERA_KEY) {
        setShowCamera(prev => !prev);
        resetInactivityTimer();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [resetInactivityTimer]);

  const current = PANELS[panelIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Clock />
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {showCamera ? (
          <Camera />
        ) : (
          <>
            {current === 'weather'        && <Weather       data={data.weather}  />}
            {current === 'calendar'       && <Calendar      data={data.calendar} />}
            {current === 'gmail'          && <Gmail         data={data.gmail}    />}
            {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
            {current === 'steam-sales'    && <SteamSales    data={data.steamData} />}
            {current === 'steam-releases' && <SteamReleases data={data.steamData} />}
            {current === 'stocks'         && <Stocks        data={data.stocks}   />}
            {current === 'gas'            && <GasPrices     data={data.gas}      />}
          </>
        )}
      </div>
      <StatusBar currentPanel={showCamera ? 'camera' : current} />
    </div>
  );
}
```

- [ ] **Step 5: Verify RTSP stream on Pi before deploying**

SSH in and test ffmpeg can reach the camera:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
source ~/dashy-v2/.env.local
ffmpeg -c:v h264_v4l2m2m \
  -i "rtsp://${CAMERA_USER}:${CAMERA_PASS}@${CAMERA_IP}/stream2" \
  -f mpjpeg -r 10 -q:v 5 /tmp/test.mjpeg
```

Wait 5 seconds, press Ctrl+C. Expected: frames written to `/tmp/test.mjpeg` without "Connection refused" errors. If `h264_v4l2m2m` errors, retry without `-c:v h264_v4l2m2m` and also remove that flag from `pages/api/camera.js`.

- [ ] **Step 6: Deploy to Pi and test camera panel**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

On the Pi display, press the camera toggle button. Expected:
- Camera panel fills the screen with MJPEG feed and red "● LIVE" badge
- StatusBar highlights CAMERA segment
- Press the toggle again → camera dismisses, returns to the panel it was on
- Do nothing for 30 seconds while camera is active → camera auto-dismisses, rotation resumes

- [ ] **Step 7: Commit**

```bash
git add screens/Camera.jsx pages/api/camera.js pages/index.js
git commit -m "feat: live camera panel with MJPEG stream and remote toggle"
```

---

### Task 4: Recordings API Routes

**Files:**
- Create: `pages/api/recordings/index.js`
- Create: `pages/api/recordings/[file].js`

**Interfaces:**
- Produces: `GET /api/recordings` → `Array<{ name: string, size: number, mtime: string }>` sorted newest-first
- Produces: `GET /api/recordings/<name>.mp4` → MP4 stream with range request support (HTTP 200 or 206)

**Prerequisites:** None for writing. For testing, create a dummy recordings directory locally.

- [ ] **Step 1: Create `pages/api/recordings/index.js`**

```js
import fs from 'fs';
import path from 'path';

const RECORDINGS_DIR = path.join(process.env.HOME ?? '/home/swahekul', 'recordings');

export default function handler(req, res) {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    return res.status(200).json([]);
  }

  const files = fs.readdirSync(RECORDINGS_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => {
      const stat = fs.statSync(path.join(RECORDINGS_DIR, f));
      return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

  res.status(200).json(files);
}
```

- [ ] **Step 2: Create `pages/api/recordings/[file].js`**

```js
import fs from 'fs';
import path from 'path';

const RECORDINGS_DIR = path.join(process.env.HOME ?? '/home/swahekul', 'recordings');

export default function handler(req, res) {
  const { file } = req.query;
  const safeName = path.basename(String(file));

  if (!safeName.endsWith('.mp4')) {
    return res.status(400).end();
  }

  const filePath = path.join(RECORDINGS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).end();
  }

  const { size } = fs.statSync(filePath);
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': size,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
```

- [ ] **Step 3: Create a dummy MP4 for local testing**

Only needed locally. Skip if you don't have ffmpeg installed locally — test on the Pi instead (Task 6 Step 5).

```bash
mkdir -p ~/recordings
ffmpeg -f lavfi -i color=c=black:s=640x360:d=5 -c:v libx264 ~/recordings/2026-07-21_12-00-00.mp4
```

- [ ] **Step 4: Test the list endpoint**

Start dev server locally:

```bash
npm run dev
```

Then in a separate terminal:

```bash
curl http://localhost:3000/api/recordings
```

Expected response (array with one entry if dummy file exists):

```json
[{"name":"2026-07-21_12-00-00.mp4","size":12345,"mtime":"2026-07-21T12:00:00.000Z"}]
```

If `~/recordings/` doesn't exist locally: expected `[]`.

- [ ] **Step 5: Test the stream endpoint with range request**

```bash
curl -H "Range: bytes=0-1023" http://localhost:3000/api/recordings/2026-07-21_12-00-00.mp4 -v 2>&1 | grep -E "< HTTP|< Content"
```

Expected output includes:
```
< HTTP/1.1 206 Partial Content
< Content-Range: bytes 0-1023/12345
< Content-Type: video/mp4
```

- [ ] **Step 6: Commit**

```bash
git add pages/api/recordings/
git commit -m "feat: recordings list and MP4 streaming API with range request support"
```

---

### Task 5: Recordings Web Viewer Page

**Files:**
- Create: `pages/recordings.jsx`

**Interfaces:**
- Consumes: `GET /api/recordings` → `Array<{name, size, mtime}>` (Task 4)
- Consumes: `GET /api/recordings/<name>.mp4` via `<video src>` (Task 4)

- [ ] **Step 1: Create `pages/recordings.jsx`**

```jsx
import { useState, useEffect } from 'react';

function formatDate(isoStr) {
  return new Date(isoStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Recordings() {
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('/api/recordings')
      .then(r => r.json())
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#0a0a0a',
      color: '#ccc',
      fontFamily: 'monospace',
    }}>
      <div style={{
        width: 260,
        borderRight: '1px solid #1a1a1a',
        overflow: 'auto',
        padding: '12px 8px',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, color: '#444', letterSpacing: 3, marginBottom: 12, paddingLeft: 4 }}>
          RECORDINGS
        </div>

        {files === null && (
          <div style={{ color: '#333', fontSize: 12, paddingLeft: 4 }}>Loading…</div>
        )}
        {files !== null && files.length === 0 && (
          <div style={{ color: '#333', fontSize: 12, paddingLeft: 4 }}>No recordings yet</div>
        )}
        {(files ?? []).map(f => (
          <div
            key={f.name}
            onClick={() => setSelected(f.name)}
            style={{
              padding: '7px 10px',
              marginBottom: 2,
              borderRadius: 3,
              cursor: 'pointer',
              background: selected === f.name ? '#181818' : 'transparent',
              borderLeft: selected === f.name ? '2px solid #555' : '2px solid transparent',
            }}
          >
            <div style={{ fontSize: 12, color: selected === f.name ? '#fff' : '#888' }}>
              {formatDate(f.mtime)}
            </div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
              {formatSize(f.size)}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        {selected ? (
          <video
            key={selected}
            src={`/api/recordings/${selected}`}
            controls
            autoPlay
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 4, outline: 'none' }}
          />
        ) : (
          <div style={{ color: '#222', fontSize: 13 }}>Select a clip to play</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

With dev server running, open `http://localhost:3000/recordings`.

Expected:
- Left panel shows "RECORDINGS" header and lists any clips in `~/recordings/` newest-first (or "No recordings yet" if empty)
- Clicking a clip loads it in the right panel and begins playback
- Scrubbing the video timeline works (confirms range requests are working)

- [ ] **Step 3: Commit**

```bash
git add pages/recordings.jsx
git commit -m "feat: recordings web viewer page with clip list and video player"
```

---

### Task 6: Pi Recording Service + Rolling Deletion + rclone Sync

**System files (on Pi — not committed to repo):**
- `/home/swahekul/dashy-recorder.sh`
- `/etc/systemd/system/dashy-recorder.service`
- Two crontab entries

**Prerequisites:** Camera credentials in `.env.local`, ffmpeg and rclone installed, `~/recordings/` directory created.

- [ ] **Step 1: Install ffmpeg and rclone on Pi**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 \
  'sudo apt-get update && sudo apt-get install -y ffmpeg rclone'
```

- [ ] **Step 2: Create recordings directory**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'mkdir -p ~/recordings'
```

- [ ] **Step 3: Configure rclone OneDrive remote**

SSH into the Pi interactively (rclone config is interactive and needs a browser):

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
rclone config
```

Follow the prompts:
1. Type `n` → new remote
2. Name: `onedrive`
3. Storage type: type `onedrive` and press Enter
4. Leave client_id and client_secret blank (press Enter twice)
5. Edit advanced config: `n`
6. Use auto config: `y` — rclone prints a URL, open it in your browser, sign in to Microsoft, authorize
7. Choose account type: `1` (OneDrive Personal or Business as appropriate)
8. Confirm the displayed config with `y`
9. Quit config with `q`

Verify the remote works:

```bash
rclone lsd onedrive: --max-depth 1
```

Expected: lists your OneDrive root folders without error.

- [ ] **Step 4: Create the recorder wrapper script**

Using a wrapper script avoids systemd escaping issues with environment variables and strftime `%` characters.

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'cat > ~/dashy-recorder.sh << '"'"'SCRIPT'"'"'
#!/bin/bash
set -a
source /home/swahekul/dashy-v2/.env.local
set +a

exec /usr/bin/ffmpeg \
  -c:v h264_v4l2m2m \
  -i "rtsp://${CAMERA_USER}:${CAMERA_PASS}@${CAMERA_IP}/stream2" \
  -c:v copy \
  -f segment \
  -segment_time 600 \
  -segment_format mp4 \
  -strftime 1 \
  "/home/swahekul/recordings/%Y-%m-%d_%H-%M-%S.mp4"
SCRIPT
chmod +x ~/dashy-recorder.sh'
```

- [ ] **Step 5: Create the systemd service**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'sudo tee /etc/systemd/system/dashy-recorder.service > /dev/null << EOF
[Unit]
Description=Dashy Camera Recorder
After=network-online.target
Wants=network-online.target

[Service]
User=swahekul
Restart=always
RestartSec=10
ExecStart=/home/swahekul/dashy-recorder.sh

[Install]
WantedBy=multi-user.target
EOF'
```

- [ ] **Step 6: Enable and start the recorder**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 \
  'sudo systemctl daemon-reload && \
   sudo systemctl enable dashy-recorder && \
   sudo systemctl start dashy-recorder'
```

Check it started:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'sudo systemctl status dashy-recorder'
```

Expected: `Active: active (running)`. After 60 seconds:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'ls -lh ~/recordings/'
```

Expected: at least one `.mp4` file growing in size.

- [ ] **Step 7: Add cron jobs for rolling deletion and rclone sync**

SSH in interactively:

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
crontab -e
```

Add these two lines at the bottom (choose `nano` if prompted for an editor):

```
*/30 * * * * find /home/swahekul/recordings/ -name "*.mp4" -mmin +1560 -delete
*/15 * * * * /usr/bin/rclone sync /home/swahekul/recordings/ onedrive:dashy-recordings/ --min-age 2m
```

Save and exit. Verify:

```bash
crontab -l
```

Both lines should appear.

- [ ] **Step 8: Manually test rclone sync**

Wait for at least one completed 10-minute segment (file not actively being written). Then:

```bash
/usr/bin/rclone sync ~/recordings/ onedrive:dashy-recordings/ --min-age 2m -v
```

Expected: at least one file transferred. Open OneDrive in a browser and confirm `dashy-recordings/` folder contains MP4 files.

- [ ] **Step 9: Deploy app so Pi's /recordings page can see the files**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

Open `http://192.168.68.62:3000/recordings` from your phone (on the same WiFi). Expected: recordings list populated, clips playable.

---

### Task 7: Cloudflare Tunnel + Access

**Prerequisites:**
- Cloudflare account with a domain whose DNS is managed by Cloudflare
- Next.js app running on Pi at port 3000
- `cloudflared` package installed

- [ ] **Step 1: Install cloudflared on Pi**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 \
  'curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null && \
   echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" | \
   sudo tee /etc/apt/sources.list.d/cloudflared.list && \
   sudo apt-get update && sudo apt-get install -y cloudflared'
```

- [ ] **Step 2: Authenticate cloudflared (interactive — needs browser)**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
cloudflared tunnel login
```

A URL is printed. Open it in your browser, select your domain, authorize. A cert file is saved to `~/.cloudflared/cert.pem` on the Pi.

- [ ] **Step 3: Create the tunnel**

```bash
cloudflared tunnel create dashy
```

Output includes a tunnel UUID like `abc123de-...`. Note it — you need it in Step 4.

- [ ] **Step 4: Create tunnel config file**

Replace `<TUNNEL-UUID>` with the UUID from Step 3 and `yourdomain.com` with your actual domain:

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: <TUNNEL-UUID>
credentials-file: /home/swahekul/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: dash.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

- [ ] **Step 5: Create DNS record**

```bash
cloudflared tunnel route dns dashy dash.yourdomain.com
```

Expected: `Added CNAME dash.yourdomain.com which will route to this tunnel`

- [ ] **Step 6: Install cloudflared as systemd service**

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

Expected: `Active: active (running)`.

- [ ] **Step 7: Test tunnel from outside home network**

On your phone with WiFi turned off (mobile data only), open `https://dash.yourdomain.com`. Expected: the dashboard loads over HTTPS.

- [ ] **Step 8: Configure Cloudflare Access to gate the subdomain**

In your browser, go to the Cloudflare dashboard:

1. **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Fill in:
   - Application name: `Dashy`
   - Session duration: `24 hours`
   - Application domain: `dash` + your domain (e.g. `dash.yourdomain.com`)
3. Click **Next** → **Add a policy**:
   - Policy name: `Owner`
   - Action: `Allow`
   - Configure rules: **Include** → **Emails** → `lthaws@gmail.com`
4. Save the policy, then save the application.

- [ ] **Step 9: Verify Access gate**

Open `https://dash.yourdomain.com` in an incognito browser window. Expected: Cloudflare Access login page appears (not the dashboard). Enter `lthaws@gmail.com`, receive a one-time code by email, enter the code. Expected: dashboard loads.

---

## Post-Implementation Checklist

- [ ] Remote Left/Right navigates panels; auto-rotation pauses on keypress
- [ ] Auto-rotation resumes after 30 seconds of no input
- [ ] Camera toggle key shows live feed; StatusBar highlights CAMERA
- [ ] Left/Right while camera is visible dismisses camera and navigates
- [ ] Camera auto-dismisses and rotation resumes after 30s inactivity
- [ ] `GET /api/camera` returns MJPEG stream; `<img>` in browser shows live feed
- [ ] `GET /api/recordings` returns JSON array of MP4 metadata
- [ ] `GET /api/recordings/<file>.mp4` with `Range: bytes=0-1023` returns HTTP 206
- [ ] `/recordings` page lists clips and plays them with working seek
- [ ] `dashy-recorder` systemd service is active and writing MP4 files
- [ ] `ls ~/recordings/` shows 10-minute segments accumulating
- [ ] Rolling deletion cron removes segments older than 26 hours
- [ ] rclone sync uploads completed segments to `onedrive:dashy-recordings/`
- [ ] `cloudflared` systemd service is active
- [ ] Dashboard reachable at `https://dash.yourdomain.com` on mobile data
- [ ] Cloudflare Access requires email login before showing the dashboard
