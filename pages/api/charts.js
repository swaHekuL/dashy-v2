// Chart series for a non-default range (remote "b" button). Allowlisted so the collector
// is never asked for arbitrary ranges.
import { getJkmcSeries, getPortfolioSeries } from '../../lib/history';
import { isAllowedRange } from '../../lib/chartRanges';

export default async function handler(req, res) {
  const { panel } = req.query;
  const range = Number(req.query.range);
  if (!isAllowedRange(panel, range)) return res.status(400).json({ error: 'bad range' });
  const charts = panel === 'minecraft' ? await getJkmcSeries(range) : await getPortfolioSeries(range);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ charts });
}
