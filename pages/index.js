import { useState, useEffect, useRef, useCallback } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import SteamSales from '../screens/SteamSales';
import SteamReleases from '../screens/SteamReleases';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';
import Stocks from '../screens/Stocks';
import Portfolio from '../screens/Portfolio';
import Camera from '../screens/Camera';
import Minecraft from '../screens/Minecraft';
import StatusBar from '../screens/StatusBar';
import DebugOverlay from '../components/DebugOverlay';
import { recordFetch } from '../lib/debugStore';
import { RANGE_KEY, defaultRange, nextRange, rangeLabel } from '../lib/chartRanges';

const PANELS = [
  'weather', 'calendar', 'gmail',
  // 'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  // 'steam-sales', 'steam-releases',
  // 'stocks',
  'portfolio',
  'minecraft',
];

const CAMERAS = ['tapo', 'ring'];

const PANEL_MS = 10000;
const INACTIVITY_MS = 30000;
const CAMERA_KEY = 'Escape';

const REFRESH_MS = {
  weather:          10 * 60 * 1000,
  calendar:          5 * 60 * 1000,
  gmail:             2 * 60 * 1000,
  'news-world':     15 * 60 * 1000,
  'news-gaming':    15 * 60 * 1000,
  'news-tech':      15 * 60 * 1000,
  'news-sports':    15 * 60 * 1000,
  'news-utah':      15 * 60 * 1000,
  'steam-sales':    60 * 60 * 1000,
  'steam-releases': 60 * 60 * 1000,
  stocks:            5 * 60 * 1000,
  portfolio:         60 * 60 * 1000,
  minecraft:         30 * 1000,
};

const NEWS_LABELS = {
  'news-world':  'World News',
  'news-gaming': 'Gaming News',
  'news-tech':   'Tech / AI',
  'news-sports': 'Sports',
  'news-utah':   'Utah News',
};

