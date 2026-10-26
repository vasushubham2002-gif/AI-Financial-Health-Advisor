import { useState } from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { api } from '../api.ts';
import type { UserProfile } from '../types.ts';
import { Card, ErrorBox, Spinner, primaryButton } from './ui.tsx';

interface Props {
  profile: UserProfile;
  onUpdated: (profile: UserProfile) => void;
}

export default function Roadmap({ profile, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roadmap = profile.aiRoadmap;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const aiRoadmap = await api.analyze(profile.id);
      onUpdated({ ...profile, aiRoadmap });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate roadmap');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">AI credit roadmap</h2>
            <p className="text-sm text-slate-600">A personalised 5-step plan based on your current profile.</p>
          </div>
          <button className={primaryButton} onClick={generate} disabled={loading}>
            <Sparkles className="h-4 w-4" /> {roadmap ? 'Regenerate' : 'Generate roadmap'}
          </button>
        </div>
        {loading && <div className="mt-3"><Spinner label="Analysing your credit file…" /></div>}
        {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      </Card>

      {roadmap && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
                {roadmap.cibilHealthGrade}
              </span>
              <span className="flex items-center gap-1 text-sm text-slate-700">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Projected score in 6 months: <b>{roadmap.projectedScoreIn6Months}</b>
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-800">{roadmap.summary}</p>
            <p className="mt-2 text-sm text-slate-600"><b>Main bottlenecks:</b> {roadmap.bottleneckSummary}</p>
          </Card>

          <Card title="Action steps">
            <ol className="space-y-3">
              {roadmap.steps.map((s) => (
                <li key={s.stepNumber} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                      {s.stepNumber}
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold">{s.title}</p>
                      <p className="mt-1 text-slate-700">{s.description}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {s.category} · {s.timeframe} · up to +{s.potentialScoreImpact} points
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Indian banking tips">
            <p className="whitespace-pre-line text-sm text-slate-700">{roadmap.indianBankingAdvice}</p>
          </Card>
        </>
      )}
    </div>
  );
}
