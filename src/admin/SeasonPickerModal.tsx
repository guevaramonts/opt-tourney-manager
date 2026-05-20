import { useCallback, useEffect, useState } from 'react';
import type { Season } from '@shared/types';

interface Props {
  onSelect: (season: Season) => void;
  activeSeasonId?: number | null;
}

export default function SeasonPickerModal({ onSelect, activeSeasonId = null }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await window.api.getAllSeasons();
      setSeasons(rows);
      // If there's exactly one active season, auto-select it so the user doesn't need to click.
      if (rows.length === 1) {
        onSelect(rows[0]);
      }
    } catch {
      setStatus({ text: 'Failed to load seasons.', ok: false });
    } finally {
      setLoading(false);
    }
  }, [onSelect]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const created = await window.api.createSeason(newName.trim());
      setNewName('');
      onSelect(created);
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-6 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-gray-100">Select Season Context</h1>
          <p className="text-sm text-gray-400 mt-1">
            The selected season is the admin context used across the app.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">Loading seasons…</p>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-gray-500">No seasons yet. Create one below to get started.</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {seasons.map((season) => (
              <li key={season.id}>
                <button
                  type="button"
                  onClick={() => onSelect(season)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                    season.id === activeSeasonId
                      ? 'border-sky-500 bg-sky-950/30'
                      : 'border-gray-700 bg-gray-800 hover:border-orange-500 hover:bg-orange-950/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-sm text-gray-100">{season.name}</p>
                    {season.id === activeSeasonId && (
                      <span className="text-[10px] uppercase tracking-wide text-sky-200 border border-sky-600 rounded-full px-2 py-0.5">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">{season.status}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-gray-800 pt-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Create New Season</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
              placeholder="e.g. 2026 Regular Season"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold px-4 py-2 text-sm"
            >
              {creating ? '…' : 'Create'}
            </button>
          </div>
          {status && (
            <p className={`text-xs ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
