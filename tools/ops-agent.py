#!/usr/bin/env python3
"""Status snapshot of the Claude sessions and a few services on this container (CT 102).

Dashy's Ops panel fetches this over the LAN. Read-only, stdlib only, no secrets.
  ops-agent.py            print the snapshot once
  ops-agent.py --serve    serve it at http://0.0.0.0:8788/ (cached 3 s)

A session is one `claude --print --sdk-url .../cse_...` worker. Its transcript is found through the
worker's open fd (/tmp/claude-UID/<encoded cwd>/<session uuid>/tasks), and the last transcript
record plus the worker's child processes decide the state:
  working  a tool is running (child process), or the transcript changed in the last few seconds
  blocked  the last record is a tool call with no result, nothing is running, and it has sat
           for a while: the session is waiting for a permission answer
  review   the last record is the assistant finishing a turn (it is waiting for you)
  idle     nothing recent
Each session also carries a title (see session_title).
"""
import json, os, re, subprocess, sys, time, urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOME = os.path.expanduser("~")
TRANSCRIPTS = f"{HOME}/.claude/projects"
UID = os.getuid()
PORT = 8788
WORKING_SEC = 8          # transcript touched this recently = busy
BLOCKED_SEC = 20         # pending tool call untouched this long, no children = waiting on permission
REVIEW_MIN = 30          # finished turns older than this count as idle (no tile)
CACHE_SEC = 3


