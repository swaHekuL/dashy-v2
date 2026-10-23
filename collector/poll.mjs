import { scrape } from '../lib/mcMetrics.js';
import { ping } from '../lib/slp.js';
import { getContainer, getHost } from '../lib/proxmox.js';

// Turn one round of results into metric values. Failed sources contribute nothing (no zeros).
export function toValues({ slp, metrics, ct, host }) {
  const v = {};
  if (metrics) { v.mc_tps = metrics.tps; v.mc_chunks = metrics.chunks; v.mc_entities = metrics.entities; }
  if (slp) v.mc_players = slp.playersOnline;
  if (ct) {
    v.ct_cpu_pct = ct.cpuPct; v.ct_mem_used = ct.memUsed; v.ct_mem_max = ct.memMax; v.ct_disk_used = ct.diskUsed;
  }
  if (host) { v.host_cpu_pct = host.cpuPct; v.host_mem_used = host.memUsed; v.host_disk_used = host.diskUsed; }
  return v;
}

const lastError = {};
function report(part, r) {
  const msg = r.status === 'rejected' ? (r.reason?.message ?? String(r.reason)) : null;
  if (msg && msg !== lastError[part]) console.error(`[collector] ${part}: ${msg}`);
  if (!msg && lastError[part]) console.log(`[collector] ${part}: recovered`);
  lastError[part] = msg;
  return r.status === 'fulfilled' ? r.value : null;
}

export async function pollOnce(cfg) {
  const [slp, metrics, ct, host] = await Promise.allSettled([
    ping({ host: cfg.host, port: cfg.port }),
    scrape({ url: `http://${cfg.host}:${cfg.metricsPort}/metrics` }),
    getContainer(cfg.container),
    getHost(),
  ]);
  return toValues({
    slp: report('slp', slp), metrics: report('metrics', metrics),
    ct: report('proxmox-ct', ct), host: report('proxmox-host', host),
  });
}
