import https from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Proxmox signs its node cert with its own CA; trust exactly that CA.
let _ca = null;
function ca() {
  if (!_ca) _ca = readFileSync(join(process.cwd(), 'config', 'pve-root-ca.pem'));
  return _ca;
}

export function findContainer(list, name) {
  return list.find(c => c.name === name) ?? null;
}

export function mapContainer(ct) {
  return {
    status: ct.status,
    cpuPct: Number(ct.cpu) * 100,   // Proxmox reports a fraction of the CT's allotted cpus
    cpus: Number(ct.cpus),
    memUsed: Number(ct.mem),
    memMax: Number(ct.maxmem),
    diskUsed: Number(ct.disk),
    diskMax: Number(ct.maxdisk),
    uptime: Number(ct.uptime),
  };
}

function getJson(path, timeoutMs) {
  const { PROXMOX_URL, PROXMOX_TOKEN_ID, PROXMOX_TOKEN_SECRET } = process.env;
  if (!PROXMOX_URL || !PROXMOX_TOKEN_ID || !PROXMOX_TOKEN_SECRET) {
    return Promise.reject(new Error('PROXMOX_* env vars not set'));
  }
  const url = new URL(`/api2/json${path}`, PROXMOX_URL);
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      ca: ca(),
      headers: { Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}` },
      timeout: timeoutMs,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Proxmox HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body).data); } catch { reject(new Error('Proxmox: invalid JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Proxmox timeout after ${timeoutMs}ms`)));
    req.on('error', reject);
  });
}

export function latestCpu(rrd) {
  const points = (rrd ?? []).filter(p => p.cpu != null);
  return points.length ? Number(points[points.length - 1].cpu) : null;
}

export async function getContainer(name, { timeoutMs = 5000 } = {}) {
  const list = await getJson('/nodes/pve/lxc', timeoutMs);
  const ct = findContainer(list ?? [], name);
  if (!ct) throw new Error(`Proxmox: container "${name}" not found`);
  // The list's cpu is an instantaneous sample that often reads 0; the newest
  // rrd point is a 1-minute average. Fall back to the list value if rrd fails.
  let cpu = null;
  try {
    cpu = latestCpu(await getJson(`/nodes/pve/lxc/${ct.vmid}/rrddata?timeframe=hour&cf=AVERAGE`, timeoutMs));
  } catch { /* keep list value */ }
  return mapContainer(cpu == null ? ct : { ...ct, cpu });
}

export function mapHost(st) {
  return {
    cpuPct: Number(st.cpu) * 100,   // fraction of all host cores
    cpus: Number(st.cpuinfo?.cpus),
    memUsed: Number(st.memory?.used),
    memMax: Number(st.memory?.total),
    diskUsed: Number(st.rootfs?.used),
    diskMax: Number(st.rootfs?.total),
    uptime: Number(st.uptime),
  };
}

export async function getHost({ timeoutMs = 5000 } = {}) {
  return mapHost(await getJson('/nodes/pve/status', timeoutMs));
}
