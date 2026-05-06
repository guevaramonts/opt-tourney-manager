import type { BountyEntry } from '@shared/types';

const MEDALS = ['🥇', '🥈', '🥉'];

interface Props {
  entries: BountyEntry[];
}

export default function AssassinFeed({ entries }: Props) {
  return (
    <div className="shrink-0">
      <h2 className="text-xs uppercase tracking-[0.2em] text-green-400 font-semibold mb-4">
        Top Assassins
      </h2>

      {entries.length === 0 ? (
        <p className="text-gray-600 text-sm">No bounties yet…</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry, i) => (
            <li
              key={entry.name}
              className="flex items-center justify-between bg-black/20 rounded-xl px-4 py-3 border border-green-900/30"
            >
              <span className="text-xl mr-2">{MEDALS[i] ?? '💀'}</span>
              <span className="flex-1 font-semibold text-white truncate">
                {entry.name}
              </span>
              <span className="text-orange-400 font-mono font-bold text-lg ml-3">
                {entry.bounties_collected}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
