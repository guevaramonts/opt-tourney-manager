import type { ClockState } from '@shared/types';

interface Props {
  clock: ClockState;
}

export default function TournamentClock({ clock }: Props) {
  const minutes = String(Math.floor(clock.remainingSeconds / 60)).padStart(2, '0');
  const seconds = String(clock.remainingSeconds % 60).padStart(2, '0');

  // Turn red in the last 60 seconds of a level
  const urgent = clock.remainingSeconds <= 60 && clock.remainingSeconds > 0;

  return (
    <div className="text-center select-none">
      {/* Level badge */}
      <p className="text-2xl uppercase tracking-[0.3em] text-green-400 font-semibold mb-4">
        Level {clock.level}
      </p>

      {/* Main timer */}
      <p
        className={`font-mono font-bold leading-none transition-colors duration-300 ${
          urgent ? 'text-red-400' : 'text-white'
        }`}
        style={{ fontSize: 'clamp(6rem, 18vw, 14rem)' }}
      >
        {minutes}:{seconds}
      </p>

      {/* Blinds */}
      <div className="mt-8 flex items-center justify-center gap-6">
        {clock.isBreak ? (
          <p className="text-6xl font-bold text-sky-300 tracking-wide">
            {clock.breakLabel || 'BREAK'}
          </p>
        ) : (
          <>
            <Chip label="Small" value={clock.smallBlind} />
            <span className="text-gray-600 text-3xl">/</span>
            <Chip label="Big" value={clock.bigBlind} />
            {clock.ante > 0 && (
              <>
                <span className="text-gray-600 text-3xl">·</span>
                <Chip label="Ante" value={clock.ante} />
              </>
            )}
          </>
        )}
      </div>

      {/* Next level blinds */}
      {clock.nextSmallBlind !== null && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <span className="text-xs uppercase tracking-widest text-gray-600">Next:</span>
          {clock.nextIsBreak ? (
            <span className="text-sky-300 text-lg font-semibold">{clock.nextBreakLabel || 'BREAK'}</span>
          ) : (
            <span className="text-gray-500 text-lg font-mono">
              {clock.nextSmallBlind.toLocaleString()}
              <span className="text-gray-700 mx-1">/</span>
              {clock.nextBigBlind!.toLocaleString()}
              {clock.nextAnte ? <span className="text-gray-700"> · {clock.nextAnte.toLocaleString()} ante</span> : null}
            </span>
          )}
        </div>
      )}

      {/* Paused indicator */}
      {!clock.running && (
        <p className="mt-4 text-sm uppercase tracking-widest text-yellow-400 animate-pulse">
          ⏸ Paused
        </p>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-1">{label}</p>
      <p className="font-bold text-orange-300 leading-none" style={{ fontSize: 'clamp(3.25rem, 7vw, 6rem)' }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
