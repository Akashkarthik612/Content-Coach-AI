import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { completeDriveConnect, knowledgeErrorReason } from '../api/knowledge';

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
