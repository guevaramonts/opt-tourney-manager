import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useSeason } from '../contexts/SeasonContext';
import type { Season } from '../contexts/SeasonContext';

interface SeasonTournamentEntry {
  season_id: number;
  tournament_id: number;
  tournament_number: number;
  tournament_name: string;
  tournament_status: string;
  player_count: number;
  synced_results_count: number;
}

interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  total_points: number;
  tournament_count: number;
  top_6_scores: number[];
  tournament_scores: Array<{
    tournament_id: number;
    tournament_points: number;
    bounty_points: number;
    total_points: number;
  }>;
  is_toc_eligible: boolean;
}

export default function SeasonsView() {
  const { activeSeason, setActiveSeason } = useSeason();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [seasonTournaments, setSeasonTournaments] = useState<SeasonTournamentEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = useCallback(async () => {
    const rows = await api.getAllSeasons() as Season[];
    setSeasons(rows);
    if (activeSeason !== null && !rows.some((r) => r.id === activeSeason.id)) {
      setActiveSeason(null);
      setSeasonTournaments([]);
      setLeaderboard([]);
    }
  }, [activeSeason, setActiveSeason]);

  const refreshSeasonDetails = useCallback(async () => {
    if (!activeSeason) { setSeasonTournaments([]); setLeaderboard([]); return; }
    const [linked, board] = await Promise.all([
      api.getSeasonTournaments(activeSeason.id) as Promise<SeasonTournamentEntry[]>,
      api.getSeasonLeaderboard(activeSeason.id) as Promise<LeaderboardEntry[]>,
    ]);
    setSeasonTournaments(linked);
    setLeaderboard(board);
  }, [activeSeason]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);
  useEffect(() => { void refreshSeasonDetails(); }, [refreshSeasonDetails]);

  async function handleCreateSeason() {
    if (!seasonName.trim()) { setStatus({ text: 'Season name is required.', ok: false }); return; }
    setBusy(true); setStatus(null);
    try {
      const created = await api.createSeason(seasonName.trim()) as Season;
      setActiveSeason(created);
      setSeasonName('');
      setStatus({ text: `Created season "${created.name}".`, ok: true });
      await refreshAll();
      await refreshSeasonDetails();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleStartSeason() {
    if (!activeSeason) return;
    setBusy(true); setStatus(null);
    try {
      const result = await api.startSeason(activeSeason.id) as { ok: boolean; createdTournaments?: number };
      const n = result.createdTournaments ?? 0;
      setStatus({ text: `Season "${activeSeason.name}" is now active. Created ${n} tournament${n === 1 ? '' : 's'}.`, ok: true });
      await refreshAll();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleFinishSeason() {
    if (!activeSeason) return;
    setBusy(true); setStatus(null);
    try {
      await api.finishSeason(activeSeason.id);
      setStatus({ text: `Season "${activeSeason.name}" marked as finished.`, ok: true });
      await refreshAll();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleDeleteSeason() {
    if (!activeSeason) return;
    setBusy(true); setStatus(null);
    try {
      const impact = await api.getSeasonDeleteImpact(activeSeason.id) as { hasData: boolean; seasonResultCount: number; linkedTournamentCount: number };
      const msg = impact.hasData
        ? `Delete "${activeSeason.name}"? This will permanently clear ${impact.seasonResultCount} season result row(s) and ${impact.linkedTournamentCount} linked tournament(s). Continue?`
        : `Delete "${activeSeason.name}"?`;
      if (!confirm(msg)) return;
      const result = await api.deleteSeason(activeSeason.id) as { name: string; deleted: { seasonResults: number; tournaments: number } };
      setActiveSeason(null);
      setSeasonTournaments([]);
      setLeaderboard([]);
      await refreshAll();
      setStatus({ ok: true, text: `Deleted season "${result.name}". Removed ${result.deleted.seasonResults} result row(s) and ${result.deleted.tournaments} tournament(s).` });
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleSyncAllLinked() {
    if (!activeSeason || seasonTournaments.length === 0) return;
    setBusy(true); setStatus(null);
    try {
      let total = 0;
      for (const row of seasonTournaments) {
        const result = await api.syncSeasonTournamentResults(activeSeason.id, row.tournament_id) as { upserted: number };
        total += result.upserted;
      }
      setStatus({ text: `Season sync complete (${total} player results upserted).`, ok: true });
      await refreshSeasonDetails();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  const completedTournaments = useMemo(
    () => seasonTournaments
      .filter((r) => r.tournament_status === 'finalized' || r.tournament_status === 'finished')
      .sort((a, b) => a.tournament_number - b.tournament_number),
    [seasonTournaments]
  );

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
            onChange={(e) => setActiveSeason(seasons.find((s) => s.id === Number(e.target.value)) ?? null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          >
            <option value="">— Select season —</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
          </select>
        </div>

        {activeSeason && (
          <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/50 p-3">
            <p className="text-xs text-gray-500">Status: <span className="text-gray-300">{activeSeason.status}</span></p>
            <div className="flex gap-2">
              <button type="button" onClick={handleStartSeason} disabled={busy || activeSeason.status === 'active'}
                className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500 disabled:opacity-40">
                Start
              </button>
              <button type="button" onClick={handleFinishSeason} disabled={busy || activeSeason.status === 'finished'}
                className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-500 disabled:opacity-40">
                Finish
              </button>
              <button type="button" onClick={handleDeleteSeason} disabled={busy}
                className="rounded-md border border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:border-rose-500 disabled:opacity-40">
                Delete
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Season Leaderboard (Top 6 Scores)</h3>
          <button type="button" onClick={handleSyncAllLinked}
            disabled={busy || !activeSeason || seasonTournaments.length === 0}
            className="rounded-md border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:border-sky-500 disabled:opacity-40">
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
                  {completedTournaments.map((t) => (
                    <th key={t.tournament_id} className="py-2 px-2 text-center min-w-[120px]">T{t.tournament_number}</th>
                  ))}
                  <th className="py-2 pl-3 text-right min-w-[100px]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {leaderboard.map((row) => (
                  <tr key={row.player_id}>
                    <td className="py-2 pr-3 text-gray-200 sticky left-0 bg-gray-900/95">{row.player_name}</td>
                    {completedTournaments.map((t) => {
                      const cell = row.tournament_scores.find((s) => s.tournament_id === t.tournament_id);
                      return (
                        <td key={`${row.player_id}-${t.tournament_id}`} className="py-2 px-2 text-center text-xs">
                          {cell ? (
                            <div className="leading-tight">
                              <div className="text-gray-200">T {cell.tournament_points.toFixed(2)}</div>
                              <div className="text-sky-300">B {cell.bounty_points.toFixed(2)}</div>
                            </div>
                          ) : <span className="text-gray-600">-</span>}
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

      {status && <p className={`text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>}
      <p className="text-xs text-gray-500">Players can miss tournaments. Season totals are computed from each player's best 6 tournament scores.</p>
    </div>
  );
}
