import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../api.ts';
import type { BankOffer, RefinanceResult, UserProfile } from '../types.ts';
import { formatINR } from '../utils.ts';
import { Card, ErrorBox, Spinner, inputClass, primaryButton } from './ui.tsx';

const CATEGORIES = [
  { value: 'all', label: 'All offers' },
  { value: 'debt_consolidation', label: 'Debt consolidation' },
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'gold_loan', label: 'Gold loan' },
  { value: 'home_loan_balance_transfer', label: 'Home loan transfer' },
];

export default function BankOffers({ profile }: { profile: UserProfile }) {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('rate_asc');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [offers, setOffers] = useState<BankOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetRate, setTargetRate] = useState('11');
  const [tenure, setTenure] = useState('36');
  const [refi, setRefi] = useState<RefinanceResult | null>(null);
  const [refiError, setRefiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .bankOffers({ category, sort, minCibil: eligibleOnly ? profile.cibilScore : undefined })
      .then((o) => !cancelled && setOffers(o))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load offers'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category, sort, eligibleOnly, profile.cibilScore]);

  const simulateRefinance = async () => {
    setRefiError(null);
    const debtItems = [
      ...profile.creditCards
        .filter((c) => c.currentBalance > 0)
        .map((c) => ({
          amount: c.currentBalance,
          rate: c.aprPercent,
          monthlyPayment: Math.round(c.currentBalance * 0.05),
          type: 'card',
        })),
      ...profile.activeLoans
        .filter((l) => !l.isSecured)
        .map((l) => ({ amount: l.principalRemaining, rate: l.interestRate, monthlyPayment: l.monthlyEMI, type: 'loan' })),
    ];
    if (debtItems.length === 0) {
      setRefiError('No unsecured debt to consolidate.');
      return;
    }
    try {
      setRefi(await api.refinance({ debtItems, targetRate: Number(targetRate), tenureMonths: Number(tenure) }));
    } catch (e) {
      setRefiError(e instanceof Error ? e.message : 'Simulation failed');
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Debt consolidation calculator">
        <p className="mb-3 text-sm text-slate-600">
          Combines your card balances and unsecured loans into one loan at a lower rate.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Target rate (% p.a.)</span>
            <input className={inputClass} type="number" step="0.1" min="1" value={targetRate} onChange={(e) => setTargetRate(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tenure (months)</span>
            <input className={inputClass} type="number" min="6" value={tenure} onChange={(e) => setTenure(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button className={`${primaryButton} w-full`} onClick={simulateRefinance}>Calculate</button>
          </div>
        </div>
        {refiError && <div className="mt-3"><ErrorBox message={refiError} /></div>}
        {refi && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Debt consolidated</dt><dd className="font-semibold">{formatINR(refi.totalConsolidatedDebt)}</dd></div>
            <div><dt className="text-slate-500">Current monthly outgo</dt><dd className="font-semibold">{formatINR(refi.currentMonthlyObligation)}</dd></div>
            <div><dt className="text-slate-500">New EMI</dt><dd className="font-semibold">{formatINR(refi.refinancedMonthlyEMI)}</dd></div>
            <div><dt className="text-slate-500">Monthly saving</dt><dd className="font-semibold text-green-700">{formatINR(refi.monthlySavings)}</dd></div>
            <div><dt className="text-slate-500">Interest saved (est.)</dt><dd className="font-semibold text-green-700">{formatINR(refi.lifetimeInterestSaved)}</dd></div>
            <div><dt className="text-slate-500">Likely score change</dt><dd className="font-semibold text-green-700">+{refi.projectedCibilDelta}</dd></div>
          </dl>
        )}
      </Card>

      <Card title="Loan offers">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="rate_asc">Lowest rate</option>
            <option value="cibil_asc">Lowest CIBIL needed</option>
            <option value="rating_desc">Best rated</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} />
            Only offers I'm close to qualifying for
          </label>
        </div>

        {loading && <Spinner label="Loading offers…" />}
        {error && <ErrorBox message={error} />}
        {!loading && !error && offers.length === 0 && (
          <p className="text-sm text-slate-500">No offers match these filters.</p>
        )}

        <ul className="space-y-3">
          {offers.map((o) => (
            <li key={o.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-14 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${o.themeColor}`}>
                  {o.bankLogoText}
                </span>
                <div className="flex-1 text-sm">
                  <p className="font-semibold">{o.productName}</p>
                  <p className="text-xs text-slate-500">{o.bankName} · {o.badge}</p>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                  <Star className="h-3.5 w-3.5 fill-current" /> {o.partnerRating}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
                <p>Rate<br /><b>{o.interestRateMin}–{o.interestRateMax}%</b></p>
                <p>Min CIBIL<br /><b>{o.minCibilScore}</b></p>
                <p>Up to<br /><b>{formatINR(o.maxAmount)}</b></p>
                <p>Fee<br /><b>{o.processingFee}</b></p>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
                {o.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <p className="mt-2 text-xs text-slate-400">Disbursal: {o.disbursalTime} · {o.officialApplyUrlNote}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">Sample offers for demonstration; confirm current terms with the lender.</p>
      </Card>
    </div>
  );
}
