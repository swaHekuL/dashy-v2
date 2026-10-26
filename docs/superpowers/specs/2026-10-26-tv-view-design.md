# Dashy TV view (bedroom Fire Stick) — design draft

Status: DRAFT for Luke's approval. Written 2026-10-26. No code written yet.

## Goal
Show Dashy on Luke's bedroom Samsung TV (via Fire TV Stick 4K 2nd Gen at 192.168.68.60) as a 1920x1080 "TV view", and have the stick fall back to it after it has been idle.

## Decisions so far
- All current panels shown: weather, calendar, Gmail, portfolio, JKMC (Minecraft), clock, Claude notifications. It is Luke's bedroom TV, so Gmail and portfolio are fine to show.
- Same app, new route: **`/tv`** next to the existing `/` (Pi 800x480 view). The existing `/api/*` routes, fetch intervals and notification hook are reused unchanged, so nothing is duplicated and the Pi view is untouched.

## Layout (to confirm)
- 16:9, designed at 1920x1080, text sized for viewing from a bed (large type, high contrast, dark background).
- Prefer a **multi-panel board** (several panels visible at once) over the Pi's one-panel-every-10-seconds rotation, because a big screen has the room. A fixed grid: clock + weather on one side, calendar and Gmail in the middle, JKMC and portfolio on the other, Claude notifications as a strip.
- Optional later: slow rotation of detail panels in one tile.

## Remote control
Fire TV remote sends arrow keys, Select, Back and Menu. Proposed: Left/Right changes the focused tile, Select expands it, Back returns. Keep the existing key handling (debug overlay combo, chart-range key) working on `/`; `/tv` gets its own small handler.

## Night behaviour
- Dark theme, reduced brightness after a set time (a CSS dim layer; the TV itself is not controllable from the page).
- Idle script on CT 102 can send the stick to Home or sleep at night. To be decided.

## Open questions
1. Grid layout vs. rotating single panel (recommended: grid).
2. Night dimming times.
3. Is Gmail unread preview text okay at TV size, or count only?

## Delivery on the Fire Stick (separate from this repo)
- Browser: Silk is disabled on the stick, so use **Firefox for Fire TV** from the Appstore (verify, then ask Luke before installing) opened fullscreen on `http://192.168.68.62:3000/tv`.
- Idle launcher: a small script on CT 102 polls the stick over adb and launches the browser at the URL after N minutes with no media playing; Home or Back to leave. Fully Kiosk Browser stays a fallback; its Fire TV Stick / Fire OS 8 behavior is unverified and its idle features may be paid.

## Deploy rule
Per project notes: every change needs `git pull && npm run build` on the Pi and then `sudo reboot`. Nothing is committed or pushed without Luke's yes.
