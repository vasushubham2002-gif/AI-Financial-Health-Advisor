import { useState } from 'react';
import confetti from 'canvas-confetti';
import { CreditCard as CardIcon, Landmark } from 'lucide-react';
import { api } from '../api.ts';
import type { UserProfile } from '../types.ts';
import { formatINR } from '../utils.ts';
import { Card, ErrorBox, inputClass, primaryButton, secondaryButton } from './ui.tsx';

interface Props {
  profile: UserProfile;
  onUpdated: (profile: UserProfile) => void;
}

export default function DebtManager({ profile, onUpdated }: Props) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pay = async (type: 'card' | 'loan', itemId: string, closeAccount = false) => {
    const amountPaid = Number(amounts[itemId]);
    if (!closeAccount && !(amountPaid > 0)) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setBusyId(itemId);
    setError(null);
    setMessage(null);
    try {
      const res = await api.payDebt(profile.id, { type, itemId, amountPaid: amountPaid || 0, closeAccount });
      onUpdated(res.profile);
      setAmounts((a) => ({ ...a, [itemId]: '' }));
      setMessage(`Payment recorded. CIBIL score is now ${res.newScore} (+${res.delta}).`);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <ErrorBox message={error} />}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}

      <Card title="Credit cards">
        {profile.creditCards.length === 0 && <p className="text-sm text-slate-500">No credit cards on file.</p>}
        <ul className="space-y-3">
          {profile.creditCards.map((c) => {
            const util = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 0;
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  <CardIcon className="mt-1 h-5 w-5 text-indigo-600" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">{c.bankName} · {c.cardName}</p>
                    <p className="text-slate-600">
                      {formatINR(c.currentBalance)} of {formatINR(c.creditLimit)} ({util}%) · APR {c.aprPercent}% · due {c.dueDate}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${util > 50 ? 'bg-red-500' : util > 30 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, util)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="Amount to pay (₹)"
                    value={amounts[c.id] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))}
                  />
                  <button className={primaryButton} disabled={busyId === c.id} onClick={() => pay('card', c.id)}>
                    Pay
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Loans">
        {profile.activeLoans.length === 0 && <p className="text-sm text-slate-500">No active loans.</p>}
        <ul className="space-y-3">
          {profile.activeLoans.map((l) => (
            <li key={l.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                <Landmark className="mt-1 h-5 w-5 text-indigo-600" />
                <div className="text-sm">
                  <p className="font-semibold">{l.lenderName} · {l.loanType} {l.isSecured ? '(secured)' : '(unsecured)'}</p>
                  <p className="text-slate-600">
                    Outstanding {formatINR(l.principalRemaining)} · EMI {formatINR(l.monthlyEMI)} · {l.interestRate}% · {l.tenureMonthsRemaining} months left
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="Part-prepayment (₹)"
                  value={amounts[l.id] ?? ''}
                  onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
                />
                <button className={primaryButton} disabled={busyId === l.id} onClick={() => pay('loan', l.id)}>
                  Prepay
                </button>
                <button className={secondaryButton} disabled={busyId === l.id} onClick={() => pay('loan', l.id, true)}>
                  Close loan
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
