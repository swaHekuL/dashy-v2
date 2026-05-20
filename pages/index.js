import { useState, useEffect } from 'react';
import Clock from '../screens/Clock';

const PANELS = ['weather', 'calendar', 'gmail', 'news', 'steam'];
const PANEL_MS = 7000;
const REFRESH_MS = {
  weather:  10 * 60 * 1000,
  calendar:  5 * 60 * 1000,
  gmail:     2 * 60 * 1000,
  news:     15 * 60 * 1000,
  steam:    60 * 60 * 1000,
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null, news: null, steam: null,
  });

  const fetchPanel = async (panel) => {
    try {
      const res = await fetch(`/api/${panel}`);
      if (!res.ok) return;
      setData(prev => ({ ...prev, [panel]: await res.json() }));
    } catch (e) {
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPanelIndex(i => (i + 1) % PANELS.length), PANEL_MS);
    return () => clearInterval(id);
  }, []);

  const current = PANELS[panelIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Clock />
      <div style={{ flex: 1, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>
          {current.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
