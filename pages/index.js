import { useState, useEffect } from 'react';
import Clock from '../screens/Clock';
import Calendar from '../screens/Calendar';
import News from '../screens/News';
import SteamSales from '../screens/SteamSales';
import SteamReleases from '../screens/SteamReleases';
import Weather from '../screens/Weather';
import Gmail from '../screens/Gmail';
import Stocks from '../screens/Stocks';
import GasPrices from '../screens/GasPrices';
import StatusBar from '../screens/StatusBar';

const PANELS = [
  'weather', 'calendar', 'gmail',
  // 'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  // 'steam-sales', 'steam-releases',
  'stocks', 'gas',
];

const PANEL_MS = 10000;

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
  gas:               2 * 60 * 60 * 1000,
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
  const [data, setData] = useState({
    weather: null, calendar: null, gmail: null,
    'news-world': null, 'news-gaming': null, 'news-tech': null,
    'news-sports': null, 'news-utah': null,
    steamData: null,
    stocks: null,
    gas: null,
  });

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
      if (!res.ok) return;
      const json = await res.json();
      setData(prev => ({ ...prev, [dataKey]: json }));
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
      <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
        {current === 'weather'        && <Weather       data={data.weather}  />}
        {current === 'calendar'       && <Calendar      data={data.calendar} />}
        {current === 'gmail'          && <Gmail         data={data.gmail}    />}
        {current.startsWith('news-')  && <News          data={data[current]} category={NEWS_LABELS[current]} />}
        {current === 'steam-sales'    && <SteamSales    data={data.steamData}    />}
        {current === 'steam-releases' && <SteamReleases data={data.steamData}    />}
        {current === 'stocks'         && <Stocks        data={data.stocks}   />}
        {current === 'gas'            && <GasPrices     data={data.gas}      />}
      </div>
      <StatusBar currentPanel={current} />
    </div>
  );
}
