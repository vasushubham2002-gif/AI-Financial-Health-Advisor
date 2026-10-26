import { Download, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { UserProfile } from '../types.ts';
import { categoryBadge, formatINR } from '../utils.ts';
import { exportReport } from '../report.ts';
import { Card, Stat, secondaryButton } from './ui.tsx';
import ScoreGauge from './ScoreGauge.tsx';
import ScoreChart from './ScoreChart.tsx';

const severityStyle = {
  critical: { box: 'border-red-200 bg-red-50', icon: ShieldAlert, color: 'text-red-600' },
  warning: { box: 'border-amber-200 bg-amber-50', icon: AlertTriangle, color: 'text-amber-600' },
  info: { box: 'border-sky-200 bg-sky-50', icon: Info, color: 'text-sky-600' },
} as const;

export default function Dashboard({ profile }: { profile: UserProfile }) {
  const m = profile.calculatedMetrics;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <ScoreGauge score={profile.cibilScore} category={profile.scoreCategory} />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryBadge(profile.scoreCategory)}`}>
              {profile.scoreCategory}
            </span>
            <span className="text-slate-500">Credit age {profile.creditAgeYears} yrs</span>
          </div>
          <button className={`${secondaryButton} mt-4 w-full`} onClick={() => exportReport(profile)}>
            <Download className="h-4 w-4" /> Download PDF report
          </button>
        </Card>

        <Card title="Key metrics" className="md:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Card utilization" value={`${m.creditUtilizationRatio}%`} hint="Aim for under 30%" />
            <Stat label="FOIR / DTI" value={`${m.dtiRatio}%`} hint="Banks prefer under 40–50%" />
            <Stat label="Total debt" value={formatINR(m.totalTotalDebt)} />
            <Stat label="Monthly EMIs" value={formatINR(m.totalMonthlyEMI)} />
            <Stat label="Free cash / month" value={formatINR(m.discretionarySavings)} />
            <Stat label="Secured share" value={`${m.securedRatio}%`} hint="Of total debt" />
          </div>
        </Card>
      </div>

      <Card title="Credit bottlenecks">
        {m.bottlenecks.length === 0 ? (
          <p className="text-sm text-green-700">No major bottlenecks detected. Keep paying on time.</p>
        ) : (
          <ul className="space-y-3">
            {m.bottlenecks.map((b) => {
              const s = severityStyle[b.severity];
              const Icon = s.icon;
              return (
                <li key={b.id} className={`rounded-xl border p-3 ${s.box}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.color}`} />
                    <div className="text-sm">
                      <p className="font-semibold text-slate-900">{b.title}</p>
                      <p className="mt-1 text-slate-700">{b.description}</p>
                      <p className="mt-2 text-xs text-slate-600">
                        Now: <b>{b.currentValue}</b> · Target: <b>{b.recommendedValue}</b> · Impact: {b.impact}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Score history">
        <ScoreChart history={profile.scoreHistory} />
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {profile.scoreHistory
            .filter((h) => h.event)
            .slice(-4)
            .map((h, i) => (
              <li key={`${h.date}-${i}`}>
                <b>{h.monthLabel}</b> — {h.event}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
