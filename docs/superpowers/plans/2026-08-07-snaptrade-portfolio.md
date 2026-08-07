# SnapTrade Portfolio Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Portfolio panel showing each connected Fidelity account as a distinct card with total value and daily P&L ($ and %), powered by SnapTrade.

**Architecture:** A one-time setup script SSHes to the Pi to read credentials in-memory, registers a SnapTrade user, and writes the resulting `userSecret` back to the Pi — no tokens ever touch the local filesystem. The `/api/portfolio` route uses the SnapTrade SDK to fetch per-account holdings and balances, computes total value, and tracks a daily in-memory baseline for P&L. The Portfolio screen renders each account as a card matching the Stocks panel aesthetic.

**Tech Stack:** `snaptrade-typescript-sdk` (used in plain JS), Node.js `child_process.execSync` (SSH in setup script), Next.js API routes, React with inline styles.

## Global Constraints

- Next.js 16.2.6 with Turbopack; plain `.js`/`.jsx` only — no TypeScript files in the app
- All API routes use ESM: `import` only, never `require()`
- Target display: 800×480, Pi 3B+
- No test framework in this project — verification steps are manual browser/terminal checks
- SSH key: `~/.ssh/id_ed25519_dashy`, Pi host: `swahekul@192.168.68.62`
- Credentials live on Pi only: never write SnapTrade tokens to any local file
- Pi deploy requires `npm install` in addition to `npm run build` (new dependency)
- If changes don't appear after deploy, do a full `sudo reboot` on the Pi

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `scripts/setup-snaptrade.mjs` | One-time setup: SSH to Pi, register SnapTrade user, write userSecret back, print OAuth URL |
| Create | `pages/api/portfolio.js` | Fetch accounts + per-account holdings from SnapTrade, compute totalValue, daily P&L baseline, 1h cache |
| Create | `screens/Portfolio.jsx` | Render account card grid with value and daily P&L |
| Modify | `pages/index.js` | Add `'portfolio'` to PANELS, REFRESH_MS, state, render |
| Modify | `screens/StatusBar.jsx` | Add `portfolio` to SEGMENT_MAP, `PORTFOLIO` to SEGMENTS |

---

### Task 1: Install dependency and verify SDK shape

**Files:**
- Modify: `package.json` (via npm install)

**Interfaces:**
- Produces: `Snaptrade` class importable from `snaptrade-typescript-sdk` in Tasks 2 and 3

- [ ] **Step 1: Install the SDK**

```powershell
npm install snaptrade-typescript-sdk
```

- [ ] **Step 2: Verify SDK method names**

```powershell
node --input-type=module --eval "import { Snaptrade } from 'snaptrade-typescript-sdk'; const c = new Snaptrade({ clientId: 'x', consumerKey: 'x' }); console.log(Object.keys(c.accountInformation)); console.log(Object.keys(c.authentication));"
```

You need to confirm the exact method names before writing Tasks 2 and 3. Expected (verify these match what you see):
- `c.authentication` has: `registerSnapTradeUser`, `loginSnapTradeUser`
- `c.accountInformation` has: `listUserAccounts`, `getAccountHoldings`

If the names differ from above, use the actual names from this output throughout Tasks 2 and 3.

- [ ] **Step 3: Check the holdings response shape**

```powershell
node --input-type=module --eval "import pkg from 'snaptrade-typescript-sdk/dist/api/account-information-api.js'; console.log(Object.keys(pkg));" 2>$null
```

Or simply read the type definition for `getAccountHoldings` to confirm the response has `positions` (with `price` and `units`) and `balances` (with `cash`):

```powershell
Select-String -Path "node_modules\snaptrade-typescript-sdk\dist\*.d.ts" -Pattern "getAccountHoldings" | Select-Object -First 5
```

