# Claude Code "waiting for you" notification — design

## Motivation

Claude Code sessions run on other machines (a work laptop, a remote VM). When
a session finishes a turn and is waiting on the user, there's no ambient way
to notice short of checking the terminal. dashy is already an
always-on, always-visible screen, so it's a natural place to surface "a
Claude session wants your attention" without any polling on the user's part.

## Overview

Two independent pieces joined by a Cloudflare Tunnel:

```
[Other machine]                     [Cloudflare]              [Pi]
Stop hook ────POST start───────────>  notify.<domain>  ───>  localhost:3000
UserPromptSubmit hook ─POST clear──>     (tunnel)              (dashy Next server)
                                                                     |
                                                          in-memory waiting map
                                                                     |
                                                          dashy frontend polls GET
                                                                     |
                                                          badge in Clock corner
```

- A Claude Code `Stop` hook on the other machine fires every time a session
  finishes responding and POSTs a "start waiting" event.
- A Claude Code `UserPromptSubmit` hook on the same machine fires when the
  user sends their next message and POSTs a "clear" event for that session.
- dashy exposes one API route that tracks currently-waiting sessions
  in memory and a small badge in the Clock area displays them.
- Multiple simultaneous sessions (different machines and/or projects) are
  supported — each is tracked independently by `session_id`.

## Transport & security

- The other machine may not be on the home LAN (could be a remote VM), so the
  Pi needs a publicly reachable ingress. Use **Cloudflare Tunnel**
  (`cloudflared`) on the Pi, since a Cloudflare domain is already available —
  no port-forwarding or VPN client needed on the remote end.
- The tunnel's ingress config routes **only** the path `/api/claude-notify`
  on the chosen hostname (e.g. `notify.<domain>`) to `http://localhost:3000`;
  every other path returns 404. The rest of the dashboard is never exposed
  publicly.
- Mutating requests (`POST`) require `Authorization: Bearer <token>`,
  checked against `CLAUDE_NOTIFY_TOKEN` in the Pi's `.env.local`. The token
  is a shared secret generated once and copied to the other machine's hook
  config — it is never committed to git on either side.
- `GET` (status read) is left unauthenticated. It only returns hostnames and
  project directory names for your own sessions — low sensitivity — and
  keeping it open avoids having to ship the secret into dashy's client-side
  JS bundle (which would otherwise let anyone who found the tunnel hostname
  read the token and forge `start` events).

## Hook side (other machine)

Registered globally in `~/.claude/settings.json` under `hooks.Stop` and
`hooks.UserPromptSubmit` — both event types fire on every session with no
tool matcher — pointing at one script invoked with an argument:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": null,
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/dashy-notify.sh start", "timeout": 10 }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": null,
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/dashy-notify.sh clear", "timeout": 10 }
        ]
      }
    ]
  }
}
```

`dashy-notify.sh` reads the hook's stdin JSON:

| Field | Used for |
|---|---|
| `session_id` | Map key — identifies which entry to set/clear |
| `cwd` | Basename becomes the "project" label (e.g. `dashy-v2`) |

`hostname` (shell builtin) supplies the "machine" label — it isn't in the
hook payload.

The script POSTs `{ event, session_id, machine, project }` to
`$DASHY_NOTIFY_URL` with the bearer token, using `curl --max-time 5`.

**Critical constraint:** the script must always `exit 0`, unconditionally.
`UserPromptSubmit` treats a nonzero exit as "block this prompt and erase
what the user typed" — a network hiccup or an unreachable tunnel must never
eat a real message. Failures are swallowed silently; the only user-visible
effect of a lost notification is a badge that doesn't appear or doesn't
clear, never a blocked prompt.

The token is stored in `~/.claude/hooks/dashy-notify.env` (`chmod 600`),
sourced by the script — not inlined into `settings.json`, which may get
synced or shared.

## dashy receive side

**`pages/api/claude-notify.js`** — in-memory `Map<session_id, {machine,
project, since}>`. Acceptable to lose on process restart; this is ephemeral
state, not data worth persisting.

- `POST`: requires the bearer token (401 without it). Body
  `{event: "start", session_id, machine, project}` sets an entry with
  `since: Date.now()`; `{event: "clear", session_id}` deletes it. Every call
  also sweeps entries older than 30 minutes (safety net for a session that's
  killed before its clear-hook fires — e.g. laptop closed, terminal killed).
- `GET`: no auth. Sweeps stale entries, returns
  `{ waiting: [{session_id, machine, project, since}, ...] }`.

**`pages/index.js`** — new `setInterval` (~15s) polling `GET
/api/claude-notify`, stored in state, passed down as a `notifications` prop
alongside the existing `<Clock />` render — same pattern as the existing
per-panel polling already in this file.

**`screens/Clock.jsx`** — gains a `notifications` prop. When non-empty,
renders small absolutely-positioned chips (`position: absolute; top: ...;
left: ...`) in the top-left corner, one per waiting session, labeled
`<machine> · <project>`. Empty array renders nothing — no layout change to
the existing clock display.

## Error handling

- Tunnel or Pi unreachable when a hook fires → `curl` fails, script still
  exits 0, no visible failure. Worst case: a missed or stuck badge, never a
  blocked prompt (see constraint above).
- Session killed before its `clear` fires → auto-dropped by the 30-minute
  sweep on the next `POST` or `GET`.
- Pi restarts (per the existing gotcha that changes need a full reboot to
  apply) → the waiting map resets to empty. Acceptable: worst case is a
  missed badge for whatever was waiting at restart time, not stale data.

## Testing

Manual only, matching how the other panels are verified — no unit test
infra for API routes in this project:

1. Simulate a `Stop` hook locally: `echo '{"session_id":"test-1","cwd":"/tmp/dashy-v2"}' | ~/.claude/hooks/dashy-notify.sh start` — confirm the badge appears on dashy within one poll interval.
2. Simulate the matching `UserPromptSubmit`: `... | dashy-notify.sh clear` with the same `session_id` — confirm the badge disappears.
3. Manually `POST` an entry with a `since` far in the past (via `curl` directly against the API, bypassing the hook) and confirm the next request sweeps it.
4. `POST` without the `Authorization` header and confirm it's rejected with 401.

## Out of scope / future ideas

- No mechanism to manually dismiss a badge from the dashboard itself (no
  touch input assumed) — clearing is hook-driven or timeout-driven only.
- No retry/queueing if the tunnel is briefly down — a missed event is just
  missed.
- Multiple hook-side machines are supported by design (keyed by
  `session_id`), but this spec only sets up **one** machine's hook
  configuration; onboarding additional machines repeats the hook-side setup
  with the same URL/token.
