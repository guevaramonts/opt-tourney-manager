import { useClockState, usePlayerEliminated, useSeatsAssigned } from '../api/socket';
import { useState, useCallback } from 'react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface EliminationEvent {
  killerName: string;
  victimName: string;
  placement: number;
  leaderboard: Array<{ name: string; bounties_collected: number }>;
}

export default function ClockPage() {
  const clock = useClockState();
  const [lastElim, setLastElim] = useState<EliminationEvent | null>(null);
  const [seatChart, setSeatChart] = useState<Array<{ player_name: string; table_name: string; seat_number: number }>>([]);

  const onElim = useCallback((payload: unknown) => {
    const e = payload as EliminationEvent;
    setLastElim(e);
    setTimeout(() => setLastElim(null), 8000);
  }, []);

  const onSeats = useCallback((payload: unknown) => {
    const p = payload as { chart: typeof seatChart };
    setSeatChart(p.chart ?? []);
  }, []);

  usePlayerEliminated(onElim);
  useSeatsAssigned(onSeats);

  if (!clock) {
    return (
      <div style={styles.container}>
        <div style={styles.connecting}>Connecting…</div>
      </div>
    );
  }

  const tableGroups: Record<string, typeof seatChart> = {};
  for (const entry of seatChart) {
    if (!tableGroups[entry.table_name]) tableGroups[entry.table_name] = [];
    tableGroups[entry.table_name].push(entry);
  }

  return (
    <div style={styles.container}>
      {/* Clock header */}
      <div style={styles.header}>
        <div style={styles.levelBadge}>
          {clock.isBreak ? (clock.breakLabel ?? 'BREAK') : `Level ${clock.level}`}
        </div>
        {!clock.isBreak && (
          <div style={styles.blinds}>
            {clock.smallBlind}/{clock.bigBlind}
            {clock.ante > 0 && <span> (Ante {clock.ante})</span>}
          </div>
        )}
        <div style={{ ...styles.timer, color: clock.remainingSeconds <= 60 ? '#ff4444' : '#fff' }}>
          {formatTime(clock.remainingSeconds)}
        </div>
        {clock.nextSmallBlind && (
          <div style={styles.nextLevel}>
            Next: {clock.nextIsBreak ? (clock.nextBreakLabel ?? 'Break') : `${clock.nextSmallBlind}/${clock.nextBigBlind}${clock.nextAnte ? ` (Ante ${clock.nextAnte})` : ''}`}
          </div>
        )}
      </div>

      {/* Elimination toast */}
      {lastElim && (
        <div style={styles.elimToast}>
          <div style={styles.elimTitle}>Player Eliminated — #{lastElim.placement}</div>
          <div style={styles.elimDetail}>{lastElim.killerName} eliminated {lastElim.victimName}</div>
          {lastElim.leaderboard.length > 0 && (
            <div style={styles.leaderboard}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Bounty Leaders</div>
              {lastElim.leaderboard.map((e, i) => (
                <div key={i}>{e.name}: {e.bounties_collected} 🎯</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Seat chart */}
      {seatChart.length > 0 && (
        <div style={styles.seating}>
          {Object.entries(tableGroups).map(([tableName, seats]) => (
            <div key={tableName} style={styles.tableCard}>
              <div style={styles.tableName}>{tableName}</div>
              {seats.sort((a, b) => a.seat_number - b.seat_number).map((s) => (
                <div key={s.seat_number} style={styles.seat}>
                  <span style={styles.seatNum}>{s.seat_number}</span>
                  <span>{s.player_name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', fontFamily: 'monospace', padding: 24 },
  connecting: { fontSize: 24, textAlign: 'center', marginTop: 100, color: '#888' },
  header: { textAlign: 'center', marginBottom: 32 },
  levelBadge: { fontSize: 20, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 4 },
  blinds: { fontSize: 32, color: '#ccc', marginBottom: 8 },
  timer: { fontSize: 96, fontWeight: 'bold', lineHeight: 1, marginBottom: 8 },
  nextLevel: { fontSize: 16, color: '#666' },
  elimToast: { background: '#1a0a0a', border: '1px solid #ff4444', borderRadius: 8, padding: 16, marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' },
  elimTitle: { fontSize: 18, fontWeight: 'bold', color: '#ff4444', marginBottom: 4 },
  elimDetail: { color: '#ccc', marginBottom: 8 },
  leaderboard: { color: '#aaa', fontSize: 14 },
  seating: { display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  tableCard: { background: '#111', border: '1px solid #333', borderRadius: 8, padding: 12, minWidth: 160 },
  tableName: { fontSize: 14, fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, borderBottom: '1px solid #333', paddingBottom: 6 },
  seat: { display: 'flex', gap: 8, padding: '4px 0', fontSize: 14 },
  seatNum: { color: '#555', minWidth: 20 },
};
