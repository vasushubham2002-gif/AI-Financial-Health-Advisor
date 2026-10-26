import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../api.ts';
import type { SimulationResult, UserProfile } from '../types.ts';
import { Card, ErrorBox, Spinner, inputClass, primaryButton } from './ui.tsx';

const SCENARIOS = [
  { value: 'pay_credit_card', label: 'Pay down credit card balance', needsAmount: true },
  { value: 'preclose_personal_loan', label: 'Pre-close a personal loan', needsAmount: false },
  { value: 'card_limit_enhancement', label: 'Accept a card limit increase', needsAmount: true },
  { value: 'six_months_on_time', label: 'Pay everything on time for 6 months', needsAmount: false },
];

export default function Simulator({ profile }: { profile: UserProfile }) {
  const [action, setAction] = useState(SCENARIOS[0].value);
  const [amount, setAmount] = useState('25000');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scenario = SCENARIOS.find((s) => s.value === action)!;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.simulate(profile.id, action, Number(amount) || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="What-if simulator">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Scenario</span>
            <select className={inputClass} value={action} onChange={(e) => { setAction(e.target.value); setResult(null); }}>
              {SCENARIOS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          {scenario.needsAmount && (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Amount (₹)</span>
              <input className={inputClass} type="number" min="0" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          )}
        </div>
        <button className={`${primaryButton} mt-4`} onClick={run} disabled={loading}>
          Simulate
        </button>
        {loading && <div className="mt-3"><Spinner label="Calculating…" /></div>}
        {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      </Card>

      {result && (
        <Card title="Projected result">
          <div className="flex items-center justify-center gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500">Now</p>
              <p className="text-3xl font-bold text-slate-700">{result.currentScore}</p>
            </div>
            <ArrowRight className="h-6 w-6 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Projected</p>
              <p className="text-3xl font-bold text-green-600">{result.projectedScore}</p>
              <p className="text-xs font-medium text-green-700">+{result.delta} points</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-700">{result.impactExplanation}</p>
          <p className="mt-2 text-xs text-slate-500">
            Utilization after: {result.projectedUtilization}% · FOIR after: {result.projectedDTI}%
          </p>
          <p className="mt-2 text-xs text-slate-400">Estimates only; real bureau scores depend on CIBIL's own model.</p>
        </Card>
      )}
    </div>
  );
}
