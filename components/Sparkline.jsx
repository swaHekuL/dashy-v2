import { sparkPath } from '../lib/sparkline';

// Plain SVG line chart. Stretches to its container.
export default function Sparkline({ points, color = '#4caf50', min, max, minSpan, fill = false }) {
  const p = sparkPath(points, { min, max, minSpan });
  if (!p) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '1.4vw' }}>
        collecting…
      </div>
    );
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {fill && <path d={`${p.d}L100 100L0 100Z`} fill={color} opacity="0.15" />}
      <path d={p.d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
