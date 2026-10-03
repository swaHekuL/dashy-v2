import settings from '../../config/settings.json';
import { ping } from '../../lib/slp';
import { scrape } from '../../lib/mcMetrics';
import { getContainer, getHost } from '../../lib/proxmox';
import { resolvePlayers, normalizePlayer } from '../../lib/mcPlayers';
import { load, save, update, peakToday } from '../../lib/mcHistory';

let history = null;
// Log each failure once when it starts, not every 30s while it lasts.
const lastError = {};

function report(part, result) {
  const msg = result.status === 'rejected' ? (result.reason?.message ?? String(result.reason)) : null;
  if (msg && msg !== lastError[part]) console.error(`[minecraft] ${part}: ${msg}`);
  if (!msg && lastError[part]) console.log(`[minecraft] ${part}: recovered`);
  lastError[part] = msg;
}

export default async function handler(req, res) {
  const cfg = settings.minecraft;
  if (!cfg?.host) return res.status(503).json({ error: 'minecraft not configured' });

  const [slp, metrics, ct, host] = await Promise.allSettled([
    ping({ host: cfg.host, port: cfg.port }),
    scrape({ url: `http://${cfg.host}:${cfg.metricsPort}/metrics` }),
    getContainer(cfg.container),
    getHost(),
  ]);
  report('slp', slp);
  report('metrics', metrics);
  report('proxmox-ct', ct);
  report('proxmox-host', host);

  if (!history) history = load();
  const now = Date.now();

  let mc = { online: false };
  if (slp.status === 'fulfilled') {
    const s = slp.value;
    const exporterPlayers = metrics.status === 'fulfilled' ? metrics.value.players : null;
    const resolved = resolvePlayers(s.sample, exporterPlayers, s.playersOnline);

    let players;
    if (resolved === null) {
      // Players are on but unnamed this poll: keep last known list, don't end their sessions.
      players = Object.entries(history.online)
        .map(([uuid, info]) => normalizePlayer({ name: info.name, id: uuid }))
        .filter(Boolean);
    } else {
      players = resolved;
      const next = update(history, players, now);
      history = next.state;
      if (next.changed) {
        try { save(history); } catch (e) { console.error('[minecraft] history save:', e.message); }
      }
    }

    mc = {
      online: true,
      version: s.version,
      motd: s.motd,
      playersOnline: s.playersOnline,
      playersMax: s.playersMax,
      players: players
        .map(p => ({ ...p, onlineSince: history.online[p.uuid].since }))
        .sort((a, b) => a.onlineSince - b.onlineSince),
    };
  }

  res.json({
    mc,
    tps: metrics.status === 'fulfilled'
      ? { tps: metrics.value.tps, chunks: metrics.value.chunks, entities: metrics.value.entities }
      : null,
    ct: ct.status === 'fulfilled' ? ct.value : null,
    host: host.status === 'fulfilled' ? host.value : null,
    history: { peakToday: peakToday(history, now), lastSeen: history.lastSeen },
  });
}
