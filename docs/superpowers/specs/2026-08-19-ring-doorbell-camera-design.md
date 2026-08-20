# Ring Doorbell Snapshot + Multi-Camera Cycling

**Date:** 2026-08-19
**Status:** Approved

## Overview

Add a Ring doorbell snapshot panel to the dashboard and upgrade the camera UX so that Left/Right arrows cycle between camera feeds while in camera mode. The Escape key continues to toggle camera mode on/off.

## User Experience

- **Escape** → enter camera mode (opens on Tapo / BACK PATIO by default)
- **Left / Right arrows** → cycle between camera feeds (wraps around)
- **Escape** → exit camera mode, return to rotation
- `camIndex` resets to 0 (Tapo) each time camera mode is entered

### Camera Overlay UI

A semi-transparent dark bar sits at the bottom of the feed, showing the active camera label centered with arrow indicators:

```
← BACK PATIO →
```

The existing `● LIVE` badge (top-right) stays for Tapo. Ring shows `● 7s` to communicate it's a polling snapshot, not a live stream. A `CONNECTING...` placeholder shows for both feeds until the first image loads.

### Camera Labels (hardcoded constants in Camera.jsx)

| Key    | Label        |
|--------|--------------|
| `tapo` | `BACK PATIO` |
| `ring` | `FRONT DOOR` |

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `pages/api/ring-snapshot.js` | New — serves Ring snapshots |
| `screens/Camera.jsx` | Updated — multi-camera rendering + overlay UI |
| `pages/index.js` | Updated — camera cycling key handling |
| `scripts/get-ring-token.mjs` | New — one-time token setup script |
| `.env.local` | Add `RING_REFRESH_TOKEN` |

### Camera Registry (index.js)

```js
const CAMERAS = ['tapo', 'ring'];
```

When `showCamera` is true, Left/Right cycle `camIndex` through `CAMERAS`. `camIndex` resets to `0` on camera mode exit.

### `/api/ring-snapshot.js`

- Module-level `RingApi` singleton initialized with `RING_REFRESH_TOKEN` from env
- Authenticates once on first request; subsequent calls just fetch the snapshot
- On each GET: calls `getDevices()`, grabs first doorbell, fetches snapshot buffer, returns as `image/jpeg`
- Returns 503 if `RING_REFRESH_TOKEN` is missing or fetch fails

### `screens/Camera.jsx`

Props: `activeCam` (`'tapo'` | `'ring'`), `onPrev` (fn), `onNext` (fn)

**Tapo rendering:** unchanged — `<img src="/api/camera">` MJPEG stream

**Ring rendering:** `<img src="/api/ring-snapshot?t={timestamp}">` where timestamp is updated every 7 seconds via `setInterval`; interval clears on unmount or when `activeCam` changes away from `'ring'`

**Shared overlay:** semi-transparent `position: absolute` bar at the bottom of the feed. Content: `← {LABEL} →` centered in monospace. Clicking left/right arrows is not required (keyboard only), but the arrows serve as a visual affordance.

### `pages/index.js`

Add `camIndex` state (default `0`). Modify key handler:

```js
} else if (e.key === CAMERA_KEY) {
  if (showCamera) {
    setShowCamera(false);
    setCamIndex(0);       // reset on exit
    startRotation();
  } else {
    setShowCamera(true);
  }
} else if (showCamera) {
  if (e.key === 'ArrowRight') setCamIndex(i => (i + 1) % CAMERAS.length);
  if (e.key === 'ArrowLeft')  setCamIndex(i => (i - 1 + CAMERAS.length) % CAMERAS.length);
}
```

Pass `activeCam={CAMERAS[camIndex]}` to `<Camera>`.

## Token Setup

### `scripts/get-ring-token.mjs`

One-time script run locally on the dev machine:

1. Prompts for Ring email, password, and 2FA code via stdin
2. Calls `ring-client-api` auth flow to obtain a refresh token
3. Reads existing `.env.local`, appends or replaces `RING_REFRESH_TOKEN=<token>`, writes back
4. Prints confirmation with the token value

The refresh token is long-lived. Re-run only if Ring password changes or access is revoked. After running locally, the token must also be added to `.env.local` on the Pi (copy-paste or re-run the script on the Pi).

## Dependencies

- `ring-client-api` (npm) — Ring cloud auth + snapshot API

## Error Handling

- Ring not configured (`RING_REFRESH_TOKEN` missing): `/api/ring-snapshot` returns 503
- Ring fetch fails (network/cloud error): returns 503; `Camera.jsx` `onError` handler retries after 1s (same as Tapo)
- Tapo unavailable: existing retry behavior unchanged
