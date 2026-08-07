import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';

// Client is lazily created so missing env vars don't crash module load
let _client = null;
function getClient() {
  if (!_client) {
    _client = new Snaptrade({
      auth: SnaptradeAuth.personalApiKey({
        clientId: process.env.SNAPTRADE_CLIENT_ID,
        consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
      }),
    });
  }
  return _client;
}

let cache = null;
let cacheAt = 0;
const TTL = 60 * 60 * 1000; // 1 hour

// baseline resets each trading day: { date: 'YYYY-MM-DD', accounts: { [id]: totalValue } }
let baseline = null;

function todayET() {
  // Returns 'YYYY-MM-DD' in Eastern Time
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function fetchPortfolio() {
  const client = getClient();

  // 1) List all connected accounts
  const accountsRes = await client.accountInformation.listUserAccounts({});
  const accounts = accountsRes.data; // Array<Account>, each has { id, name, ... }

  // 2) Per-account: fetch positions + balances concurrently
  return Promise.all(accounts.map(async (account) => {
    const [posRes, balRes] = await Promise.all([
      // getAllAccountPositions requires accountId per SDK BaseRequest type
      client.accountInformation.getAllAccountPositions({ accountId: account.id }),
      // getUserAccountBalance requires accountId per SDK BaseRequest type
      client.accountInformation.getUserAccountBalance({ accountId: account.id }),
    ]);

    // posRes.data is AllAccountPositionsResponse: { results: AccountPosition[], data_freshness }
    // AccountPosition: price and units are strings (not numbers) — must parseFloat
    const positions = posRes.data?.results ?? [];
    const positionValue = positions.reduce((sum, p) => {
      const price = parseFloat(p.price ?? '0') || 0;
      const units = parseFloat(p.units ?? '0') || 0;
      // Skip cash-equivalent positions to avoid double-counting with cash balances
      if (p.cash_equivalent) return sum;
      return sum + price * units;
    }, 0);

    // balRes.data is Balance[]: each has { cash: number|null }
    const balances = balRes.data ?? [];
    const cashValue = balances.reduce((sum, b) => sum + (b.cash ?? 0), 0);

    return {
      id: account.id,
      name: account.name ?? account.number,
      totalValue: positionValue + cashValue,
    };
  }));
}

export default async function handler(req, res) {
  if (!process.env.SNAPTRADE_CLIENT_ID || !process.env.SNAPTRADE_CONSUMER_KEY) {
    return res.status(503).json({ error: 'not configured' });
  }

  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const today = todayET();
    const accounts = await fetchPortfolio();

    if (!baseline || baseline.date !== today) {
      // First fetch of the day — establish baseline, return null P&L
      baseline = {
        date: today,
        accounts: Object.fromEntries(accounts.map(a => [a.id, a.totalValue])),
      };
      const payload = {
        accounts: accounts.map(a => ({
          id: a.id,
          name: a.name,
          totalValue: a.totalValue,
          dailyChange: null,
          dailyChangePct: null,
          hasBaseline: false,
        })),
        asOf: new Date().toISOString(),
      };
      cache = payload;
      cacheAt = now;
      return res.json(payload);
    }

    // Subsequent fetches — compute P&L vs baseline
    const payload = {
      accounts: accounts.map(a => {
        const base = baseline.accounts[a.id] ?? a.totalValue;
        const dailyChange = a.totalValue - base;
        const dailyChangePct = base !== 0 ? (dailyChange / base) * 100 : 0;
        return {
          id: a.id,
          name: a.name,
          totalValue: a.totalValue,
          dailyChange,
          dailyChangePct,
          hasBaseline: true,
        };
      }),
      asOf: new Date().toISOString(),
    };
    cache = payload;
    cacheAt = now;
    res.json(payload);
  } catch (e) {
    console.error('[portfolio]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
