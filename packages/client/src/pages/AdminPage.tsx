import { useCallback, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../auth/firebase';
import { api } from '../api/client';
import { SeasonProvider, useSeason } from '../contexts/SeasonContext';
import { TournamentProvider } from '../contexts/TournamentContext';
import type { Season } from '../contexts/SeasonContext';
import SeasonsView from '../views/SeasonsView';
import TournamentsView from '../views/TournamentsView';
import RegistrationView from '../views/RegistrationView';
import PlayersView from '../views/PlayersView';
import BlindStructuresView from '../views/BlindStructuresView';
import DataTasksView from '../views/DataTasksView';
import InTournamentManager from '../views/InTournamentManager';

type MainTab = 'live' | 'setup';
type SetupTab = 'seasons' | 'tournaments' | 'registration' | 'players' | 'blinds' | 'data';

export default function AdminPage() {
  return (
    <SeasonProvider>
      <TournamentProvider>
        <AdminLayout />
      </TournamentProvider>
    </SeasonProvider>
  );
}

function AdminLayout() {
  const { activeSeason, setActiveSeason } = useSeason();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>('setup');
  const [setupTab, setSetupTab] = useState<SetupTab>('seasons');

  const loadSeasons = useCallback(async () => {
    const rows = await api.getAllSeasons() as Season[];
    setSeasons(rows);
    if (activeSeason && !rows.some((s) => s.id === activeSeason.id)) {
      setActiveSeason(null);
    }
  }, [activeSeason, setActiveSeason]);

  useEffect(() => { void loadSeasons(); }, [loadSeasons]);

  const MAIN_TABS: { key: MainTab; label: string }[] = [
    { key: 'live', label: 'Live View' },
    { key: 'setup', label: 'Setup' },
  ];

  const SETUP_TABS: { key: SetupTab; label: string }[] = [
    { key: 'seasons', label: 'Seasons' },
    { key: 'tournaments', label: 'Tournaments' },
    { key: 'registration', label: 'Registration' },
    { key: 'players', label: 'Players' },
    { key: 'blinds', label: 'Blind Structures' },
    { key: 'data', label: 'Data Tasks' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/95 backdrop-blur px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-base font-bold tracking-wide text-orange-400">OPT Admin</span>
            <select
              value={activeSeason?.id ?? ''}
              onChange={(e) => setActiveSeason(seasons.find((s) => s.id === Number(e.target.value)) ?? null)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400 min-w-[180px]"
            >
              <option value="">— Select season —</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => { void signOut(auth); }}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:border-gray-500 hover:text-gray-200"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main tabs */}
      <nav className="border-b border-gray-800 bg-gray-900/60 px-6">
        <div className="flex gap-1">
          {MAIN_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMainTab(key)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                mainTab === key
                  ? 'border-orange-400 text-orange-300'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="px-6 py-6 max-w-screen-2xl">
        {mainTab === 'live' && <InTournamentManager />}

        {mainTab === 'setup' && (
          <div className="space-y-6">
            {/* Setup sub-tabs */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-gray-800 bg-gray-900/50 p-1">
              {SETUP_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSetupTab(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    setupTab === key
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div>
              {setupTab === 'seasons' && <SeasonsView />}
              {setupTab === 'tournaments' && (
                <TournamentsView onNavigateToRegistration={() => setSetupTab('registration')} />
              )}
              {setupTab === 'registration' && <RegistrationView />}
              {setupTab === 'players' && <PlayersView />}
              {setupTab === 'blinds' && <BlindStructuresView />}
              {setupTab === 'data' && <DataTasksView />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
