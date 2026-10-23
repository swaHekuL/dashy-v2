import Sparkline from '../components/Sparkline';

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

const GREEN = '#4caf50';
const RED = '#f44336';

function trendColor(points) {
  if (!points || points.length < 2) return '#666';
  const d = points[points.length - 1][1] - points[0][1];
  return d > 0 ? GREEN : d < 0 ? RED : '#888';
}

function pnl(change, pct) {
  return `${change >= 0 ? '+' : '-'}$${fmt(Math.abs(change))}  ·  ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function AccountCard({ account, points }) {
  const { name, totalValue, dailyChange, dailyChangePct, hasBaseline } = account;
  const up = hasBaseline && dailyChange > 0;
  const flat = hasBaseline && dailyChange === 0;
  const accentColor = !hasBaseline ? '#444' : flat ? '#888' : up ? GREEN : RED;
  const pnlColor = !hasBaseline || flat ? '#9aa0a6' : accentColor;
  return (
    <div style={{ background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ height: '4px', background: accentColor }} />
      <div style={{ padding: '1vh 1vw 0', display: 'flex', flexDirection: 'column', gap: '0.4vh' }}>
        <div style={{ color: '#9aa0a6', fontSize: '1.3vw', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ color: '#fff', fontSize: '2.3vw', fontWeight: 500, whiteSpace: 'nowrap' }}>${fmt(totalValue)}</div>
        <div style={{ color: pnlColor, fontSize: '1.3vw', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {hasBaseline ? pnl(dailyChange, dailyChangePct) : '—'}
        </div>
      </div>
      {points !== undefined && (
        <div style={{ flex: 1, minHeight: 0, padding: '0.8vh 0.8vw 1vh' }}>
          <Sparkline points={points} color={trendColor(points)} minSpan={0.01 * totalValue} />
        </div>
      )}
    </div>
  );
}

export default function Portfolio({ data }) {
  if (!data || !data.accounts?.length) return <PanelLoading />;

  const { accounts, charts } = data;
  const withBase = accounts.filter(a => a.hasBaseline);
  const total = accounts.reduce((sum, a) => sum + a.totalValue, 0);
  const change = withBase.reduce((sum, a) => sum + a.dailyChange, 0);
  const baseTotal = withBase.reduce((sum, a) => sum + a.totalValue - a.dailyChange, 0);
  const pct = baseTotal ? (change / baseTotal) * 100 : 0;
  const totalPts = charts ? charts.total : undefined;
  const hasCharts = !!charts;
  const since = totalPts?.length > 1
    ? new Date(totalPts[0][0] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  if (!hasCharts) {
    const cols = accounts.length <= 3 ? accounts.length : 2;
    return (
      <div style={{ width: '100%', height: '100%', background: '#000', padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div style={{ color: '#9aa0a6', fontSize: '2vw', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Portfolio</div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '10px' }}>
          {accounts.map(a => <AccountCard key={a.id} account={a} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '2.5vh 3vw', display: 'flex', flexDirection: 'column', gap: '1.2vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5vw' }}>
        <span style={{ color: '#9aa0a6', fontSize: '1.8vw', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Portfolio</span>
        <span style={{ color: '#fff', fontSize: '3vw', fontWeight: 500 }}>${fmt(total)}</span>
        {withBase.length > 0 && (
          <span style={{ color: change === 0 ? '#9aa0a6' : change > 0 ? GREEN : RED, fontSize: '1.8vw', fontWeight: 500 }}>{pnl(change, pct)}</span>
        )}
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: '1.4vw' }}>{data.chartRange ? `${data.chartRange} · ` : ''}{since ? `since ${since}` : '30 d'}</span>
      </div>
      <div style={{ flex: 4, minHeight: 0, background: '#111', borderRadius: '8px', padding: '1vh 1vw' }}>
        <Sparkline points={totalPts} color={trendColor(totalPts)} minSpan={0.01 * total} fill />
      </div>
      <div style={{ flex: 5, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${accounts.length}, minmax(0, 1fr))`, gap: '8px' }}>
        {accounts.map(a => <AccountCard key={a.id} account={a} points={charts.accounts?.[a.id]?.series ?? []} />)}
      </div>
    </div>
  );
}
