import { useState } from 'react';
import { api } from '../api/client';

export default function DataTasksView() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleResetAllKeepPlayers() {
    if (!confirm('This will delete all seasons, tournaments, registrations, bounties, and season points. Players will be preserved. Continue?')) return;
    setBusy(true); setStatus(null);
    try {
      const result = await api.resetAllDataKeepPlayers() as { deleted: { tournaments: number; registrations: number; bountyLog: number; seasonResults: number; seasons: number } };
      const d = result.deleted;
      setStatus({
        ok: true,
        text: `Data reset complete. Deleted ${d.tournaments} tournaments, ${d.registrations} registrations, ${d.bountyLog} bounty events, ${d.seasonResults} season results, and ${d.seasons} seasons.`,
      });
    } catch (err) { setStatus({ ok: false, text: String(err) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Data Tasks</h2>
        <p className="text-sm text-gray-400">Utilities for resetting local test data without deleting your player roster.</p>
      </section>

      <section className="rounded-xl border border-red-900/70 bg-red-950/20 p-4 space-y-3">
        <h3 className="text-base font-semibold text-red-200">Danger Zone</h3>
        <p className="text-sm text-red-300/90">Delete all tournament and points data while keeping players.</p>
        <ul className="text-xs text-red-200/80 space-y-1 list-disc pl-5">
          <li>Deletes: seasons, season links, season results</li>
          <li>Deletes: tournaments, registrations, bounty log, table state</li>
          <li>Keeps: players, blind structure library, scoring tables</li>
        </ul>
        <button type="button" onClick={() => { void handleResetAllKeepPlayers(); }} disabled={busy}
          className="rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-200 hover:border-red-500 hover:text-white disabled:opacity-40">
          {busy ? 'Resetting Data...' : 'Reset Tournament/Points Data'}
        </button>
      </section>

      {status && <p className={`text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>}
    </div>
  );
}
