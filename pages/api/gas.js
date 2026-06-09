import settings from '../../config/settings.json';
import creds from '../../config/credentials.json';

// Persists between requests in the same server process.
// Keyed by placeId, stores last known price to compute deltas.
const priceCache = {};

export default async function handler(req, res) {
  const { stations } = settings.gasPrices;
  const apiKey = creds.maps_api_key;

  const results = await Promise.all(
    stations.map(async ({ label, placeId }) => {
      try {
        const response = await fetch(
          `https://places.googleapis.com/v1/places/${placeId}`,
          {
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'fuelOptions',
            },
          }
        );
        if (!response.ok) {
          const errText = await response.text();
          return { label, price: null, delta: null, updatedAt: null, _debug: { status: response.status, body: errText.slice(0, 200) } };
        }

        const body = await response.json();
        const fuelPrices = body.fuelOptions?.fuelPrices ?? [];
        const regular = fuelPrices.find(f => f.type === 'REGULAR_UNLEADED');
        if (!regular) {
          return { label, price: null, delta: null, updatedAt: null, _debug: { bodyKeys: Object.keys(body), types: fuelPrices.map(f => f.type) } };
        }

        const price = Math.round(
          (parseInt(regular.price.units, 10) + regular.price.nanos / 1e9) * 100
        ) / 100;
        const updatedAt = regular.updateTime;

        const prev = priceCache[placeId];
        const delta = prev !== undefined ? Math.round((price - prev) * 100) / 100 : null;
        priceCache[placeId] = price;

        return { label, price, delta, updatedAt };
      } catch (e) {
        return { label, price: null, delta: null, updatedAt: null, _debug: { fetchError: e.message } };
      }
    })
  );

  res.status(200).json(results);
}
