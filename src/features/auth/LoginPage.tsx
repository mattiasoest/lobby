import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/authContext.tsx';
import { apiUrl } from '../../services/apiOrigin.ts';
import { devLogin, fetchProviders, type ProvidersResponse } from '../../services/messagesApi.ts';
import { useCallback, useEffect, useState } from 'react';

export function LoginPage() {
  const navigate = useNavigate();
  const { token, sessionReady, setToken } = useAuth();
  const [search] = useSearchParams();

  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [devName, setDevName] = useState('explorer');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProviders()
      .then(setProviders)
      .catch(() => setProviders({ google: false, github: false, dev: false }));
  }, []);

  useEffect(() => {
    if (sessionReady && token) navigate('/lobby', { replace: true });
  }, [navigate, token, sessionReady]);

  const paramError = search.get('error');

  useEffect(() => {
    if (paramError) setError(`OAuth failed (${paramError})`);
  }, [paramError]);

  const startGoogle = useCallback(() => {
    window.location.href = apiUrl('/api/auth/google');
  }, []);

  const startGithub = useCallback(() => {
    window.location.href = apiUrl('/api/auth/github');
  }, []);

  const handleDevLogin = useCallback(async () => {
    setError(null);
    try {
      const t = await devLogin(devName.trim() || 'explorer');
      setToken(t);
      navigate('/lobby', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dev login failed');
    }
  }, [devName, navigate, setToken]);

  if (!sessionReady) {
    return (
      <div className="auth-page">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="muted">
          Short-lived access JWT kept in memory; rotating refresh stays in an http-only cookie scoped to{' '}
          <code>/api/auth</code> (new tab restores access via silent refresh).
        </p>

        {(error ?? paramError) && <div className="callout">{error ?? paramError}</div>}

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
            <button type="button" onClick={handleDevLogin}>
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
