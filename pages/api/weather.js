import settings from '../../config/settings.json';

let cache = null;
let cacheAt = 0;
const TTL = 10 * 60 * 1000;

const WMO = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
  80: 'Showers', 81: 'Heavy Showers', 82: 'Violent Showers',
  85: 'Snow Showers', 86: 'Heavy Snow Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ Hail', 99: 'Severe Thunderstorm',
};

export default async function handler(req, res) {
  if (!settings.lat || settings.lat === 'YOUR_LATITUDE' ||
      !settings.lon || settings.lon === 'YOUR_LONGITUDE') {
    return res.status(503).json({ error: 'weather not configured' });
  }

  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${settings.lat}&longitude=${settings.lon}&current_weather=true&hourly=temperature_2m,weathercode,windspeed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=auto`;
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const d = await r.json();

    const temps = d.hourly?.temperature_2m ?? [];
    const codes = d.hourly?.weathercode ?? [];
    const winds = d.hourly?.windspeed_10m ?? [];
    const times = d.hourly?.time ?? [];
    const isDayArr = d.hourly?.is_day ?? [];

    // current_weather.time can be 15-min aligned (e.g. T18:45); truncate to hour to match hourly array
    const cwHour = d.current_weather.time?.slice(0, 13) + ':00';
    const curIdx = times.indexOf(cwHour);
    const startSlot = curIdx >= 0 ? (Math.floor(curIdx / 3) + 1) * 3 : 3;

    const forecast = [startSlot, startSlot + 3, startSlot + 6, startSlot + 9]
      .filter(i => i < times.length)
      .map(i => ({
        // Parse local time string directly — no Date() to avoid UTC/local conversion
        time: (() => { const h = +times[i].slice(11, 13); const m = times[i].slice(14, 16); const ampm = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${m} ${ampm}`; })(),
        temp: Math.round(temps[i]),
        conditionCode: codes[i],
        wind: Math.round(winds[i]),
        isDay: isDayArr[i] === 1,
      }));

    const todayTemps = temps.slice(0, 24);
    cache = {
      temp: Math.round(d.current_weather.temperature),
      condition: WMO[d.current_weather.weathercode] ?? 'Unknown',
      wind: Math.round(d.current_weather.windspeed),
      isDay: d.current_weather.is_day === 1,
      high: todayTemps.length ? Math.round(Math.max(...todayTemps)) : null,
      low: todayTemps.length ? Math.round(Math.min(...todayTemps)) : null,
      forecast,
    };
    cacheAt = now;
    res.json(cache);
  } catch (e) {
    clearTimeout(timer);
    console.error('[weather]', e);
    if (cache) return res.json(cache);
    res.status(503).json({ error: 'unavailable' });
  }
}
