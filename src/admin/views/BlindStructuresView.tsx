import { useCallback, useEffect, useState } from 'react';
import type { BlindStructure } from '@shared/types';

type EditableLevel = {
  is_break: boolean;
  small_blind: string;
  big_blind: string;
  duration_minutes: string;
  break_label: string;
};

function newLevel(): EditableLevel {
  return {
    is_break: false,
    small_blind: '25',
    big_blind: '50',
    duration_minutes: '15',
    break_label: '',
  };
}

function newBreak(): EditableLevel {
  return {
    is_break: true,
    small_blind: '0',
    big_blind: '0',
    duration_minutes: '10',
    break_label: 'Break',
  };
}

export default function BlindStructuresView() {
  const [structures, setStructures] = useState<BlindStructure[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [levels, setLevels] = useState<EditableLevel[]>([newLevel()]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.api.getBlindStructures();
    setStructures(list);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function loadStructure(structureId: number) {
    const structure = structures.find((item) => item.id === structureId);
    if (!structure) return;

    const rows = await window.api.getBlindStructureLevels(structureId);
    setSelectedId(structureId);
    setName(structure.name);
    setLevels(
      rows.map((row) => ({
        is_break: row.is_break === 1,
        small_blind: String(row.small_blind),
        big_blind: String(row.big_blind),
        duration_minutes: String(Math.max(1, Math.floor(row.duration_seconds / 60))),
        break_label: row.break_label ?? 'Break',
      }))
    );
    setStatus(null);
  }

  function startNew() {
    setSelectedId(null);
    setName('');
    setLevels([newLevel()]);
    setStatus(null);
  }

  async function save() {
    if (!name.trim()) {
      setStatus({ text: 'Blind structure name is required.', ok: false });
      return;
    }
    if (levels.length === 0) {
      setStatus({ text: 'Add at least one level.', ok: false });
      return;
    }

    const normalizedName = name.trim().toLowerCase();
    const duplicate = structures.find(
      (item) => item.name.trim().toLowerCase() === normalizedName && item.id !== selectedId
    );
    if (duplicate) {
      setStatus({ text: `A blind structure named "${duplicate.name}" already exists.`, ok: false });
      return;
    }

    const invalidBlindLevel = levels.find((row) => {
      if (row.is_break) return false;
      const small = Number(row.small_blind);
      const big = Number(row.big_blind);
      const mins = Number(row.duration_minutes);
      return small <= 0 || big <= 0 || big < small || mins <= 0;
    });
    if (invalidBlindLevel) {
      setStatus({ text: 'Each blind level needs positive Small/Big, Big >= Small, and positive minutes.', ok: false });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        name: name.trim(),
        levels: levels.map((row, index) => ({
          level: index + 1,
          small_blind: row.is_break ? 0 : Number(row.small_blind) || 0,
          big_blind: row.is_break ? 0 : Number(row.big_blind) || 0,
          duration_seconds: Math.max(60, (Number(row.duration_minutes) || 1) * 60),
          is_break: (row.is_break ? 1 : 0) as 0 | 1,
          break_label: row.is_break ? (row.break_label.trim() || 'Break') : null,
        })),
      } as const;

      if (selectedId === null) {
        const created = await window.api.createBlindStructure(payload);
        setSelectedId(created.id);
        setStatus({ text: `Created structure "${created.name}".`, ok: true });
      } else {
        const updated = await window.api.updateBlindStructure({ id: selectedId, ...payload });
        setStatus({ text: `Updated structure "${updated.name}".`, ok: true });
      }

      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (selectedId === null) return;
    if (!confirm('Delete this blind structure?')) return;

    setSaving(true);
    setStatus(null);
    try {
      await window.api.deleteBlindStructure(selectedId);
      setStatus({ text: 'Blind structure deleted.', ok: true });
      startNew();
      await refresh();
    } catch (err) {
      setStatus({ text: String(err), ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <aside className="xl:col-span-1 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Blind Structures</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-orange-400 hover:text-orange-300"
          >
            + New
          </button>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800">
          {structures.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No blind structures yet.</p>
          ) : (
            structures.map((structure) => (
              <button
                key={structure.id}
                type="button"
                onClick={() => { void loadStructure(structure.id); }}
                className={`w-full text-left px-4 py-3 transition-colors ${selectedId === structure.id ? 'bg-orange-950/30' : 'hover:bg-gray-800/60'}`}
              >
                <p className="text-sm font-semibold text-gray-100">{structure.name}</p>
                <p className="text-xs text-gray-500">{structure.level_count ?? 0} levels</p>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="xl:col-span-2 space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Structure Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OPT Deepstack"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
            <p className="mt-1 text-xs text-gray-500">A single level is allowed.</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-gray-500">Levels</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLevels((prev) => [...prev, newLevel()])}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-orange-400 hover:text-orange-300"
            >
              + Level
            </button>
            <button
              type="button"
              onClick={() => setLevels((prev) => [...prev, newBreak()])}
              className="rounded-md border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:border-sky-500"
            >
              + Break
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {levels.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2 items-center">
              <div className="col-span-1 text-xs text-gray-500 text-center">{idx + 1}</div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-1">Type</label>
                <select
                  value={row.is_break ? 'break' : 'blind'}
                  onChange={(e) => {
                    const isBreak = e.target.value === 'break';
                    setLevels((prev) => prev.map((entry, rowIdx) => rowIdx !== idx ? entry : {
                      ...entry,
                      is_break: isBreak,
                      small_blind: isBreak ? '0' : entry.small_blind,
                      big_blind: isBreak ? '0' : entry.big_blind,
                      break_label: isBreak ? (entry.break_label || 'Break') : '',
                    }));
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                >
                  <option value="blind">Blind</option>
                  <option value="break">Break</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-1">Small</label>
                <input
                  disabled={row.is_break}
                  value={row.small_blind}
                  onChange={(e) => setLevels((prev) => prev.map((entry, rowIdx) => rowIdx !== idx ? entry : { ...entry, small_blind: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs disabled:opacity-40"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-1">Big</label>
                <input
                  disabled={row.is_break}
                  value={row.big_blind}
                  onChange={(e) => setLevels((prev) => prev.map((entry, rowIdx) => rowIdx !== idx ? entry : { ...entry, big_blind: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs disabled:opacity-40"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-1">Minutes</label>
                <input
                  value={row.duration_minutes}
                  onChange={(e) => setLevels((prev) => prev.map((entry, rowIdx) => rowIdx !== idx ? entry : { ...entry, duration_minutes: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-1">Break Label</label>
                <input
                  disabled={!row.is_break}
                  value={row.break_label}
                  onChange={(e) => setLevels((prev) => prev.map((entry, rowIdx) => rowIdx !== idx ? entry : { ...entry, break_label: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs disabled:opacity-40"
                />
              </div>
              <div className="col-span-12 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLevels((prev) => prev.filter((_, rowIdx) => rowIdx !== idx))}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40"
          >
            {saving ? 'Saving…' : selectedId === null ? 'Create Structure' : 'Save Changes'}
          </button>
          {selectedId !== null && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-300 hover:border-red-500 disabled:opacity-40"
            >
              Delete
            </button>
          )}
        </div>

        {status && (
          <p className={`text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.text}</p>
        )}
      </section>
    </div>
  );
}
