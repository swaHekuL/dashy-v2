export default function Stocks({ data }) {
  if (!data) return <PanelLoading />;

  const tickers = data.tickers ?? [];
  if (!tickers.length) return <PanelLoading />;

  const shouldScroll = tickers.length > 6;
  const rows = Math.ceil(tickers.length / 3);
  const scrollDuration = Math.round((rows * 80) / 30);

  const cards = tickers.map(t => (
    <div key={t.symbol} style={{
      background: '#111', borderRadius: '8px',
      overflow: 'hidden', display: 'flex', height: '70px',
    }}>
      <div style={{
        width: '5px', flexShrink: 0,
        background: t.marketOpen ? (t.up ? '#4caf50' : '#f44336') : '#444',
      }} />
      <div style={{
        flex: 1, padding: '0 2vw',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: '#e8eaed', fontSize: '2.5vw', fontWeight: 700, letterSpacing: '0.05em' }}>
          {t.symbol}
        </span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fff', fontSize: '2.5vw', fontWeight: 500 }}>${t.price}</div>
          <div style={{
            fontSize: '1.8vw', fontWeight: 500,
            color: t.marketOpen ? (t.up ? '#4caf50' : '#f44336') : '#9aa0a6',
          }}>
            {t.change} · {t.changePct}{!t.marketOpen ? ' (closed)' : ''}
          </div>
        </div>
      </div>
    </div>
  ));

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      {shouldScroll && (
        <style>{`@keyframes stocksScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }`}</style>
      )}
      <div style={{
        color: '#9aa0a6', fontSize: '2vw', fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        Stocks
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px',
          animation: shouldScroll ? `stocksScroll ${scrollDuration}s linear infinite` : 'none',
        }}>
          {cards}
          {shouldScroll && cards}
        </div>
      </div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>STOCKS</span>
    </div>
  );
}
