import { useState, useEffect, useCallback } from 'react';
import type { Player, UpdatePlayerData } from '@shared/types';
import { useTournament } from '../TournamentContext';

export default function PlayersView() {
  const { activeTournament } = useTournament();
  const [players, setPlayers] = useState<Player[]>([]);
  const [eliminatedCount, setEliminatedCount] = useState<number | null>(null);
  const [activeSeatingByPlayerId, setActiveSeatingByPlayerId] = useState<Record<number, { tableName: string | null; seatNumber: number | null }>>({});
  const [newName, setNewName] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.getAllPlayers();
      setPlayers(list);
    } catch {
      // ignore
    }
  }, []);

  const refreshEliminatedCount = useCallback(async () => {
    if (!activeTournament) {
      setEliminatedCount(null);
      setActiveSeatingByPlayerId({});
      return;
    }
    try {
      const active = await window.api.getActivePlayers(activeTournament.id);
      const total = activeTournament.player_count ?? 0;
      setEliminatedCount(total - active.length);
      const seating: Record<number, { tableName: string | null; seatNumber: number | null }> = {};
      for (const entry of active) {
        seating[entry.player_id] = {
          tableName: entry.table_name,
          seatNumber: entry.seat_number,
        };
      }
      setActiveSeatingByPlayerId(seating);
    } catch {
      setEliminatedCount(null);
      setActiveSeatingByPlayerId({});
    }
  }, [activeTournament]);

  const showSeatNumbers = activeTournament?.status === 'pending';

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    refreshEliminatedCount();
  }, [refreshEliminatedCount]);

  // Refresh eliminated count when tournament is reset.
  useEffect(() => {
    const unsubscribe = window.api.onTournamentProgressReset(() => {
      refreshEliminatedCount();
    });
    return unsubscribe;
  }, [refreshEliminatedCount]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setStatus(null);
    try {
      await window.api.createPlayer({
        name: newName.trim(),
        nickname: newNickname.trim() || undefined,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
      });
      setNewName('');
      setNewNickname('');
      setNewEmail('');
      setNewPhone('');
      setStatus({ text: `✓ ${newName.trim()} added to roster`, ok: true });
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(player: Player) {
    setDeletingId(player.id);
    setStatus(null);
    try {
      await window.api.deletePlayer(player.id);
      setStatus({ text: `${player.name} removed`, ok: true });
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setDeletingId(null);
    }
  }

  function handleEdit(player: Player) {
    setEditingId(player.id);
    setEditName(player.name);
    setEditNickname(player.nickname || '');
    setEditEmail(player.email || '');
    setEditPhone(player.phone || '');
  }

  async function handleSave(playerId: number) {
    setStatus(null);
    try {
      await window.api.updatePlayer({
        id: playerId,
        name: editName.trim() || undefined,
        nickname: editNickname.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
      } as UpdatePlayerData);
      setStatus({ text: 'Player updated', ok: true });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    }
  }

  function handleCancel() {
    setEditingId(null);
    setEditName('');
    setEditNickname('');
    setEditEmail('');
    setEditPhone('');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-end justify-between">
        <h2 className="text-lg font-semibold">Player Roster</h2>
        <span className="text-xs text-gray-500 font-mono">{players.length} players</span>
      </div>

      {/* Add player form */}
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name…"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          />
          <input
            type="text"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            placeholder="Nickname (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          />
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          />
          <input
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !newName.trim()}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors whitespace-nowrap"
          >
            {submitting ? 'Adding…' : '+ Add Player'}
          </button>
        </div>
        {status && (
          <p className={`text-sm font-medium ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
            {status.text}
          </p>
        )}
      </form>

      {/* Roster table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900 text-left">
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold">Name</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold">Nickname</th>
              {showSeatNumbers && (
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold">Table/Seat</th>
              )}
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold">Email</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold">Phone</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold text-center">Tournaments</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold text-right">Career Earnings</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {players.length === 0 ? (
              <tr>
                <td colSpan={showSeatNumbers ? 8 : 7} className="px-4 py-8 text-center text-gray-600 text-sm italic">
                  No players yet — add someone above
                </td>
              </tr>
            ) : (
              players.map((p) => {
                const isEditing = editingId === p.id;
                const seating = activeSeatingByPlayerId[p.id];
                const seatingLabel = seating
                  ? `${seating.tableName ?? 'Unseated'}${seating.seatNumber !== null ? ` · Seat ${seating.seatNumber}` : ''}`
                  : '—';
                return (
                  <tr key={p.id} className={`${isEditing ? 'bg-gray-800' : 'hover:bg-gray-900/50'} transition-colors group`}>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-orange-400"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-gray-100">{p.name}</span>
                      )}
                    </td>
                    {showSeatNumbers && (
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        <span className="font-mono">{seatingLabel}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-orange-400"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">{p.nickname ?? <span className="text-gray-700">—</span>}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-orange-400"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">{p.email ?? <span className="text-gray-700">—</span>}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-orange-400"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">{p.phone ?? <span className="text-gray-700">—</span>}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 font-mono text-xs">
                      {p.tournaments_played ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">
                      {p.total_career_earnings > 0
                        ? `$${p.total_career_earnings.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSave(p.id)}
                            className="text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-gray-500 hover:text-gray-400 text-xs px-2 py-1 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(p)}
                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-orange-400 transition-all text-xs px-2 py-1 rounded"
                            title="Edit player"
                          >
                            Edit
                          </button>
                          {(p.tournaments_played ?? 0) === 0 && (
                            <button
                              onClick={() => handleDelete(p)}
                              disabled={deletingId === p.id}
                              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all disabled:opacity-40 text-xs px-2 py-1 rounded"
                              title="Remove from roster"
                            >
                              {deletingId === p.id ? '…' : 'Remove'}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {players.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-700 bg-gray-900">
                <td colSpan={showSeatNumbers ? 8 : 7} className="px-4 py-2 text-center text-xs text-gray-400 tracking-widest select-none">
                  {eliminatedCount !== null
                    ? `── ${eliminatedCount} player${eliminatedCount === 1 ? '' : 's'} eliminated ──`
                    : `── ${players.length} player${players.length === 1 ? '' : 's'} ──`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-gray-600">
        Players with tournament history cannot be removed. To add a player to a tournament, go to the Registration tab.
      </p>
    </div>
  );
}
