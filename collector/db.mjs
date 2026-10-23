import { DatabaseSync } from 'node:sqlite';

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS samples (
      metric TEXT NOT NULL, ts INTEGER NOT NULL, value REAL NOT NULL,
      PRIMARY KEY (metric, ts)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  `);
  const ins = db.prepare('INSERT OR REPLACE INTO samples (metric, ts, value) VALUES (?, ?, ?)');
  const sel = db.prepare('SELECT ts, value FROM samples WHERE metric = ? AND ts >= ? AND ts <= ? ORDER BY ts');
  const del = db.prepare("DELETE FROM samples WHERE ts < ? AND metric NOT LIKE 'pf_total:%'");
  const acct = db.prepare('INSERT OR REPLACE INTO accounts (id, name) VALUES (?, ?)');
  return {
    addSamples(ts, values) {            // values: { metric: number }; non-finite values are skipped
      let n = 0;
      db.exec('BEGIN');
      try {
        for (const [m, v] of Object.entries(values)) {
          if (typeof v === 'number' && Number.isFinite(v)) { ins.run(m, ts, v); n++; }
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return n;
    },
    addPortfolio(ts, accounts) {
      db.exec('BEGIN');
      try {
        for (const a of accounts) {
          acct.run(a.id, a.name);
          ins.run(`pf_total:${a.id}`, ts, a.value);
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    series(metric, from, to) { return sel.all(metric, from, to).map(r => [r.ts, r.value]); },
    accounts() { return db.prepare('SELECT id, name FROM accounts ORDER BY name').all().map(r => ({ id: r.id, name: r.name })); },
    prune(beforeTs) { return Number(del.run(beforeTs).changes); },
    lastTs() { return db.prepare('SELECT MAX(ts) AS t FROM samples').get().t; },
    close() { db.close(); },
  };
}
