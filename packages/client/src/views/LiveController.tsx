import { useState } from 'react';
import { api } from '../api/client';
import { useClockState } from '../api/socket';
import { useTournament } from '../contexts/TournamentContext';

export default function LiveController() {
  const { activeTournament, setActiveTournament } = useTournament();
  const clock = useClockState();
  const [status, setStatus] = useState<string | null>(null);

  const remainingSeconds = clock?.remainingSeconds ?? 0;
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const seconds = String(remainingSeconds % 60).padStart(2, '0');

  async function handlePlay() {
    const result = await api.clockPlay(activeTournament?.id);
    void result;
  }

  async function handlePause() {
    await api.clockPause();
  }

  async function handleReset() {
    await api.clockReset();
  }

  async function handleNextLevel() {
    await api.clockNextLevel();
  }

  async function handleResetTournamentProgress() {
    if (!activeTournament) return;
    if (!confirm(`Reset progress for "${activeTournament.name}"? This will clear committed bounty/elimination activity and restore all players to active.`)) return;
    const result = await api.resetTournamentProgress(activeTournament.id) as {
      clearedSeasonResults: number; clearedBountyEvents: number;
      restoredPlayers: number; rolledBackCareerEarnings: number;
    };
    setStatus(
      `Tournament reset: ${result.clearedSeasonResults} season point rows cleared, ${result.clearedBountyEvents} bounty events cleared, ${result.restoredPlayers} registrations restored, and $${result.rolledBackCareerEarnings.toLocaleString()} in bounty earnings rolled back.`
    );
    setActiveTournament({ ...activeTournament, status: 'pending' });
  }

  return (
    <div className="max-w-lg space-y-6 text-sm">
      <h2 className="text-lg font-semibold">Live Controller</h2>

      <div className="bg-gray-900 rounded-2xl p-4 text-center border border-gray-800">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Level {clock?.level ?? 1}
        </p>
        <p className="font-mono text-4xl font-bold text-orange-300">{minutes}:{seconds}</p>
        <p className="mt-2 text-xs text-gray-400">
          {clock?.isBreak
            ? <strong className="text-sky-300">{clock.breakLabel || 'Break'}</strong>
            : <>Blinds: <strong className="text-white">{clock?.smallBlind ?? 25} / {clock?.bigBlind ?? 50}</strong></>}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {clock?.running ? (
          <button onClick={() => { void handlePause(); }}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold rounded-lg text-xs">
            ⏸ Pause
          </button>
        ) : (
          <button onClick={() => { void handlePlay(); }}
            className="px-4 py-2 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-lg text-xs">
            ▶ Play
          </button>
        )}
        <button onClick={() => { void handleNextLevel(); }}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg text-xs">
          ⏭ Next Level
        </button>
        <button onClick={() => { void handleReset(); }}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg text-xs">
          ↺ Reset
        </button>
        <button onClick={() => { void handleResetTournamentProgress(); }} disabled={!activeTournament}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg text-xs disabled:opacity-40">
          Reset Tournament Progress
        </button>
      </div>

      {status && <p className="text-xs text-yellow-300">{status}</p>}
    </div>
  );
}
