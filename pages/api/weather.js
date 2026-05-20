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
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${settings.lat}&longitude=${settings.lon}&current_weather=true&hourly=temperature_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1`;
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const d = await r.json();

    const temps = d.hourly?.temperature_2m ?? [];

    cache = {
      temp: Math.round(d.current_weather.temperature),
      condition: WMO[d.current_weather.weathercode] ?? 'Unknown',
      wind: Math.round(d.current_weather.windspeed),
      high: temps.length ? Math.round(Math.max(...temps)) : null,
      low: temps.length ? Math.round(Math.min(...temps)) : null,
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
