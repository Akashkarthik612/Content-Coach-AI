import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LandingPage from './pages/landing/LandingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import WelcomeSplashPage from './pages/WelcomeSplashPage';
import OnboardingPage from './pages/OnboardingPage';
import MyWorkPage from './pages/MyWorkPage';
import ChatPage from './pages/ChatPage';
import SchedulePage from './pages/SchedulePage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import AccountDetailsPage from './pages/AccountDetailsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AgentsPage from './pages/AgentsPage';
import { ReviewQueueProvider } from './context/ReviewQueueContext';
import { supabase } from './lib/supabaseClient';

// Dev-only switch — see AUTH_PROVIDER on the backend (backend/auth_local/).
// Defaults to Supabase; never set VITE_AUTH_MODE=local outside local dev.
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';

function RequireAuth({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authed | anon

  useEffect(() => {
    if (IS_LOCAL_AUTH) {
      setStatus(localStorage.getItem('user_id') ? 'authed' : 'anon');
      return;
    }
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
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/welcome"    element={<RequireAuth><WelcomeSplashPage /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/my-work"    element={<RequireAuth><MyWorkPage /></RequireAuth>} />
        <Route path="/vault"      element={<RequireAuth><MyWorkPage /></RequireAuth>} />
        <Route path="/chat"       element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="/schedule"   element={<RequireAuth><SchedulePage /></RequireAuth>} />
        <Route path="/analytics"  element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
        <Route path="/settings"   element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/account-details" element={<RequireAuth><AccountDetailsPage /></RequireAuth>} />
        <Route path="/agents"     element={<RequireAuth><AgentsPage /></RequireAuth>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </ReviewQueueProvider>
  );
}
