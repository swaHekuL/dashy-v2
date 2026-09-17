const TTL_MS = 30 * 60 * 1000;

let waiting = new Map();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of waiting) {
    if (entry.since < cutoff) waiting.delete(id);
  }
}

export default function handler(req, res) {
  sweep();

  if (req.method === 'POST') {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!process.env.CLAUDE_NOTIFY_TOKEN || token !== process.env.CLAUDE_NOTIFY_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { event, session_id, machine, project } = req.body ?? {};
    if (!session_id || (event !== 'start' && event !== 'clear')) {
      return res.status(400).json({ error: 'invalid payload' });
    }

    if (event === 'start') {
      waiting.set(session_id, {
        machine: machine || 'unknown',
        project: project || 'unknown',
        since: Date.now(),
      });
    } else {
      waiting.delete(session_id);
    }
    return res.status(200).json({ ok: true });
  }

  const list = Array.from(waiting, ([session_id, entry]) => ({ session_id, ...entry }));
  return res.status(200).json({ waiting: list });
}
