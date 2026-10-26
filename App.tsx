import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Bot, Calculator, Landmark, Map, Plus, Wallet } from 'lucide-react';
import { api } from './api.ts';
import type { ProfileSummary, UserProfile } from './types.ts';
import Dashboard from './components/Dashboard.tsx';
import DebtManager from './components/DebtManager.tsx';
import Roadmap from './components/Roadmap.tsx';
import Simulator from './components/Simulator.tsx';
import BankOffers from './components/BankOffers.tsx';
import ChatBot from './components/ChatBot.tsx';
import NewProfileForm from './components/NewProfileForm.tsx';
import { ErrorBox, Spinner, inputClass, secondaryButton } from './components/ui.tsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'debts', label: 'Debts', icon: Wallet },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'simulator', label: 'Simulator', icon: Calculator },
  { id: 'offers', label: 'Offers', icon: Landmark },
  { id: 'chat', label: 'Advisor', icon: Bot },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [summaries, setSummaries] = useState<ProfileSummary[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (id: string) => {
    try {
      setError(null);
      setProfile(await api.getProfile(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load profile');
    }
  }, []);

  const refreshList = useCallback(async () => {
    const list = await api.listProfiles();
    setSummaries(list);
    return list;
  }, []);

  useEffect(() => {
    refreshList()
      .then((list) => list[0] && loadProfile(list[0].id))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach the server'));
  }, [refreshList, loadProfile]);

  const handleUpdated = (updated: UserProfile) => {
    setProfile(updated);
    refreshList().catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Credit Assistant</h1>
            <p className="text-xs text-slate-500">AI Financial Health Advisor for India</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-48`}
              value={profile?.id ?? ''}
              onChange={(e) => loadProfile(e.target.value)}
              aria-label="Select profile"
            >
              {summaries.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.cibilScore})</option>
              ))}
            </select>
            <button className={secondaryButton} onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {error && <ErrorBox message={error} />}
        {!profile && !error && <Spinner label="Loading profile…" />}
        {profile && (
          <>
            {tab === 'dashboard' && <Dashboard profile={profile} />}
            {tab === 'debts' && <DebtManager profile={profile} onUpdated={handleUpdated} />}
            {tab === 'roadmap' && <Roadmap profile={profile} onUpdated={handleUpdated} />}
            {tab === 'simulator' && <Simulator profile={profile} />}
            {tab === 'offers' && <BankOffers profile={profile} />}
            {tab === 'chat' && <ChatBot profile={profile} />}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-400">
        Educational tool. Scores and offers are illustrative and are not financial advice.
      </footer>

      {showForm && (
        <NewProfileForm
          onClose={() => setShowForm(false)}
          onCreated={async (p) => {
            setShowForm(false);
            setProfile(p);
            setTab('dashboard');
            await refreshList();
          }}
        />
      )}
    </div>
  );
}
