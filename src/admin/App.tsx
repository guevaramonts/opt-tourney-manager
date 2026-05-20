import { useState, Component } from 'react';
import type { ReactNode } from 'react';
import type { Season, Tournament } from '@shared/types';
import { TournamentContext } from './TournamentContext';
import { SeasonContext } from './SeasonContext';
import SeasonPickerModal from './SeasonPickerModal';
import PlayersView from './views/PlayersView';
import RegistrationView from './views/RegistrationView';
import InTournamentManager from './views/InTournamentManager';
import BlindStructuresView from './views/BlindStructuresView';
import SeasonsSubView from './views/SeasonsSubView';
import TournamentsSubView from './views/TournamentsSubView';
import DataTasksView from './views/DataTasksView';

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

type MainTab = 'live' | 'setup';
type SetupTab = 'seasons' | 'blindStructures' | 'players' | 'registration' | 'dataTasks';
type SeasonsSubTab = 'seasons' | 'tournaments';

export default function App() {
  const [mainTab, setMainTab] = useState<MainTab>('live');
  const [setupTab, setSetupTab] = useState<SetupTab>('seasons');
  const [seasonsSubTab, setSeasonsSubTab] = useState<SeasonsSubTab>('seasons');
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [showSeasonPicker, setShowSeasonPicker] = useState(true);

  function handleSeasonSelect(season: Season) {
    setActiveSeason(season);
    setActiveTournament(null);
    setShowSeasonPicker(false);
  }

  const mainTabs: { id: MainTab; label: string }[] = [
    { id: 'live', label: 'Admin Live View' },
    { id: 'setup', label: 'Setup' },
  ];

  const setupTabs: { id: SetupTab; label: string }[] = [
    { id: 'seasons', label: 'Seasons and Tournaments' },
    { id: 'registration', label: 'Registration' },
    { id: 'players', label: 'Players' },
    { id: 'blindStructures', label: 'Blind Structures' },
    { id: 'dataTasks', label: 'Data Tasks' },
  ];

  const seasonsSubTabs: { id: SeasonsSubTab; label: string }[] = [
    { id: 'seasons', label: 'Seasons' },
    { id: 'tournaments', label: 'Tournaments' },
  ];

  return (
    <SeasonContext.Provider value={{ activeSeason, setActiveSeason }}>
    <TournamentContext.Provider value={{ activeTournament, setActiveTournament }}>
    {showSeasonPicker && <SeasonPickerModal onSelect={handleSeasonSelect} activeSeasonId={activeSeason?.id ?? null} />}
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-xl font-bold tracking-tight">
          Olalde Poker <span className="text-orange-400">Tournament Manager</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-sky-800/70 bg-sky-950/20 px-3 py-2 min-w-[280px]">
            <p className="text-[10px] uppercase tracking-wide text-sky-300/80 font-semibold">Season Context</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className={`text-sm font-semibold ${activeSeason ? 'text-sky-200' : 'text-yellow-300'}`}>
                {activeSeason ? activeSeason.name : 'No season selected'}
              </p>
              <button
                type="button"
                onClick={() => setShowSeasonPicker(true)}
                className="rounded-md border border-sky-700 px-2 py-1 text-xs font-semibold text-sky-200 hover:border-sky-500 hover:text-white transition-colors"
              >
                {activeSeason ? 'Switch Season' : 'Select Season'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">All admin changes are scoped to the selected season.</p>
          </div>
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

      {/* Main Tab Nav */}
      <nav className="flex border-b border-gray-700 bg-gray-900 px-4">
        {mainTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
              mainTab === tab.id
                ? tab.id === 'live'
                  ? 'border-sky-400 text-sky-300'
                  : 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Setup Sub-Tab Nav */}
      {mainTab === 'setup' && (
        <nav className="flex border-b border-gray-800 bg-gray-950 px-4">
          {setupTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSetupTab(tab.id)}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                setupTab === tab.id
                  ? 'border-emerald-300 text-emerald-300'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* Seasons Sub-Tab Nav (nested within Seasons and Tournaments) */}
      {mainTab === 'setup' && setupTab === 'seasons' && (
        <nav className="flex border-b border-gray-800 bg-gray-900 px-4">
          {seasonsSubTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSeasonsSubTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                seasonsSubTab === tab.id
                  ? 'border-emerald-300 text-emerald-300'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <ErrorBoundary>
          {mainTab === 'live' && <InTournamentManager />}
          {mainTab === 'setup' && setupTab === 'seasons' && seasonsSubTab === 'seasons' && <SeasonsSubView />}
          {mainTab === 'setup' && setupTab === 'seasons' && seasonsSubTab === 'tournaments' && <TournamentsSubView onNavigateToRegistration={() => { setMainTab('setup'); setSetupTab('registration'); }} />}
          {mainTab === 'setup' && setupTab === 'blindStructures' && <BlindStructuresView />}
          {mainTab === 'setup' && setupTab === 'players' && <PlayersView />}
          {mainTab === 'setup' && setupTab === 'registration' && <RegistrationView />}
          {mainTab === 'setup' && setupTab === 'dataTasks' && <DataTasksView />}
        </ErrorBoundary>
      </main>
    </div>
    </TournamentContext.Provider>
    </SeasonContext.Provider>
  );
}




