import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapContainer, findContainer, getContainer, mapHost, getHost, latestCpu } from '../proxmox.js';

test('latestCpu takes the newest rrd point that has a cpu value', () => {
  const rrd = [{ time: 1, cpu: 0.5 }, { time: 2, cpu: 0.62 }, { time: 3 }];
  assert.equal(latestCpu(rrd), 0.62);
});

test('latestCpu returns null for empty or cpu-less rrd data', () => {
  assert.equal(latestCpu([]), null);
  assert.equal(latestCpu([{ time: 1 }]), null);
  assert.equal(latestCpu(null), null);
});

const LIST = [
  { vmid: 102, name: 'claude-agent', status: 'running', cpu: 0.01, cpus: 2, mem: 1, maxmem: 2, disk: 1, maxdisk: 2, uptime: 5 },
  { vmid: 101, name: 'minecraft', status: 'running', cpu: 0.25, cpus: 4, mem: 5476083712, maxmem: 8589934592, disk: 8800000000, maxdisk: 21474836480, uptime: 273600 },
];

test('findContainer matches by name, not vmid', () => {
  assert.equal(findContainer(LIST, 'minecraft').vmid, 101);
  assert.equal(findContainer(LIST, 'nope'), null);
});

test('mapContainer converts cpu fraction to percent and coerces numbers', () => {
  assert.deepEqual(mapContainer({ ...LIST[1], mem: '5476083712' }), {
    status: 'running', cpuPct: 25, cpus: 4,
    memUsed: 5476083712, memMax: 8589934592,
    diskUsed: 8800000000, diskMax: 21474836480, uptime: 273600,
  });
});

test('mapHost flattens /nodes/pve/status', () => {
  const raw = {
    cpu: 0.12, uptime: 1036800, loadavg: ['0.5', '0.4', '0.3'],
    cpuinfo: { cpus: 8, model: 'x' },
    memory: { used: 19327352832, total: 33617092608, free: 1 },
    rootfs: { used: 40000000000, total: 100000000000, avail: 1 },
  };
  assert.deepEqual(mapHost(raw), {
    cpuPct: 12, cpus: 8, memUsed: 19327352832, memMax: 33617092608,
    diskUsed: 40000000000, diskMax: 100000000000, uptime: 1036800,
  });
});

test('getContainer/getHost reject without leaking anything when env is missing', async () => {
  const saved = { ...process.env };
  delete process.env.PROXMOX_URL;
  delete process.env.PROXMOX_TOKEN_ID;
  delete process.env.PROXMOX_TOKEN_SECRET;
  try {
    await assert.rejects(getContainer('minecraft'), /PROXMOX_\* env vars not set/);
    await assert.rejects(getHost(), /PROXMOX_\* env vars not set/);
  } finally { Object.assign(process.env, saved); }
});
