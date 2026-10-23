// Chart time ranges, cycled with the remote's "b" button. First entry is the default.
export const RANGES = {
  minecraft: { unit: 'h', values: [72, 24, 6] },
  portfolio: { unit: 'd', values: [30, 90, 7] },
};
export const RANGE_KEY = 'b';

export const defaultRange = (panel) => RANGES[panel]?.values[0] ?? null;

export function nextRange(panel, current) {
  const r = RANGES[panel];
  if (!r) return null;
  const i = r.values.indexOf(current);
  return r.values[(i + 1) % r.values.length];
}

export const isAllowedRange = (panel, n) => !!RANGES[panel]?.values.includes(n);
export const rangeLabel = (panel, n) => (RANGES[panel] && n != null ? `${n} ${RANGES[panel].unit}` : '');
