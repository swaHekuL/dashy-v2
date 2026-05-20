let cache = null;
let cacheAt = 0;
const TTL = 60 * 60 * 1000;

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const [featRes, catRes] = await Promise.all([
      fetch('https://store.steampowered.com/api/featured/?cc=us&l=en'),
      fetch('https://store.steampowered.com/api/featuredcategories/?cc=us&l=en'),
    ]);

    const feat = featRes.ok ? await featRes.json() : null;
    const cat = catRes.ok ? await catRes.json() : null;

    const deals = [];
    const allFeatured = [
      ...(feat?.large_capsules || []),
      ...(feat?.featured_win || []),
    ];
    for (const item of allFeatured) {
      if (item.discount_percent > 0 && deals.length < 3) {
        deals.push({
          name: item.name,
          discount: item.discount_percent,
        });
      }
    }

    const newRelease = cat?.new_releases?.items?.[0]?.name ?? null;

    cache = { deals, newRelease };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    console.error('[steam]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