Note the field names. If `positions` items use different names (e.g., `marketPrice` instead of `price`, `quantity` instead of `units`), update Task 3 accordingly.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json
git commit -m "feat: add snaptrade-typescript-sdk dependency"
```

---

### Task 2: Write the one-time setup script

**Files:**
- Create: `scripts/setup-snaptrade.mjs`

**Interfaces:**
- Consumes: `Snaptrade` from `snaptrade-typescript-sdk`; `execSync` from `child_process`; `os.homedir()` for SSH key path; Pi's `.env.local` for client credentials
- Produces: `SNAPTRADE_USER_ID=dashy` and `SNAPTRADE_USER_SECRET=...` appended to Pi's `~/dashy-v2/.env.local`; OAuth URL printed to stdout for manual browser visit

- [ ] **Step 1: Create the scripts directory**

```powershell
New-Item -ItemType Directory -Force scripts
```

- [ ] **Step 2: Write the setup script**

Create `scripts/setup-snaptrade.mjs`:

```js
import { execSync } from 'child_process';
import os from 'os';
import { Snaptrade } from 'snaptrade-typescript-sdk';

const SSH_HOST = 'swahekul@192.168.68.62';
const SSH_KEY = `${os.homedir()}/.ssh/id_ed25519_dashy`;
const ENV_PATH = '~/dashy-v2/.env.local';

function ssh(cmd) {
  return execSync(`ssh -i "${SSH_KEY}" ${SSH_HOST} "${cmd}"`, { encoding: 'utf8' });
}

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

console.log('Reading credentials from Pi...');
const envRaw = ssh(`cat ${ENV_PATH}`);
const env = parseEnv(envRaw);

const clientId = env['SNAPTRADE_CLIENT_ID'];
const consumerKey = env['SNAPTRADE_CONSUMER_KEY'];

if (!clientId || !consumerKey) {
  console.error('ERROR: SNAPTRADE_CLIENT_ID or SNAPTRADE_CONSUMER_KEY not found in Pi .env.local');
  console.error('Run Phase 1 first: SSH the keys onto the Pi manually.');
  process.exit(1);
}

const client = new Snaptrade({ clientId, consumerKey });

let userSecret = env['SNAPTRADE_USER_SECRET'];

if (userSecret) {
  console.log('SNAPTRADE_USER_SECRET already exists on Pi — skipping registration.');
} else {
  console.log('Registering SnapTrade user "dashy"...');
  const res = await client.authentication.registerSnapTradeUser({ userId: 'dashy' });
  userSecret = res.data.userSecret;

  console.log('Writing userSecret to Pi .env.local...');
  ssh(`echo 'SNAPTRADE_USER_ID=dashy' >> ${ENV_PATH}`);
  ssh(`echo 'SNAPTRADE_USER_SECRET=${userSecret}' >> ${ENV_PATH}`);
  console.log('Done. Credentials saved to Pi only.');
}

console.log('Generating Fidelity OAuth URL...');
const loginRes = await client.authentication.loginSnapTradeUser({ userId: 'dashy', userSecret });
// The SDK may return the URL as loginRes.data.redirectURI or loginRes.data (string) — handle both
const redirectUri = (typeof loginRes.data === 'string') ? loginRes.data : loginRes.data.redirectURI;

console.log('\n========================================');
console.log('Open this URL in your browser to connect your Fidelity accounts:');
console.log(redirectUri);
console.log('========================================\n');
console.log('After connecting all accounts, your Portfolio panel will auto-populate on next fetch.');
```

- [ ] **Step 3: Verify SSH access before running**

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 "grep SNAPTRADE ~/dashy-v2/.env.local"
```

Expected: lines showing `SNAPTRADE_CLIENT_ID=...` and `SNAPTRADE_CONSUMER_KEY=...` already present on the Pi.

- [ ] **Step 4: Run the setup script**

```powershell
node scripts/setup-snaptrade.mjs
```

Expected output:
```
Reading credentials from Pi...
Registering SnapTrade user "dashy"...
Writing userSecret to Pi .env.local...
Done. Credentials saved to Pi only.
Generating Fidelity OAuth URL...

========================================
Open this URL in your browser to connect your Fidelity accounts:
https://app.snaptrade.com/...
========================================
```

