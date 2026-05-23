import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ background: '#0a0a0a', color: '#888', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
