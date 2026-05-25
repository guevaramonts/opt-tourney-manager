import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAdmin from './auth/RequireAdmin';
import AdminPage from './pages/AdminPage';
import ClockPage from './pages/ClockPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';

export default function RouterRoot() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/*" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="/clock" element={<RequireAdmin><ClockPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
