import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useTournament } from '../contexts/TournamentContext';
import { useTournamentProgressReset, useConsolidationExecuted } from '../api/socket';

interface ActivePlayer {
  player_id: number; name: string; nickname?: string | null;
  table_name?: string | null; seat_number?: number | null; table_id?: number | null;
}

interface RebalanceCandidate { playerId: number; name: string; tableName: string; seatNumber?: number | null; }

interface RebalanceSuggestion {
  sourceTableName: string; sourceCount: number; targetTableName: string; targetCount: number;
  targetTableId: number; candidates: RebalanceCandidate[];
}

interface ConsolidationPlan {
  eligible: boolean; reason: string; totalPlayersToMove: number; totalOpenSeats: number;
}

const TABLE_ICONS: Record<string, string> = {
  Hearts: '♥', Spades: '♠', Clubs: '♣', Diamonds: '♦',
};

const TABLE_HEADER_COLOR: Record<string, string> = {
  Hearts: 'text-rose-400', Spades: 'text-slate-300',
  Clubs: 'text-emerald-400', Diamonds: 'text-blue-400',
};

const TABLE_ORDER = ['Hearts', 'Spades', 'Clubs', 'Diamonds'];

export default function BountyAction({ showSeatNumbers = true }: { showSeatNumbers?: boolean }) {
  const { activeTournament } = useTournament();
  const tournamentId = activeTournament?.id ?? null;

  const [players, setPlayers] = useState<ActivePlayer[]>([]);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [loserId, setLoserId] = useState<number | null>(null);
  const [handEliminations, setHandEliminations] = useState<Array<{ killerId: number; victimId: number }>>([]);
  const [selectedMovePlayerId, setSelectedMovePlayerId] = useState<number | null>(null);
  const [pendingRebalance, setPendingRebalance] = useState<RebalanceSuggestion | null>(null);
  const [pendingConsolidation, setPendingConsolidation] = useState<ConsolidationPlan | null>(null);
  const [pendingConsolidationAt, setPendingConsolidationAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedWinner = players.find((p) => p.player_id === winnerId);

  const tableGroups = useMemo(() => {
    const groups: Record<string, ActivePlayer[]> = {};
    for (const p of players) {
      const key = p.table_name ?? 'Unseated';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (a.seat_number ?? 99) - (b.seat_number ?? 99));
    }
    return groups;
  }, [players]);

  const orderedTables = useMemo(() => [
    ...TABLE_ORDER.filter((t) => tableGroups[t]),
    ...Object.keys(tableGroups).filter((t) => !TABLE_ORDER.includes(t)),
  ], [tableGroups]);

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) return;
    setPlayers(await api.getActivePlayers(tournamentId) as ActivePlayer[]);
  }, [tournamentId]);

  useEffect(() => { void loadPlayers(); }, [loadPlayers]);

  useTournamentProgressReset(useCallback(() => { void loadPlayers(); }, [loadPlayers]));

  useConsolidationExecuted(useCallback((payload: unknown) => {
    const event = payload as { tournamentId?: number };
    if (!tournamentId || event.tournamentId !== tournamentId) return;
    setWinnerId(null); setLoserId(null); setHandEliminations([]);
    setPendingRebalance(null); setPendingConsolidation(null); setPendingConsolidationAt(null);
    setSelectedMovePlayerId(null);
    setStatus('Consolidation wave executed. Bounty action has been refreshed.');
    void loadPlayers();
  }, [loadPlayers, tournamentId]));

  function playerDisplayName(player: { name: string; nickname?: string | null }): string {
    return player.nickname?.trim() ? `${player.name} (${player.nickname.trim()})` : player.name;
  }

  function handlePlayerClick(playerId: number) {
    // Tap winner again → deselect both
    if (winnerId === playerId) { setWinnerId(null); setLoserId(null); return; }
    // Tap loser again → deselect loser
    if (loserId === playerId) { setLoserId(null); return; }

    const clicked = players.find((p) => p.player_id === playerId);

    if (winnerId === null) {
      // Nothing selected yet — set winner
      setWinnerId(playerId);
      return;
    }

    // Winner already selected
    if (selectedWinner && clicked?.table_id === selectedWinner.table_id) {
      // Same table — set as loser
      setLoserId(playerId);
    } else {
      // Different table — swap winner, clear loser
      setWinnerId(playerId);
      setLoserId(null);
    }
  }

  function handleQueueElimination() {
    if (!winnerId || !loserId || !tournamentId) return;
    if (handEliminations.some((e) => e.victimId === loserId)) {
      setStatus('This player is already queued for this hand.'); return;
    }
    const victim = players.find((p) => p.player_id === loserId);
    setHandEliminations((cur) => [...cur, { killerId: winnerId, victimId: loserId }]);
    setStatus(`Queued: ${victim ? playerDisplayName(victim) : 'Player'}`);
    setLoserId(null); // keep winner selected for back-to-back knockouts
  }

  async function handleResolveHand() {
    if (!tournamentId) return;
    if (handEliminations.length === 0) { setStatus('Queue at least one knockout first.'); return; }
    setSubmitting(true); setStatus(null);
    try {
      const result = await api.recordEliminations({ tournamentId, eliminations: handEliminations }) as { rebalance: RebalanceSuggestion | null };
      const refreshedPlayers = await api.getActivePlayers(tournamentId) as ActivePlayer[];
      setPlayers(refreshedPlayers);
      const activeCount = refreshedPlayers.length;

      if (activeCount === 20 || activeCount === 10) {
        const plan = await api.getConsolidationPlan(tournamentId) as ConsolidationPlan;
        if (plan.eligible) {
          setPendingRebalance(null); setPendingConsolidation(plan);
          setPendingConsolidationAt(activeCount); setSelectedMovePlayerId(null);
          setStatus(`✓ Hand resolved with ${handEliminations.length} knockout${handEliminations.length === 1 ? '' : 's'}. ${activeCount} players remain — run a consolidation wave now.`);
        } else {
          setPendingConsolidation(null); setPendingConsolidationAt(null);
          setPendingRebalance(result.rebalance); setSelectedMovePlayerId(null);
          setStatus(result.rebalance
            ? `✓ ${handEliminations.length} knockout${handEliminations.length === 1 ? '' : 's'} committed. Rebalance needed — select a player to move from ${result.rebalance.sourceTableName}.`
            : `✓ ${handEliminations.length} knockout${handEliminations.length === 1 ? '' : 's'} committed.`);
        }
      } else {
        setPendingConsolidation(null); setPendingConsolidationAt(null);
        setPendingRebalance(result.rebalance); setSelectedMovePlayerId(null);
        setStatus(result.rebalance
          ? `✓ ${handEliminations.length} knockout${handEliminations.length === 1 ? '' : 's'} committed. Rebalance needed — select a player to move from ${result.rebalance.sourceTableName}.`
          : `✓ ${handEliminations.length} knockout${handEliminations.length === 1 ? '' : 's'} committed.`);
      }
      setHandEliminations([]); setWinnerId(null); setLoserId(null);
    } catch (err) { setStatus(`Error: ${String(err)}`); }
    finally { setSubmitting(false); }
  }

  async function handleExecuteConsolidation() {
    if (!tournamentId || !pendingConsolidation?.eligible) return;
    setSubmitting(true); setStatus(null);
    try {
      const result = await api.executeConsolidationWave(tournamentId) as { movedCount: number; closedTables: string[] };
      setPendingConsolidation(null); setPendingConsolidationAt(null);
      setStatus(`✓ Consolidation complete: moved ${result.movedCount} player${result.movedCount === 1 ? '' : 's'} from ${result.closedTables.join(', ')}.`);
      await loadPlayers();
    } catch (err) { setStatus(`Consolidation blocked: ${String(err)}`); }
    finally { setSubmitting(false); }
  }

  async function handleMovePlayer() {
    if (!pendingRebalance || !selectedMovePlayerId || !tournamentId) return;
    setSubmitting(true); setStatus(null);
    try {
      const player = pendingRebalance.candidates.find((c) => c.playerId === selectedMovePlayerId);
      const result = await api.movePlayerForRebalance({ tournamentId, playerId: selectedMovePlayerId, toTableId: pendingRebalance.targetTableId }) as { rebalance: RebalanceSuggestion | null; tableName: string; seatNumber: number | null };
      setPendingRebalance(result.rebalance); setSelectedMovePlayerId(null);
      setStatus(result.rebalance
        ? `✓ ${player ? playerDisplayName(player) : 'Player'} moved to ${result.tableName}${showSeatNumbers ? `, seat ${result.seatNumber}` : ''}. Another move needed.`
        : `✓ ${player ? playerDisplayName(player) : 'Player'} moved to ${result.tableName}${showSeatNumbers ? `, seat ${result.seatNumber}` : ''}. Tables balanced.`);
      await loadPlayers();
    } catch (err) { setStatus(`Error: ${String(err)}`); }
    finally { setSubmitting(false); }
  }

  if (!activeTournament) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Bounty Action</h2>
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-400">
          No tournament selected.
        </div>
      </div>
    );
  }

  const instructionText = !winnerId
    ? 'Tap a player to mark them as the winner.'
    : !loserId
    ? `Winner: ${selectedWinner ? playerDisplayName(selectedWinner) : '—'} — now tap who they knocked out.`
    : 'Ready — queue this knockout or tap a player to change.';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bounty Action</h2>
        <span className="text-xs text-gray-500">{players.length} active</span>
      </div>

      <p className="text-xs text-gray-400">{instructionText}</p>

      {/* Player grid grouped by table */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {orderedTables.map((tableName) => {
          const tablePlayers = tableGroups[tableName];
          const icon = TABLE_ICONS[tableName] ?? '•';
          const headerColor = TABLE_HEADER_COLOR[tableName] ?? 'text-gray-400';

          return (
            <div key={tableName}>
              <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1.5 ${headerColor}`}>
                {icon} {tableName}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tablePlayers.map((player) => {
                  const isWinner = player.player_id === winnerId;
                  const isLoser = player.player_id === loserId;
                  const isQueued = handEliminations.some((e) => e.victimId === player.player_id);
                  const isDimmed = !isWinner && !isLoser && winnerId !== null
                    && selectedWinner?.table_id != null
                    && player.table_id !== selectedWinner.table_id;

                  let cls = 'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors';
                  if (isWinner)
                    cls += ' border-orange-400 bg-orange-950/50 text-orange-100';
                  else if (isLoser)
                    cls += ' border-red-400 bg-red-950/50 text-red-100';
                  else if (isQueued)
                    cls += ' border-gray-700 bg-gray-900/40 text-gray-500 line-through cursor-default';
                  else if (isDimmed)
                    cls += ' border-gray-800 bg-transparent text-gray-700 cursor-not-allowed';
                  else
                    cls += ' border-gray-700 bg-gray-900/60 text-gray-200 hover:border-gray-500 hover:bg-gray-800/70 cursor-pointer';

                  return (
                    <button
                      key={player.player_id}
                      type="button"
                      disabled={isDimmed || isQueued}
                      onClick={() => handlePlayerClick(player.player_id)}
                      className={cls}
                    >
                      {playerDisplayName(player)}
                      {showSeatNumbers && player.seat_number && !isWinner && !isLoser && (
                        <span className="font-mono opacity-40 text-[10px]">#{player.seat_number}</span>
                      )}
                      {isWinner && <span className="text-[10px] font-bold text-orange-400">W</span>}
                      {isLoser && <span className="text-[10px] font-bold text-red-400">✕</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleQueueElimination}
          disabled={!winnerId || !loserId || submitting}
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm"
        >
          + Queue Knockout
        </button>
        <button
          type="button"
          onClick={() => { void handleResolveHand(); }}
          disabled={submitting || handEliminations.length === 0}
          className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm"
        >
          {submitting ? 'Committing…' : `Commit (${handEliminations.length})`}
        </button>
      </div>

      {/* Queued eliminations */}
      {handEliminations.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Pending — not committed
          </p>
          {handEliminations.map((entry, idx) => {
            const killer = players.find((p) => p.player_id === entry.killerId);
            const victim = players.find((p) => p.player_id === entry.victimId);
            return (
              <div key={`${entry.victimId}-${idx}`} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">
                  <span className="text-orange-300">{killer ? playerDisplayName(killer) : `#${entry.killerId}`}</span>
                  <span className="text-gray-600 mx-1.5">eliminates</span>
                  <span className="text-red-300">{victim ? playerDisplayName(victim) : `#${entry.victimId}`}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setHandEliminations((cur) => cur.filter((_, i) => i !== idx))}
                  className="text-gray-600 hover:text-red-400 ml-3"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {status && <p className="text-xs text-green-400">{status}</p>}

      {/* Rebalance modal */}
      {pendingRebalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div role="dialog" aria-modal="true"
            className="w-full max-w-lg space-y-4 rounded-xl border border-orange-700 bg-gray-950 p-5 shadow-2xl">
            <div>
              <h3 className="text-sm font-semibold text-orange-300">Table Move Required</h3>
              <p className="text-xs text-orange-200/70 mt-1">
                Move one player from {pendingRebalance.sourceTableName} ({pendingRebalance.sourceCount}) → {pendingRebalance.targetTableName} ({pendingRebalance.targetCount}).
              </p>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {pendingRebalance.candidates.map((candidate) => {
                const selected = candidate.playerId === selectedMovePlayerId;
                return (
                  <button key={candidate.playerId} type="button"
                    onClick={() => setSelectedMovePlayerId(candidate.playerId)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${selected ? 'border-orange-400 bg-orange-500/10 text-orange-100' : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-orange-700'}`}>
                    <span className="text-sm font-medium">{candidate.name}</span>
                    {showSeatNumbers && (
                      <span className="text-xs text-gray-500 font-mono">Seat {candidate.seatNumber ?? '—'}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => { void handleMovePlayer(); }}
              disabled={submitting || !selectedMovePlayerId}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40">
              {submitting ? 'Moving…' : `Move to ${pendingRebalance.targetTableName}`}
            </button>
          </div>
        </div>
      )}

      {/* Consolidation modal */}
      {pendingConsolidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div role="dialog" aria-modal="true"
            className="w-full max-w-lg space-y-4 rounded-xl border border-emerald-700 bg-gray-950 p-5 shadow-2xl">
            <div>
              <h3 className="text-sm font-semibold text-emerald-300">Consolidation Wave</h3>
              <p className="text-xs text-emerald-200/70 mt-1">
                {pendingConsolidationAt} players remain. {pendingConsolidation.reason}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-xs text-gray-400 space-y-1">
              <p>Players to move: <span className="font-mono text-gray-200">{pendingConsolidation.totalPlayersToMove}</span></p>
              <p>Open seats available: <span className="font-mono text-gray-200">{pendingConsolidation.totalOpenSeats}</span></p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { void handleExecuteConsolidation(); }} disabled={submitting}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
                {submitting ? 'Consolidating…' : 'Execute Wave'}
              </button>
              <button type="button" onClick={() => { setPendingConsolidation(null); setPendingConsolidationAt(null); }} disabled={submitting}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 hover:border-gray-500 disabled:opacity-40">
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
