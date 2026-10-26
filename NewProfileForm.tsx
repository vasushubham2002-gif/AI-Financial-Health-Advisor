import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { api } from '../api.ts';
import type { UserProfile } from '../types.ts';
import { ErrorBox, inputClass, primaryButton, secondaryButton } from './ui.tsx';

interface Props {
  onCreated: (profile: UserProfile) => void;
  onClose: () => void;
}

const field = (label: string, node: ReactNode) => (
  <label className="text-sm">
    <span className="mb-1 block font-medium text-slate-700">{label}</span>
    {node}
  </label>
);

export default function NewProfileForm({ onCreated, onClose }: Props) {
  const [f, setF] = useState({
    name: '',
    occupation: '',
    monthlyIncome: '',
    monthlyExpenses: '',
    cibilScore: '',
    missedPaymentsLast24Months: '0',
    hardInquiriesLast6Months: '1',
    creditAgeYears: '2',
    cardBank: '',
    cardLimit: '',
    cardBalance: '',
    loanLender: '',
    loanBalance: '',
    loanEMI: '',
    loanRate: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const score = Number(f.cibilScore);
    if (!f.name.trim()) return setError('Name is required.');
    if (!(Number(f.monthlyIncome) > 0)) return setError('Monthly income must be greater than 0.');
    if (score < 300 || score > 900) return setError('CIBIL score must be between 300 and 900.');

    setBusy(true);
    setError(null);
    try {
      const profile = await api.createProfile({
        name: f.name.trim(),
        occupation: f.occupation,
        monthlyIncome: Number(f.monthlyIncome),
        monthlyExpenses: Number(f.monthlyExpenses),
        cibilScore: score,
        missedPaymentsLast24Months: Number(f.missedPaymentsLast24Months),
        hardInquiriesLast6Months: Number(f.hardInquiriesLast6Months),
        creditAgeYears: Number(f.creditAgeYears),
        creditCards: f.cardLimit
          ? [{ bankName: f.cardBank || 'Bank', creditLimit: Number(f.cardLimit), currentBalance: Number(f.cardBalance) || 0 }]
          : [],
        activeLoans: f.loanBalance
          ? [{ lenderName: f.loanLender || 'Lender', principalRemaining: Number(f.loanBalance), monthlyEMI: Number(f.loanEMI) || 0, interestRate: Number(f.loanRate) || 14, isSecured: false }]
          : [],
      });
      onCreated(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add your profile</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Full name', <input className={inputClass} value={f.name} onChange={set('name')} required />)}
          {field('Occupation', <input className={inputClass} value={f.occupation} onChange={set('occupation')} />)}
          {field('Monthly income (₹)', <input className={inputClass} type="number" min="0" value={f.monthlyIncome} onChange={set('monthlyIncome')} required />)}
          {field('Monthly expenses (₹)', <input className={inputClass} type="number" min="0" value={f.monthlyExpenses} onChange={set('monthlyExpenses')} />)}
          {field('CIBIL score (300–900)', <input className={inputClass} type="number" min="300" max="900" value={f.cibilScore} onChange={set('cibilScore')} required />)}
          {field('Credit age (years)', <input className={inputClass} type="number" min="0" step="0.5" value={f.creditAgeYears} onChange={set('creditAgeYears')} />)}
          {field('Missed payments (24 months)', <input className={inputClass} type="number" min="0" value={f.missedPaymentsLast24Months} onChange={set('missedPaymentsLast24Months')} />)}
          {field('Hard inquiries (6 months)', <input className={inputClass} type="number" min="0" value={f.hardInquiriesLast6Months} onChange={set('hardInquiriesLast6Months')} />)}
        </div>

        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Credit card (optional)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {field('Bank', <input className={inputClass} value={f.cardBank} onChange={set('cardBank')} />)}
          {field('Limit (₹)', <input className={inputClass} type="number" min="0" value={f.cardLimit} onChange={set('cardLimit')} />)}
          {field('Balance (₹)', <input className={inputClass} type="number" min="0" value={f.cardBalance} onChange={set('cardBalance')} />)}
        </div>

        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Loan (optional)</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          {field('Lender', <input className={inputClass} value={f.loanLender} onChange={set('loanLender')} />)}
          {field('Outstanding (₹)', <input className={inputClass} type="number" min="0" value={f.loanBalance} onChange={set('loanBalance')} />)}
          {field('EMI (₹)', <input className={inputClass} type="number" min="0" value={f.loanEMI} onChange={set('loanEMI')} />)}
          {field('Rate (%)', <input className={inputClass} type="number" min="0" step="0.1" value={f.loanRate} onChange={set('loanRate')} />)}
        </div>

        {error && <div className="mt-4"><ErrorBox message={error} /></div>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButton} disabled={busy}>{busy ? 'Saving…' : 'Create profile'}</button>
        </div>
      </form>
    </div>
  );
}