export default function Home() {
  const [panelIndex, setPanelIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [camIndex, setCamIndex] = useState(0);
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steamData: null, stocks: null, portfolio: null, minecraft: null,
  });
  const [notifications, setNotifications] = useState([]);
  // Non-default chart ranges chosen with the remote's "b" button: { minecraft: { n, charts } }.
  const [rangeOverride, setRangeOverride] = useState({});
  const rangeTimerRef = useRef(null);
  const rangeRef = useRef({});
  const rotationRef = useRef(null);
  const resumeTimerRef = useRef(null);

  const fetchPanel = async (panel) => {
    let apiUrl, dataKey;
    if (panel.startsWith('news-')) {
      apiUrl = `/api/news/${panel.slice(5)}`;
      dataKey = panel;
    } else if (panel === 'steam-sales' || panel === 'steam-releases') {
      apiUrl = '/api/steam';
      dataKey = 'steamData';
    } else {
      apiUrl = `/api/${panel}`;
      dataKey = panel;
    }
    try {
      const res = await fetch(apiUrl);
      recordFetch(panel, res.ok, res.status);
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [dataKey]: json }));
    } catch (e) {
      recordFetch(panel, false, 'net');
      console.error(`[fetchPanel] ${panel}:`, e);
    }
  };

  useEffect(() => {
    PANELS.forEach(p => fetchPanel(p));
    const intervals = PANELS.map(p => setInterval(() => fetchPanel(p), REFRESH_MS[p]));
    return () => intervals.forEach(clearInterval);
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/claude-notify');
        if (!res.ok) return;
        const json = await res.json();
        setNotifications(json.waiting ?? []);
      } catch (e) {
        console.error('[fetchNotifications]', e);
      }
    };
    fetchNotifications();
    const id = setInterval(fetchNotifications, 15000);
    return () => clearInterval(id);
  }, []);

  const fetchRange = useCallback(async (panel, n) => {
    try {
      const res = await fetch(`/api/charts?panel=${panel}&range=${n}`);
      recordFetch(`charts-${panel}`, res.ok, res.status);
      if (!res.ok) return;
      const { charts } = await res.json();
      // Ignore a late answer if the range was changed or reset meanwhile.
      if (rangeRef.current[panel] !== n) return;
      setRangeOverride(prev => ({ ...prev, [panel]: { n, charts } }));
    } catch (e) {
      recordFetch(`charts-${panel}`, false, 'net');
      console.error(`[fetchRange] ${panel}:`, e);
    }
  }, []);

  const cycleRange = useCallback((panel) => {
    const cur = rangeRef.current[panel] ?? defaultRange(panel);
    const n = nextRange(panel, cur);
    if (n == null) return false;
    clearTimeout(rangeTimerRef.current);
    if (n === defaultRange(panel)) {
      delete rangeRef.current[panel];
      setRangeOverride(prev => { const { [panel]: _, ...rest } = prev; return rest; });
    } else {
      rangeRef.current = { ...rangeRef.current, [panel]: n };
      fetchRange(panel, n);
      // Back to the default range after the same idle time that resumes rotation.
      rangeTimerRef.current = setTimeout(() => { rangeRef.current = {}; setRangeOverride({}); }, INACTIVITY_MS);
    }
    return true;
  }, [fetchRange]);

  // Keep a non-default range fresh while it is showing.
  useEffect(() => {
    const id = setInterval(() => {
      Object.entries(rangeRef.current).forEach(([panel, n]) => fetchRange(panel, n));
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [fetchRange]);

  const startRotation = useCallback(() => {
    clearInterval(rotationRef.current);
    rotationRef.current = setInterval(
      () => setPanelIndex(i => (i + 1) % PANELS.length),
      PANEL_MS
    );
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInterval(rotationRef.current);
    rotationRef.current = null;
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(startRotation, INACTIVITY_MS);
  }, [startRotation]);

  useEffect(() => {
    startRotation();
    return () => {
      clearInterval(rotationRef.current);
      clearTimeout(resumeTimerRef.current);
    };
  }, [startRotation]);

  useEffect(() => {
    const handleKey = (e) => {
      // The remote's "down" button alternates Escape and Shift+F5 (a browser hard reload).
      // Block the reload and treat both as the camera toggle.
      if (e.key === CAMERA_KEY || e.key === 'F5') {
        e.preventDefault();
        if (showCamera) {
          setShowCamera(false);
          setCamIndex(0);
          startRotation();
        } else {
          setShowCamera(true);
        }
        return;
      }

      if (e.key === RANGE_KEY && !showCamera) {
        if (cycleRange(PANELS[panelIndex])) resetInactivityTimer();
        return;
      }

      const isRight = e.key === 'ArrowRight' || e.key === 'PageDown';
      const isLeft  = e.key === 'ArrowLeft'  || e.key === 'PageUp';
      if (!isRight && !isLeft) return;

      if (showCamera) {
        if (isRight) setCamIndex(i => (i + 1) % CAMERAS.length);
        if (isLeft)  setCamIndex(i => (i - 1 + CAMERAS.length) % CAMERAS.length);
      } else {
        if (isRight) setPanelIndex(i => (i + 1) % PANELS.length);
        if (isLeft)  setPanelIndex(i => (i - 1 + PANELS.length) % PANELS.length);
        setShowCamera(false);
        resetInactivityTimer();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [resetInactivityTimer, startRotation, showCamera, cycleRange, panelIndex]);

  const current = PANELS[panelIndex];
  const withRange = (panel, d) => {
    const o = rangeOverride[panel];
    return d && o ? { ...d, charts: o.charts ?? d.charts, chartRange: rangeLabel(panel, o.n) } : d;
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {!showCamera && <Clock notifications={notifications} />}
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {showCamera ? (
          <Camera activeCam={CAMERAS[camIndex]} />
        ) : (
          <>
            {current === 'weather'        && <Weather       data={data.weather}  />}
            {current === 'calendar'       && <Calendar      data={data.calendar} />}
            {current === 'gmail'          && <Gmail         data={data.gmail}    />}
            {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
            {current === 'steam-sales'    && <SteamSales    data={data.steamData} />}
            {current === 'steam-releases' && <SteamReleases data={data.steamData} />}
            {current === 'stocks'         && <Stocks        data={data.stocks}   />}
            {current === 'portfolio'      && <Portfolio     data={withRange('portfolio', data.portfolio)} />}
            {current === 'minecraft'      && <Minecraft     data={withRange('minecraft', data.minecraft)} />}
          </>
        )}
      </div>
      <StatusBar currentPanel={showCamera ? 'camera' : current} />
      <DebugOverlay getState={() => ({
        panel: showCamera ? 'camera' : current, panelIndex, panelCount: PANELS.length,
        rotating: rotationRef.current != null, camera: showCamera, data,
      })} />
    </div>
  );
}
