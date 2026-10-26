import type { ScoreHistoryEntry } from '../types.ts';

/** Lightweight SVG line chart for score history (no chart library needed). */
export default function ScoreChart({ history }: { history: ScoreHistoryEntry[] }) {
  if (history.length === 0) return <p className="text-sm text-slate-500">No score history yet.</p>;

  const W = 560;
  const H = 220;
  const pad = { l: 40, r: 16, t: 16, b: 32 };
  const scores = history.map((h) => h.score);
  const lo = Math.floor((Math.min(...scores) - 20) / 10) * 10;
  const hi = Math.ceil((Math.max(...scores) + 20) / 10) * 10;
  const xAt = (i: number) =>
    history.length === 1 ? W / 2 : pad.l + (i * (W - pad.l - pad.r)) / (history.length - 1);
  const yAt = (s: number) => pad.t + ((hi - s) * (H - pad.t - pad.b)) / (hi - lo || 1);
  const points = history.map((h, i) => `${xAt(i)},${yAt(h.score)}`).join(' ');
  const ticks = [lo, Math.round((lo + hi) / 2), hi];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="CIBIL score history">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={yAt(t)} y2={yAt(t)} stroke="#e2e8f0" />
          <text x={pad.l - 6} y={yAt(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">{t}</text>
        </g>
      ))}
      <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />
      {history.map((h, i) => (
        <g key={`${h.date}-${i}`}>
          <circle cx={xAt(i)} cy={yAt(h.score)} r="4" fill="#4f46e5">
            <title>{`${h.monthLabel}: ${h.score}${h.event ? ` — ${h.event}` : ''}`}</title>
          </circle>
          <text x={xAt(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#64748b">
            {h.monthLabel.replace(' (Updated)', '')}
          </text>
        </g>
      ))}
    </svg>
  );
}
