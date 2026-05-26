import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAdmin from './auth/RequireAdmin';
import RequireAuth from './auth/RequireAuth';
import AdminPage from './pages/AdminPage';
import ClockPage from './pages/ClockPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import JoinPage from './pages/JoinPage';
import PlayerDashboardPage from './pages/PlayerDashboardPage';

export default function RouterRoot() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/player" element={<RequireAuth><PlayerDashboardPage /></RequireAuth>} />
          <Route path="/admin/*" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="/clock" element={<RequireAdmin><ClockPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
