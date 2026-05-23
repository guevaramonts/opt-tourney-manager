import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import ClockPage from './pages/ClockPage';

export default function RouterRoot() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/clock" element={<ClockPage />} />
        <Route path="*" element={<Navigate to="/clock" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
