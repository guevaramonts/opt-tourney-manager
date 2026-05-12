import { useEffect, useRef, useState } from 'react';
import type { LivePointAward } from '@shared/types';

const SCROLL_SPEED = 40;

interface Props {
  entries: Array<LivePointAward & { id: string }>;
}

function ordinal(place: number): string {
  const rem10 = place % 10;
  const rem100 = place % 100;
  if (rem10 === 1 && rem100 !== 11) return `${place}st`;
  if (rem10 === 2 && rem100 !== 12) return `${place}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${place}rd`;
  return `${place}th`;
}

function formatAwardTime(id: string): string {
  const head = id.split('-')[0];
  const epochMs = Number(head);
  if (!Number.isFinite(epochMs) || epochMs <= 0) return 'Time unavailable';
  return new Date(epochMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export default function PointsFeed({ entries }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content || entries.length === 0) {
        setShouldScroll(false);
        return;
      }
      setShouldScroll(content.scrollHeight > viewport.clientHeight + 1);
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [entries]);

  useEffect(() => {
    const track = trackRef.current;
    const content = contentRef.current;

    if (!track || !content || !shouldScroll || entries.length === 0) {
      animRef.current?.cancel();
      if (track) track.style.transform = 'translateY(0)';
      return;
    }

    const raf = requestAnimationFrame(() => {
      const loopHeight = content.scrollHeight;
      const duration = (loopHeight / SCROLL_SPEED) * 1000;

      animRef.current?.cancel();
      animRef.current = track.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(-${loopHeight}px)` }],
        { duration, iterations: Infinity, easing: 'linear' }
      );
    });

    return () => {
      cancelAnimationFrame(raf);
      animRef.current?.cancel();
    };
  }, [entries, shouldScroll]);

  const renderList = (prefix: string) => (
    <ul className="space-y-2 pb-1">
      {entries.map((entry) => (
        <li
          key={`${prefix}-${entry.id}`}
          className="rounded-lg border border-green-900/30 bg-black/20 px-3 py-2"
        >
          <p className="text-[10px] text-gray-500 font-mono mb-1">{formatAwardTime(entry.id)}</p>
          {entry.kind === 'placement' && entry.placement !== undefined ? (
            <>
              <p className="text-xs text-white leading-5">
                {entry.playerName} eliminated in {ordinal(entry.placement)}
              </p>
              <p className="text-[11px] text-gray-400 font-mono">
                +{entry.points.toFixed(2)} placement pts
              </p>
              {(entry.bountiesCollected ?? 0) > 0 && (
                <p className="text-[11px] text-gray-500 font-mono">
                  Previously earned bounty pts: {((entry.bountiesCollected ?? 0) * 3).toFixed(2)}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-white leading-5">{entry.playerName} collected a bounty</p>
              <p className="text-[11px] text-gray-400 font-mono">
                +{entry.points.toFixed(2)} bounty pts · Bounty total {entry.totalPoints.toFixed(2)}
              </p>
            </>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mt-4 border-t border-green-900/40 pt-3 flex-[1.6] min-h-0 overflow-hidden flex flex-col">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-green-400 font-semibold mb-2 pb-1 shrink-0">
        Live Points
      </h2>

      {entries.length === 0 ? (
        <p className="text-gray-600 text-xs">No points awarded yet…</p>
      ) : (
        <div ref={viewportRef} className="flex-1 min-h-0 overflow-hidden relative pr-1">
          <div ref={trackRef} className="will-change-transform">
            <div ref={contentRef}>{renderList('main')}</div>
            {shouldScroll ? <div aria-hidden="true">{renderList('dup')}</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}
