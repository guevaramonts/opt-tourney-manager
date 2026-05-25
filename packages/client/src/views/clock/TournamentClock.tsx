import type { ClockState } from '../../api/socket';

interface Props {
  clock: ClockState;
}

const CHIP_DENOMINATIONS = [
  { value: 25,   color: '#e0e0e0', textColor: '#1a1a1a' },
  { value: 50,   color: '#dc2626', textColor: '#ffffff' },
  { value: 100,  color: '#2563eb', textColor: '#ffffff' },
  { value: 500,  color: '#111827', textColor: '#ffffff' },
  { value: 1000, color: '#16a34a', textColor: '#ffffff' },
  { value: 5000, color: '#eab308', textColor: '#1a1a1a' },
] as const;

export default function TournamentClock({ clock }: Props) {
  const minutes = String(Math.floor(clock.remainingSeconds / 60)).padStart(2, '0');
  const seconds = String(clock.remainingSeconds % 60).padStart(2, '0');
  const urgent = clock.remainingSeconds <= 60 && clock.remainingSeconds > 0;

  return (
    <div className="text-center select-none">
      {/* Chip rack */}
      <div className="mb-8 flex items-end justify-center gap-5">
        {CHIP_DENOMINATIONS.map((chip) => (
          <PokerChip key={chip.value} value={chip.value} color={chip.color} textColor={chip.textColor} />
        ))}
      </div>

      <p className="text-2xl uppercase tracking-[0.3em] text-green-400 font-semibold mb-4">
        Level {clock.level}
      </p>

      <p
        className={`font-mono font-bold leading-none transition-colors duration-300 ${
          urgent ? 'text-red-400' : 'text-white'
        }`}
        style={{ fontSize: 'clamp(6rem, 18vw, 14rem)' }}
      >
        {minutes}:{seconds}
      </p>

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

      {clock.nextSmallBlind !== null && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <span className="text-xs uppercase tracking-widest text-gray-600">Next:</span>
          {clock.nextIsBreak ? (
            <span className="text-sky-300 text-lg font-semibold">
              {clock.nextBreakLabel || 'BREAK'}
            </span>
          ) : (
            <span className="text-gray-500 text-lg font-mono">
              {clock.nextSmallBlind.toLocaleString()}
              <span className="text-gray-700 mx-1">/</span>
              {clock.nextBigBlind!.toLocaleString()}
              {clock.nextAnte ? (
                <span className="text-gray-700"> · {clock.nextAnte.toLocaleString()} ante</span>
              ) : null}
            </span>
          )}
        </div>
      )}

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

function PokerChip({ value, color, textColor }: { value: number; color: string; textColor: string }) {
  const label = value >= 1000 ? `${value / 1000}K` : String(value);
  const isWhite = value === 25;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 100 100" className="w-12 h-12 drop-shadow-xl" aria-label={`${value} chip`}>
        {/* Outer rim */}
        <circle cx="50" cy="50" r="49" fill={color} />
        {/* Edge stripe notches */}
        <circle
          cx="50" cy="50" r="43"
          fill="none"
          stroke={isWhite ? '#aaaaaa' : 'rgba(255,255,255,0.65)'}
          strokeWidth="9"
          strokeDasharray="11 8"
        />
        {/* Inner circle */}
        <circle cx="50" cy="50" r="33" fill={color} />
        {/* Inner border ring */}
        <circle
          cx="50" cy="50" r="33"
          fill="none"
          stroke={isWhite ? '#aaaaaa' : 'rgba(255,255,255,0.5)'}
          strokeWidth="1.5"
        />
        {/* Value label */}
        <text
          x="50" y="51"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={label.length > 2 ? 17 : 20}
          fontWeight="bold"
          fill={textColor}
          fontFamily="monospace"
          letterSpacing="-0.5"
        >
          {label}
        </text>
      </svg>
      <span className="text-[10px] font-mono text-gray-500">{value.toLocaleString()}</span>
    </div>
  );
}
