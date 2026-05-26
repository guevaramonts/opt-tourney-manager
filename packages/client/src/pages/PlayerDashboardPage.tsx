import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../auth/firebase';
import { api } from '../api/client';

interface Player {
  id: number;
  name: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  total_career_earnings: number;
}

interface Registration {
  tournament_id: number;
  tournament_name: string;
  tournament_status: string;
  chip_count: number;
  is_active: boolean;
  bounties_collected: number;
  table_name: string | null;
  seat_number: number | null;
}

interface MeResponse {
  player: Player;
  registrations: Registration[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Upcoming',
  finished: 'Finished',
  finalized: 'Finalized',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#60a5fa',
  finished: '#facc15',
  finalized: '#4ade80',
};

export default function PlayerDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (api.playerMe() as Promise<MeResponse>)
      .then(setData)
      .catch((err: Error) => {
        if (err.message.includes('not found')) {
          navigate('/signup');
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  async function handleSignOut() {
    await signOut(auth);
    navigate('/');
  }

  if (loading) return <Page><p style={s.muted}>Loading…</p></Page>;
  if (error) return <Page><p style={s.error}>{error}</p></Page>;
  if (!data) return null;

  const { player, registrations } = data;
  const active = registrations.filter((r) => r.tournament_status === 'pending');
  const past = registrations.filter((r) => r.tournament_status !== 'pending');

  return (
    <Page>
      {/* Header */}
      <div style={s.header}>
        <div>
          <span style={s.logo}>♠ OPT</span>
          <span style={s.logoSub}>Olalde Poker Tournament</span>
        </div>
        <button onClick={() => void handleSignOut()} style={s.signOut}>Sign out</button>
      </div>

      {/* Profile card */}
      <div style={s.card}>
        <h1 style={s.name}>{player.name}</h1>
        {player.nickname && <p style={s.nickname}>"{player.nickname}"</p>}
        <p style={s.email}>{player.email}</p>
        <div style={s.stat}>
          <span style={s.statLabel}>Career earnings</span>
          <span style={s.statValue}>${player.total_career_earnings.toLocaleString()}</span>
        </div>
      </div>

      {/* Active registrations */}
      <section>
        <h2 style={s.sectionTitle}>Upcoming Tournaments</h2>
        {active.length === 0 ? (
          <p style={s.muted}>No upcoming registrations.</p>
        ) : (
          active.map((r) => <RegistrationRow key={r.tournament_id} reg={r} />)
        )}
      </section>

      {/* Past tournaments */}
      {past.length > 0 && (
        <section>
          <h2 style={s.sectionTitle}>Past Tournaments</h2>
          {past.map((r) => <RegistrationRow key={r.tournament_id} reg={r} />)}
        </section>
      )}
    </Page>
  );
}

function RegistrationRow({ reg }: { reg: Registration }) {
  return (
    <div style={s.regRow}>
      <div style={{ flex: 1 }}>
        <p style={s.regName}>{reg.tournament_name}</p>
        {reg.table_name && (
          <p style={s.regSeat}>Table {reg.table_name}{reg.seat_number ? `, Seat ${reg.seat_number}` : ''}</p>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...s.badge, color: STATUS_COLOR[reg.tournament_status] ?? '#aaa' }}>
          {STATUS_LABEL[reg.tournament_status] ?? reg.tournament_status}
        </span>
        {reg.bounties_collected > 0 && (
          <p style={s.regSeat}>{reg.bounties_collected} bounty{reg.bounties_collected !== 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={s.page}>
      <div style={s.inner}>{children}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: '#0a0a0a', color: '#fff', minHeight: '100vh' },
  inner: { maxWidth: 540, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 28 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em' },
  logoSub: { color: '#555', fontSize: 13, marginLeft: 10 },
  signOut: { background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13 },
  card: { background: '#111', border: '1px solid #222', borderRadius: 12, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 6 },
  name: { fontSize: 22, fontWeight: 'bold', margin: 0 },
  nickname: { color: '#888', fontSize: 15, margin: 0 },
  email: { color: '#555', fontSize: 13, margin: 0 },
  stat: { display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #222' },
  statLabel: { color: '#666', fontSize: 13 },
  statValue: { color: '#facc15', fontWeight: 'bold', fontFamily: 'monospace', fontSize: 15 },
  sectionTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4ade80', fontWeight: 600, margin: '0 0 12px' },
  regRow: { background: '#111', border: '1px solid #222', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  regName: { fontWeight: 600, fontSize: 15, margin: 0 },
  regSeat: { color: '#666', fontSize: 12, margin: '2px 0 0' },
  badge: { fontSize: 12, fontWeight: 600, fontFamily: 'monospace' },
  muted: { color: '#555', fontSize: 14 },
  error: { color: '#f87171', fontSize: 14 },
};
