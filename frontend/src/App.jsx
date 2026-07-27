import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LandingPage from './pages/landing/LandingPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import MyWorkPage from './pages/MyWorkPage';
import ChatPage from './pages/ChatPage';
import AgentsPage from './pages/AgentsPage';
import { ReviewQueueProvider } from './context/ReviewQueueContext';
import { supabase } from './lib/supabaseClient';

function RequireAuth({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authed | anon

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'authed' : 'anon');
    });
  }, []);

  if (status === 'checking') return null;
  return status === 'authed' ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ReviewQueueProvider>
      <Routes>
        <Route path="/"         element={<LandingPage />} />
        <Route path="/login"    element={<HomePage initialMode="login" />} />
        <Route path="/register" element={<HomePage initialMode="register" />} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/dashboard"  element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/analytics"  element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
        <Route path="/my-work"    element={<RequireAuth><MyWorkPage /></RequireAuth>} />
        <Route path="/vault"      element={<RequireAuth><MyWorkPage /></RequireAuth>} />
        <Route path="/chat"       element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="/agents"     element={<RequireAuth><AgentsPage /></RequireAuth>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </ReviewQueueProvider>
  );
}
