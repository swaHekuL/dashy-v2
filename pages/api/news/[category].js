import Parser from 'rss-parser';

const TTL = 15 * 60 * 1000;
const parser = new Parser();

const FEEDS = {
  world:  'https://feeds.bbci.co.uk/news/rss.xml',
  gaming: 'https://kotaku.com/rss',
  tech:   'https://techcrunch.com/feed/',
  sports: 'https://www.espn.com/espn/rss/news',
  utah:   'https://www.deseret.com/arc/outboundfeeds/rss/',
};

const caches = {};

export default async function handler(req, res) {
  const { category } = req.query;
  const feedUrl = FEEDS[category];
  if (!feedUrl) return res.status(404).json({ error: 'unknown category' });

  if (!caches[category]) caches[category] = { data: null, at: 0 };
  const c = caches[category];
  const now = Date.now();
  if (c.data && now - c.at < TTL) return res.json(c.data);

  try {
    const feed = await parser.parseURL(feedUrl);
    c.data = { headlines: feed.items.slice(0, 3).map(item => ({ title: item.title })) };
    c.at = now;
    res.json(c.data);
  } catch {
    if (c.data) return res.json(c.data);
    res.status(503).json({ error: 'unavailable' });
  }
}
