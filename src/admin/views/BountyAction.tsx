import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  BatchEliminationData,
  ActivePlayer,
  RebalanceSuggestion,
} from '@shared/types';
import { useTournament } from '../TournamentContext';

export default function BountyAction() {
  const { activeTournament } = useTournament();
  const tournamentId = activeTournament?.id ?? null;

  const [players, setPlayers] = useState<ActivePlayer[]>([]);
  const [winner, setWinner] = useState('');
  const [loser, setLoser] = useState('');
  const [handEliminations, setHandEliminations] = useState<Array<{ killerId: number; victimId: number }>>([]);
  const [selectedMovePlayerId, setSelectedMovePlayerId] = useState<number | null>(null);
  const [pendingRebalance, setPendingRebalance] = useState<RebalanceSuggestion | null>(null);
  const [knockoutPosition, setKnockoutPosition] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const POSITION_LABELS = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'];

  function getPositionLabel(index: number): string {
    return POSITION_LABELS[index] ?? `P${index + 1}`;
  }

  function getOrderedSeats(tableId: number): number[] {
    const seats = players
      .filter((p) => p.table_id === tableId && p.seat_number !== null)
      .map((p) => p.seat_number as number)
      .sort((a, b) => a - b);

    if (seats.length === 0) return [];

    const buttonIndex = 0;

    return [...seats.slice(buttonIndex), ...seats.slice(0, buttonIndex)];
  }

  function getSeatPositionLabel(tableId: number, seatNumber: number | null): string | null {
    if (seatNumber === null) return null;
    const orderedSeats = getOrderedSeats(tableId);
    const positionIndex = orderedSeats.indexOf(seatNumber);
    if (positionIndex < 0) return null;
    return getPositionLabel(positionIndex);
  }

  const sourcePositionOptions = useMemo(() => {
    if (!pendingRebalance) return [];
    return getOrderedSeats(pendingRebalance.sourceTableId).map((seat, idx) => ({
      seat,
      label: getPositionLabel(idx),
    }));
  }, [pendingRebalance, players]);

  const candidatePositionMap = useMemo(() => {
    if (!pendingRebalance) return new Map<number, string | null>();
    const map = new Map<number, string | null>();
    for (const candidate of pendingRebalance.candidates) {
      map.set(
        candidate.playerId,
        getSeatPositionLabel(pendingRebalance.sourceTableId, candidate.seatNumber)
      );
    }
    return map;
  }, [pendingRebalance, players]);

  const prioritizedCandidates = useMemo(() => {
    if (!pendingRebalance) return [];
    if (!knockoutPosition) return pendingRebalance.candidates;

    const matching = pendingRebalance.candidates.filter(
      (candidate) => candidatePositionMap.get(candidate.playerId) === knockoutPosition
    );

    if (matching.length > 0) return matching;
    return pendingRebalance.candidates;
  }, [pendingRebalance, knockoutPosition, candidatePositionMap]);

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) return;
    const active = await window.api.getActivePlayers(tournamentId);
    setPlayers(active);
  }, [tournamentId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  function playerLabel(player: ActivePlayer): string {
    const table = player.table_name ?? 'Unseated';
    const seat = player.seat_number ? ` · Seat ${player.seat_number}` : '';
    return `${player.name} (${table}${seat})`;
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
    const victimName = players.find((p) => p.player_id === victimId)?.name ?? 'Player';
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
      setPendingRebalance(result.rebalance);
      setKnockoutPosition('');
      setSelectedMovePlayerId(null);
      setStatus(
        result.rebalance
          ? `✓ Hand resolved with ${handEliminations.length} knockouts. Rebalance needed: record busted position, then choose who to move from ${result.rebalance.sourceTableName}.`
          : `✓ Hand resolved with ${handEliminations.length} knockouts. Bounties awarded.`
      );
      setHandEliminations([]);
      setWinner('');
      setLoser('');
      await loadPlayers();
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
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
      setKnockoutPosition('');
      setSelectedMovePlayerId(null);
      setStatus(
        result.rebalance
          ? `✓ ${player?.name ?? 'Player'} moved to ${result.tableName}, seat ${result.seatNumber}. Another move is still needed.`
          : `✓ ${player?.name ?? 'Player'} moved to ${result.tableName}, seat ${result.seatNumber}. Tables are balanced.`
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
        <div>
          <label className="block text-sm text-gray-400 mb-1">Winner (took the chips)</label>
          <select
            value={winner}
            onChange={(e) => setWinner(e.target.value)}
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
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
          >
            <option value="">— Select knocked out —</option>
            {players
              .filter((p) => String(p.player_id) !== winner)
              .map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  {playerLabel(p)}
                </option>
              ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !winner || !loser}
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            + Add To Hand
          </button>
          <button
            type="button"
            onClick={handleResolveHand}
            disabled={submitting || handEliminations.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {submitting ? 'Committing…' : `Commit Hand (${handEliminations.length})`}
          </button>
        </div>
      </form>

      {handEliminations.length > 0 && (
        <div className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pending Knockouts (Not Committed)</p>
          {handEliminations.map((entry, idx) => {
            const killerName = players.find((p) => p.player_id === entry.killerId)?.name ?? 'Unknown';
            const victim = players.find((p) => p.player_id === entry.victimId);
            const victimName = victim?.name ?? 'Unknown';
            const victimTable = victim?.table_name ? ` · ${victim.table_name}` : '';
            const victimSeat = victim?.seat_number ? ` Seat ${victim.seat_number}` : '';
            return (
              <div key={`${entry.victimId}-${idx}`} className="flex items-center justify-between text-sm">
                <span className="text-gray-200">{victimName}{victimTable}{victimSeat ? ` · ${victimSeat}` : ''} busted by {killerName}</span>
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
        <div className="space-y-4 rounded-xl border border-orange-800 bg-orange-950/20 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-orange-300">Table Move Required</h3>
            <p className="text-xs text-orange-200/80">
              Move one player from {pendingRebalance.sourceTableName} ({pendingRebalance.sourceCount}) to{' '}
              {pendingRebalance.targetTableName} ({pendingRebalance.targetCount}).
            </p>
            <p className="text-xs text-orange-200/70">
              1) Select the busted player's position. 2) Ask {pendingRebalance.sourceTableName} who is in that position. 3) Select that player below.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-orange-200/80 mb-1">
              Busted Player Position
            </label>
            <select
              value={knockoutPosition}
              onChange={(e) => {
                const selectedPosition = e.target.value;
                setKnockoutPosition(selectedPosition);

                if (!pendingRebalance) return;
                const matching = pendingRebalance.candidates.filter(
                  (candidate) => candidatePositionMap.get(candidate.playerId) === selectedPosition
                );
                setSelectedMovePlayerId(
                  matching[0]?.playerId ?? pendingRebalance.candidates[0]?.playerId ?? null
                );
              }}
              className="w-full bg-gray-900 border border-orange-800/80 rounded-lg px-3 py-2 text-sm text-orange-100 focus:outline-none focus:border-orange-500"
            >
              <option value="">— Select position —</option>
              {sourcePositionOptions.map((entry) => (
                <option key={`${entry.label}-${entry.seat}`} value={entry.label}>
                  {entry.label} (Seat {entry.seat})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {prioritizedCandidates.map((candidate) => {
              const selected = candidate.playerId === selectedMovePlayerId;
              const candidatePosition = candidatePositionMap.get(candidate.playerId);
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
                      {candidate.tableName} · Seat {candidate.seatNumber ?? '—'} · {candidatePosition ?? 'Unknown position'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {knockoutPosition &&
            prioritizedCandidates.length > 0 &&
            candidatePositionMap.get(prioritizedCandidates[0].playerId) !== knockoutPosition && (
              <p className="text-xs text-yellow-300/90">
                No exact {knockoutPosition} match found on {pendingRebalance.sourceTableName}; choose the closest player manually.
              </p>
            )}

          <button
            type="button"
            onClick={handleMovePlayer}
            disabled={submitting || !selectedMovePlayerId || !knockoutPosition}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-400 disabled:opacity-40"
          >
            {submitting ? 'Moving…' : `Move Selected Player to ${pendingRebalance.targetTableName}`}
          </button>
        </div>
      )}

      {/* Active player count */}
      <p className="text-xs text-gray-600">
        {players.length} active player{players.length !== 1 ? 's' : ''} remaining
      </p>
    </div>
  );
}
