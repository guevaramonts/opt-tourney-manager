import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../api/client';

interface InvitationInfo {
  valid: boolean;
  email?: string;
  tournament_id?: number;
  tournament_name?: string;
  error?: string;
}

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const token = params.get('token') ?? '';

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    void api.validateInvitationToken(token).then(setInfo).catch(() =>
      setInfo({ valid: false, error: 'Could not validate this invitation.' })
    ).finally(() => setChecking(false));
  }, [token]);

  useEffect(() => {
    if (authLoading || checking || !info?.valid || !user) return;
    // Logged-in user lands here — auto-accept
    setAccepting(true);
    void api.playerAcceptInvitation(token)
      .then(() => navigate('/player'))
      .catch((err: Error) => { setError(err.message); setAccepting(false); });
  }, [authLoading, checking, info, user, token, navigate]);

  if (checking || authLoading) return <Screen><p style={s.muted}>Checking invitation…</p></Screen>;

  if (!token || !info?.valid) {
    return (
      <Screen>
        <h1 style={s.title}>Invitation Invalid</h1>
        <p style={s.muted}>{info?.error ?? 'This invitation link is not valid or has already been used.'}</p>
        <a href="/" style={s.link}>Go to OPT home</a>
      </Screen>
    );
  }

  if (accepting) return <Screen><p style={s.muted}>Accepting invitation…</p></Screen>;

  return (
    <Screen>
      <p style={s.eyebrow}>♠ OPT — Olalde Poker Tournament</p>
      <h1 style={s.title}>You're invited!</h1>
      <p style={s.body}>
        You've been invited to play in <strong>{info.tournament_name}</strong>.
        Create an account or log in to confirm your seat.
      </p>
      {error && <p style={s.error}>{error}</p>}
      <div style={s.actions}>
        <Link to={`/signup?token=${token}`} style={s.btnPrimary}>Create account</Link>
        <Link to={`/login?next=${encodeURIComponent(`/join?token=${token}`)}`} style={s.btnSecondary}>Log in</Link>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={s.page}>
      <div style={s.card}>{children}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#111', padding: 40, borderRadius: 12, width: 420, border: '1px solid #222', display: 'flex', flexDirection: 'column', gap: 16 },
  eyebrow: { color: '#555', fontSize: 13, margin: 0 },
  title: { fontSize: 26, fontWeight: 'bold', margin: 0 },
  body: { color: '#aaa', fontSize: 15, lineHeight: 1.6, margin: 0 },
  muted: { color: '#666', fontSize: 15, margin: 0 },
  error: { color: '#ff4444', fontSize: 14, margin: 0 },
  actions: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  btnPrimary: { display: 'block', textAlign: 'center', background: '#2a5cff', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '12px 0', fontWeight: 'bold', fontSize: 15 },
  btnSecondary: { display: 'block', textAlign: 'center', background: 'transparent', color: '#aaa', textDecoration: 'none', borderRadius: 8, padding: '12px 0', border: '1px solid #333', fontSize: 15 },
  link: { color: '#2a5cff', fontSize: 14 },
};
