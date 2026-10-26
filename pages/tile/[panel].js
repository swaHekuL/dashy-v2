import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Clock from '../../screens/Clock';
import Weather from '../../screens/Weather';
import Calendar from '../../screens/Calendar';
import Gmail from '../../screens/Gmail';
import Portfolio from '../../screens/Portfolio';
import Minecraft from '../../screens/Minecraft';

// One panel on its own, for the /tv grid. Each tile is loaded in an iframe so the
// panels' vw/vh sizing resolves against the tile, not the whole TV.
const REFRESH_MS = {
  weather: 10 * 60 * 1000,
  calendar: 5 * 60 * 1000,
  gmail: 2 * 60 * 1000,
  portfolio: 60 * 60 * 1000,
  minecraft: 30 * 1000,
};

const PANELS = {
  weather: Weather,
  calendar: Calendar,
  gmail: Gmail,
  portfolio: Portfolio,
  minecraft: Minecraft,
};

export default function Tile() {
  const { query, isReady } = useRouter();
  const panel = query.panel;
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!isReady || !REFRESH_MS[panel]) return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/${panel}`);
        if (!res.ok) return;
        const json = await res.json();
        if (live) setData(json);
      } catch (e) {
        console.error(`[tile] ${panel}:`, e);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS[panel]);
    return () => { live = false; clearInterval(id); };
  }, [isReady, panel]);

  useEffect(() => {
    if (!isReady || panel !== 'clock') return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch('/api/claude-notify');
        if (!res.ok) return;
        const json = await res.json();
        if (live) setNotifications(json.waiting ?? []);
      } catch (e) {
        console.error('[tile] notifications:', e);
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, [isReady, panel]);

  if (!isReady) return null;

  if (panel === 'clock') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#000' }}>
        <Clock notifications={notifications} />
      </div>
    );
  }

  const Panel = PANELS[panel];
  if (!Panel) return null;
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <Panel data={data} />
    </div>
  );
}
