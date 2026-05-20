import { useState, useEffect } from 'react';
import { Bebas_Neue } from 'next/font/google';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'] });

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n) { return String(n).padStart(2, '0'); }

export default function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours() % 12 || 12;
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';
  const day = DAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];
  const date = now.getDate();

  return (
    <div className={bebas.className} style={{
      height: '42vh',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderBottom: '1px solid #1a1a1a',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5vw' }}>
        <span style={{ fontSize: '18vw', color: '#fff', lineHeight: 1, letterSpacing: '0.04em' }}>
          {h}:{m}:{s}
        </span>
        <span style={{ fontSize: '4vw', color: '#aaa', letterSpacing: '0.1em' }}>
          {ampm}
        </span>
      </div>
      <div style={{
        fontSize: '2.8vw',
        color: '#aaa',
        letterSpacing: '0.2em',
        marginTop: '0.5vh',
        textTransform: 'uppercase',
      }}>
        {day} · {month} {date}
      </div>
    </div>
  );
}
