import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useTournament } from '../contexts/TournamentContext';
import { useTournamentProgressReset } from '../api/socket';

interface Player {
  id: number; name: string; nickname: string | null; email: string | null;
  phone: string | null; total_career_earnings: number; tournaments_played?: number;
}

export default function PlayersView() {
  const { activeTournament } = useTournament();
  const [players, setPlayers] = useState<Player[]>([]);
  const [eliminatedCount, setEliminatedCount] = useState<number | null>(null);
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
    setPlayers(await api.getAllPlayers() as Player[]);
  }, []);

  const refreshEliminated = useCallback(async () => {
    if (!activeTournament) { setEliminatedCount(null); return; }
    const active = await api.getActivePlayers(activeTournament.id) as Array<{ player_id: number }>;
    setEliminatedCount((activeTournament.player_count ?? 0) - active.length);
  }, [activeTournament]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void refreshEliminated(); }, [refreshEliminated]);
  useTournamentProgressReset(useCallback(() => { void refreshEliminated(); }, [refreshEliminated]));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true); setStatus(null);
    try {
      await api.createPlayer({ name: newName.trim(), nickname: newNickname.trim() || undefined, email: newEmail.trim() || undefined, phone: newPhone.trim() || undefined });
      setNewName(''); setNewNickname(''); setNewEmail(''); setNewPhone('');
      setStatus({ text: `✓ ${newName.trim()} added to roster`, ok: true });
      await refresh();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(p: Player) {
    setDeletingId(p.id); setStatus(null);
    try {
      await api.deletePlayer(p.id);
      setStatus({ text: `${p.name} removed`, ok: true });
      await refresh();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setDeletingId(null); }
  }

  function handleEdit(p: Player) {
    setEditingId(p.id); setEditName(p.name); setEditNickname(p.nickname || '');
    setEditEmail(p.email || ''); setEditPhone(p.phone || '');
  }

  async function handleSave(playerId: number) {
    setStatus(null);
    try {
      await api.updatePlayer(playerId, { name: editName.trim() || undefined, nickname: editNickname.trim() || undefined, email: editEmail.trim() || undefined, phone: editPhone.trim() || undefined });
      setStatus({ text: 'Player updated', ok: true });
      setEditingId(null);
      await refresh();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-end justify-between">
        <h2 className="text-lg font-semibold">Player Roster</h2>
        <span className="text-xs text-gray-500 font-mono">{players.length} players</span>
      </div>

      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name…"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-400" />
          <input type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} placeholder="Nickname (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-400" />
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-400" />
          <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-400" />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={submitting || !newName.trim()}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold rounded-lg px-5 py-2 text-sm">
            {submitting ? 'Adding…' : '+ Add Player'}
          </button>
        </div>
        {status && <p className={`text-sm font-medium ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>}
      </form>

      <div className="rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900 text-left">
              {['Name', 'Nickname', 'Email', 'Phone', 'Tournaments', 'Earnings', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {players.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm italic">No players yet — add someone above</td></tr>
            ) : players.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id} className={`${isEditing ? 'bg-gray-800' : 'hover:bg-gray-900/50'} transition-colors`}>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:border-orange-400" />
                    ) : <span className="font-medium text-gray-100">{p.name}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input type="text" value={editNickname} onChange={(e) => setEditNickname(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-orange-400" />
                    ) : <span className="text-gray-400 text-xs">{p.nickname ?? <span className="text-gray-700">—</span>}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-orange-400" />
                    ) : <span className="text-gray-400 text-xs">{p.email ?? <span className="text-gray-700">—</span>}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-orange-400" />
                    ) : <span className="text-gray-400 text-xs">{p.phone ?? <span className="text-gray-700">—</span>}</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400 font-mono text-xs">{p.tournaments_played ?? 0}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {p.total_career_earnings > 0 ? `$${p.total_career_earnings.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 space-x-1">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={() => { void handleSave(p.id); }}
                          className="text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded">Save</button>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="text-gray-500 hover:text-gray-400 text-xs px-2 py-1 rounded">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => handleEdit(p)}
                          className="text-orange-300 hover:text-orange-200 border border-orange-800 hover:border-orange-600 text-xs px-2 py-1 rounded">Edit</button>
                        {(p.tournaments_played ?? 0) === 0 && (
                          <button type="button" onClick={() => { void handleDelete(p); }} disabled={deletingId === p.id}
                            className="text-red-300 hover:text-red-200 border border-red-800 hover:border-red-600 disabled:opacity-40 text-xs px-2 py-1 rounded">
                            {deletingId === p.id ? '…' : 'Remove'}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {players.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-700 bg-gray-900">
                <td colSpan={7} className="px-4 py-2 text-center text-xs text-gray-400 tracking-widest">
                  {eliminatedCount !== null
                    ? `── ${eliminatedCount} player${eliminatedCount === 1 ? '' : 's'} eliminated ──`
                    : `── ${players.length} player${players.length === 1 ? '' : 's'} ──`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-600">Players with tournament history cannot be removed. To add a player to a tournament, go to the Registration tab.</p>
    </div>
  );
}
