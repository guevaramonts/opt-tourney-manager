import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../auth/firebase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/admin');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <form onSubmit={handleSubmit} style={s.card}>
        <h1 style={s.title}>OPT Admin</h1>
        <div style={s.field}>
          <label style={s.label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={s.input} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} />
        </div>
        {error && <div style={s.error}>{error}</div>}
        <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#111', padding: 40, borderRadius: 12, width: 360, border: '1px solid #222' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 32, textAlign: 'center' },
  field: { marginBottom: 16 },
  label: { display: 'block', color: '#888', fontSize: 13, marginBottom: 6 },
  input: { width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box' },
  error: { color: '#ff4444', fontSize: 14, marginBottom: 16 },
  btn: { width: '100%', background: '#2a5cff', color: '#fff', border: 'none', borderRadius: 6, padding: 12, fontSize: 16, cursor: 'pointer', marginTop: 8 },
};
