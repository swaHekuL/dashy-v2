# Message to a Claude Code agent: set up the dashy "waiting for you" hook

You're being asked to configure this machine's Claude Code hooks so that
**every** Claude Code session on this machine (any project) notifies a home
dashboard called "dashy" when it finishes responding, and clears that
notification when the user sends their next message. You have no other
context beyond this file — everything you need is below.

Full background: this implements the hook side of the design in
[`2026-09-17-claude-notify-hook-design.md`](superpowers/specs/2026-09-17-claude-notify-hook-design.md)
in the `dashy-v2` repo. You don't need that repo checked out to do this —
this file is self-contained — but it's worth reading if you want the full
rationale (Cloudflare Tunnel, in-memory map, badge UI, etc).

## 0. Get two values from the user before doing anything else

You cannot proceed without these — they come from the dashy-side setup,
which is separate from this machine. **Ask the user directly**, don't guess
or invent placeholders:

- `DASHY_NOTIFY_URL` — the full endpoint URL, e.g.
  `https://notify.example.com/api/claude-notify`
- `DASHY_NOTIFY_TOKEN` — a shared-secret bearer token

If the user doesn't have these yet (dashy side not deployed), stop and tell
them so — there's nothing to configure until both exist. Once you have both,
continue.

Also check what OS/shell this machine actually uses. Everything below
assumes a POSIX shell (`bash`) with `curl` and `jq` available — true for
Linux and macOS. If this machine is Windows without Git Bash/WSL, stop and
ask the user how they want the hook script implemented (e.g. PowerShell)
instead of guessing.

## 1. Check/install prerequisites

Confirm `curl` and `jq` are on PATH (`curl --version`, `jq --version`). If
`jq` is missing, install it with the system's package manager (e.g. `apt
install jq`, `brew install jq`) — ask before installing anything if you're
unsure it's safe to do so on this machine.

## 2. Create the secrets file

`~/.claude/hooks/dashy-notify.env` (create the `~/.claude/hooks/` directory
if it doesn't exist):

```
DASHY_NOTIFY_URL="<the URL the user gave you>"
DASHY_NOTIFY_TOKEN="<the token the user gave you>"
```

Then `chmod 600 ~/.claude/hooks/dashy-notify.env` — this holds a secret, keep
it out of group/world read.

## 3. Create the hook script

`~/.claude/hooks/dashy-notify.sh`, exactly as follows, then `chmod +x` it:

```bash
#!/usr/bin/env bash
# dashy-notify.sh <start|clear>
# Reads a Claude Code hook JSON payload on stdin and notifies dashy.
#
# MUST ALWAYS exit 0. A nonzero exit from a UserPromptSubmit hook blocks
# and erases whatever the user just typed — a network hiccup or a down
# tunnel must never do that. Every failure path here is swallowed silently;
# the only visible effect of a lost notification is a badge that doesn't
# appear or doesn't clear, never a blocked prompt.

set -u
EVENT="${1:-}"
ENV_FILE="$HOME/.claude/hooks/dashy-notify.env"

{
  [ -f "$ENV_FILE" ] && source "$ENV_FILE"

  PAYLOAD="$(cat)"
  SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null)"
  CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty' 2>/dev/null)"
  PROJECT="$(basename "${CWD:-unknown}")"
  MACHINE="$(hostname)"

  if [ -n "${DASHY_NOTIFY_URL:-}" ] && [ -n "${DASHY_NOTIFY_TOKEN:-}" ] && [ -n "$SESSION_ID" ] && [ -n "$EVENT" ]; then
    BODY="$(jq -n --arg event "$EVENT" --arg session_id "$SESSION_ID" \
      --arg machine "$MACHINE" --arg project "$PROJECT" \
      '{event: $event, session_id: $session_id, machine: $machine, project: $project}')"
    curl -s -o /dev/null --max-time 5 \
      -X POST "$DASHY_NOTIFY_URL" \
      -H "Authorization: Bearer $DASHY_NOTIFY_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY"
  fi
} >/dev/null 2>&1

exit 0
```

Do not modify the "always exit 0" behavior — that's a deliberate safety
property, not an oversight.

## 4. Register the hooks in `~/.claude/settings.json`

This file may already exist with other settings/hooks in it — **read it
first and merge**, don't overwrite it. If it doesn't exist, create it with
just the content below.

Add (or merge into existing `hooks.Stop` / `hooks.UserPromptSubmit` arrays
— append, don't replace, if entries are already present for other purposes):

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

Use a JSON-aware merge (e.g. read with `jq`/a script, not blind text
insertion) so you don't corrupt any existing settings.

## 5. Test it

Simulate a `Stop` event:

```bash
echo '{"session_id":"test-123","cwd":"/tmp/test-project"}' | ~/.claude/hooks/dashy-notify.sh start
echo "exit code: $?"   # must print 0
```

Ask the user to check dashy's screen for a badge labeled `<this
machine's hostname> · test-project`. Then clear it:

```bash
echo '{"session_id":"test-123","cwd":"/tmp/test-project"}' | ~/.claude/hooks/dashy-notify.sh clear
echo "exit code: $?"   # must print 0
```

Confirm the badge disappears. If nothing shows up, debug by temporarily
dropping `-o /dev/null` and `-s` from the `curl` call in the script to see
the actual HTTP response — 401 means the token doesn't match what dashy has
configured; a timeout/connection error means the tunnel URL is wrong or
down. Put `-s -o /dev/null` back afterward.

## 6. Report back

Tell the user: what you created (`dashy-notify.env`, `dashy-notify.sh`,
the `settings.json` merge), the test results, and whether the badge
appeared/disappeared as expected. If it didn't, report the actual `curl`
error rather than guessing at a fix.
