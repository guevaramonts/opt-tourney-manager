import { useRef, useEffect, useState } from 'react';

export interface BountyEntry {
  name: string;
  bounties_collected: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const SCROLL_SPEED = 40;

interface Props {
  entries: BountyEntry[];
}

export default function AssassinFeed({ entries }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || entries.length === 0) { setShouldScroll(false); return; }
    setShouldScroll(content.scrollHeight > viewport.clientHeight + 1);
  }, [entries]);

  useEffect(() => {
    const track = trackRef.current;
    const content = contentRef.current;
    if (!track || !content || entries.length === 0 || !shouldScroll) {
      animRef.current?.cancel();
      if (track) track.style.transform = 'translateY(0)';
      return;
    }
    const raf = requestAnimationFrame(() => {
      const loopHeight = content.scrollHeight;
      animRef.current?.cancel();
      animRef.current = track.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(-${loopHeight}px)` }],
        { duration: (loopHeight / SCROLL_SPEED) * 1000, iterations: Infinity, easing: 'linear' }
      );
    });
    return () => { cancelAnimationFrame(raf); animRef.current?.cancel(); };
  }, [entries, shouldScroll]);

  const content = (
    <ol className="space-y-3 pb-3">
      {entries.map((entry, i) => (
        <li key={entry.name} className="flex items-center justify-between bg-black/20 rounded-xl px-4 py-3 border border-green-900/30">
          <span className="text-xl mr-2">{MEDALS[i] ?? '💀'}</span>
          <span className="flex-1 font-semibold text-white truncate">{entry.name}</span>
          <span className="text-orange-400 font-mono font-bold text-lg ml-3">{entry.bounties_collected}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex flex-col mt-4 border-t border-green-900/40 pt-3 flex-[0.9] min-h-0">
      <h2 className="text-xs uppercase tracking-[0.2em] text-green-400 font-semibold mb-4 shrink-0">
        Bounty Count
      </h2>
      {entries.length === 0 ? (
        <p className="text-gray-600 text-sm">No bounties yet…</p>
      ) : (
        <div ref={viewportRef} className="overflow-hidden relative flex-1">
          <div ref={trackRef} className="will-change-transform">
            <div ref={contentRef}>{content}</div>
            {shouldScroll ? <div aria-hidden="true">{content}</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}