If you see `registerSnapTradeUser` failing with "user already exists", the userId `"dashy"` is taken in SnapTrade. Re-run with a different userId (e.g., `"dashy-pi"`) in both the script and Task 3's `SNAPTRADE_USER_ID`.

- [ ] **Step 5: Complete the OAuth flow**

Open the printed URL in a browser. Log into Fidelity and connect all your accounts. Return here when done.

- [ ] **Step 6: Verify accounts are visible via the SDK**

```powershell
node --input-type=module --eval "
import { Snaptrade } from 'snaptrade-typescript-sdk';
import { execSync } from 'child_process';
import os from 'os';
const raw = execSync('ssh -i ' + os.homedir() + '/.ssh/id_ed25519_dashy swahekul@192.168.68.62 \"cat ~/dashy-v2/.env.local\"', { encoding: 'utf8' });
const env = {};
raw.split('\n').forEach(l => { const eq = l.indexOf('='); if (eq > -1) env[l.slice(0,eq).trim()] = l.slice(eq+1).trim(); });
const client = new Snaptrade({ clientId: env.SNAPTRADE_CLIENT_ID, consumerKey: env.SNAPTRADE_CONSUMER_KEY });
const res = await client.accountInformation.listUserAccounts({ userId: env.SNAPTRADE_USER_ID, userSecret: env.SNAPTRADE_USER_SECRET });
console.log(JSON.stringify(res.data, null, 2));
"
```

Expected: JSON array of your Fidelity accounts, each with `id`, `name`, `number` fields. If empty, the OAuth connection didn't complete — re-run the script to get a fresh OAuth URL and try again.

- [ ] **Step 7: Commit**

```powershell
git add scripts/setup-snaptrade.mjs
git commit -m "feat: add SnapTrade setup script (SSH-based, no local credential storage)"
```

---

### Task 3: Write the API route

**Files:**
- Create: `pages/api/portfolio.js`

**Interfaces:**
- Consumes: `Snaptrade` from `snaptrade-typescript-sdk`; env vars `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `SNAPTRADE_USER_ID`, `SNAPTRADE_USER_SECRET` (all present on Pi via `.env.local`)
- Produces: `GET /api/portfolio` → `{ accounts: [{ id, name, totalValue, dailyChange, dailyChangePct, hasBaseline }], asOf: ISO string }`
  - `dailyChange` and `dailyChangePct` are `null` when `hasBaseline` is `false`

- [ ] **Step 1: Write the route**

Create `pages/api/portfolio.js`. Use the exact SDK method names you confirmed in Task 1 Step 2. The field names `price`, `units`, and `cash` below may differ — use what Task 1 Step 3 showed:

```js
import { Snaptrade } from 'snaptrade-typescript-sdk';

const client = new Snaptrade({
  clientId: process.env.SNAPTRADE_CLIENT_ID,
  consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
});

const userId = process.env.SNAPTRADE_USER_ID;
const userSecret = process.env.SNAPTRADE_USER_SECRET;

let cache = null;
let cacheAt = 0;
const TTL = 60 * 60 * 1000;

let baseline = null; // { date: 'YYYY-MM-DD', accounts: { [id]: totalValue } }

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // 'YYYY-MM-DD'
}

async function fetchPortfolio() {
  const accountsRes = await client.accountInformation.listUserAccounts({ userId, userSecret });
  const accounts = accountsRes.data;

  return Promise.all(accounts.map(async (account) => {
    const holdingsRes = await client.accountInformation.getAccountHoldings({
      userId,
      userSecret,
      accountId: account.id,
    });

    const { positions = [], balances = [] } = holdingsRes.data;
    const positionValue = positions.reduce((sum, p) => sum + (p.price ?? 0) * (p.units ?? 0), 0);
    const cashValue = balances.reduce((sum, b) => sum + (b.cash ?? 0), 0);

    return { id: account.id, name: account.name, totalValue: positionValue + cashValue };
  }));
}

