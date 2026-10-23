// Non-sensitive Pi health for the debug overlay: commit, uptime, temperature, load, memory.
// No secrets, addresses or balances belong here (public repo).
import os from 'node:os';
import fs from 'node:fs';
import { execFile } from 'node:child_process';

let commit = null;
const run = (cmd, args) => new Promise(resolve => {
  execFile(cmd, args, { timeout: 2000 }, (err, out) => resolve(err ? null : String(out).trim()));
});

// Last keys the browser saw, so they can be read over ssh without the overlay.
const recentKeys = [];

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const b = req.body ?? {};
    const short = (v) => String(v ?? '').slice(0, 24);
    recentKeys.push({
      at: new Date().toISOString(), ev: short(b.ev || 'keydown'),
      key: short(b.key), code: short(b.code), keyCode: Number(b.keyCode) || 0,
      mods: short(b.mods), note: short(b.note),
    });
    if (recentKeys.length > 60) recentKeys.shift();
    return res.status(204).end();
  }
  if (commit === null) commit = (await run('git', ['rev-parse', '--short', 'HEAD'])) ?? 'unknown';
  let buildId = null;
  try { buildId = fs.readFileSync('.next/BUILD_ID', 'utf8').trim().slice(0, 8); } catch {}
  const t = await run('vcgencmd', ['measure_temp']);
  const tempC = t ? parseFloat(t.replace(/[^0-9.]/g, '')) : null;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    commit, buildId,
    uptimeSec: Math.round(os.uptime()),
    tempC: Number.isFinite(tempC) ? tempC : null,
    load: os.loadavg().map(n => Math.round(n * 100) / 100),
    memFreeMB: Math.round(os.freemem() / 1048576),
    memTotalMB: Math.round(os.totalmem() / 1048576),
    nodeUptimeSec: Math.round(process.uptime()),
    recentKeys,
  });
}
