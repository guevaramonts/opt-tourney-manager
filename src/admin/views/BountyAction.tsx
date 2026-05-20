import { useState, useEffect, useCallback } from 'react';
import type {
  BatchEliminationData,
  ActivePlayer,
  ConsolidationPlan,
  RebalanceSuggestion,
} from '@shared/types';
import { useTournament } from '../TournamentContext';

export default function BountyAction() {
  const { activeTournament } = useTournament();
  const tournamentId = activeTournament?.id ?? null;
  const showSeatNumbers = activeTournament?.status === 'pending';

  const [players, setPlayers] = useState<ActivePlayer[]>([]);
  const [winner, setWinner] = useState('');
  const [loser, setLoser] = useState('');
  const [handEliminations, setHandEliminations] = useState<Array<{ killerId: number; victimId: number }>>([]);
  const [selectedMovePlayerId, setSelectedMovePlayerId] = useState<number | null>(null);
  const [pendingRebalance, setPendingRebalance] = useState<RebalanceSuggestion | null>(null);
  const [pendingConsolidation, setPendingConsolidation] = useState<ConsolidationPlan | null>(null);
  const [pendingConsolidationAt, setPendingConsolidationAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedWinner = players.find((p) => String(p.player_id) === winner);
  const eligibleLosers = players.filter((p) => {
    if (String(p.player_id) === winner) return false;
    if (!selectedWinner) return true;
    if (selectedWinner.table_id === null) return false;
    return p.table_id === selectedWinner.table_id;
  });

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) return;
    const active = await window.api.getActivePlayers(tournamentId);
    setPlayers(active);
  }, [tournamentId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // Refresh player seats when tournament is reset.
  useEffect(() => {
    const unsubscribe = window.api.onTournamentProgressReset(() => {
      loadPlayers();
    });
    return unsubscribe;
  }, [loadPlayers]);

  useEffect(() => {
    const unsubscribe = window.api.onConsolidationExecuted((payload) => {
      const event = payload as { tournamentId?: number };
      if (!tournamentId || event.tournamentId !== tournamentId) return;
      setWinner('');
      setLoser('');
      setHandEliminations([]);
      setPendingRebalance(null);
      setPendingConsolidation(null);
      setPendingConsolidationAt(null);
      setSelectedMovePlayerId(null);
      setStatus('Consolidation wave executed. Bounty action has been refreshed.');
      loadPlayers();
    });
    return unsubscribe;
  }, [loadPlayers, tournamentId]);

  function playerDisplayName(player: { name: string; nickname?: string | null }): string {
    return player.nickname?.trim() ? `${player.name} (${player.nickname.trim()})` : player.name;
  }

  function playerLabel(player: ActivePlayer): string {
    const table = player.table_name ?? 'Unseated';
    const seat = showSeatNumbers && player.seat_number ? ` · Seat ${player.seat_number}` : '';
    return `${playerDisplayName(player)} (${table}${seat})`;
  }

  function handleAddElimination(e: React.FormEvent) {
    e.preventDefault();
    if (!winner || !loser || winner === loser || !tournamentId) return;

    const killerId = Number(winner);
    const victimId = Number(loser);
    const killer = players.find((p) => p.player_id === killerId);
    const victim = players.find((p) => p.player_id === victimId);
    if (killer?.table_id && victim?.table_id && killer.table_id !== victim.table_id) {
      setStatus('Winner and knocked out player must be from the same table.');
      return;
    }

    if (handEliminations.some((entry) => entry.victimId === victimId)) {
      setStatus('This knocked out player is already queued for this hand.');
      return;
    }

    setHandEliminations((current) => [...current, { killerId, victimId }]);
    const victimName = victim ? playerDisplayName(victim) : 'Player';
    setStatus(`Queued: ${victimName}`);
    setLoser('');
  }

  async function handleResolveHand() {
    if (!tournamentId) return;
    if (handEliminations.length === 0) {
      setStatus('Add at least one knockout for this hand first.');
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const data: BatchEliminationData = {
        tournamentId,
        eliminations: handEliminations,
      };
      const result = await window.api.recordEliminations(data);
      const refreshedPlayers = await window.api.getActivePlayers(tournamentId);
      setPlayers(refreshedPlayers);
      const activeCount = refreshedPlayers.length;

      if (activeCount === 20 || activeCount === 10) {
        const plan = await window.api.getConsolidationPlan(tournamentId);
        if (plan.eligible) {
          setPendingRebalance(null);
          setPendingConsolidation(plan);
          setPendingConsolidationAt(activeCount);
          setSelectedMovePlayerId(null);
          setStatus(
            `✓ Hand resolved with ${handEliminations.length} knockouts. ${activeCount} players remain — run a consolidation wave now.`
          );
        } else {
          setPendingConsolidation(null);
          setPendingConsolidationAt(null);
          setPendingRebalance(result.rebalance);
          setSelectedMovePlayerId(null);
          setStatus(
            result.rebalance
              ? `✓ Hand resolved with ${handEliminations.length} knockouts. Rebalance needed — select a player to move from ${result.rebalance.sourceTableName}.`
              : `✓ Hand resolved with ${handEliminations.length} knockouts. Bounties awarded.`
          );
        }
      } else {
        setPendingConsolidation(null);
        setPendingConsolidationAt(null);
        setPendingRebalance(result.rebalance);
        setSelectedMovePlayerId(null);
        setStatus(
          result.rebalance
            ? `✓ Hand resolved with ${handEliminations.length} knockouts. Rebalance needed — select a player to move from ${result.rebalance.sourceTableName}.`
            : `✓ Hand resolved with ${handEliminations.length} knockouts. Bounties awarded.`
        );
      }

      setSelectedMovePlayerId(null);
      setHandEliminations([]);
      setWinner('');
      setLoser('');
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExecuteConsolidation() {
    if (!tournamentId || !pendingConsolidation?.eligible) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const result = await window.api.executeConsolidationWave(tournamentId);
      setPendingConsolidation(null);
      setPendingConsolidationAt(null);
      setStatus(
        `✓ Consolidation wave complete: moved ${result.movedCount} player${result.movedCount === 1 ? '' : 's'} from ${result.closedTables.join(', ')}.`
      );
      await loadPlayers();
    } catch (err) {
      setStatus(`Consolidation blocked: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMovePlayer() {
    if (!pendingRebalance || !selectedMovePlayerId || !tournamentId) return;

    setSubmitting(true);
    setStatus(null);

    try {
      const player = pendingRebalance.candidates.find(
        (candidate) => candidate.playerId === selectedMovePlayerId
      );
      const result = await window.api.movePlayerForRebalance({
        tournamentId,
        playerId: selectedMovePlayerId,
        toTableId: pendingRebalance.targetTableId,
      });
      setPendingRebalance(result.rebalance);
      setSelectedMovePlayerId(null);
      setStatus(
        result.rebalance
          ? `✓ ${player ? playerDisplayName(player) : 'Player'} moved to ${result.tableName}${showSeatNumbers ? `, seat ${result.seatNumber}` : ''}. Another move is still needed.`
          : `✓ ${player ? playerDisplayName(player) : 'Player'} moved to ${result.tableName}${showSeatNumbers ? `, seat ${result.seatNumber}` : ''}. Tables are balanced.`
      );
      await loadPlayers();
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeTournament) {
    return (
      <div className="max-w-md space-y-6">
        <h2 className="text-lg font-semibold">Bounty Action</h2>
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-400">
          No tournament selected — go to the <strong>Tournaments</strong> tab to create or select one.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-6">
      <h2 className="text-lg font-semibold">Bounty Action</h2>
      <p className="text-sm text-gray-400">
        Queue all bust-outs from one hand as pending, then commit once.
      </p>

      <form onSubmit={handleAddElimination} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Winner (took the chips)</label>
            <select
              value={winner}
              onChange={(e) => {
                const nextWinner = e.target.value;
                setWinner(nextWinner);
                setLoser((currentLoser) => {
                  if (!currentLoser) return '';
                  const winnerRow = players.find((p) => String(p.player_id) === nextWinner);
                  const loserRow = players.find((p) => String(p.player_id) === currentLoser);
                  if (!winnerRow || !loserRow) return '';
                  if (winnerRow.table_id === null) return '';
                  return loserRow.table_id === winnerRow.table_id ? currentLoser : '';
                });
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            >
              <option value="">— Select winner —</option>
              {players
                .filter((p) => String(p.player_id) !== loser)
                .map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {playerLabel(p)}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Knocked Out Player</label>
            <select
              value={loser}
              onChange={(e) => setLoser(e.target.value)}
              disabled={!winner || (selectedWinner?.table_id ?? null) === null}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            >
              <option value="">
                {!winner
                  ? '— Select winner first —'
                  : (selectedWinner?.table_id ?? null) === null
                    ? '— Winner must be seated at a table —'
                    : '— Select knocked out —'}
              </option>
              {eligibleLosers
                .map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {playerLabel(p)}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !winner || !loser}
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            Post Elimination
          </button>
          <button
            type="button"
            onClick={handleResolveHand}
            disabled={submitting || handEliminations.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {submitting ? 'Committing…' : `Commit Elimination (${handEliminations.length})`}
          </button>
        </div>
      </form>

      {handEliminations.length > 0 && (
        <div className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pending Knockouts (Not Committed)</p>
          {handEliminations.map((entry, idx) => {
            const killer = players.find((p) => p.player_id === entry.killerId);
            const killerName = killer ? playerDisplayName(killer) : 'Unknown';
            const victim = players.find((p) => p.player_id === entry.victimId);
            const victimName = victim ? playerDisplayName(victim) : 'Unknown';
            const victimTable = victim?.table_name ? ` · ${victim.table_name}` : '';
            const victimSeat = showSeatNumbers && victim?.seat_number ? ` Seat ${victim.seat_number}` : '';
            return (
              <div key={`${entry.victimId}-${idx}`} className="flex items-center justify-between text-sm">
                <span className="text-gray-200">{killerName} eliminates {victimName}{victimTable}{victimSeat ? ` · ${victimSeat}` : ''}</span>
                <button
                  type="button"
                  onClick={() =>
                    setHandEliminations((current) =>
                      current.filter((_, rowIndex) => rowIndex !== idx)
                    )
                  }
                  className="text-xs text-gray-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {status && (
        <p className="text-sm text-green-400">{status}</p>
      )}

      {pendingRebalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select a player to move"
            className="w-full max-w-lg space-y-4 rounded-xl border border-orange-700 bg-gray-950 p-5 shadow-2xl"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-orange-300">Table Move Required</h3>
              <p className="text-xs text-orange-200/80">
                Move one player from {pendingRebalance.sourceTableName} ({pendingRebalance.sourceCount}) to{' '}
                {pendingRebalance.targetTableName} ({pendingRebalance.targetCount}).
              </p>
              <p className="text-xs text-orange-200/70">
                Select the player to move from {pendingRebalance.sourceTableName}.
              </p>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {pendingRebalance.candidates.map((candidate) => {
                const selected = candidate.playerId === selectedMovePlayerId;
                return (
                  <button
                    key={candidate.playerId}
                    type="button"
                    onClick={() => setSelectedMovePlayerId(candidate.playerId)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected
                        ? 'border-orange-400 bg-orange-500/10 text-orange-100'
                        : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-orange-700'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium">{candidate.name}</span>
                      <span className="block text-xs text-gray-500">
                        {candidate.tableName}{showSeatNumbers ? ` · Seat ${candidate.seatNumber ?? '—'}` : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleMovePlayer}
              disabled={submitting || !selectedMovePlayerId}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 disabled:opacity-40"
            >
              {submitting ? 'Moving…' : `Move Selected Player to ${pendingRebalance.targetTableName}`}
            </button>
          </div>
        </div>
      )}

      {pendingConsolidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Consolidation wave required"
            className="w-full max-w-lg space-y-4 rounded-xl border border-emerald-700 bg-gray-950 p-5 shadow-2xl"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-emerald-300">Consolidation Wave Required</h3>
              <p className="text-xs text-emerald-200/80">
                {pendingConsolidationAt} players remain. Skip replacement and run consolidation.
              </p>
              <p className="text-xs text-emerald-200/70">{pendingConsolidation.reason}</p>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-xs text-gray-300 space-y-1">
              <p>
                Players to move: <span className="font-mono">{pendingConsolidation.totalPlayersToMove}</span>
              </p>
              <p>
                Open seats available: <span className="font-mono">{pendingConsolidation.totalOpenSeats}</span>
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExecuteConsolidation}
                disabled={submitting}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
              >
                {submitting ? 'Consolidating…' : 'Execute Consolidation Wave'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingConsolidation(null);
                  setPendingConsolidationAt(null);
                }}
                disabled={submitting}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500 disabled:opacity-40"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active player count */}
      <p className="text-xs text-gray-600">
        {players.length} active player{players.length !== 1 ? 's' : ''} remaining
      </p>
    </div>
  );
}
