import settings from '../../config/settings.json';

let cache = null;
let cacheAt = 0;
const TTL = 5 * 60 * 1000;

function isMarketOpen() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export default async function handler(req, res) {
  const tickers = settings.tickers ?? [];
  if (!tickers.length) return res.json({ tickers: [], asOf: null });

  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const marketOpen = isMarketOpen();

  try {
    const results = await Promise.all(
      tickers.map(async (symbol) => {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return null;
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (!meta) return null;
        const price = meta.regularMarketPrice ?? 0;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change = price - prevClose;
        const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
        return {
          symbol,
          price: price.toFixed(2),
          change: (change >= 0 ? '+' : '') + change.toFixed(2),
          changePct: (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%',
          up: change >= 0,
          marketOpen,
        };
      })
    );

    cache = { tickers: results.filter(Boolean), asOf: new Date().toISOString() };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[stocks]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
