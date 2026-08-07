# SnapTrade Portfolio Screen — Design Spec
_Last updated: 2026-08-07_

## Overview

Add a Portfolio panel to Dashy that displays each Fidelity account as a distinct card showing total account value and today's daily gain/loss ($ and %). Data comes from SnapTrade, a partnership-level Fidelity integration that uses OAuth (no credential scraping). The Gas panel has been removed and Portfolio takes its slot.

---

## Setup (One-Time, Pre-Deploy)

Credentials live **only on the Pi** — nothing is stored locally. The setup script reads from the Pi via SSH, calls SnapTrade in-memory, and writes results back to the Pi.

### Phase 1 — SnapTrade Developer Registration (manual, ~5 min)
1. Register at snaptrade.com → get `clientId` and `consumerKey` from the developer dashboard
2. SSH them directly onto the Pi:
   ```powershell
   ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'echo "SNAPTRADE_CLIENT_ID=..." >> ~/dashy-v2/.env.local && echo "SNAPTRADE_CONSUMER_KEY=..." >> ~/dashy-v2/.env.local'
   ```

### Phase 2 — Run Setup Script
```
node scripts/setup-snaptrade.mjs
```
The script (no local `.env.local` required):
1. SSHs into the Pi and reads `~/dashy-v2/.env.local` via `cat`
2. Parses `SNAPTRADE_CLIENT_ID` and `SNAPTRADE_CONSUMER_KEY` — held in memory only, never written locally
3. Calls SnapTrade API to register user `"dashy"` → receives `userSecret`
4. SSHs back to Pi to append `SNAPTRADE_USER_ID=dashy` and `SNAPTRADE_USER_SECRET=...` to `~/dashy-v2/.env.local`
5. Prints the OAuth redirect URL → user opens in browser, logs into Fidelity, connects all accounts
6. Done — the API route auto-discovers all connected accounts on first fetch

### Pi `.env.local` after setup (nothing stored locally)
```
SNAPTRADE_CLIENT_ID=...
SNAPTRADE_CONSUMER_KEY=...
SNAPTRADE_USER_ID=dashy
SNAPTRADE_USER_SECRET=...
```

---

## New Files

| File | Purpose |
|------|---------|
| `scripts/setup-snaptrade.mjs` | One-time setup script |
| `pages/api/portfolio.js` | API route |
| `screens/Portfolio.jsx` | Dashboard screen |

### Dependency
```
npm install snaptrade-typescript-sdk
```
Works in plain JS despite the name.

---

## API Route — `pages/api/portfolio.js`

### Data fetching
- Initialize `Snaptrade` client with `SNAPTRADE_CLIENT_ID` + `SNAPTRADE_CONSUMER_KEY`
- Fetch all accounts: `listUserAccounts({ userId, userSecret })`
- For each account in parallel:
  - Fetch holdings (positions): each position has `price` and `units`
  - Fetch balances: returns cash amount
  - `totalValue = Σ(position.price × position.units) + cash`

### Daily P&L baseline (in-memory, Approach A)
```js
let baseline = null; // { date: 'YYYY-MM-DD', accounts: { [accountId]: value } }
```
- On each fetch, compute today's date in ET
- If `baseline === null` or `baseline.date !== today`: overwrite baseline with current values; P&L fields are `null` (rendered as `—`)
- Otherwise: `dailyChange = currentValue - baseline.accounts[id]`; `dailyChangePct = dailyChange / baseline.accounts[id] * 100`
- On Pi reboot, baseline resets → P&L shows `—` until next refresh cycle (acceptable tradeoff)

### Caching
- In-memory cache with 1h TTL (same pattern as other routes)
- Falls back to stale cache on SnapTrade error

### Response shape
```json
{
  "accounts": [
    {
      "id": "abc123",
      "name": "Roth IRA",
      "totalValue": 123456.78,
      "dailyChange": 1234.56,
      "dailyChangePct": 1.01,
      "hasBaseline": true
    }
  ],
  "asOf": "2026-08-07T14:00:00.000Z"
}
```
`dailyChange` and `dailyChangePct` are `null` when `hasBaseline` is `false`.

---

## Screen — `screens/Portfolio.jsx`

### Layout
- Header: `PORTFOLIO` label (muted gray, monospace, same as other screens)
- Cards in a CSS grid: single row for ≤3 accounts, 2-column grid for 4+ (wraps naturally)
- Loading state: shows `PORTFOLIO` placeholder text (same pattern as `Stocks`)

### Card design (matches Stocks panel aesthetic)
```
┌─┬────────────────────────────────┐
│ │  ROTH IRA                      │  ← account name, uppercased
│ │  $123,456.78                   │  ← totalValue, large white
│ │  +$1,234.56  ·  +1.23%        │  ← dailyChange + pct, green/red
└─┴────────────────────────────────┘
```
- Left accent bar: green (`#4caf50`) if `dailyChange > 0`, red (`#f44336`) if negative, gray (`#444`) if no baseline
- P&L row: green/red when baseline exists, muted gray (`#9aa0a6`) with `—` when not
- Account name from SnapTrade as-is (Fidelity returns readable names like "Roth IRA", "Individual")

---

## `pages/index.js` Changes

```js
import Portfolio from '../screens/Portfolio';

const PANELS = [
  'weather', 'calendar', 'gmail',
  'stocks', 'portfolio',
];

const REFRESH_MS = {
  // ...existing...
  portfolio: 60 * 60 * 1000,  // 1 hour
};

// state:
{ ..., portfolio: null }

// render:
{current === 'portfolio' && <Portfolio data={data.portfolio} />}
```

---

## `screens/StatusBar.jsx` Changes

```js
const SEGMENT_MAP = {
  // ...existing...
  portfolio: { segment: 'PORTFOLIO' },
};

const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'STOCKS', 'PORTFOLIO', 'CAMERA'];
```

---

## Error Handling

- SnapTrade API down: serve stale cache if available; otherwise render loading state (no crash)
- Missing env vars: API route returns `503` with `{ error: 'not configured' }`; screen shows loading state
- Account with no positions (cash-only): `totalValue = cash`, no positions loop needed
- SnapTrade returns 0 accounts: screen shows loading state

---

## Out of Scope

- No individual holdings breakdown on the screen (just account totals)
- No historical chart
- No trading or write operations
- No per-account rename/alias (use Fidelity's names as returned by SnapTrade)
