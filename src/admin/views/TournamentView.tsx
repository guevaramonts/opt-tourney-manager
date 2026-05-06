import { useState, useEffect, useCallback } from 'react';
import type { Tournament, CreateTournamentData, UpdateTournamentData } from '@shared/types';
import { useTournament } from '../TournamentContext';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  finished: 'Finished',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
  finished: 'text-gray-500 bg-gray-800/30 border-gray-700',
};

export default function TournamentView() {
  const { activeTournament, setActiveTournament } = useTournament();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [form, setForm] = useState({ name: '', buyIn: '20', bountyAmount: '5' });
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', buyIn: '0', bountyAmount: '0' });
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.api.getAllTournaments();
    setTournaments(list);
    // Keep context tournament reference fresh if one is already selected elsewhere.
    if (activeTournament) {
      const refreshed = list.find((t) => t.id === activeTournament.id) ?? null;
      setActiveTournament(refreshed);
    }
  }, [activeTournament, setActiveTournament]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    setStatus(null);
    try {
      const data: CreateTournamentData = {
        name: form.name.trim(),
        buyIn: Number(form.buyIn) || 0,
        bountyAmount: Number(form.bountyAmount) || 0,
      };
      const created = await window.api.createTournament(data);
      setForm({ name: '', buyIn: '20', bountyAmount: '5' });
      setStatus({ text: `✓ Tournament "${created.name}" created`, ok: true });
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setCreating(false);
    }
  }

  function startEdit(t: Tournament) {
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      buyIn: String(t.buy_in),
      bountyAmount: String(t.bounty_amount),
    });
    setStatus(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(t: Tournament) {
    if (!editForm.name.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload: UpdateTournamentData = {
        id: t.id,
        name: editForm.name.trim(),
        buyIn: Number(editForm.buyIn) || 0,
        bountyAmount: Number(editForm.bountyAmount) || 0,
      };
      const updated = await window.api.updateTournament(payload);
      setStatus({ text: `✓ Tournament "${updated.name}" updated`, ok: true });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish(t: Tournament) {
    if (!confirm(`Mark "${t.name}" as finished? This will save bounty earnings to player career totals.`)) return;
    setFinishing(true);
    try {
      await window.api.finishTournament(t.id);
      setStatus({ text: `✓ "${t.name}" finished — results saved`, ok: true });
      if (activeTournament?.id === t.id) setActiveTournament(null);
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-lg font-semibold">Tournaments</h2>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300">Create New Tournament</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3">
            <label className="block text-xs text-gray-500 mb-1">Tournament Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Home Game — May 4"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Buy-in ($)</label>
            <input
              type="number"
              min="0"
              value={form.buyIn}
              onChange={(e) => setForm((f) => ({ ...f, buyIn: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bounty ($)</label>
            <input
              type="number"
              min="0"
              value={form.bountyAmount}
              onChange={(e) => setForm((f) => ({ ...f, bountyAmount: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating || !form.name.trim()}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {creating ? 'Creating…' : '+ Create'}
            </button>
          </div>
        </div>
        {status && (
          <p className={`text-sm font-medium ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
            {status.text}
          </p>
        )}
      </form>

      {/* Tournament list */}
      <div className="space-y-2">
        {tournaments.length === 0 ? (
          <p className="text-sm text-gray-600 italic text-center py-8 border border-dashed border-gray-800 rounded-xl">
            No tournaments yet — create one above
          </p>
        ) : (
          tournaments.map((t) => {
            const isActive = activeTournament?.id === t.id;
            return (
              <div
                key={t.id}
                className={`rounded-xl border px-4 py-3 flex items-center gap-4 transition-colors ${
                  isActive
                    ? 'border-orange-700 bg-orange-950/20'
                    : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {editingId === t.id ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="md:col-span-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                      />
                      <input
                        type="number"
                        min="0"
                        value={editForm.buyIn}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, buyIn: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                      />
                      <input
                        type="number"
                        min="0"
                        value={editForm.bountyAmount}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, bountyAmount: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                      />
                      <div className="flex items-center text-xs text-gray-500">{t.player_count ?? 0} players</div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{t.name}</span>
                        {isActive && (
                          <span className="text-xs text-orange-400 font-semibold uppercase tracking-wider">
                            Selected In Manager
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="font-mono">${t.buy_in} buy-in · ${t.bounty_amount} bounty</span>
                        <span>{t.player_count ?? 0} players</span>
                      </div>
                    </>
                  )}
                </div>

                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </span>

                {editingId === t.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => saveEdit(t)}
                      disabled={saving || !editForm.name.trim()}
                      className="text-xs text-emerald-300 hover:text-emerald-200 font-semibold px-3 py-1.5 rounded-lg border border-emerald-800 hover:border-emerald-600 transition-colors disabled:opacity-40"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-xs text-gray-500 hover:text-red-400 font-semibold px-3 py-1.5 rounded-lg border border-gray-700 hover:border-red-800 transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      disabled={t.status === 'finished'}
                      className="text-xs text-orange-400 hover:text-orange-300 font-semibold px-3 py-1.5 rounded-lg border border-orange-800 hover:border-orange-600 transition-colors disabled:opacity-40"
                    >
                      Edit
                    </button>
                    {t.status !== 'finished' && (
                      <button
                        onClick={() => handleFinish(t)}
                        disabled={finishing}
                        className="text-xs text-gray-500 hover:text-red-400 font-semibold px-3 py-1.5 rounded-lg border border-gray-700 hover:border-red-800 transition-colors disabled:opacity-40"
                      >
                        Finish
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
