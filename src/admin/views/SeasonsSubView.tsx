import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Season, SeasonLeaderboardEntry, SeasonTournamentEntry } from '@shared/types';
import { useSeason } from '../SeasonContext';

export default function SeasonsSubView() {
  const { activeSeason, setActiveSeason } = useSeason();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [seasonTournaments, setSeasonTournaments] = useState<SeasonTournamentEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<SeasonLeaderboardEntry[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = useCallback(async () => {
    const seasonRows = await window.api.getAllSeasons();
    setSeasons(seasonRows);

    // If the globally selected season was deleted, clear it.
    if (activeSeason !== null && !seasonRows.some((row) => row.id === activeSeason.id)) {
      setActiveSeason(null);
      setSeasonTournaments([]);
      setLeaderboard([]);
    }
  }, [activeSeason, setActiveSeason]);

  const refreshSeasonDetails = useCallback(async () => {
    if (activeSeason === null) {
      setSeasonTournaments([]);
      setLeaderboard([]);
      return;
    }

    const [linked, board] = await Promise.all([
      window.api.getSeasonTournaments(activeSeason.id),
      window.api.getSeasonLeaderboard(activeSeason.id),
    ]);
    setSeasonTournaments(linked);
    setLeaderboard(board);
  }, [activeSeason]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void refreshSeasonDetails();
  }, [refreshSeasonDetails]);

  async function handleCreateSeason() {
    if (!seasonName.trim()) {
      setStatus({ text: 'Season name is required.', ok: false });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const created = await window.api.createSeason(seasonName.trim());
      setActiveSeason(created);
      setSeasonName('');
      setStatus({ text: `Created season "${created.name}".`, ok: true });
      await refreshAll();
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSeason() {
    if (!activeSeason) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.api.startSeason(activeSeason.id);
      const created = result.createdTournaments ?? 0;
      setStatus({
        text: `Season "${activeSeason.name}" is now active. Created ${created} tournament${created === 1 ? '' : 's'}.`,
        ok: true,
      });
      await refreshAll();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishSeason() {
    if (!activeSeason) return;
    setBusy(true);
    setStatus(null);
    try {
      await window.api.finishSeason(activeSeason.id);
      setStatus({ text: `Season "${activeSeason.name}" marked as finished.`, ok: true });
      await refreshAll();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncAllLinked() {
    if (activeSeason === null || seasonTournaments.length === 0) return;

    setBusy(true);
    setStatus(null);
    try {
      let total = 0;
      for (const row of seasonTournaments) {
        const result = await window.api.syncSeasonTournamentResults(activeSeason.id, row.tournament_id);
        total += result.upserted;
      }
      setStatus({ text: `Season sync complete (${total} player results upserted).`, ok: true });
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  const completedTournaments = useMemo(
    () => seasonTournaments
      .filter((row) => row.tournament_status === 'finalized' || row.tournament_status === 'finished')
      .sort((a, b) => a.tournament_number - b.tournament_number),
    [seasonTournaments]
  );

  function getTournamentCell(row: SeasonLeaderboardEntry, tournamentId: number) {
    return row.tournament_scores.find((score) => score.tournament_id === tournamentId);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Seasons</h2>

        <div className="space-y-2">
          <label className="block text-xs text-gray-500">Create Season</label>
          <div className="flex gap-2">
            <input
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
              placeholder="e.g. 2026 Regular Season"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
            <button
              type="button"
              onClick={handleCreateSeason}
              disabled={busy || !seasonName.trim()}
              className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold px-4 py-2 text-sm"
            >
              Create
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-gray-500">Active Season</label>
          <select
            value={activeSeason?.id ?? ''}
            onChange={(e) => {
              const found = seasons.find((s) => s.id === Number(e.target.value)) ?? null;
              setActiveSeason(found);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          >
            <option value="">— Select season —</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name} ({season.status})
              </option>
            ))}
          </select>
        </div>

        {activeSeason && (
          <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/50 p-3">
            <p className="text-xs text-gray-500">Status: <span className="text-gray-300">{activeSeason.status}</span></p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStartSeason}
                disabled={busy || activeSeason.status === 'active'}
                className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500 disabled:opacity-40"
              >
                Start
              </button>
              <button
                type="button"
                onClick={handleFinishSeason}
                disabled={busy || activeSeason.status === 'finished'}
                className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-500 disabled:opacity-40"
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Season Leaderboard (Top 6 Scores)</h3>
          <button
            type="button"
            onClick={handleSyncAllLinked}
            disabled={busy || activeSeason === null || seasonTournaments.length === 0}
            className="rounded-md border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:border-sky-500 disabled:opacity-40"
          >
            Sync All Results
          </button>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-500">No season points yet. Link tournaments and sync results.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-3 sticky left-0 bg-gray-900/95">Player</th>
                  {completedTournaments.map((tournament) => (
                    <th key={tournament.tournament_id} className="py-2 px-2 text-center min-w-[140px]">
                      T{tournament.tournament_number}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right min-w-[120px]">Season Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {leaderboard.map((row) => (
                  <tr key={row.player_id}>
                    <td className="py-2 pr-3 text-gray-200 sticky left-0 bg-gray-900/95">{row.player_name}</td>
                    {completedTournaments.map((tournament) => {
                      const cell = getTournamentCell(row, tournament.tournament_id);
                      return (
                        <td key={`${row.player_id}-${tournament.tournament_id}`} className="py-2 px-2 text-center text-xs">
                          {cell ? (
                            <div className="leading-tight">
                              <div className="text-gray-200">T {cell.tournament_points.toFixed(2)}</div>
                              <div className="text-sky-300">B {cell.bounty_points.toFixed(2)}</div>
                            </div>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-mono text-orange-300">{row.total_points.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {status && (
        <p className={`text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>
      )}

      <p className="text-xs text-gray-500">
        Players can miss tournaments. Season totals are computed from each player&apos;s best 6 tournament scores.
      </p>
    </div>
  );
}
