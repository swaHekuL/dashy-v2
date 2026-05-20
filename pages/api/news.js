import Parser from 'rss-parser';

let cache = null;
let cacheAt = 0;
const TTL = 15 * 60 * 1000;
const RSS_URL = 'https://feeds.bbci.co.uk/news/rss.xml';

const parser = new Parser();

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  try {
    const feed = await parser.parseURL(RSS_URL);
    cache = {
      headlines: feed.items.slice(0, 3).map(item => ({
        title: item.title,
      })),
    };
    cacheAt = now;
    res.json(cache);
  } catch {
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
