# Design: Remote Control + Live Camera Feed + Recording

**Date:** 2026-07-21  
**Status:** Approved

---

## Overview

Three additions to the dashy-v2 Pi dashboard:

1. **Remote control** — AMERTEER RF ring remote (5 buttons, USB nano receiver) lets the user manually navigate panels and toggle a camera feed.
2. **Live camera feed** — Tapo C120 outdoor WiFi camera placed under the back porch, streamed to a dedicated dashboard panel on demand.
3. **Rolling recording + web viewer** — Camera feed recorded to local Pi storage (1-day rolling buffer) and synced to OneDrive for long-term archive. Accessible via a web viewer exposed externally through a Cloudflare Tunnel.

---

## Hardware

| Item | Model | Notes |
|------|-------|-------|
| Remote | AMERTEER RF ring remote | 5 buttons: Left, Right, Top, Bottom, Laser. USB nano receiver acts as HID keyboard. |
| Camera | Tapo C120 | 2K+, wired power, WiFi, RTSP. Placed on surface under back porch (not mounted). |

### Button Mapping

Exact keycodes for Top, Bottom, and Laser must be determined at setup time using a keylogger step (see Hardware Setup below). Left/Right are expected to send `ArrowLeft`/`ArrowRight` or `PageUp`/`PageDown`.

| Button | Action |
|--------|--------|
| Right | Next panel |
| Left | Previous panel |
| Top or Bottom | Toggle camera on/off |
| Laser | Unused |

---

## Panel Navigation & Auto-Rotation Pause

A `keydown` listener on `window` in `pages/index.js` handles remote input. Left/Right (or PageUp/PageDown) advance or retreat `panelIndex`.

**30-second inactivity timer:** Any keypress clears and restarts a 30-second `setTimeout` stored in a `useRef`. While the timer is counting down, the auto-rotation `setInterval` is paused. When the timer fires, auto-rotation resumes from the current `panelIndex`. If camera is active when the timer fires, camera is dismissed first, then rotation resumes.

---

## Camera State

A `showCamera` boolean sits alongside `panelIndex` in state. When `true`:
- The Camera panel renders in place of the normal panel
- Auto-rotation is paused (the 30-second inactivity timer still governs resume)
- The StatusBar shows a `CAMERA` segment
- The MJPEG stream is fetched via `<img src="/api/camera">`

`panelIndex` does not change while camera is visible. Dismissing camera returns to wherever the rotation was.

---

## Live Stream Architecture

```
Tapo C120 (WiFi, local network)
  └─ RTSP /stream2 (640×360, H.264)
       └─ ffmpeg (Pi, hardware decode: h264_v4l2m2m)
            └─ MJPEG multipart stream → stdout
                 └─ /api/camera (Next.js API route, pipes stdout to response)
                      └─ <img src="/api/camera"> in Camera.jsx
```

### FFmpeg Command (live stream)

```
ffmpeg -c:v h264_v4l2m2m \
       -i rtsp://USER:PASS@CAMERA_IP/stream2 \
       -f mpjpeg -q:v 5 -r 10 \
       pipe:1
```

- `-c:v h264_v4l2m2m` — Pi 3B+ hardware H.264 decode (~10–15% CPU)
- `/stream2` — sub-stream (~640×360), sufficient for 800×480 display
- `-r 10` — 10fps
- `-q:v 5` — good JPEG quality (scale 1–31, lower = better)

### API Route: `/api/camera`

- Spawns ffmpeg on request, pipes stdout to HTTP response
- `Content-Type: multipart/x-mixed-replace; boundary=mjpeg`
- Kills ffmpeg process on `req.socket` close (client disconnect)
- Credentials from `process.env`: `CAMERA_IP`, `CAMERA_USER`, `CAMERA_PASS`

---

## Recording Architecture

Recording is **entirely separate from the live stream** — a dedicated systemd service that runs continuously regardless of whether the dashboard is open or the camera panel is active.

```
Tapo C120 RTSP /stream2
  └─ ffmpeg (systemd service: dashy-recorder)
       └─ Segmented MP4 files → ~/recordings/
            ├─ Local rolling buffer (1 day, ~7GB)
            └─ rclone sync (every 15 min) → OneDrive:/dashy-recordings/
```

### FFmpeg Command (recording)

```
ffmpeg -c:v h264_v4l2m2m \
       -i rtsp://USER:PASS@CAMERA_IP/stream2 \
       -c:v copy \
       -f segment \
       -segment_time 600 \
       -segment_format mp4 \
       -strftime 1 \
       ~/recordings/%Y-%m-%d_%H-%M-%S.mp4
```

- `-c:v copy` — stream copy, no re-encode (zero CPU overhead for recording)
- `-segment_time 600` — 10-minute MP4 chunks
- `-strftime 1` — filenames include timestamp: `2026-07-21_14-30-00.mp4`
- Hardware decode still used to reduce network buffering overhead

### Rolling Deletion

A cron job runs every 30 minutes and deletes MP4 files in `~/recordings/` older than 26 hours. This keeps the local buffer at ~1 day and prevents SD card overflow.

```
*/30 * * * * find ~/recordings/ -name "*.mp4" -mmin +1560 -delete
```

(1560 minutes = 26 hours)

### Storage Budget

| Location | Allocation | Coverage |
|----------|-----------|---------|
| Pi SD card (`~/recordings/`) | ~7GB (1 day) | Recent buffer, fast access |
| OneDrive (`dashy-recordings/`) | Limited by quota | Long-term archive |

Sub-stream at ~600kbps ≈ 270MB/hour ≈ 6.5GB/day. SD card has 22GB free; 7GB reserved for recordings leaves 15GB headroom for OS and app.

