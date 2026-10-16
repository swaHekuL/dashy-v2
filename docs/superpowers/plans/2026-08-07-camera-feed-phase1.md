# Camera Feed Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live Tapo C120 camera feed to the Dashy dashboard, toggled by the AMERTEER remote's Down (play/video) button, with Left/Right navigation and 30-second auto-resume.

**Architecture:** A `keydown` listener on `window` handles the RF remote (USB HID keyboard). Left/Right navigate panels; the Down button toggles a `showCamera` boolean that swaps the main panel area to a full-bleed MJPEG feed. Camera persists until explicitly closed — the Down button closes it and immediately restarts rotation. Nav keys also close camera and start the 30-second inactivity timer. The MJPEG stream is proxied from the Tapo C120's RTSP sub-stream via an ffmpeg child process in a Next.js API route.

**Tech Stack:** Next.js 16.2.6 (Pages Router), Node.js `child_process` (ffmpeg), Tapo C120 RTSP

## Global Constraints

- Pages Router only — all pages in `pages/`, API routes in `pages/api/`
- API routes use ESM: `import` only — `require()` throws `ReferenceError` at runtime
- Camera credentials in `.env.local` (gitignored): `CAMERA_IP=192.168.68.200`, `CAMERA_USER`, `CAMERA_PASS`
- Always use sub-stream: RTSP path `/stream2` (~640×360) — never `/stream1` (2K+, too heavy for Pi 3B+)
- ffmpeg hardware decode flag: `-c:v h264_v4l2m2m` — omit if V4L2 unavailable, falls back to software
- Exact keycode for Down button determined via key logger step in Task 3 — placeholder `'CAMERA_KEY_PLACEHOLDER'` until then
- Pi static IP: `192.168.68.62`; Camera static IP: `192.168.68.200`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `pages/index.js` | Modify | keydown listener, `showCamera` state, 30s inactivity/resume timer, camera panel rendering |
| `screens/StatusBar.jsx` | Modify | Add `camera` to `SEGMENT_MAP`, add `'CAMERA'` to `SEGMENTS` array |
| `screens/Camera.jsx` | Create | Full-bleed MJPEG `<img>` + LIVE badge |
| `pages/api/camera.js` | Create | Spawn ffmpeg, pipe MJPEG stdout to response, kill on client disconnect |

---

### Task 1: Remote Navigation + 30-Second Inactivity Timer

**Files:**
- Modify: `pages/index.js`

**Prerequisites:** None. Test with keyboard — no hardware required.

- [ ] **Step 1: Replace `pages/index.js` with the updated version**

Replaces the bare `setInterval` with ref-based rotation that can be paused and resumed, and adds a `keydown` listener for Left/Right panel navigation. Camera toggle is wired in Task 3.

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

- [ ] **Step 2: Verify auto-rotation still works**

```
npm run dev
```

Open the dashboard — panels should still cycle every 10 seconds.

- [ ] **Step 3: Verify keyboard navigation and inactivity timer**

Press `ArrowRight` / `ArrowLeft` on your keyboard. Panel should jump immediately and stop cycling. Wait 30 seconds — cycling should resume on its own.

- [ ] **Step 4: Commit**

```bash
git add pages/index.js
git commit -m "feat: remote navigation with 30s inactivity timer"
```

---

### Task 2: StatusBar CAMERA Segment

**Files:**
- Modify: `screens/StatusBar.jsx`

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

- [ ] **Step 2: Verify in browser**

Status bar should now show 6 segments: WEATHER, CALENDAR, GMAIL, STOCKS, GAS, CAMERA. CAMERA is dark (inactive) on the right end.

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

**Prerequisites (do these before Step 4):**
- RTSP enabled on Tapo C120 via the Tapo app (Settings → Advanced Settings → RTSP)
- Note the RTSP username and password you set
- ffmpeg installed on Pi: `sudo apt-get install -y ffmpeg`

**Key logger — run this before Step 5 to find the Down button's keycode:**

Plug the remote's USB receiver into the Pi. On the Pi's browser console on the dashboard:
```js
window.addEventListener('keydown', e => console.log(e.key, e.code))
```
Press the Down (play/video) button. Note the `e.key` value — use it in Step 5.

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

SSH in and append (substitute real values):

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62
echo 'CAMERA_IP=192.168.68.200' >> ~/dashy-v2/.env.local
echo 'CAMERA_USER=your_rtsp_username' >> ~/dashy-v2/.env.local
echo 'CAMERA_PASS=your_rtsp_password' >> ~/dashy-v2/.env.local
```

- [ ] **Step 4: Verify the RTSP stream reaches the Pi**

```bash
source ~/dashy-v2/.env.local
ffmpeg -c:v h264_v4l2m2m \
  -i "rtsp://${CAMERA_USER}:${CAMERA_PASS}@${CAMERA_IP}/stream2" \
  -f mpjpeg -r 10 -q:v 5 /tmp/test.mjpeg
```

Wait 5 seconds, press Ctrl+C. Expected: frames written to `/tmp/test.mjpeg` without "Connection refused" or auth errors. If `-c:v h264_v4l2m2m` errors with "codec not found", remove that flag and also remove it from `pages/api/camera.js` before deploying.

- [ ] **Step 5: Update `pages/index.js` with `showCamera` state and camera toggle**

Replace `'CAMERA_KEY_PLACEHOLDER'` with the actual `e.key` value from the key logger step (e.g. `'ArrowDown'`, `'F5'`, `'b'`).

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
        setShowCamera(false);
        setPanelIndex(i => (i + 1) % PANELS.length);
        resetInactivityTimer();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setShowCamera(false);
        setPanelIndex(i => (i - 1 + PANELS.length) % PANELS.length);
        resetInactivityTimer();
      } else if (e.key === CAMERA_KEY) {
        if (showCamera) {
          setShowCamera(false);
          startRotation();
        } else {
          setShowCamera(true);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [resetInactivityTimer, startRotation, showCamera]);

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

- [ ] **Step 6: Deploy to Pi**

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

- [ ] **Step 7: Test on the Pi display**

Press the Down (play/video) button on the remote. Expected:
- Camera panel fills the screen with the live MJPEG feed and red "● LIVE" badge
- StatusBar highlights CAMERA
- Press Down again → camera dismisses, returns to the panel it was on
- Press Left/Right while camera is showing → camera dismisses, panel navigates
- Do nothing for 30 seconds while camera is showing → camera auto-dismisses, rotation resumes

- [ ] **Step 8: Commit**

```bash
git add screens/Camera.jsx pages/api/camera.js pages/index.js
git commit -m "feat: live camera feed with remote toggle"
```
