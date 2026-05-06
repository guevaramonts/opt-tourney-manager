import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActivePlayer,
  BountyEntry,
  ConsolidationPlan,
  ClockState,
  PayoutResult,
  TableAssignment,
  Tournament,
} from '@shared/types';
import { useTournament } from '../TournamentContext';
import LiveController from './LiveController';
import BountyAction from './BountyAction';

const INITIAL_CLOCK: ClockState = {
  level: 1,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  remainingSeconds: 900,
  running: false,
  nextSmallBlind: 50,
  nextBigBlind: 100,
  nextAnte: null,
};

export default function InTournamentManager() {
  const { activeTournament, setActiveTournament } = useTournament();
  const tournamentId = activeTournament?.id ?? null;

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [bounties, setBounties] = useState<BountyEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutResult | null>(null);
  const [consolidationPlan, setConsolidationPlan] = useState<ConsolidationPlan | null>(null);
  const [clock, setClock] = useState<ClockState>(INITIAL_CLOCK);
  const [loading, setLoading] = useState(false);
  const [executingConsolidation, setExecutingConsolidation] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.api.getAllTournaments();
    setTournaments(list);

    if (!tournamentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus(null);
    const results = await Promise.allSettled([
      window.api.getActivePlayers(tournamentId),
      window.api.getTableAssignments(tournamentId),
      window.api.getBountyLeaderboard(tournamentId),
      window.api.calculatePayouts(tournamentId),
      window.api.getConsolidationPlan(tournamentId),
    ]);

    const [playersRes, tablesRes, bountyRes, payoutRes, consolidationRes] = results;
    let failedCount = 0;

    if (playersRes.status === 'fulfilled') {
      setActivePlayers(playersRes.value);
    } else {
      failedCount += 1;
    }

    if (tablesRes.status === 'fulfilled') {
      setAssignments(tablesRes.value);
    } else {
      failedCount += 1;
    }

    if (bountyRes.status === 'fulfilled') {
      setBounties(bountyRes.value);
    } else {
      failedCount += 1;
    }

    if (payoutRes.status === 'fulfilled') {
      setPayouts(payoutRes.value);
    } else {
      failedCount += 1;
      setPayouts(null);
    }

    if (consolidationRes.status === 'fulfilled') {
      setConsolidationPlan(consolidationRes.value);
    } else {
      failedCount += 1;
      setConsolidationPlan(null);
    }

    if (failedCount > 0) {
      setStatus('Some manager panels could not be loaded, but core tournament data is up to date.');
    }

    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubTick = window.api.onClockTick((payload) => {
      setClock((prev) => ({ ...prev, ...(payload as Partial<ClockState>) }));
    });
    const unsubSeats = window.api.onSeatsAssigned(() => {
      refresh();
    });
    const unsubElim = window.api.onPlayerEliminated(() => {
      refresh();
    });

    return () => {
      unsubTick();
      unsubSeats();
      unsubElim();
    };
  }, [refresh]);

  const tableLoad = useMemo(() => {
    const map = new Map<number, { name: string; count: number; seats: number[] }>();
    for (const row of assignments) {
      if (!map.has(row.table_id)) {
        map.set(row.table_id, { name: row.table_name, count: 0, seats: [] });
      }
      if (row.player_name) {
        const table = map.get(row.table_id)!;
        table.count += 1;
        if (row.seat_number !== null) table.seats.push(row.seat_number);
      }
    }
    return Array.from(map.entries()).map(([tableId, table]) => ({
      tableId,
      tableName: table.name,
      playerCount: table.count,
      seats: table.seats.sort((a, b) => a - b),
    }));
  }, [assignments]);

  const tablesInUse = tableLoad.filter((t) => t.playerCount > 0);
  const maxTable = tablesInUse.reduce((max, t) => Math.max(max, t.playerCount), 0);
  const minTable = tablesInUse.reduce((min, t) => Math.min(min, t.playerCount), tablesInUse.length ? Infinity : 0);
  const imbalance = tablesInUse.length > 1 ? maxTable - minTable : 0;

  async function handleExecuteConsolidationWave() {
    if (!tournamentId || !consolidationPlan?.eligible) return;
    setExecutingConsolidation(true);
    setStatus(null);
    try {
      const result = await window.api.executeConsolidationWave(tournamentId);
      setStatus(
        `Consolidation wave complete: moved ${result.movedCount} player${result.movedCount === 1 ? '' : 's'} from ${result.closedTables.join(', ')}.`
      );
      await refresh();
    } catch (err) {
      setStatus(`Consolidation blocked: ${String(err)}`);
    } finally {
      setExecutingConsolidation(false);
    }
  }

  if (!activeTournament) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">In-Tournament Manager</h2>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-4 space-y-2">
          <label className="block text-xs uppercase tracking-wide text-gray-500">Select Tournament To Initiate</label>
          <select
            value=""
            onChange={(e) => {
              const selected = tournaments.find((t) => t.id === Number(e.target.value)) ?? null;
              setActiveTournament(selected);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          >
            <option value="">— Select a pending tournament —</option>
            {tournaments
              .filter((t) => t.status === 'pending')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-400">
          No tournament selected.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">In-Tournament Manager</h2>
          <p className="text-sm text-gray-400">{activeTournament.name}</p>
          <div className="mt-2">
            <select
              value={activeTournament.id}
              onChange={(e) => {
                const selected = tournaments.find((t) => t.id === Number(e.target.value)) ?? null;
                setActiveTournament(selected);
              }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400"
            >
              {tournaments
                .filter((t) => t.status === 'pending')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-orange-500 hover:text-orange-300 disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <InfoCard label="Status" value={activeTournament.status.toUpperCase()} />
        <InfoCard label="Active Players" value={String(activePlayers.length)} />
        <InfoCard label="Tables In Use" value={String(tablesInUse.length)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
          <LiveController />
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
          <BountyAction />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/40 p-4 xl:col-span-2">
          <h3 className="text-sm font-semibold text-gray-200">Table Operations</h3>

          {consolidationPlan && (
            <div
              className={`rounded-lg border p-3 ${
                consolidationPlan.eligible
                  ? 'border-emerald-800 bg-emerald-950/20'
                  : 'border-gray-800 bg-gray-950/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Consolidation Wave</p>
                  <p className={`text-xs mt-1 ${consolidationPlan.eligible ? 'text-emerald-300' : 'text-gray-400'}`}>
                    {consolidationPlan.reason}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExecuteConsolidationWave}
                  disabled={!consolidationPlan.eligible || executingConsolidation || loading}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                >
                  {executingConsolidation ? 'Consolidating…' : 'Execute Wave'}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <p className="text-gray-500">
                  Players to move: <span className="text-gray-300 font-mono">{consolidationPlan.totalPlayersToMove}</span>
                </p>
                <p className="text-gray-500">
                  Open seats elsewhere: <span className="text-gray-300 font-mono">{consolidationPlan.totalOpenSeats}</span>
                </p>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Sources: {consolidationPlan.sourceTables.length > 0
                  ? consolidationPlan.sourceTables.map((table) => `${table.tableName} (${table.playerCount})`).join(', ')
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
          ) : (
            tableLoad.map((table) => {
              return (
                <div key={table.tableId} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-200">{table.tableName}</span>
                    <span className="text-xs text-gray-400">{table.playerCount} players</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Occupied seats: {table.seats.length ? table.seats.join(', ') : 'none'}
                  </p>
                </div>
              );
            })
          )}

          <p className={`text-xs ${imbalance >= 2 ? 'text-yellow-400' : 'text-gray-500'}`}>
            {tablesInUse.length > 1
              ? imbalance >= 2
                ? `Rebalance recommended: table spread is ${imbalance}.`
                : 'Tables are currently balanced.'
              : 'Table spread available when 2+ tables are active.'}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
          <h3 className="text-sm font-semibold text-gray-200">Live Tournament Snapshot</h3>

          <div className="space-y-2 text-xs text-gray-400">
            <p>
              Level {clock.level} · {clock.running ? 'Running' : 'Paused'}
            </p>
            <p>
              Blinds {clock.smallBlind} / {clock.bigBlind}
            </p>
            <p>
              Next {clock.nextSmallBlind ?? '—'} / {clock.nextBigBlind ?? '—'}
            </p>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Top Bounties</p>
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
              <p className="mt-1 text-xs text-gray-400">
                Prize Pool: ${payouts.prizePool.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400">
                Bounty Pool: ${payouts.bountyPool.toLocaleString()}
              </p>
              {payouts.payouts.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {payouts.payouts
                    .slice(0, 3)
                    .map((entry) => `${entry.place}${entry.place === 1 ? 'st' : entry.place === 2 ? 'nd' : 'rd'}: $${entry.amount.toLocaleString()}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}

          {status && <p className="text-xs text-yellow-400">{status}</p>}
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
