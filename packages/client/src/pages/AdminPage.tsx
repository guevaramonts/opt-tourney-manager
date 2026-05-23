import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useClockState, useSeatsAssigned, usePlayerEliminated, useConsolidationExecuted } from '../api/socket';

// Re-export existing admin views with api swapped in — full port happens in next phase
// For now: functional clock control + minimal tournament management to prove deployment

interface Tournament {
  id: number;
  name: string;
  status: string;
  buy_in: number;
  bounty_amount: number;
  player_count?: number;
}

interface ActivePlayer {
  id: number;
  player_id: number;
  name: string;
  nickname?: string;
  table_name?: string;
  seat_number?: number;
  is_active: number;
  bounties_collected: number;
  chip_count: number;
}

export default function AdminPage() {
  const clock = useClockState();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [tab, setTab] = useState<'clock' | 'players' | 'eliminate'>('clock');
  const [status, setStatus] = useState('');

  const loadTournaments = useCallback(async () => {
    const data = await api.getAllTournaments();
    setTournaments(data as Tournament[]);
  }, []);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  useEffect(() => {
    if (selectedId) {
      api.getActivePlayers(selectedId).then((d) => setActivePlayers(d as ActivePlayer[]));
    }
  }, [selectedId]);

  useSeatsAssigned(useCallback(() => {
    if (selectedId) api.getActivePlayers(selectedId).then((d) => setActivePlayers(d as ActivePlayer[]));
  }, [selectedId]));

  usePlayerEliminated(useCallback(() => {
    if (selectedId) api.getActivePlayers(selectedId).then((d) => setActivePlayers(d as ActivePlayer[]));
  }, [selectedId]));

  useConsolidationExecuted(useCallback(() => {
    if (selectedId) api.getActivePlayers(selectedId).then((d) => setActivePlayers(d as ActivePlayer[]));
  }, [selectedId]));

  async function runAction(label: string, fn: () => Promise<unknown>) {
    try {
      setStatus(`Running: ${label}…`);
      await fn();
      setStatus(`Done: ${label}`);
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    }
  }

  const selectedTournament = tournaments.find((t) => t.id === selectedId);

  return (
    <div style={s.container}>
      <h1 style={s.title}>OPT Admin</h1>

      {/* Tournament selector */}
      <div style={s.section}>
        <label style={s.label}>Tournament</label>
        <select style={s.select} value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}>
          <option value="">-- select --</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.status}, {t.player_count ?? 0} players)</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(['clock', 'players', 'eliminate'] as const).map((t) => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Clock tab */}
      {tab === 'clock' && (
        <div style={s.section}>
          {clock && (
            <div style={s.clockDisplay}>
              <div style={s.clockLevel}>{clock.isBreak ? (clock.breakLabel ?? 'BREAK') : `Level ${clock.level}`}</div>
              <div style={s.clockBlinds}>{clock.isBreak ? '' : `${clock.smallBlind}/${clock.bigBlind}${clock.ante > 0 ? ` (Ante ${clock.ante})` : ''}`}</div>
              <div style={s.clockTime}>{Math.floor(clock.remainingSeconds / 60)}:{String(clock.remainingSeconds % 60).padStart(2, '0')}</div>
              <div style={{ color: clock.running ? '#44ff44' : '#888' }}>{clock.running ? '● Running' : '■ Paused'}</div>
            </div>
          )}
          <div style={s.buttonRow}>
            <button style={s.btn} onClick={() => runAction('Play', () => api.clockPlay(selectedId ?? undefined))}>▶ Play</button>
            <button style={s.btn} onClick={() => runAction('Pause', () => api.clockPause())}>⏸ Pause</button>
            <button style={s.btn} onClick={() => runAction('Reset', () => api.clockReset())}>↩ Reset</button>
            <button style={s.btn} onClick={() => runAction('Next Level', () => api.clockNextLevel())}>⏭ Next Level</button>
          </div>
          {selectedId && (
            <div style={s.buttonRow}>
              <button style={s.btn} onClick={() => runAction('Assign Seats', () => api.randomAssignSeats(selectedId))}>🎲 Assign Seats</button>
              <button style={s.btn} onClick={() => runAction('Finish', () => api.finishTournament(selectedId).then(loadTournaments))}>🏁 Finish</button>
            </div>
          )}
        </div>
      )}

      {/* Players tab */}
      {tab === 'players' && selectedId && (
        <div style={s.section}>
          <div style={s.countBadge}>{activePlayers.length} active players</div>
          <div style={s.playerGrid}>
            {activePlayers.map((p) => (
              <div key={p.player_id} style={s.playerCard}>
                <div style={s.playerName}>{p.name}{p.nickname ? ` (${p.nickname})` : ''}</div>
                <div style={s.playerMeta}>
                  {p.table_name ? `${p.table_name} Seat ${p.seat_number}` : 'No seat'}
                  {p.bounties_collected > 0 && ` · ${p.bounties_collected} 🎯`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eliminate tab */}
      {tab === 'eliminate' && selectedId && (
        <EliminatePanel tournamentId={selectedId} players={activePlayers} onDone={() => {
          api.getActivePlayers(selectedId).then((d) => setActivePlayers(d as ActivePlayer[]));
        }} />
      )}

      {status && <div style={s.status}>{status}</div>}
    </div>
  );
}

function EliminatePanel({ tournamentId, players, onDone }: { tournamentId: number; players: ActivePlayer[]; onDone: () => void }) {
  const [killerId, setKillerId] = useState('');
  const [victimId, setVictimId] = useState('');
  const [msg, setMsg] = useState('');

  async function handleElim() {
    if (!killerId || !victimId) { setMsg('Select both players'); return; }
    try {
      await api.recordElimination({ tournamentId, killerId: parseInt(killerId), victimId: parseInt(victimId) });
      setKillerId(''); setVictimId('');
      setMsg('Elimination recorded');
      onDone();
    } catch (err) { setMsg(String(err)); }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#888', marginBottom: 4 }}>Victim (eliminated)</div>
          <select style={{ background: '#1a1a1a', color: '#fff', padding: 8, borderRadius: 4, border: '1px solid #333', minWidth: 200 }} value={victimId} onChange={(e) => setVictimId(e.target.value)}>
            <option value="">-- eliminated player --</option>
            {players.map((p) => <option key={p.player_id} value={p.player_id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ color: '#888', marginBottom: 4 }}>Killer (bounty winner)</div>
          <select style={{ background: '#1a1a1a', color: '#fff', padding: 8, borderRadius: 4, border: '1px solid #333', minWidth: 200 }} value={killerId} onChange={(e) => setKillerId(e.target.value)}>
            <option value="">-- killer --</option>
            {players.map((p) => <option key={p.player_id} value={p.player_id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <button style={{ background: '#cc2222', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 6, cursor: 'pointer', fontSize: 16 }} onClick={handleElim}>Record Elimination</button>
      {msg && <div style={{ color: '#aaa', marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, color: '#fff' },
  section: { background: '#111', borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { color: '#888', fontSize: 14, display: 'block', marginBottom: 6 },
  select: { background: '#1a1a1a', color: '#fff', padding: 10, borderRadius: 6, border: '1px solid #333', width: '100%', fontSize: 15 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: { background: '#1a1a1a', color: '#888', border: '1px solid #333', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  tabActive: { background: '#2a2a2a', color: '#fff', borderColor: '#555' },
  clockDisplay: { textAlign: 'center', marginBottom: 20 },
  clockLevel: { fontSize: 14, color: '#888', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 4 },
  clockBlinds: { fontSize: 20, color: '#ccc', marginBottom: 4 },
  clockTime: { fontSize: 72, fontWeight: 'bold', lineHeight: 1, marginBottom: 8 },
  buttonRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  btn: { background: '#222', color: '#fff', border: '1px solid #444', padding: '10px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  status: { background: '#111', borderRadius: 6, padding: 12, color: '#888', fontSize: 13, marginTop: 12 },
  countBadge: { color: '#888', fontSize: 14, marginBottom: 12 },
  playerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 },
  playerCard: { background: '#1a1a1a', borderRadius: 6, padding: 10 },
  playerName: { fontWeight: 'bold', marginBottom: 4 },
  playerMeta: { color: '#888', fontSize: 12 },
};
