import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { completeDriveConnect, knowledgeErrorReason } from '../api/knowledge';
import { completeGoogleDocs } from '../api/workspaces';

/**
 * Google redirects here after the Drive consent screen. This page finishes the
 * connection with the signed-in user's token, so a consent link started by
 * someone else can't attach this user's Drive to their account.
 */
export default function GDriveCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // The code is single-use; StrictMode runs effects twice in development.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const state = params.get('state') ?? '';
    if (state.startsWith('docs.')) {
      const workspace = sessionStorage.getItem('honne_docs_workspace');
      sessionStorage.removeItem('honne_docs_workspace');
      const previous = sessionStorage.getItem('honne_docs_return');
      sessionStorage.removeItem('honne_docs_return');
      const destination = new URL(previous || `/demo?workspace=${encodeURIComponent(workspace || '')}&view=chat`, window.location.origin);
      const returnTo = result => {
        const safe = destination.origin === window.location.origin && destination.pathname === '/demo';
        const url = safe ? destination : new URL('/demo', window.location.origin);
        url.searchParams.set('docs', result);
        return url.pathname + url.search;
      };
      if (!workspace) { navigate('/demo?docs=error', { replace: true }); return; }
      completeGoogleDocs(workspace, { state, code: params.get('code'), error: params.get('error') })
        .then(() => navigate(returnTo('connected'), { replace: true }))
        .catch(() => navigate(returnTo('error'), { replace: true }));
      return;
    }
    completeDriveConnect({
      state: params.get('state') ?? '',
      code: params.get('code'),
      error: params.get('error'),
    })
      .then(source => navigate(`/knowledge?drive=connected&source=${encodeURIComponent(source.id)}`, { replace: true }))
      .catch(err =>
        navigate(`/knowledge?drive=error&reason=${encodeURIComponent(knowledgeErrorReason(err))}`, { replace: true }),
      );
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
      Connecting Google Drive…
    </div>
  );
}
