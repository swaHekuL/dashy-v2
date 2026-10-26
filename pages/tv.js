import { useState, useEffect } from 'react';

// TV view for the bedroom Fire Stick: 2x2 grid at 1920x1080. Each cell is a /tile/<panel>
// iframe so the existing panels render unchanged. The bottom-right cell rotates.
const ROTATING = ['gmail', 'portfolio', 'minecraft'];
const ROTATE_MS = 10000;
const RESUME_MS = 30000;
const DIM_FROM_HOUR = 23;
const DIM_TO_HOUR = 6;

const cell = { position: 'relative', overflow: 'hidden', border: 0 };
const frame = { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#000' };

function isNight(d) {
  const h = d.getHours();
  return h >= DIM_FROM_HOUR || h < DIM_TO_HOUR;
}

export default function TV() {
  const [rot, setRot] = useState(0);
  const [paused, setPaused] = useState(false);
  const [night, setNight] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setRot(i => (i + 1) % ROTATING.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    const tick = () => setNight(isNight(new Date()));
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let resume;
    const onKey = (e) => {
      const right = e.key === 'ArrowRight' || e.key === 'PageDown';
      const left = e.key === 'ArrowLeft' || e.key === 'PageUp';
      if (!right && !left) return;
      setRot(i => (i + (right ? 1 : ROTATING.length - 1)) % ROTATING.length);
      setPaused(true);
      clearTimeout(resume);
      resume = setTimeout(() => setPaused(false), RESUME_MS);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(resume); };
  }, []);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', background: '#000',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '2px',
    }}>
      <div style={cell}><iframe src="/tile/clock" style={frame} /></div>
      <div style={cell}><iframe src="/tile/weather" style={frame} /></div>
      <div style={cell}><iframe src="/tile/calendar" style={frame} /></div>
      <div style={cell}>
        {ROTATING.map((p, i) => (
          <iframe key={p} src={`/tile/${p}`} style={{ ...frame, visibility: i === rot ? 'visible' : 'hidden' }} />
        ))}
      </div>
      {night && <div style={{ position: 'fixed', inset: 0, background: '#000', opacity: 0.6, pointerEvents: 'none' }} />}
    </div>
  );
}
