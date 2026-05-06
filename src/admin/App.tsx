import { useState, Component } from 'react';
import type { ReactNode } from 'react';
import type { Tournament } from '@shared/types';
import { TournamentContext } from './TournamentContext';
import TournamentView from './views/TournamentView';
import PlayersView from './views/PlayersView';
import RegistrationView from './views/RegistrationView';
import InTournamentManager from './views/InTournamentManager';

// ── Error boundary so a component crash shows the error instead of blank screen
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-red-400 space-y-2">
          <p className="font-bold text-lg">Render error</p>
          <pre className="text-xs whitespace-pre-wrap opacity-80">{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

type Tab = 'tournaments' | 'players' | 'registration' | 'manager' | 'payouts';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tournaments');
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'manager', label: 'In-Tournament Manager' },
    { id: 'tournaments', label: 'Tournaments' },
    { id: 'registration', label: 'Registration' },
    { id: 'players', label: 'Players' },
    { id: 'payouts', label: 'Payouts' },
  ];

  return (
    <TournamentContext.Provider value={{ activeTournament, setActiveTournament }}>
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-xl font-bold tracking-tight">
          Olalde Poker <span className="text-orange-400">Tournament Manager</span>
        </h1>
        <div className="flex items-center gap-3">
          {activeTournament ? (
            <span className="text-xs font-semibold text-orange-300 bg-orange-950/40 border border-orange-800 rounded-full px-3 py-1">
              {activeTournament.name}
            </span>
          ) : (
            <span className="text-xs text-gray-600 italic">No tournament selected</span>
          )}
          <span className="text-xs text-gray-500 font-mono">v0.1.0</span>
        </div>
      </header>

      {/* Tab Nav */}
      <nav className="flex border-b border-gray-800 bg-gray-900 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-orange-400 text-orange-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <ErrorBoundary>
          {activeTab === 'tournaments' && <TournamentView />}
          {activeTab === 'players' && <PlayersView />}
          {activeTab === 'registration' && <RegistrationView />}
          {activeTab === 'manager' && <InTournamentManager />}
          {activeTab === 'payouts' && <PayoutsPlaceholder />}
        </ErrorBoundary>
      </main>
    </div>
    </TournamentContext.Provider>
  );
}

function PayoutsPlaceholder() {
  return (
    <div className="text-center text-gray-500 mt-24">
      <p className="text-2xl mb-2">🏆</p>
      <p className="text-sm">Payout calculator — Phase 4</p>
    </div>
  );
}


