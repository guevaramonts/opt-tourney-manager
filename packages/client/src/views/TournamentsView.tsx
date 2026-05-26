import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useSeason } from '../contexts/SeasonContext';
import { useTournament } from '../contexts/TournamentContext';
import type { Tournament } from '../contexts/TournamentContext';

interface BlindStructure { id: number; name: string; level_count?: number; }
interface SeasonTournamentEntry {
  season_id: number; tournament_id: number; tournament_number: number;
  tournament_name: string; tournament_status: string;
  player_count: number; synced_results_count: number;
}
interface Invitation { id: number; email: string; status: string; created_at: string; }

function InvitePanel({ tournamentId, tournamentName }: { tournamentId: number; tournamentName: string }) {
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    void api.getInvitations(tournamentId).then(setInvitations);
  }, [open, tournamentId]);

  async function handleSend() {
    const emails = emailInput.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) { setStatus({ text: 'Enter at least one email address.', ok: false }); return; }
    setBusy(true); setStatus(null);
    try {
      const { results } = await api.sendInvitations(tournamentId, emails);
      const sent = results.filter((r) => r.status === 'sent').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      setStatus({ text: `Sent ${sent} invitation${sent !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}.`, ok: true });
      setEmailInput('');
      setInvitations(await api.getInvitations(tournamentId));
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleRevoke(id: number) {
    setBusy(true);
    try {
      await api.revokeInvitation(id);
      setInvitations(await api.getInvitations(tournamentId));
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  const statusColor = (s: string) =>
    s === 'accepted' ? 'text-green-400' : s === 'expired' ? 'text-gray-600' : 'text-yellow-400';

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-purple-400 hover:text-purple-300 underline-offset-2 hover:underline"
      >
        {open ? 'Hide Invitations' : `Invite Players to ${tournamentName}`}
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-purple-900/40 bg-purple-950/10 p-3">
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Enter one email per line, or comma-separated.</p>
            <textarea
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              rows={3}
              placeholder="alice@example.com&#10;bob@example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-purple-500"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={busy || !emailInput.trim()}
                className="rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2"
              >
                {busy ? 'Sending…' : 'Send Invitations'}
              </button>
              {status && <p className={`text-xs ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>}
            </div>
          </div>
          {invitations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-gray-600">Sent Invitations</p>
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-300 truncate">{inv.email}</span>
                  <span className={`shrink-0 ${statusColor(inv.status)}`}>{inv.status}</span>
                  {inv.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(inv.id)}
                      disabled={busy}
                      className="shrink-0 text-gray-600 hover:text-red-400 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TournamentsViewProps {
  onNavigateToRegistration?: () => void;
}

export default function TournamentsView({ onNavigateToRegistration }: TournamentsViewProps) {
  const { activeSeason } = useSeason();
  const { setActiveTournament } = useTournament();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [blindStructures, setBlindStructures] = useState<BlindStructure[]>([]);
  const [form, setForm] = useState({ name: '', buyIn: '20', bountyAmount: '5', blindStructureId: '' });
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [seasonTournaments, setSeasonTournaments] = useState<SeasonTournamentEntry[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = useCallback(async () => {
    const [ts, bs] = await Promise.all([
      api.getAllTournaments() as Promise<Tournament[]>,
      api.getBlindStructures() as Promise<BlindStructure[]>,
    ]);
    setTournaments(ts);
    setBlindStructures(bs);
    if (activeSeason) {
      setSeasonTournaments(await api.getSeasonTournaments(activeSeason.id) as SeasonTournamentEntry[]);
    } else {
      setSeasonTournaments([]);
    }
  }, [activeSeason]);

  const refreshSeasonDetails = useCallback(async () => {
    if (!activeSeason) { setSeasonTournaments([]); return; }
    setSeasonTournaments(await api.getSeasonTournaments(activeSeason.id) as SeasonTournamentEntry[]);
  }, [activeSeason]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const linkedIds = useMemo(() => new Set(seasonTournaments.map((r) => r.tournament_id)), [seasonTournaments]);
  const availableTournaments = useMemo(() => tournaments.filter((t) => !linkedIds.has(t.id)), [tournaments, linkedIds]);
  const pendingTournaments = useMemo(() => tournaments.filter((t) => t.status === 'pending'), [tournaments]);

  async function handleCreate() {
    if (!form.name.trim()) { setStatus({ text: 'Tournament name is required.', ok: false }); return; }
    setBusy(true); setStatus(null);
    try {
      const payload = { name: form.name.trim(), buyIn: Number(form.buyIn) || 0, bountyAmount: Number(form.bountyAmount) || 0, blindStructureId: form.blindStructureId ? Number(form.blindStructureId) : null };
      const created = await api.createTournament(payload) as Tournament;
      setForm({ name: '', buyIn: '20', bountyAmount: '5', blindStructureId: '' });
      setStatus({ text: `Tournament "${created.name}" created.`, ok: true });
      await refreshAll();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleLink() {
    if (!activeSeason || !selectedTournamentId) return;
    setBusy(true); setStatus(null);
    try {
      const nextNum = seasonTournaments.length > 0 ? Math.max(...seasonTournaments.map((r) => r.tournament_number)) + 1 : 1;
      await api.addTournamentToSeason(activeSeason.id, { tournamentId: Number(selectedTournamentId), tournamentNumber: nextNum });
      setSelectedTournamentId('');
      setStatus({ text: 'Tournament linked to season.', ok: true });
      await refreshSeasonDetails();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleQuickAdd(tournamentId: number) {
    if (!activeSeason) { setStatus({ text: 'Select a season first.', ok: false }); return; }
    setBusy(true); setStatus(null);
    try {
      const nextNum = seasonTournaments.length > 0 ? Math.max(...seasonTournaments.map((r) => r.tournament_number)) + 1 : 1;
      await api.addTournamentToSeason(activeSeason.id, { tournamentId, tournamentNumber: nextNum });
      setStatus({ text: 'Tournament added to season.', ok: true });
      await refreshSeasonDetails();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  async function handleFinalize(tournamentId: number) {
    setBusy(true); setStatus(null);
    try {
      const result = await api.finalizeTournament(tournamentId) as { resultsCommitted: number };
      setStatus({ text: `Tournament finalized. ${result.resultsCommitted} season result(s) committed.`, ok: true });
      await refreshSeasonDetails();
    } catch (err) { setStatus({ text: String(err), ok: false }); }
    finally { setBusy(false); }
  }

  function handleAddPlayers(row: SeasonTournamentEntry) {
    setActiveTournament({ id: row.tournament_id, name: row.tournament_name, status: row.tournament_status as Tournament['status'], buy_in: 0, bounty_amount: 0 });
    onNavigateToRegistration?.();
  }

  return (
    <div className="space-y-6">
      {!activeSeason && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-300">
          No season selected. Use the season dropdown in the header to pick one.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Season</h2>
          {activeSeason ? (
            <div className="rounded-lg border border-sky-800 bg-sky-950/20 px-3 py-2">
              <p className="text-sm font-semibold text-sky-300">{activeSeason.name}</p>
              <p className="text-xs text-gray-500 capitalize">{activeSeason.status}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No season active</p>
          )}
        </section>

        <section className="xl:col-span-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
          <h3 className="text-base font-semibold">Create Tournament</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tournament name" className="md:col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            <input type="number" min="0" value={form.buyIn} onChange={(e) => setForm((p) => ({ ...p, buyIn: e.target.value }))}
              placeholder="Buy-in" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            <input type="number" min="0" value={form.bountyAmount} onChange={(e) => setForm((p) => ({ ...p, bountyAmount: e.target.value }))}
              placeholder="Bounty" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            <select value={form.blindStructureId} onChange={(e) => setForm((p) => ({ ...p, blindStructureId: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
              <option value="">Default blinds</option>
              {blindStructures.map((bs) => <option key={bs.id} value={bs.id}>{bs.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleCreate} disabled={busy || !form.name.trim()}
              className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold px-4 py-2 text-sm">
              Create Tournament
            </button>
          </div>
          {pendingTournaments.length > 0 && (
            <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Pending Tournaments</p>
              {pendingTournaments.slice(0, 8).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-300 truncate">{row.name}</span>
                  <button type="button" onClick={() => { void handleQuickAdd(row.id); }}
                    disabled={busy || !activeSeason || linkedIds.has(row.id)}
                    className="rounded-md border border-sky-700 px-3 py-1 text-xs font-semibold text-sky-300 hover:border-sky-500 disabled:opacity-40">
                    {linkedIds.has(row.id) ? 'Linked' : 'Add to Season'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
        <h3 className="text-base font-semibold">Season Tournaments</h3>
        <div className="flex gap-2">
          <select value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)}
            disabled={!activeSeason}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 disabled:opacity-40">
            <option value="">— Link tournament —</option>
            {availableTournaments.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}
          </select>
          <button type="button" onClick={handleLink} disabled={busy || !activeSeason || !selectedTournamentId}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-orange-500 hover:text-orange-300 disabled:opacity-40">
            Add
          </button>
        </div>
        <div className="space-y-2">
          {seasonTournaments.length === 0 ? (
            <p className="text-sm text-gray-500">No tournaments linked yet.</p>
          ) : (
            seasonTournaments.map((row) => (
              <div key={row.tournament_id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">#{row.tournament_number} {row.tournament_name}</p>
                    <p className="text-xs text-gray-500">
                      {row.player_count} entrants · {row.synced_results_count} committed
                      {row.tournament_status === 'finalized' ? ' · ✓ Finalized' : ` · ${row.tournament_status}`}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    {row.tournament_status !== 'finalized' && (
                      <button type="button" onClick={() => handleAddPlayers(row)} disabled={busy}
                        className="rounded-md border border-blue-700 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:border-blue-500 disabled:opacity-40">
                        Add Players
                      </button>
                    )}
                    {row.tournament_status === 'finalized' ? (
                      <span className="rounded-md border border-green-800 px-3 py-1.5 text-xs font-semibold text-green-500 opacity-70 cursor-default">Finalized</span>
                    ) : (
                      <button type="button" onClick={() => { void handleFinalize(row.tournament_id); }}
                        disabled={busy || row.player_count === 0}
                        className="rounded-md border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:border-orange-500 disabled:opacity-40">
                        Finalize &amp; Commit
                      </button>
                    )}
                  </div>
                </div>
                {row.tournament_status !== 'finalized' && (
                  <InvitePanel tournamentId={row.tournament_id} tournamentName={row.tournament_name} />
                )}
              </div>
            ))
          )}
        </div>
      </section>
      {status && <p className={`text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>}
    </div>
  );
}
