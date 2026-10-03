const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
const FLOODGATE_UUID_PREFIX = '00000000-0000-0000-';

export function normalizePlayer({ name, id } = {}) {
  if (!name || !id || id === FAKE_UUID) return null;
  const bedrock = name.startsWith('.') || id.startsWith(FLOODGATE_UUID_PREFIX);
  return { name: name.replace(/^\./, ''), uuid: id, bedrock };
}

// SLP sample first; the exporter list covers players the sample hides (an empty
// sample, or "Anonymous Player" entries from clients with server listing off).
// Returns null when players are online but none can be named, so callers can
// treat it as unknown rather than "everyone left".
export function resolvePlayers(sample, exporterPlayers, playersOnline) {
  if (playersOnline === 0) return [];
  const fromSample = sample.map(normalizePlayer).filter(Boolean);
  if (fromSample.length >= playersOnline) return fromSample;
  const fromExporter = (exporterPlayers ?? []).map(normalizePlayer).filter(Boolean);
  const best = fromExporter.length > fromSample.length ? fromExporter : fromSample;
  return best.length ? best : null;
}