### rclone Sync

rclone is configured with a OneDrive remote and syncs `~/recordings/` to `OneDrive:/dashy-recordings/` every 15 minutes via cron:

```
*/15 * * * * rclone sync ~/recordings/ onedrive:dashy-recordings/ --min-age 2m
```

`--min-age 2m` skips files still being written by ffmpeg. Completed segments (older than 2 minutes) are synced.

---

## Web Viewer (`/recordings` page)

A new Next.js page at `/recordings` lists and plays back recorded clips.

- `GET /api/recordings` — reads `~/recordings/`, returns sorted list of MP4 filenames with parsed timestamps
- `GET /api/recordings/[file]` — streams the requested MP4 with HTTP range request support (required for browser seek)
- `/recordings` page — lists clips newest-first, plays selected clip in a `<video>` element
- Accessible from any device on the local network at `http://192.168.68.62:3000/recordings`
- Accessible externally via Cloudflare Tunnel (see below)

---

## External Access: Cloudflare Tunnel

`cloudflared` runs as a systemd service on the Pi, creating a persistent tunnel to Cloudflare's edge. No port forwarding required. The entire Next.js app (dashboard + recordings viewer) is exposed at a subdomain (e.g., `dash.yourdomain.com`).

### Components

- `cloudflared` daemon on Pi (systemd service: `cloudflared`)
- Cloudflare Tunnel configured to forward to `localhost:3000`
- DNS CNAME in Cloudflare dashboard pointing subdomain at the tunnel

### Security: Cloudflare Access

Cloudflare Access (free tier) gates the subdomain with an email-based login. Only whitelisted email addresses can reach the app. This prevents public access to the recordings page or live camera.

Policy: allow `lthaws@gmail.com` (and any other trusted emails).

---

## systemd Services (Pi)

Two new services managed by systemd:

| Service | Command | Purpose |
|---------|---------|---------|
| `dashy-recorder` | ffmpeg segment recording | Continuous recording to ~/recordings/ |
| `cloudflared` | cloudflared tunnel run | Cloudflare Tunnel daemon |

Both set to `Restart=always` so they recover from crashes automatically.

---

## Files Changed

### New (Next.js)
- `screens/Camera.jsx` — live camera panel UI
- `pages/api/camera.js` — RTSP→MJPEG live stream proxy
- `pages/recordings.jsx` — recordings web viewer page
- `pages/api/recordings/index.js` — list available MP4 files
- `pages/api/recordings/[file].js` — stream MP4 with range request support

### Modified (Next.js)
- `pages/index.js` — `showCamera` state, `keydown` listener, 30s inactivity/resume logic, camera panel rendering
- `screens/StatusBar.jsx` — add `'camera'` to `SEGMENT_MAP`, add `'CAMERA'` to `SEGMENTS` array
- `.env.local` — add `CAMERA_IP`, `CAMERA_USER`, `CAMERA_PASS`

### New (Pi system config)
- `/etc/systemd/system/dashy-recorder.service` — ffmpeg recording service
- `/etc/systemd/system/cloudflared.service` — Cloudflare Tunnel service (or installed via package)
- `/home/swahekul/.config/rclone/rclone.conf` — rclone OneDrive credentials
- `~/recordings/` — directory for MP4 segments
- Two crontab entries (rolling deletion + rclone sync)

---

## Hardware Setup (One-Time Steps)

### 1. Remote Key Logger

To identify keycodes for Top, Bottom, and Laser buttons:

1. Open the Pi's browser console on the dashboard page.
2. Run: `window.addEventListener('keydown', e => console.log(e.key, e.code))`
3. Press each button and note the output.
4. Update the `keydown` handler in `pages/index.js` with confirmed keycodes.

### 2. Camera Static IP

The Tapo C120's IP is already reserved in the router at `192.168.68.62` — apply the same process for the camera. Set `CAMERA_IP` in `.env.local` to match.

### 3. Enable RTSP on Tapo C120

1. Tapo app → C120 → Settings → Advanced Settings → RTSP
2. Enable RTSP, set username and password
3. Set `CAMERA_USER` and `CAMERA_PASS` in `.env.local`

### 4. Install Dependencies on Pi

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg rclone
```

### 5. Configure rclone OneDrive Remote

```bash
rclone config
```

Follow interactive setup: choose OneDrive, authenticate via browser. Name the remote `onedrive`.

### 6. Configure Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create dashy
cloudflared tunnel route dns dashy dash.yourdomain.com
```

Then create the systemd service and configure Cloudflare Access in the Cloudflare dashboard.

### 7. Verify RTSP stream

```bash
ffmpeg -c:v h264_v4l2m2m -i rtsp://USER:PASS@CAMERA_IP/stream2 -f mpjpeg -r 10 -q:v 5 /tmp/test.mjpeg
```

Watch for a few seconds, Ctrl+C. Frames written without errors = stream working.

---

## Constraints & Notes

- If `h264_v4l2m2m` is unavailable, remove the `-c:v` flag to fall back to software decode (higher CPU, still functional).
- The Tapo C120 requires wired power — plan cable routing to a patio outlet.
- rclone sync uses upload bandwidth continuously; at 600kbps recording rate this is modest but sustained.
- The recordings API route must support HTTP range requests (`Range: bytes=X-Y`) for video seeking to work in browsers.
- Cloudflare Access free tier allows up to 50 users per application — more than sufficient.
- RTSP credentials in `.env.local` are gitignored and must be manually copied to the Pi alongside other secrets.
- The Pi's IP is now statically reserved at `192.168.68.62` in the router.
