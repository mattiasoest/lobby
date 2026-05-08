import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/authContext.tsx';
import { useAuthProvidersQuery, useDevLoginMutation } from '../../query/hooks.ts';
import { apiUrl } from '../../services/apiOrigin.ts';
import { useCallback, useState } from 'react';

export function LoginPage() {
  const { token, sessionReady, setToken } = useAuth();
  const [search] = useSearchParams();

  const providersQuery = useAuthProvidersQuery();
  const devLoginMut = useDevLoginMutation({ setToken });
  const providers = providersQuery.isError
    ? { google: false, github: false, dev: false }
    : (providersQuery.data ?? null);
  const [devName, setDevName] = useState('explorer');
  const [error, setError] = useState<string | null>(null);

  const paramError = search.get('error');
  const oauthUrlError = paramError ? `OAuth failed (${paramError})` : null;

  const startGoogle = useCallback(() => {
    window.location.href = apiUrl('/api/auth/google');
  }, []);

  const startGithub = useCallback(() => {
    window.location.href = apiUrl('/api/auth/github');
  }, []);

  const handleDevLogin = useCallback(() => {
    setError(null);
    devLoginMut.mutate(devName.trim() || 'explorer');
  }, [devLoginMut, devName]);

  if (!sessionReady) {
    return (
      <div className="auth-page">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  if (token) {
    return <Navigate to="/lobby" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="muted">
          Short-lived access JWT kept in memory; rotating refresh stays in an http-only cookie scoped to{' '}
          <code>/api/auth</code> (new tab restores access via silent refresh).
        </p>

        {(oauthUrlError ?? error ?? devLoginMut.error) && (
          <div className="callout">
            {oauthUrlError ??
              error ??
              (devLoginMut.error instanceof Error
                ? devLoginMut.error.message
                : devLoginMut.error
                  ? 'Dev login failed'
                  : null)}
          </div>
        )}

        {providers?.google ? (
          <button type="button" className="primary" onClick={startGoogle}>
            Continue with Google
          </button>
        ) : null}

        {providers?.github ? (
          <button type="button" className="primary" onClick={startGithub}>
            Continue with GitHub
          </button>
        ) : null}

        {providers?.dev ? (
          <div className="dev-login">
            <label>
              Display name for dev login
              <input
                value={devName}
                onChange={(event) => setDevName(event.target.value)}
                placeholder="Nickname"
              />
            </label>
            <button type="button" disabled={devLoginMut.isPending} onClick={handleDevLogin}>
              Dev JWT (ALLOW_DEV_LOGIN=1 server)
            </button>
          </div>
        ) : null}

        {!providers?.google &&
        !providers?.github &&
        !providers?.dev &&
        providers !== null ? (
          <div className="callout muted">No providers configured.</div>
        ) : null}
      </div>
    </div>
  );
}
