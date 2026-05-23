import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAdmin from './auth/RequireAdmin';
import AdminPage from './pages/AdminPage';
import ClockPage from './pages/ClockPage';
import LoginPage from './pages/LoginPage';

export default function RouterRoot() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/*" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="/clock" element={<ClockPage />} />
          <Route path="*" element={<Navigate to="/clock" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
