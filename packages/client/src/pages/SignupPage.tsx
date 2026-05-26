import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { auth } from '../auth/firebase';
import { api } from '../api/client';

export default function SignupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Display name is required'); return; }
    setError('');
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      await api.playerLink({ name: name.trim(), nickname: nickname.trim() || undefined });
      if (token) {
        await api.playerAcceptInvitation(token);
        navigate('/player');
      } else {
        navigate('/player');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists. Try logging in instead.');
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <form onSubmit={(e) => void handleSubmit(e)} style={s.card}>
        <h1 style={s.title}>Create Your OPT Account</h1>
        {token && (
          <p style={s.hint}>You'll be registered for your tournament after account creation.</p>
        )}
        <div style={s.field}>
          <label style={s.label}>Display name <span style={s.req}>*</span></label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="How you appear on leaderboards"
            style={s.input}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Nickname <span style={s.opt}>(optional)</span></label>
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} style={s.input} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Email <span style={s.req}>*</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Password <span style={s.req}>*</span></label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={s.input} />
        </div>
        {error && <div style={s.error}>{error}</div>}
        <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p style={s.footer}>
          Already have an account?{' '}
          <Link to={token ? `/login?next=${encodeURIComponent(`/join?token=${token}`)}` : '/login'} style={s.link}>
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#111', padding: 40, borderRadius: 12, width: 400, border: '1px solid #222', display: 'flex', flexDirection: 'column', gap: 4 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  hint: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { display: 'block', color: '#888', fontSize: 13, marginBottom: 6 },
  req: { color: '#f87171' },
  opt: { color: '#555' },
  input: { width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box' },
  error: { color: '#ff4444', fontSize: 14, marginBottom: 8 },
  btn: { width: '100%', background: '#2a5cff', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontSize: 16, cursor: 'pointer', marginTop: 8 },
  footer: { textAlign: 'center', color: '#666', fontSize: 13, marginTop: 12 },
  link: { color: '#2a5cff' },
};
