import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BlindStructure, CreateTournamentData, Season, SeasonLeaderboardEntry, SeasonTournamentEntry, Tournament } from '@shared/types';

export default function SeasonView() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [blindStructures, setBlindStructures] = useState<BlindStructure[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [seasonName, setSeasonName] = useState('');
  const [tournamentForm, setTournamentForm] = useState({ name: '', buyIn: '20', bountyAmount: '5', blindStructureId: '' });
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [seasonTournaments, setSeasonTournaments] = useState<SeasonTournamentEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<SeasonLeaderboardEntry[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  );

  const refreshAll = useCallback(async () => {
    const [seasonRows, tournamentRows, structureRows] = await Promise.all([
      window.api.getAllSeasons(),
      window.api.getAllTournaments(),
      window.api.getBlindStructures(),
    ]);
    setSeasons(seasonRows);
    setTournaments(tournamentRows);
    setBlindStructures(structureRows);

    if (selectedSeasonId !== null && !seasonRows.some((row) => row.id === selectedSeasonId)) {
      setSelectedSeasonId(null);
      setSeasonTournaments([]);
      setLeaderboard([]);
    }
  }, [selectedSeasonId]);

  const refreshSeasonDetails = useCallback(async () => {
    if (selectedSeasonId === null) {
      setSeasonTournaments([]);
      setLeaderboard([]);
      return;
    }

    const [linked, board] = await Promise.all([
      window.api.getSeasonTournaments(selectedSeasonId),
      window.api.getSeasonLeaderboard(selectedSeasonId),
    ]);
    setSeasonTournaments(linked);
    setLeaderboard(board);
  }, [selectedSeasonId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void refreshSeasonDetails();
  }, [refreshSeasonDetails]);

  const linkedTournamentIds = useMemo(
    () => new Set(seasonTournaments.map((row) => row.tournament_id)),
    [seasonTournaments]
  );

  const availableTournaments = useMemo(
    () => tournaments.filter((row) => !linkedTournamentIds.has(row.id)),
    [tournaments, linkedTournamentIds]
  );

  const pendingTournaments = useMemo(
    () => tournaments.filter((row) => row.status === 'pending'),
    [tournaments]
  );

  async function handleCreateSeason() {
    if (!seasonName.trim()) {
      setStatus({ text: 'Season name is required.', ok: false });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const created = await window.api.createSeason(seasonName.trim());
      setSelectedSeasonId(created.id);
      setSeasonName('');
      setStatus({ text: `Created season "${created.name}".`, ok: true });
      await refreshAll();
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSeason() {
    if (!selectedSeason) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.api.startSeason(selectedSeason.id);
      const created = result.createdTournaments ?? 0;
      setStatus({
        text: `Season "${selectedSeason.name}" is now active. Created ${created} tournament${created === 1 ? '' : 's'}.`,
        ok: true,
      });
      await refreshAll();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishSeason() {
    if (!selectedSeason) return;
    setBusy(true);
    setStatus(null);
    try {
      await window.api.finishSeason(selectedSeason.id);
      setStatus({ text: `Season "${selectedSeason.name}" marked as finished.`, ok: true });
      await refreshAll();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleLinkTournament() {
    if (selectedSeasonId === null || !selectedTournamentId) return;

    setBusy(true);
    setStatus(null);
    try {
      const nextNumber = seasonTournaments.length > 0
        ? Math.max(...seasonTournaments.map((row) => row.tournament_number)) + 1
        : 1;
      await window.api.addTournamentToSeason(selectedSeasonId, Number(selectedTournamentId), nextNumber);
      setSelectedTournamentId('');
      setStatus({ text: 'Tournament linked to season.', ok: true });
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTournament() {
    if (!tournamentForm.name.trim()) {
      setStatus({ text: 'Tournament name is required.', ok: false });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const payload: CreateTournamentData = {
        name: tournamentForm.name.trim(),
        buyIn: Number(tournamentForm.buyIn) || 0,
        bountyAmount: Number(tournamentForm.bountyAmount) || 0,
        blindStructureId: tournamentForm.blindStructureId ? Number(tournamentForm.blindStructureId) : null,
      };
      const created = await window.api.createTournament(payload);
      setTournamentForm({ name: '', buyIn: '20', bountyAmount: '5', blindStructureId: '' });
      setStatus({ text: `Tournament "${created.name}" created.`, ok: true });
      await refreshAll();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickAddTournamentToSeason(tournamentId: number) {
    if (selectedSeasonId === null) {
      setStatus({ text: 'Select a season first.', ok: false });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const nextNumber = seasonTournaments.length > 0
        ? Math.max(...seasonTournaments.map((row) => row.tournament_number)) + 1
        : 1;
      await window.api.addTournamentToSeason(selectedSeasonId, tournamentId, nextNumber);
      setStatus({ text: 'Tournament added to season.', ok: true });
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalizeTournament(tournamentId: number) {
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.api.finalizeTournament(tournamentId);
      setStatus({ text: `Tournament finalized. ${result.resultsCommitted} season result${result.resultsCommitted === 1 ? '' : 's'} committed.`, ok: true });
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncAllLinked() {
    if (selectedSeasonId === null || seasonTournaments.length === 0) return;

    setBusy(true);
    setStatus(null);
    try {
      let total = 0;
      for (const row of seasonTournaments) {
        const result = await window.api.syncSeasonTournamentResults(selectedSeasonId, row.tournament_id);
        total += result.upserted;
      }
      setStatus({ text: `Season sync complete (${total} player results upserted).`, ok: true });
      await refreshSeasonDetails();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Seasons</h2>

          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Create Season</label>
            <div className="flex gap-2">
              <input
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                placeholder="e.g. 2026 Regular Season"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
              <button
                type="button"
                onClick={handleCreateSeason}
                disabled={busy || !seasonName.trim()}
                className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold px-4 py-2 text-sm"
              >
                Create
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Select Season</label>
            <select
              value={selectedSeasonId ?? ''}
              onChange={(e) => setSelectedSeasonId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            >
              <option value="">— Select season —</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.status})
                </option>
              ))}
            </select>
          </div>

          {selectedSeason && (
            <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <p className="text-xs text-gray-500">Status: <span className="text-gray-300">{selectedSeason.status}</span></p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleStartSeason}
                  disabled={busy || selectedSeason.status === 'active'}
                  className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500 disabled:opacity-40"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={handleFinishSeason}
                  disabled={busy || selectedSeason.status === 'finished'}
                  className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-500 disabled:opacity-40"
                >
                  Finish
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="xl:col-span-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
          <h3 className="text-base font-semibold">Tournament Setup</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              value={tournamentForm.name}
              onChange={(e) => setTournamentForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Tournament name"
              className="md:col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
            <input
              type="number"
              min="0"
              value={tournamentForm.buyIn}
              onChange={(e) => setTournamentForm((prev) => ({ ...prev, buyIn: e.target.value }))}
              placeholder="Buy-in"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
            <input
              type="number"
              min="0"
              value={tournamentForm.bountyAmount}
              onChange={(e) => setTournamentForm((prev) => ({ ...prev, bountyAmount: e.target.value }))}
              placeholder="Bounty"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
            <select
              value={tournamentForm.blindStructureId}
              onChange={(e) => setTournamentForm((prev) => ({ ...prev, blindStructureId: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            >
              <option value="">Default blinds</option>
              {blindStructures.map((structure) => (
                <option key={structure.id} value={structure.id}>{structure.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreateTournament}
              disabled={busy || !tournamentForm.name.trim()}
              className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold px-4 py-2 text-sm"
            >
              Create Tournament
            </button>
          </div>

          {pendingTournaments.length > 0 && (
            <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Pending Tournaments</p>
              {pendingTournaments.slice(0, 8).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-300 truncate">{row.name}</span>
                  <button
                    type="button"
                    onClick={() => { void handleQuickAddTournamentToSeason(row.id); }}
                    disabled={busy || selectedSeasonId === null || linkedTournamentIds.has(row.id)}
                    className="rounded-md border border-sky-700 px-3 py-1 text-xs font-semibold text-sky-300 hover:border-sky-500 disabled:opacity-40"
                  >
                    {linkedTournamentIds.has(row.id) ? 'Linked' : 'Add to Season'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-800 pt-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Season Tournaments</h3>
            <button
              type="button"
              onClick={handleSyncAllLinked}
              disabled={busy || selectedSeasonId === null || seasonTournaments.length === 0}
              className="rounded-md border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:border-sky-500 disabled:opacity-40"
            >
              Sync All Results
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              disabled={selectedSeasonId === null}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 disabled:opacity-40"
            >
              <option value="">— Link tournament —</option>
              {availableTournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name} ({tournament.status})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleLinkTournament}
              disabled={busy || selectedSeasonId === null || !selectedTournamentId}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-orange-500 hover:text-orange-300 disabled:opacity-40"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {seasonTournaments.length === 0 ? (
              <p className="text-sm text-gray-500">No tournaments linked yet.</p>
            ) : (
              seasonTournaments.map((row) => (
                <div key={row.tournament_id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">#{row.tournament_number} {row.tournament_name}</p>
                    <p className="text-xs text-gray-500">
                      {row.player_count} entrants · {row.synced_results_count} committed
                      {row.tournament_status === 'finalized' ? ' · ✓ Finalized' : ` · ${row.tournament_status}`}
                    </p>
                  </div>
                  {row.tournament_status === 'finalized' ? (
                    <span className="rounded-md border border-green-800 px-3 py-1.5 text-xs font-semibold text-green-500 opacity-70 cursor-default select-none">
                      Finalized
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void handleFinalizeTournament(row.tournament_id); }}
                      disabled={busy || row.player_count === 0}
                      className="rounded-md border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:border-orange-500 disabled:opacity-40"
                    >
                      Finalize &amp; Commit
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
        <h3 className="text-base font-semibold">Season Leaderboard (Top 6 Scores)</h3>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-500">No season points yet. Link tournaments and sync results.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 pr-2 text-right">Total</th>
                  <th className="py-2 pr-2 text-right">Events</th>
                  <th className="py-2">Top Scores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {leaderboard.map((row) => (
                  <tr key={row.player_id}>
                    <td className="py-2 pr-2 text-gray-200">{row.player_name}</td>
                    <td className="py-2 pr-2 text-right font-mono text-orange-300">{row.total_points.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right text-gray-400">{row.tournament_count}</td>
                    <td className="py-2 text-xs text-gray-500">{row.top_6_scores.map((score) => score.toFixed(2)).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {status && (
        <p className={`text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>
      )}

      <p className="text-xs text-gray-500">
        Players can miss tournaments. Season totals are computed from each player&apos;s best 6 tournament scores.
      </p>
    </div>
  );
}
