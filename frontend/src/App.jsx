import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import HomeDashboardPage from './pages/HomeDashboardPage';
import LandingPage from './pages/landing/LandingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import LinkedInStudioPage from './pages/LinkedInStudioPage';
import RedditStudioPage from './pages/RedditStudioPage';
import XStudioPage from './pages/XStudioPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { supabase } from './lib/supabaseClient';

// Dev-only switch — see AUTH_PROVIDER on the backend (backend/auth_local/).
// Defaults to Supabase; never set VITE_AUTH_MODE=local outside local dev.
const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'local';

function RequireAuth({ children }) {
  // checking | authed | anon — local mode can answer synchronously.
  const [status, setStatus] = useState(() => {
    if (!IS_LOCAL_AUTH) return 'checking';
    return localStorage.getItem('user_id') ? 'authed' : 'anon';
  });

  useEffect(() => {
    if (IS_LOCAL_AUTH) return;
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'authed' : 'anon');
    });
  }, []);

  if (status === 'checking') return null;
  return status === 'authed' ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/"         element={<LandingPage />} />
      <Route path="/login"    element={<HomePage initialMode="login" />} />
      <Route path="/register" element={<HomePage initialMode="register" />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/home"      element={<RequireAuth><HomeDashboardPage /></RequireAuth>} />
      <Route path="/linkedin"   element={<RequireAuth><LinkedInStudioPage /></RequireAuth>} />
      <Route path="/reddit"     element={<RequireAuth><RedditStudioPage /></RequireAuth>} />
      <Route path="/x"          element={<RequireAuth><XStudioPage /></RequireAuth>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}
