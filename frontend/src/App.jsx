import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LandingPage from './pages/landing/LandingPage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import MyWorkPage from './pages/MyWorkPage';
import ChatPage from './pages/ChatPage';
import { ReviewQueueProvider } from './context/ReviewQueueContext';

function RequireAuth({ children }) {
  return localStorage.getItem('user_id') ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ReviewQueueProvider>
      <Routes>
        <Route path="/"         element={<LandingPage />} />
        <Route path="/login"    element={<HomePage initialMode="login" />} />
        <Route path="/register" element={<HomePage initialMode="register" />} />
        <Route path="/dashboard"  element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/analytics"  element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
        <Route path="/my-work"    element={<RequireAuth><MyWorkPage /></RequireAuth>} />
        <Route path="/vault"      element={<RequireAuth><MyWorkPage /></RequireAuth>} />
        <Route path="/chat"       element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </ReviewQueueProvider>
  );
}
