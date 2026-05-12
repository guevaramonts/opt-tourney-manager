import { useState, useEffect, useCallback } from 'react';
import type { RegisterPlayerData, TableAssignment, Player, ActivePlayer, Tournament } from '@shared/types';
import { useTournament } from '../TournamentContext';

const TABLE_STYLE: Record<string, { icon: string; color: string; border: string; bg: string }> = {
  Hearts:   { icon: '\u2665', color: 'text-rose-400',    border: 'border-rose-800',    bg: 'bg-rose-950/40' },
  Spades:   { icon: '\u2660', color: 'text-slate-300',   border: 'border-slate-600',   bg: 'bg-slate-800/40' },
  Clubs:    { icon: '\u2663', color: 'text-emerald-400', border: 'border-emerald-800', bg: 'bg-emerald-950/40' },
  Diamonds: { icon: '\u2666', color: 'text-blue-400',    border: 'border-blue-800',    bg: 'bg-blue-950/40' },
};

export default function RegistrationView() {
  const { activeTournament } = useTournament();

  const [roster, setRoster] = useState<Player[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [players, setPlayers] = useState<ActivePlayer[]>([]);
  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [view, setView] = useState<'list' | 'tables'>('list');
  const [removing, setRemoving] = useState(false);

  const tournamentId = selectedTournamentId ?? activeTournament?.id ?? null;
  const selectedTournament = tournaments.find((t) => t.id === tournamentId) ?? activeTournament ?? null;
  const showSeatNumbers = selectedTournament?.status === 'pending';

  const refreshTournaments = useCallback(async () => {
    try {
      const allTournaments = await window.api.getAllTournaments();
      const registerable = allTournaments.filter((t) => t.status === 'pending');
      setTournaments(registerable);
    } catch {
      // ignore refresh failures
    }
  }, []);

  const refreshPlayers = useCallback(async () => {
    if (!tournamentId) {
      setPlayers([]);
      setAssignments([]);
      try {
        const allPlayers = await window.api.getAllPlayers();
        setRoster(allPlayers);
      } catch {
        // ignore refresh failures
      }
      return;
    }

    try {
      const [active, tables, all] = await Promise.all([
        window.api.getActivePlayers(tournamentId),
        window.api.getTableAssignments(tournamentId),
        window.api.getAllPlayers(),
      ]);
      setPlayers(active);
      setAssignments(tables);
      const registeredIds = new Set(active.map((p) => p.player_id));
      setRoster(all.filter((p) => !registeredIds.has(p.id)));
    } catch {
      // silently ignore on first load
    }
  }, [tournamentId]);

  useEffect(() => {
    void refreshTournaments();
  }, [refreshTournaments]);

  useEffect(() => {
    if (selectedTournamentId === null && activeTournament?.status === 'pending') {
      setSelectedTournamentId(activeTournament.id);
    }
  }, [activeTournament, selectedTournamentId]);

  useEffect(() => {
    refreshPlayers();
  }, [refreshPlayers]);

  // Refresh player data when tournament is reset.
  useEffect(() => {
    const unsubscribe = window.api.onTournamentProgressReset(() => {
      refreshPlayers();
    });
    return unsubscribe;
  }, [refreshPlayers]);

  async function registerPlayers(playerList: Player[]) {
    if (playerList.length === 0 || !tournamentId) return;
    setSubmitting(true);
    setStatus(null);
    try {
      for (const player of playerList) {
        const data: RegisterPlayerData = {
          name: player.name,
          tournamentId,
          chipCount: 10000,
        };
        await window.api.registerPlayer(data);
      }
      setSelectedIds([]);
      setSearch('');
      setStatus({
        text:
          playerList.length === 1
            ? `\u2713 ${playerList[0].name} registered!`
            : `\u2713 ${playerList.length} players registered!`,
        ok: true,
      });
      await refreshPlayers();
    } catch (err) {
      setStatus({ text: `Error: ${String(err)}`, ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSelected(playerId: number) {
    setSelectedIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId]
    );
  }

  async function handleAssignSeats() {
    if (!tournamentId) return;
    setAssigning(true);
    try {
      const result = await window.api.randomAssignSeats(tournamentId);
      await refreshPlayers();
      setStatus({ text: `\u2713 ${result.count} players randomly seated`, ok: true });
    } catch (err) {
      setStatus({ text: `Error: ${String(err)}`, ok: false });
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemovePlayer(playerId: number, playerName: string) {
    if (!tournamentId || !confirm(`Remove ${playerName} from this tournament?`)) return;
    setRemoving(true);
    setStatus(null);
    try {
      await window.api.unregisterPlayer({ tournamentId, playerId });
      setStatus({ text: `\u2713 ${playerName} removed from tournament`, ok: true });
      await refreshPlayers();
    } catch (err) {
      setStatus({ text: `Error: ${String(err)}`, ok: false });
    } finally {
      setRemoving(false);
    }
  }

  const tableGroups = assignments.reduce<Record<string, TableAssignment[]>>((acc, row) => {
    const key = row.table_name ?? '';
    if (!acc[key]) acc[key] = [];
    if (row.player_name) acc[key].push(row);
    return acc;
  }, {});

  const seatsAssigned = players.some((p) => p.seat_number !== null);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRoster = roster.filter((player) => {
    if (!normalizedSearch) return true;
    return [player.name, player.email ?? '', player.phone ?? '']
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });
  const selectedPlayers = roster.filter((player) => selectedIds.includes(player.id));
  const selectedInFilteredCount = filteredRoster.filter((player) => selectedIds.includes(player.id)).length;

  function selectAllFiltered() {
    setSelectedIds((current) => {
      const merged = new Set(current);
      for (const player of filteredRoster) merged.add(player.id);
      return Array.from(merged);
    });
  }

  function unselectFiltered() {
    const filteredIds = new Set(filteredRoster.map((player) => player.id));
    setSelectedIds((current) => current.filter((id) => !filteredIds.has(id)));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Player Registration</h2>
        <div className="space-y-2">
          <label className="block text-xs text-gray-500">Tournament</label>
          <select
            value={tournamentId ?? ''}
            onChange={(e) => setSelectedTournamentId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          >
            <option value="">- Select pending tournament -</option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </div>
        {selectedTournament ? (
          <div className="rounded-2xl border border-orange-700 bg-orange-950/25 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-300">
              Setting Up Tournament
            </p>
            <p className="mt-1 text-base font-semibold text-orange-100">
              {selectedTournament.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-orange-800 bg-orange-900/40 px-2.5 py-1 text-orange-200">
                Status: {selectedTournament.status}
              </span>
              <span className="rounded-full border border-orange-800 bg-orange-900/40 px-2.5 py-1 text-orange-200">
                Buy-in: ${selectedTournament.buy_in}
              </span>
              <span className="rounded-full border border-orange-800 bg-orange-900/40 px-2.5 py-1 text-orange-200">
                Bounty: ${selectedTournament.bounty_amount}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {!selectedTournament && (
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-400">
          No tournament selected. Select a pending tournament above to bulk register players.
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">Quick Register</h3>
            <p className="text-xs text-gray-500">
              Search the roster, select multiple players, then add them in one shot.
            </p>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            {filteredRoster.length} available
          </span>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 text-gray-100"
          />
          <button
            type="button"
            onClick={() => registerPlayers(selectedPlayers)}
            disabled={submitting || selectedPlayers.length === 0 || !tournamentId}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors whitespace-nowrap"
          >
            {submitting
              ? 'Adding\u2026'
              : selectedPlayers.length > 0
                ? `+ Register ${selectedPlayers.length}`
                : '+ Register'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAllFiltered}
            disabled={!tournamentId || filteredRoster.length === 0 || selectedInFilteredCount === filteredRoster.length}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-orange-400 hover:text-orange-300 disabled:opacity-40"
          >
            Select all filtered ({filteredRoster.length})
          </button>
          <button
            type="button"
            onClick={unselectFiltered}
            disabled={selectedInFilteredCount === 0}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-orange-400 hover:text-orange-300 disabled:opacity-40"
          >
            Unselect filtered ({selectedInFilteredCount})
          </button>
          <button
            type="button"
            onClick={() => registerPlayers(filteredRoster)}
            disabled={submitting || !tournamentId || filteredRoster.length === 0}
            className="rounded-md border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-500 hover:text-emerald-200 disabled:opacity-40"
          >
            Register all filtered ({filteredRoster.length})
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-800 divide-y divide-gray-800">
          {filteredRoster.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-600 italic">
              {roster.length === 0 ? 'No players in roster yet' : 'No roster matches your search'}
            </div>
          ) : (
            filteredRoster.map((player) => {
              const selected = selectedIds.includes(player.id);
              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                    selected ? 'bg-orange-950/30' : 'bg-transparent hover:bg-gray-800/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSelected(player.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold ${
                        selected
                          ? 'border-orange-400 bg-orange-500 text-white'
                          : 'border-gray-600 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-100">{player.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[player.email, player.phone].filter(Boolean).join(' · ') || 'No contact info'}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => registerPlayers([player])}
                    disabled={submitting || !tournamentId}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-orange-400 hover:text-orange-300 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              );
            })
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-900 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
            <span>{selectedIds.length} players selected</span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="font-semibold text-orange-200 hover:text-white"
            >
              Clear selection
            </button>
          </div>
        )}

        {roster.length === 0 && players.length === 0 && (
          <p className="text-xs text-gray-500">
            No players in roster yet. Add players in the <strong className="text-gray-300">Players</strong> tab first.
          </p>
        )}
        {status && (
          <p className={`text-sm font-medium ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
            {status.text}
          </p>
        )}
      </section>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
          {(['list', 'tables'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                view === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {v === 'list' ? `All Players (${players.length})` : 'Tables'}
            </button>
          ))}
        </div>

        <button
          onClick={handleAssignSeats}
          disabled={assigning || players.length === 0}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap"
        >
          <span>🎲</span>
          {assigning ? 'Assigning\u2026' : seatsAssigned ? 'Re-assign Seats' : 'Assign Seats Randomly'}
        </button>
      </div>

      {view === 'list' && (
        <ul className="space-y-2">
          {players.length === 0 ? (
            <li className="text-sm text-gray-600 py-4 text-center border border-dashed border-gray-800 rounded-xl">
              No players yet \u2014 add someone above
            </li>
          ) : (
            players.map((p, i) => {
              const style = p.table_name ? TABLE_STYLE[p.table_name] : null;
              return (
                <li
                  key={p.player_id}
                  className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 font-mono w-5">{i + 1}</span>
                    <span className="font-medium text-sm">{p.name}</span>
                    {style && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${style.color} ${style.border} ${style.bg}`}>
                        {style.icon} {p.table_name}
                        {showSeatNumbers && p.seat_number !== null ? ` \u00b7 Seat ${p.seat_number}` : ''}
                      </span>
                    )}
                  </div>
                  {selectedTournament?.status !== 'finalized' && (
                    <button
                      type="button"
                      onClick={() => { void handleRemovePlayer(p.player_id, p.name); }}
                      disabled={removing}
                      className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-500 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}

      {view === 'tables' && (
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(TABLE_STYLE).map(([tableName, style]) => {
            const seated = tableGroups[tableName] ?? [];
            return (
              <div key={tableName} className={`rounded-xl border ${style.border} ${style.bg} p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className={`font-bold text-base ${style.color}`}>
                    {style.icon} {tableName}
                  </h3>
                  <span className="text-xs text-gray-500 font-mono">{seated.length} seated</span>
                </div>
                <ol className="space-y-1.5">
                  {seated.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {showSeatNumbers && (
                          <span className={`text-xs font-bold font-mono ${style.color} w-6 shrink-0`}>
                            {row.seat_number ?? '\u2014'}
                          </span>
                        )}
                        <span className="text-sm text-gray-200">{row.player_name}</span>
                      </div>
                      {selectedTournament?.status !== 'finalized' && (
                        <button
                          type="button"
                          onClick={() => {
                            const playerObj = players.find((p) => p.name === row.player_name);
                            if (playerObj) {
                              void handleRemovePlayer(playerObj.player_id, playerObj.name);
                            }
                          }}
                          disabled={removing}
                          className="rounded-md border border-red-700 px-2 py-0.5 text-xs font-semibold text-red-300 hover:border-red-500 disabled:opacity-40 whitespace-nowrap"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                  {seated.length === 0 && (
                    <li className="text-xs text-gray-600 italic">No players assigned</li>
                  )}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