def proc_table():
    """pid -> (ppid, cmdline) and ppid -> [pids]."""
    procs, kids = {}, {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            stat = open(f"/proc/{d}/stat").read()
            ppid = int(stat[stat.rindex(")") + 2:].split()[1])
            cmd = open(f"/proc/{d}/cmdline", "rb").read().replace(b"\0", b" ").decode(errors="replace")
        except OSError:
            continue
        procs[int(d)] = (ppid, cmd)
        kids.setdefault(ppid, []).append(int(d))
    return procs, kids


def has_children(pid, kids):
    return bool(kids.get(pid))


def last_record(path):
    """Last user/assistant record of a transcript, reading only the tail."""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            f.seek(max(0, size - 200_000))
            lines = f.read().decode(errors="replace").splitlines()
    except OSError:
        return None
    for line in reversed(lines):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") in ("user", "assistant"):
            return d
    return None


TITLES = f"{HOME}/.local/state/ops-agent/titles.json"
CRED = f"{HOME}/.claude/.credentials.json"
CLAUDE_JSON = f"{HOME}/.claude.json"
API_URL = "https://api.anthropic.com/v1/code/sessions?limit=100"
API_EVERY = 20           # seconds between calls to the sessions API
BLOCKED_DAYS = 2         # an app-flagged "needs you" older than this stops getting a tile


def load_titles():
    """cse_ id suffix -> the session's title as the Claude app shows it. The titles live on
    Anthropic's side (sessions API), not on this machine; the file is refreshed from there and is
    kept out of the repo because titles can be personal. Missing file or id = no title."""
    try:
        return json.load(open(TITLES))
    except (OSError, ValueError):
        return {}


_api = {"at": 0, "rows": {}}


def api_sessions():
    """cse_ id suffix -> {title, bucket, updated} from the same sessions list Claude Code itself
    reads (GET /v1/code/sessions, the list behind the app). Uses the login Claude Code keeps in
    ~/.claude/.credentials.json, read here only to send this one request; it is never logged or
    stored. Cached for API_EVERY seconds; on any failure the last good answer stays (and the
    titles file below keeps names across restarts)."""
    now = time.time()
    if now - _api["at"] < API_EVERY:
        return _api["rows"]
    _api["at"] = now
    try:
        cred = json.load(open(CRED))["claudeAiOauth"]
        if cred["expiresAt"] / 1000 < now:
            return _api["rows"]          # Claude Code refreshes the token itself while a session runs
        org = (json.load(open(CLAUDE_JSON)).get("oauthAccount") or {}).get("organizationUuid", "")
        req = urllib.request.Request(API_URL, headers={
            "Authorization": "Bearer " + cred["accessToken"],
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "ccr-byoc-2025-07-29",
            "x-organization-uuid": org,
        })
        data = json.load(urllib.request.urlopen(req, timeout=8))["data"]
    except Exception as e:               # never include the exception text: it could echo a header
        print(f"sessions api failed: {type(e).__name__}", file=sys.stderr)
        return _api["rows"]
    rows = {}
    for r in data:
        sid = str(r.get("id", ""))
        if sid.startswith("cse_") and r.get("title"):
            rows[sid[4:]] = {"title": r["title"], "bucket": r.get("status_bucket"), "updated": r.get("updated_at")}
    _api["rows"] = rows
    try:                                 # keep names for the next restart / token expiry
        tmp = TITLES + ".tmp"
        os.makedirs(os.path.dirname(TITLES), exist_ok=True)
        json.dump({k: v["title"] for k, v in rows.items()}, open(tmp, "w"))
        os.chmod(tmp, 0o600)
        os.replace(tmp, TITLES)
    except OSError:
        pass
    return rows


def age_of(iso):
    try:
        return time.time() - datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 1e9


def merge_state(local, row):
    """The app's own status wins where it knows more: it flags sessions waiting for your reply."""
    if local == "working":
        return "working"
    bucket = (row or {}).get("bucket")
    age = age_of(row["updated"]) if row else 1e9
    if bucket == "blocked" and age < BLOCKED_DAYS * 86400:
        return "blocked"
    if bucket == "failed" and age < 86400:
        return "failed"
    if local == "blocked":
        return "blocked"
    if bucket == "working":
        return "working"
    if local == "review" or (bucket == "review_ready" and age < REVIEW_MIN * 60):
        return "review"
    return "idle"


def session_title(pid, cse, titles, project):
    """Title from the app, else a real name set locally ("<folder>-xx" placeholders do not count),
    else the folder name."""
    if titles.get(cse):
        return titles[cse]
    try:
        meta = json.load(open(f"{HOME}/.claude/sessions/{pid}.json"))
    except (OSError, ValueError):
        meta = {}
    if meta.get("name") and meta.get("nameSource") != "derived":
        return meta["name"]
    return project


def classify(rec, age, children):
    if rec is None:
        return "idle"
    content = (rec.get("message") or {}).get("content")
    kinds = [c.get("type") for c in content if isinstance(c, dict)] if isinstance(content, list) else ["text"]
    if children or age < WORKING_SEC:
        return "working"
    if rec["type"] == "assistant":
        if "tool_use" in kinds:
            return "blocked" if age >= BLOCKED_SEC and age < 6 * 3600 else "idle"
        return "review" if age < REVIEW_MIN * 60 else "idle"
    # last record is a user prompt or a tool result: the model should be working on it
    return "working" if age < 300 else "idle"


def sessions():
    procs, kids = proc_table()
    titles = load_titles()
    api = api_sessions()
    out, now = [], time.time()
    for pid, (_, cmd) in procs.items():
        if "--sdk-url" not in cmd or "/code/sessions/cse_" not in cmd:
            continue
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
            fds = [os.readlink(f"/proc/{pid}/fd/{n}") for n in os.listdir(f"/proc/{pid}/fd")]
        except OSError:
            continue
        m = None
        for t in fds:
            m = re.match(rf"/tmp/claude-{UID}/([^/]+)/([0-9a-f-]{{36}})/tasks$", t)
            if m:
                break
        if not m:
            continue
        enc, sid = m.groups()
        path = f"{TRANSCRIPTS}/{enc}/{sid}.jsonl"
        try:
            age = now - os.path.getmtime(path)
        except OSError:
            continue
        cse = re.search(r"/code/sessions/cse_(\w+)", cmd).group(1)
        row = api.get(cse)
        state = merge_state(classify(last_record(path), age, has_children(pid, kids)), row)
        project = os.path.basename(cwd)
        title = row["title"] if row else session_title(pid, cse, titles, project)
        out.append({"project": project, "title": title, "state": state, "ageSec": int(age)})
    order = {"blocked": 0, "working": 1, "review": 2, "idle": 3}
    out.sort(key=lambda s: (order[s["state"]], s["ageSec"]))
    return out


def unit_active(unit):
    try:
        return subprocess.run(["systemctl", "is-active", unit], capture_output=True, text=True, timeout=3).stdout.strip() == "active"
    except Exception:
        return False


def services(procs):
    svc = []
    svc.append({"name": "syncthing", "state": "ok" if unit_active("syncthing@claude") else "down", "note": None})
    ts = any("tailscaled" in c for _, c in procs.values())
    svc.append({"name": "tailscale", "state": "ok" if ts else "down", "note": None})
    try:
        lines = open(f"{HOME}/.local/state/health/status").read().splitlines()
        stale = time.time() - int(lines[0].split("=")[1]) > 900
        problems = [l for l in lines[1:] if l.strip() and l.strip() != "OK"]
    except (OSError, ValueError, IndexError):
        stale, problems = True, []
    if stale:
        svc.append({"name": "health", "state": "warn", "note": "check stale"})
    elif problems:
        svc.append({"name": "health", "state": "warn", "note": problems[0][:24]})
    else:
        svc.append({"name": "health", "state": "ok", "note": None})
    return svc


_cache = (0, None)


def snapshot():
    global _cache
    if time.time() - _cache[0] < CACHE_SEC and _cache[1]:
        return _cache[1]
    procs, _ = proc_table()
    snap = {"at": int(time.time() * 1000), "sessions": sessions(), "services": services(procs)}
    _cache = (time.time(), snap)
    return snap


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(snapshot()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    if "--serve" in sys.argv:
        ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    else:
        print(json.dumps(snapshot(), indent=1))
