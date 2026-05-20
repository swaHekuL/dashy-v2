import { Roboto } from 'next/font/google';

const roboto = Roboto({ weight: ['300', '400', '500', '700'], subsets: ['latin'] });

export default function Gmail({ data }) {
  if (!data) return <PanelLoading label="GMAIL" />;

  const previews = data.previews ?? [];
  const { unreadCount } = data;

  return (
    <div className={roboto.className} style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2vw' }}>
        <div style={{
          background: '#ea4335', color: '#fff',
          fontSize: '2vw', fontWeight: 700,
          padding: '0.3vh 1.5vw', borderRadius: '999px',
        }}>
          {unreadCount} unread
        </div>
      </div>
      {previews.map((msg, i) => (
        <div key={msg.id} style={{
          borderBottom: i < previews.length - 1 ? '1px solid #1f1f1f' : 'none',
          paddingBottom: '1.2vh',
        }}>
          <div style={{ color: '#e8eaed', fontSize: '3vw', fontWeight: 600 }}>{msg.subject}</div>
          <div style={{ color: '#9aa0a6', fontSize: '2vw', marginTop: '0.3vh' }}>{msg.sender}</div>
        </div>
      ))}
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
