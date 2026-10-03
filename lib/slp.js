import net from 'node:net';

export function writeVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

// Returns { value, size } or null if buf ends mid-VarInt.
export function readVarInt(buf, offset = 0) {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (true) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 28) throw new Error('VarInt too long');
  }
  return { value, size: pos - offset };
}

export function buildPacket(id, payload) {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

// Returns the status JSON string, or null until the whole packet has arrived.
export function decodeStatusPacket(buf) {
  const len = readVarInt(buf, 0);
  if (!len || buf.length < len.size + len.value) return null;
  let off = len.size;
  const id = readVarInt(buf, off);
  off += id.size;
  if (id.value !== 0x00) throw new Error(`SLP: unexpected packet id ${id.value}`);
  const strLen = readVarInt(buf, off);
  off += strLen.size;
  return buf.subarray(off, off + strLen.value).toString('utf8');
}

export function flattenMotd(desc) {
  if (desc == null) return '';
  if (typeof desc === 'string') return desc.replace(/§./g, '');
  const own = flattenMotd(desc.text ?? '');
  const extra = Array.isArray(desc.extra) ? desc.extra.map(flattenMotd).join('') : '';
  return own + extra;
}

export function parseStatusResponse(json) {
  const s = JSON.parse(json);
  return {
    version: s.version?.name ?? '',
    motd: flattenMotd(s.description),
    playersOnline: s.players?.online ?? 0,
    playersMax: s.players?.max ?? 0,
    sample: Array.isArray(s.players?.sample) ? s.players.sample : [],
  };
}

function handshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port);
  return buildPacket(0x00, Buffer.concat([
    writeVarInt(-1),               // protocol version: -1 = "just asking for status"
    writeVarInt(hostBuf.length), hostBuf,
    portBuf,
    writeVarInt(1),                // next state: status
  ]));
}

export function ping({ host, port = 25565, timeoutMs = 3000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buf = Buffer.alloc(0);
    const socket = net.createConnection({ host, port });
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err); else resolve(val);
    };
    const timer = setTimeout(() => finish(new Error(`SLP timeout after ${timeoutMs}ms`)), timeoutMs);

    socket.on('connect', () => {
      socket.write(handshake(host, port));
      socket.write(buildPacket(0x00, Buffer.alloc(0)));
    });
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const json = decodeStatusPacket(buf);
        if (json !== null) finish(null, parseStatusResponse(json));
      } catch (e) {
        finish(e);
      }
    });
    socket.on('error', e => finish(e));
    socket.on('close', () => finish(new Error('SLP: connection closed before response')));
  });
}
