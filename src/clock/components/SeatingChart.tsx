import { useRef, useEffect } from 'react';
import type { SeatChartEntry } from '@shared/types';

const TABLE_STYLE: Record<string, { icon: string; color: string; border: string; bg: string }> = {
  Hearts:   { icon: '♥', color: 'text-rose-400',    border: 'border-rose-900/50',    bg: 'bg-rose-950/30' },
  Spades:   { icon: '♠', color: 'text-slate-300',   border: 'border-slate-700/50',   bg: 'bg-slate-800/30' },
  Clubs:    { icon: '♣', color: 'text-emerald-400', border: 'border-emerald-900/50', bg: 'bg-emerald-950/30' },
  Diamonds: { icon: '♦', color: 'text-blue-400',    border: 'border-blue-900/50',    bg: 'bg-blue-950/30' },
};

const TABLE_ORDER = ['Hearts', 'Spades', 'Clubs', 'Diamonds'];

// px per second — adjust to taste
const SCROLL_SPEED = 40;

interface Props {
  entries: SeatChartEntry[];
}

function buildRows(entries: SeatChartEntry[]) {
  const groups: Record<string, SeatChartEntry[]> = {};
  for (const e of entries) {
    if (!groups[e.table_name]) groups[e.table_name] = [];
    groups[e.table_name].push(e);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));
  }
  return TABLE_ORDER.filter((t) => groups[t]).map((t) => ({ name: t, seats: groups[t] }));
}

function TableGroup({ name, seats }: { name: string; seats: SeatChartEntry[] }) {
  const style = TABLE_STYLE[name] ?? { icon: '•', color: 'text-gray-400', border: 'border-gray-700', bg: 'bg-gray-800/30' };
  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden mb-3`}>
      <div className={`flex items-center gap-1.5 px-3 py-1.5 border-b ${style.border}`}>
        <span className={`${style.color} font-bold text-sm`}>{style.icon}</span>
        <span className={`${style.color} font-bold text-xs uppercase tracking-wider`}>{name}</span>
        <span className="ml-auto text-gray-600 text-xs font-mono">{seats.length}</span>
      </div>
      <ul className="divide-y divide-white/5">
        {seats.map((e) => (
          <li key={e.player_name} className="flex items-center gap-2 px-3 py-1.5">
            <span className={`${style.color} font-mono text-xs w-5 shrink-0 text-center opacity-70`}>
              {e.seat_number ?? '—'}
            </span>
            <span className="text-gray-200 text-sm">{e.player_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SeatingChart({ entries }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  const tables = buildRows(entries);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || tables.length === 0) return;

    // Wait a tick so the DOM has rendered and we can measure height
    const raf = requestAnimationFrame(() => {
      const halfHeight = track.scrollHeight / 2;
      const duration = (halfHeight / SCROLL_SPEED) * 1000;

      animRef.current?.cancel();
      animRef.current = track.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(-${halfHeight}px)` }],
        { duration, iterations: Infinity, easing: 'linear' }
      );
    });

    return () => {
      cancelAnimationFrame(raf);
      animRef.current?.cancel();
    };
  }, [entries, tables.length]);

  if (tables.length === 0) return null;

  const content = (
    <>
      {tables.map((t) => <TableGroup key={t.name} name={t.name} seats={t.seats} />)}
    </>
  );

  return (
    <div className="mt-4 border-t border-green-900/40 pt-3 flex-1 flex flex-col min-h-0">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 shrink-0">
        Seating Chart
      </h2>
      {/* Clipping window */}
      <div className="flex-1 overflow-hidden relative">
        {/* Scrolling track — content duplicated for seamless loop */}
        <div ref={trackRef} className="will-change-transform">
          {content}
          {content}
        </div>
      </div>
    </div>
  );
}
