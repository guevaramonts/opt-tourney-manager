import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useClockState, useSeatsAssigned, usePlayerEliminated, useTournamentProgressReset } from '../api/socket';
import { useTournament } from '../contexts/TournamentContext';
import type { Tournament } from '../contexts/TournamentContext';
import LiveController from './LiveController';
import BountyAction from './BountyAction';

interface Season { id: number; name: string; status: string; }

interface SeasonTournamentEntry {
  season_id: number; tournament_id: number; tournament_number: number;
  tournament_name: string; tournament_status: string; player_count: number; synced_results_count: number;
}

interface ActivePlayer {
  player_id: number; name: string; table_name?: string | null; seat_number?: number | null;
}

interface TableAssignment {
  table_id: number; table_name: string; player_name?: string | null; seat_number?: number | null;
}

interface BountyEntry { name: string; bounties_collected: number; }

interface PayoutEntry { place: number; amount: number; }

interface PayoutResult { prizePool: number; bountyPool: number; payouts: PayoutEntry[]; }

interface ConsolidationPlan {
  eligible: boolean; reason: string; totalPlayersToMove: number; totalOpenSeats: number;
  sourceTables: Array<{ tableName: string; playerCount: number }>;
  previewMoves: Array<{ playerId: number; playerName: string; fromTableName: string; toTableName: string }>;
}

interface TournamentFinalizeSummaryRow {
  player_id: number; player_name: string; placement: number;
  bounty_points: number; tournament_points: number; total_points: number;
}

