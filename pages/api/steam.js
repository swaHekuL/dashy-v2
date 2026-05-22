let cache = null;
let cacheAt = 0;
const TTL = 60 * 60 * 1000;

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const [featRes, catRes] = await Promise.all([
      fetch('https://store.steampowered.com/api/featured/?cc=us&l=en', { signal: ac.signal }),
      fetch('https://store.steampowered.com/api/featuredcategories/?cc=us&l=en', { signal: ac.signal }),
    ]);
    clearTimeout(timer);

    const feat = featRes.ok ? await featRes.json() : null;
    const cat = catRes.ok ? await catRes.json() : null;

    const sales = [];
    const seen = new Set();
    const allFeatured = [
      ...(feat?.large_capsules || []),
      ...(feat?.featured_win || []),
    ];
    for (const item of allFeatured) {
      if (item.discount_percent > 0 && sales.length < 4 && !seen.has(item.name)) {
        seen.add(item.name);
        sales.push({ name: item.name, discount: item.discount_percent });
      }
    }

    const newReleases = (cat?.new_releases?.items || [])
      .slice(0, 4)
      .map(item => ({ name: item.name }));

    cache = { sales, newReleases };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    clearTimeout(timer);
    console.error('[steam]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
