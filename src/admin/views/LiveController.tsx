import { useState, useEffect } from 'react';
import type { ClockState } from '@shared/types';
import { useTournament } from '../TournamentContext';

export default function LiveController() {
  const { activeTournament, setActiveTournament } = useTournament();
  const [status, setStatus] = useState<string | null>(null);
  const [clockState, setClockState] = useState<ClockState>({
    level: 1,
    smallBlind: 25,
    bigBlind: 50,
    ante: 0,
    isBreak: false,
    breakLabel: null,
    remainingSeconds: 900,
    running: false,
    nextSmallBlind: 50,
    nextBigBlind: 100,
    nextAnte: 0,
    nextIsBreak: false,
    nextBreakLabel: null,
  });

  // Subscribe to clock ticks pushed from the main process
  useEffect(() => {
    const unsubscribe = window.api.onClockTick((payload) => {
      const tick = payload as Partial<ClockState>;
      setClockState((prev) => ({ ...prev, ...tick }));
    });
    return unsubscribe;
  }, []);

  const minutes = String(Math.floor(clockState.remainingSeconds / 60)).padStart(2, '0');
  const seconds = String(clockState.remainingSeconds % 60).padStart(2, '0');

  async function handlePlay() {
    const result = await window.api.clockPlay(activeTournament?.id);
    setClockState((prev) => ({ ...prev, running: result.running }));
  }

  async function handlePause() {
    const result = await window.api.clockPause();
    setClockState((prev) => ({ ...prev, running: result.running }));
  }

  async function handleReset() {
    const state = await window.api.clockReset();
    setClockState(state);
  }

  async function handleResetTournamentProgress() {
    if (!activeTournament) return;
    if (!confirm(`Reset progress for "${activeTournament.name}"? This will clear committed bounty/elimination activity and restore all players to active.`)) {
      return;
    }

    const result = await window.api.resetTournamentProgress(activeTournament.id);
    setStatus(
      `Tournament reset: ${result.clearedSeasonResults} season point rows cleared, ${result.clearedBountyEvents} bounty events cleared, ${result.restoredPlayers} registrations restored, and $${result.rolledBackCareerEarnings.toLocaleString()} in bounty earnings rolled back.`
    );
    setActiveTournament({ ...activeTournament, status: 'pending' });
  }

  async function handleNextLevel() {
    const state = await window.api.clockNextLevel();
    setClockState(state);
  }

  return (
    <div className="max-w-lg space-y-6 text-sm">
      <h2 className="text-lg font-semibold">Live Controller</h2>

      {/* Clock Display */}
      <div className="bg-gray-900 rounded-2xl p-4 text-center border border-gray-800">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Level {clockState.level}
        </p>
        <p className="font-mono text-4xl font-bold text-orange-300">
          {minutes}:{seconds}
        </p>
        <p className="mt-2 text-xs text-gray-400">
          {clockState.isBreak
            ? (
              <strong className="text-sky-300">{clockState.breakLabel || 'Break'}</strong>
            )
            : (
              <>Blinds: <strong className="text-white">{clockState.smallBlind} / {clockState.bigBlind}</strong></>
            )}
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        {clockState.running ? (
          <button
            onClick={handlePause}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold rounded-lg text-xs transition-colors"
          >
            ⏸ Pause
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="px-4 py-2 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-lg text-xs transition-colors"
          >
            ▶ Play
          </button>
        )}

        <button
          onClick={handleNextLevel}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg text-xs transition-colors"
        >
          ⏭ Next Level
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg text-xs transition-colors"
        >
          ↺ Reset
        </button>

        <button
          onClick={handleResetTournamentProgress}
          disabled={!activeTournament}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg text-xs transition-colors disabled:opacity-40"
        >
          Reset Tournament Progress
        </button>
      </div>

      {status && <p className="text-xs text-yellow-300">{status}</p>}
    </div>
  );
}
