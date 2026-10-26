import { scoreColor } from '../utils.ts';

const MIN = 300;
const MAX = 900;

/** Semicircle gauge for a CIBIL score (300–900). */
export default function ScoreGauge({ score, category }: { score: number; category: string }) {
  const pct = Math.min(1, Math.max(0, (score - MIN) / (MAX - MIN)));
  const r = 80;
  const cx = 100;
  const cy = 100;
  const angle = Math.PI * (1 - pct);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const largeArc = pct > 0.5 ? 1 : 0;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-xs" role="img" aria-label={`CIBIL score ${score}`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e2e8f0" strokeWidth="14" strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="34" fontWeight="700" fill={color}>
          {score}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#64748b">
          {category}
        </text>
        <text x={cx - r} y={cy + 24} textAnchor="middle" fontSize="9" fill="#94a3b8">{MIN}</text>
        <text x={cx + r} y={cy + 24} textAnchor="middle" fontSize="9" fill="#94a3b8">{MAX}</text>
      </svg>
    </div>
  );
}
