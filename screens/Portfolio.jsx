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
