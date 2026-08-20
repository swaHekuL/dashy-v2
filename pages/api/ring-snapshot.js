import { RingApi } from 'ring-client-api';

let ringApi = null;

function getApi() {
  if (!ringApi) {
    ringApi = new RingApi({
      refreshToken: process.env.RING_REFRESH_TOKEN,
      onRefreshTokenUpdated: () => {},
    });
  }
  return ringApi;
}

export default async function handler(req, res) {
  if (!process.env.RING_REFRESH_TOKEN) {
    return res.status(503).end('Ring not configured');
  }

  try {
    const cameras = await getApi().getCameras();
    if (!cameras.length) return res.status(503).end('No Ring cameras found');

    const snapshot = await cameras[0].getSnapshot();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(snapshot);
  } catch (e) {
    console.error('[ring-snapshot]', e.message);
    ringApi = null; // reset so next request re-authenticates
    res.status(503).end('Ring snapshot failed');
  }
}
