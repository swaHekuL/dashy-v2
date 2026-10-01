import ical from 'node-ical';

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function parseIcsEvents(text, { from, to, color, busyOnly = false, idPrefix = 'ics' }) {
  const parsed = ical.sync.parseICS(text);
  const out = [];
  for (const ev of Object.values(parsed)) {
    if (ev.type !== 'VEVENT' || !ev.start) continue;
    const instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: false });
    for (const inst of instances) {
      if (busyOnly && /^free$/i.test((inst.summary || '').trim())) continue;
      const start = inst.start;
      const allDay = inst.isFullDay;
      out.push({
        id: `${idPrefix}-${ev.uid}-${start.getTime()}`,
        title: inst.summary?.trim() || (busyOnly ? 'Busy' : '(no title)'),
        date: toLocalDateStr(start),
        time: allDay ? 'All day' : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        color,
        dim: busyOnly || undefined,
        _sort: start.getTime(),
      });
    }
  }
  return out;
}

export async function fetchIcsEvents(url, opts) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status}`);
  return parseIcsEvents(await res.text(), opts);
}
