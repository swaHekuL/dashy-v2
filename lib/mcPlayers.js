const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
const FLOODGATE_UUID_PREFIX = '00000000-0000-0000-';

export function normalizePlayer({ name, id } = {}) {
  if (!name || !id || id === FAKE_UUID) return null;
  const bedrock = name.startsWith('.') || id.startsWith(FLOODGATE_UUID_PREFIX);
  return { name: name.replace(/^\./, ''), uuid: id, bedrock };
}

// SLP sample is authoritative; the exporter list covers servers that hide the sample.
export function resolvePlayers(sample, exporterPlayers, playersOnline) {
  if (playersOnline === 0) return [];
  const source = sample.length ? sample : (exporterPlayers ?? []);
  return source.map(normalizePlayer).filter(Boolean);
}