export default function InTournamentManager() {
  const { activeTournament, setActiveTournament } = useTournament();
  const tournamentId = activeTournament?.id ?? null;
  const showSeatNumbers = activeTournament?.status === 'pending';
  const clock = useClockState();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [seasonTournaments, setSeasonTournaments] = useState<SeasonTournamentEntry[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [bounties, setBounties] = useState<BountyEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutResult | null>(null);
  const [consolidationPlan, setConsolidationPlan] = useState<ConsolidationPlan | null>(null);
  const [finalizeSummary, setFinalizeSummary] = useState<TournamentFinalizeSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingConsolidation, setExecutingConsolidation] = useState(false);
  const [resettingSeating, setResettingSeating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, seasonList] = await Promise.all([
      api.getAllTournaments() as Promise<Tournament[]>,
      api.getAllSeasons() as Promise<Season[]>,
    ]);
    setTournaments(list); setSeasons(seasonList);
    if (!tournamentId) { setLoading(false); return; }
    setLoading(true); setStatus(null);

    const results = await Promise.allSettled([
      api.getActivePlayers(tournamentId) as Promise<ActivePlayer[]>,
      api.getTableAssignments(tournamentId) as Promise<TableAssignment[]>,
      api.getBountyLeaderboard(tournamentId) as Promise<BountyEntry[]>,
      api.calculatePayouts(tournamentId) as Promise<PayoutResult>,
      api.getConsolidationPlan(tournamentId) as Promise<ConsolidationPlan>,
    ]);

    const [playersRes, tablesRes, bountyRes, payoutRes, consolidationRes] = results;
    let failedCount = 0;
    if (playersRes.status === 'fulfilled') setActivePlayers(playersRes.value); else failedCount++;
    if (tablesRes.status === 'fulfilled') setAssignments(tablesRes.value); else failedCount++;
    if (bountyRes.status === 'fulfilled') setBounties(bountyRes.value); else failedCount++;
    if (payoutRes.status === 'fulfilled') setPayouts(payoutRes.value); else { failedCount++; setPayouts(null); }
    if (consolidationRes.status === 'fulfilled') setConsolidationPlan(consolidationRes.value); else { failedCount++; setConsolidationPlan(null); }
    if (failedCount > 0) setStatus('Some manager panels could not be loaded, but core tournament data is up to date.');
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setFinalizeSummary([]); }, [tournamentId]);

  useSeatsAssigned(useCallback(() => { void refresh(); }, [refresh]));
  usePlayerEliminated(useCallback(() => { void refresh(); }, [refresh]));
  useTournamentProgressReset(useCallback(() => { void refresh(); }, [refresh]));

  const tableLoad = useMemo(() => {
    const map = new Map<number, { name: string; count: number; seats: number[] }>();
    for (const row of assignments) {
      if (!map.has(row.table_id)) map.set(row.table_id, { name: row.table_name, count: 0, seats: [] });
      if (row.player_name) {
        const table = map.get(row.table_id)!;
        table.count++;
        if (row.seat_number !== null && row.seat_number !== undefined) table.seats.push(row.seat_number);
      }
    }
    return Array.from(map.entries()).map(([tableId, table]) => ({
      tableId, tableName: table.name, playerCount: table.count, seats: table.seats.sort((a, b) => a - b),
    }));
  }, [assignments]);

  const tablesInUse = tableLoad.filter((t) => t.playerCount > 0);
  const maxTable = tablesInUse.reduce((max, t) => Math.max(max, t.playerCount), 0);
  const minTable = tablesInUse.reduce((min, t) => Math.min(min, t.playerCount), tablesInUse.length ? Infinity : 0);
  const imbalance = tablesInUse.length > 1 ? maxTable - minTable : 0;

  async function handleExecuteConsolidationWave() {
    if (!tournamentId || !consolidationPlan?.eligible) return;
    setExecutingConsolidation(true); setStatus(null);
    try {
      const result = await api.executeConsolidationWave(tournamentId) as { movedCount: number; closedTables: string[] };
      setStatus(`Consolidation wave complete: moved ${result.movedCount} player${result.movedCount === 1 ? '' : 's'} from ${result.closedTables.join(', ')}.`);
      await refresh();
    } catch (err) { setStatus(`Consolidation blocked: ${String(err)}`); }
    finally { setExecutingConsolidation(false); }
  }

  async function handleResetSeating() {
    if (!tournamentId || !confirm('Reset all current seating assignments for this tournament?')) return;
    setResettingSeating(true); setStatus(null);
    try {
      const result = await api.resetSeating(tournamentId) as { count: number };
      setStatus(`Seating reset complete: ${result.count} player${result.count === 1 ? '' : 's'} reseated.`);
      await refresh();
    } catch (err) { setStatus(`Seating reset failed: ${String(err)}`); }
    finally { setResettingSeating(false); }
  }

  async function handleSeasonChange(seasonId: number | null) {
    setSelectedSeasonId(seasonId); setActiveTournament(null);
    if (!seasonId) { setSeasonTournaments([]); return; }
    setSeasonTournaments(await api.getSeasonTournaments(seasonId) as SeasonTournamentEntry[]);
  }

  if (!activeTournament) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">In-Tournament Manager</h2>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-4 space-y-2">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Season</label>
            <select value={selectedSeasonId ?? ''} onChange={(e) => { void handleSeasonChange(e.target.value ? Number(e.target.value) : null); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
              <option value="">— Select a season —</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
            </select>
          </div>
          {selectedSeasonId !== null && (
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Tournament</label>
              <select value="" onChange={(e) => {
                const entry = seasonTournaments.find((t) => t.tournament_id === Number(e.target.value));
                if (!entry) return;
                const full = tournaments.find((t) => t.id === entry.tournament_id) ?? {
                  id: entry.tournament_id, name: entry.tournament_name,
                  buy_in: 0, bounty_amount: 0, status: entry.tournament_status,
                } as Tournament;
                setActiveTournament(full);
              }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
                <option value="">— Select a tournament —</option>
                {seasonTournaments.filter((t) => t.tournament_status !== 'finished').map((t) => (
                  <option key={t.tournament_id} value={t.tournament_id}>
                    #{t.tournament_number} {t.tournament_name} · {t.tournament_status}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-400">
          {selectedSeasonId === null ? 'Select a season to begin.' : 'Select a tournament to manage.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-end">
          <div className="xl:col-span-3 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">In-Tournament Manager</h2>
              <p className="text-sm text-gray-400">{activeTournament.name}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select value={selectedSeasonId ?? ''} onChange={(e) => { void handleSeasonChange(e.target.value ? Number(e.target.value) : null); }}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400">
                <option value="">— Season —</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {selectedSeasonId !== null ? (
                <select value={activeTournament.id} onChange={(e) => {
                  const entry = seasonTournaments.find((t) => t.tournament_id === Number(e.target.value));
                  if (!entry) return;
                  const full = tournaments.find((t) => t.id === entry.tournament_id) ?? {
                    id: entry.tournament_id, name: entry.tournament_name,
                    buy_in: 0, bounty_amount: 0, status: entry.tournament_status,
                  } as Tournament;
                  setActiveTournament(full);
                }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400">
                  {seasonTournaments.filter((t) => t.tournament_status !== 'finished').map((t) => (
                    <option key={t.tournament_id} value={t.tournament_id}>
                      #{t.tournament_number} {t.tournament_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs text-gray-500">Select a season to switch tournaments</div>
              )}
              <button onClick={() => { void refresh(); }} disabled={loading}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-orange-500 hover:text-orange-300 disabled:opacity-40">
                {loading ? 'Refreshing…' : 'Refresh Manager'}
              </button>
            </div>
          </div>
          <div className="xl:col-span-2 grid grid-cols-2 gap-2">
            <InfoCard label="Status" value={activeTournament.status.toUpperCase()} />
            <InfoCard label="Active Players" value={String(activePlayers.length)} />
            <InfoCard label="Tables In Use" value={String(tablesInUse.length)} />
            <InfoCard label="Table Spread" value={tablesInUse.length > 1 ? String(imbalance) : '-'} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5"><LiveController /></div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5"><BountyAction /></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/40 p-4 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-200">Table Operations</h3>
            <button type="button" onClick={() => { void handleResetSeating(); }}
              disabled={resettingSeating || loading || activePlayers.length === 0}
              className="rounded-lg border border-red-800 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-300 hover:border-red-600 hover:bg-red-950/40 disabled:opacity-40">
              {resettingSeating ? 'Resetting…' : 'Reset Seating'}
            </button>
          </div>

          {consolidationPlan && (
            <div className={`rounded-lg border p-3 ${consolidationPlan.eligible ? 'border-emerald-800 bg-emerald-950/20' : 'border-gray-800 bg-gray-950/40'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Consolidation Wave</p>
                  <p className={`text-xs mt-1 ${consolidationPlan.eligible ? 'text-emerald-300' : 'text-gray-400'}`}>{consolidationPlan.reason}</p>
                </div>
                <button type="button" onClick={() => { void handleExecuteConsolidationWave(); }}
                  disabled={!consolidationPlan.eligible || executingConsolidation || loading}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
                  {executingConsolidation ? 'Consolidating…' : 'Execute Wave'}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <p className="text-gray-500">Players to move: <span className="text-gray-300 font-mono">{consolidationPlan.totalPlayersToMove}</span></p>
                <p className="text-gray-500">Open seats elsewhere: <span className="text-gray-300 font-mono">{consolidationPlan.totalOpenSeats}</span></p>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Sources: {consolidationPlan.sourceTables.length > 0
                  ? consolidationPlan.sourceTables.map((t) => `${t.tableName} (${t.playerCount})`).join(', ')
                  : 'none'}
              </p>
              {consolidationPlan.previewMoves.length > 0 && (
                <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Pre-Execution Preview</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {consolidationPlan.previewMoves.map((move, index) => (
                      <p key={`${move.playerId}-${index}`} className="text-xs text-gray-300">
                        {index + 1}. {move.playerName} · {move.fromTableName} → {move.toTableName}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tableLoad.length === 0 ? (
            <p className="text-xs text-gray-500">No table data yet.</p>
          ) : tableLoad.map((table) => (
            <div key={table.tableId} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-200">{table.tableName}</span>
                <span className="text-xs text-gray-400">{table.playerCount} players</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {showSeatNumbers
                  ? `Occupied seats: ${table.seats.length ? table.seats.join(', ') : 'none'}`
                  : 'Seat positions are tracked but hidden after start.'}
              </p>
            </div>
          ))}

          <p className={`text-xs ${imbalance >= 2 ? 'text-yellow-400' : 'text-gray-500'}`}>
            {tablesInUse.length > 1
              ? imbalance >= 2 ? `Rebalance recommended: table spread is ${imbalance}.` : 'Tables are currently balanced.'
              : 'Table spread available when 2+ tables are active.'}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
          <h3 className="text-sm font-semibold text-gray-200">Live Tournament Snapshot</h3>
          <div className="space-y-2 text-xs text-gray-400">
            <p>Level {clock?.level ?? 1} · {clock?.running ? 'Running' : 'Paused'}</p>
            <p>Blinds {clock?.smallBlind ?? 25} / {clock?.bigBlind ?? 50}</p>
            <p>Next {clock?.nextSmallBlind ?? '—'} / {clock?.nextBigBlind ?? '—'}</p>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Bounty Count</p>
            {bounties.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">No knockouts logged yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-gray-300">
                {bounties.slice(0, 5).map((entry) => (
                  <li key={entry.name} className="flex items-center justify-between">
                    <span>{entry.name}</span>
                    <span className="font-mono">{entry.bounties_collected}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {payouts && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Payout Snapshot</p>
              <p className="mt-1 text-xs text-gray-400">Prize Pool: ${payouts.prizePool.toLocaleString()}</p>
              <p className="text-xs text-gray-400">Bounty Pool: ${payouts.bountyPool.toLocaleString()}</p>
              {payouts.payouts.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {payouts.payouts.slice(0, 3).map((entry) =>
                    `${entry.place}${entry.place === 1 ? 'st' : entry.place === 2 ? 'nd' : 'rd'}: $${entry.amount.toLocaleString()}`
                  ).join(' · ')}
                </p>
              )}
            </div>
          )}

          {status && <p className="text-xs text-yellow-400">{status}</p>}

          {activeTournament.status !== 'finalized' ? (
            <button type="button" disabled={loading} onClick={() => {
              void (async () => {
                try {
                  const result = await api.finalizeTournament(activeTournament.id) as { resultsCommitted: number; summary?: TournamentFinalizeSummaryRow[] };
                  setFinalizeSummary(result.summary ?? []);
                  setStatus(`Tournament finalized. ${result.resultsCommitted} season result${result.resultsCommitted === 1 ? '' : 's'} committed.`);
                  await refresh();
                } catch (err) { setStatus(`Finalize failed: ${String(err)}`); }
              })();
            }}
              className="w-full rounded-lg border border-orange-700 bg-orange-950/20 px-3 py-2 text-xs font-semibold text-orange-300 hover:border-orange-500 hover:bg-orange-950/40 disabled:opacity-40">
              Finalize Tournament &amp; Commit Results
            </button>
          ) : (
            <div className="rounded-lg border border-green-800 bg-green-950/20 px-3 py-2 text-xs font-semibold text-green-400 text-center">
              ✓ Tournament Finalized
            </div>
          )}

          {finalizeSummary.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Committed Tournament Summary</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-gray-500">
                      <th className="px-2 py-2 font-semibold">Place</th>
                      <th className="px-2 py-2 font-semibold">Player</th>
                      <th className="px-2 py-2 text-right font-semibold">Bounty Pts</th>
                      <th className="px-2 py-2 text-right font-semibold">Tournament Pts</th>
                      <th className="px-2 py-2 text-right font-semibold">Total Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalizeSummary.map((row) => (
                      <tr key={row.player_id} className="border-b border-gray-900 text-gray-300 last:border-b-0">
                        <td className="px-2 py-2 font-mono">{row.placement}</td>
                        <td className="px-2 py-2">{row.player_name}</td>
                        <td className="px-2 py-2 text-right font-mono">{row.bounty_points}</td>
                        <td className="px-2 py-2 text-right font-mono">{row.tournament_points}</td>
                        <td className="px-2 py-2 text-right font-mono font-semibold text-white">{row.total_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-200">{value}</p>
    </div>
  );
}