export default async function handler(req, res) {
  if (!userId || !userSecret) {
    return res.status(503).json({ error: 'not configured' });
  }

  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const today = todayET();
    const accounts = await fetchPortfolio();

    if (!baseline || baseline.date !== today) {
      baseline = {
        date: today,
        accounts: Object.fromEntries(accounts.map(a => [a.id, a.totalValue])),
      };
      const payload = {
        accounts: accounts.map(a => ({
          id: a.id, name: a.name, totalValue: a.totalValue,
          dailyChange: null, dailyChangePct: null, hasBaseline: false,
        })),
        asOf: new Date().toISOString(),
      };
      cache = payload; cacheAt = now;
      return res.json(payload);
    }

    const payload = {
      accounts: accounts.map(a => {
        const base = baseline.accounts[a.id] ?? a.totalValue;
        const dailyChange = a.totalValue - base;
        const dailyChangePct = base !== 0 ? (dailyChange / base) * 100 : 0;
        return { id: a.id, name: a.name, totalValue: a.totalValue, dailyChange, dailyChangePct, hasBaseline: true };
      }),
      asOf: new Date().toISOString(),
    };
    cache = payload; cacheAt = now;
    res.json(payload);
  } catch (e) {
    console.error('[portfolio]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
```

- [ ] **Step 2: Check for syntax errors**

```powershell
npm run dev
```

Navigate to `http://localhost:3000/api/portfolio`. Expected: `{ "error": "not configured" }` (no local env vars — confirms the route loads without crashing). If you see a module or syntax error, fix it before continuing.

- [ ] **Step 3: Commit**

```powershell
git add pages/api/portfolio.js
git commit -m "feat: add /api/portfolio route with SnapTrade integration and daily P&L baseline"
```

---

### Task 4: Write the Portfolio screen

**Files:**
- Create: `screens/Portfolio.jsx`

**Interfaces:**
- Consumes: `data` prop of shape `{ accounts: [{ id, name, totalValue, dailyChange, dailyChangePct, hasBaseline }], asOf }` or `null`
- Produces: rendered panel; loading state when `data` is null or accounts array is empty

- [ ] **Step 1: Write the screen**

Create `screens/Portfolio.jsx`:

```jsx
function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>PORTFOLIO</span>
    </div>
  );
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AccountCard({ account }) {
  const { name, totalValue, dailyChange, dailyChangePct, hasBaseline } = account;
  const up = hasBaseline && dailyChange > 0;
  const accentColor = !hasBaseline ? '#444' : up ? '#4caf50' : '#f44336';
  const pnlColor = !hasBaseline ? '#9aa0a6' : up ? '#4caf50' : '#f44336';

  const pnlText = !hasBaseline
    ? '—'
    : `${dailyChange >= 0 ? '+' : '-'}$${fmt(Math.abs(dailyChange))}  ·  ${dailyChangePct >= 0 ? '+' : ''}${dailyChangePct.toFixed(2)}%`;

  return (
    <div style={{ background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: '5px', flexShrink: 0, background: accentColor }} />
      <div style={{
        flex: 1, padding: '0 2vw',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.8vh',
      }}>
        <div style={{ color: '#9aa0a6', fontSize: '1.8vw', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {name}
        </div>
        <div style={{ color: '#fff', fontSize: '3.5vw', fontWeight: 500 }}>
          ${fmt(totalValue)}
        </div>
        <div style={{ color: pnlColor, fontSize: '1.8vw', fontWeight: 500 }}>
          {pnlText}
        </div>
      </div>
    </div>
  );
}

export default function Portfolio({ data }) {
  if (!data || !data.accounts?.length) return <PanelLoading />;

  const { accounts } = data;
  const cols = accounts.length <= 3 ? accounts.length : 2;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ color: '#9aa0a6', fontSize: '2vw', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Portfolio
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '10px' }}>
        {accounts.map(a => <AccountCard key={a.id} account={a} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Quick smoke-test in dev**

With `npm run dev` still running, temporarily force some mock data. Open browser console on `http://localhost:3000` and confirm the panel renders visually once wired in Task 5. (Or proceed to Task 5 and test there.)

- [ ] **Step 3: Commit**

```powershell
git add screens/Portfolio.jsx
git commit -m "feat: add Portfolio screen with account value and daily P&L cards"
```

---

### Task 5: Wire Portfolio into index.js and StatusBar

**Files:**
- Modify: `pages/index.js`
- Modify: `screens/StatusBar.jsx`

**Interfaces:**
- Consumes: `Portfolio` default export from `../screens/Portfolio`; `data.portfolio` from state (shape from Task 3)
- Produces: portfolio panel cycles in the dashboard rotation; PORTFOLIO segment lights up in the status bar

- [ ] **Step 1: Update pages/index.js**

Make these four targeted edits:

**Add import** (after the `Stocks` import on line 9):
```js
import Portfolio from '../screens/Portfolio';
```

**Add `'portfolio'` to PANELS**:
```js
const PANELS = [
  'weather', 'calendar', 'gmail',
  // 'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  // 'steam-sales', 'steam-releases',
  'stocks', 'portfolio',
];
```

**Add to REFRESH_MS** (after the `stocks` entry):
```js
  portfolio:         60 * 60 * 1000,
```

**Add `portfolio: null` to useState** (end of the data object):
```js
    steamData: null, stocks: null, portfolio: null,
```

**Add render line** (after the `stocks` line in JSX):
```jsx
            {current === 'portfolio'      && <Portfolio     data={data.portfolio} />}
```

- [ ] **Step 2: Update screens/StatusBar.jsx**

**Add to SEGMENT_MAP** (after `stocks` entry):
```js
  portfolio:        { segment: 'PORTFOLIO' },
```

**Replace SEGMENTS**:
```js
const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'STOCKS', 'PORTFOLIO', 'CAMERA'];
```

- [ ] **Step 3: Verify in dev**

```powershell
npm run dev
```

Open `http://localhost:3000`. Confirm:
- The dashboard cycles: weather → calendar → gmail → stocks → portfolio → (repeat)
- Portfolio panel shows `PORTFOLIO` loading text (no local env vars — expected)
- The status bar shows a `PORTFOLIO` segment that lights up white when portfolio is active

- [ ] **Step 4: Commit**

```powershell
git add pages/index.js screens/StatusBar.jsx
git commit -m "feat: wire Portfolio panel into dashboard rotation and status bar"
```

---

### Task 6: Deploy to Pi and verify end-to-end

**Files:** none (deployment only)

- [ ] **Step 1: Push to remote**

```powershell
git push
```

- [ ] **Step 2: Deploy to Pi**

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm install && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'
```

`npm install` is required here to install `snaptrade-typescript-sdk` on the Pi.

- [ ] **Step 3: Tail logs for errors**

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'tail -f ~/dashy.log'
```

Watch for `[portfolio]` error lines. Ctrl+C when stable.

- [ ] **Step 4: Hit the API from your browser**

Open `http://192.168.68.62:3000/api/portfolio`.

Expected on first load:
```json
{
  "accounts": [
    { "id": "...", "name": "Roth IRA", "totalValue": 12345.67, "dailyChange": null, "dailyChangePct": null, "hasBaseline": false }
  ],
  "asOf": "2026-08-07T..."
}
```

If you see `{ "error": "not configured" }`, the env vars aren't loaded. Verify they're in Pi's `~/dashy-v2/.env.local` and try a full reboot:
```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'sudo reboot'
```
Then wait ~60s and re-check.

If you see `{ "error": "unavailable" }`, there's a SnapTrade API error. Check the log (`tail ~/dashy.log`) for the specific error message — likely a method name mismatch from Task 1 Step 2 that needs fixing.

- [ ] **Step 5: Verify the dashboard UI on the Pi**

Navigate to `http://192.168.68.62:3000`. Confirm:
- Portfolio panel appears in the rotation after STOCKS
- Each Fidelity account shows as a separate card with its name and total value
- P&L shows `—` (gray, no accent color) on first load — correct, baseline just set
- StatusBar PORTFOLIO segment lights up when active
- After 1 hour (next refresh cycle), P&L will show real daily change values

---
