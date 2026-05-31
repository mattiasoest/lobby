import { Navigate, useSearchParams } from 'react-router-dom';
import { APP_NAME } from '../../app/config.ts';
import { useAuth } from '../../app/authContext.tsx';
import { useAuthProvidersQuery, useDevLoginMutation, useGuestLoginMutation } from '../../query/hooks.ts';
import { apiUrl } from '../../services/apiOrigin.ts';
import { useCallback, useState } from 'react';

function GoogleIcon() {
  return (
    <svg className="login-provider-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="login-provider-icon login-provider-icon--mono" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 .5C5.73.5.5 5.78.5 12.26c0 5.2 3.44 9.61 8.2 11.17.6.11.82-.26.82-.58 0-.28-.01-1.02-.02-2-3.33.73-4.03-1.42-4.03-1.42-.55-1.41-1.35-1.78-1.35-1.78-1.1-.76.08-.75.08-.75 1.22.09 1.86 1.27 1.86 1.27 1.08 1.87 2.84 1.33 3.53 1.02.11-.79.42-1.33.76-1.64-2.66-.31-5.46-1.35-5.46-6.02 0-1.33.47-2.41 1.24-3.27-.12-.31-.54-1.55.12-3.22 0 0 1.01-.33 3.3 1.25.96-.27 1.98-.41 3-.41s2.04.14 3 .41c2.29-1.58 3.3-1.25 3.3-1.25.66 1.67.24 2.91.12 3.22.77.86 1.24 1.94 1.24 3.27 0 4.68-2.8 5.7-5.47 6.01.43.38.81 1.12.81 2.26 0 1.63-.02 2.94-.02 3.34 0 .32.22.7.83.58A10.5 10.5 0 0 0 23.5 12.26C23.5 5.78 18.27.5 12 .5z"
      />
    </svg>
  );
}

function GuestIcon() {
  return (
    <svg className="login-provider-icon login-provider-icon--mono" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.25c-3.5 0-9 1.75-9 5.25v1.5h18v-1.5c0-3.5-5.5-5.25-9-5.25z"
      />
    </svg>
  );
}

function formatLoginError(paramError: string | null, mutationError: unknown, localError: string | null): string | null {
  if (localError) return localError;
  if (paramError) {
    const label = paramError === 'google' ? 'Google' : paramError === 'github' ? 'GitHub' : 'Sign-in';
    return `${label} failed. Please try again.`;
  }
  if (mutationError instanceof Error) return mutationError.message;
  if (mutationError) return 'Sign-in failed. Please try again.';
  return null;
}

export function LoginPage() {
  const { token, sessionReady, setToken } = useAuth();
  const [search] = useSearchParams();

  const providersQuery = useAuthProvidersQuery();
  const devLoginMut = useDevLoginMutation({ setToken });
  const guestLoginMut = useGuestLoginMutation({ setToken });
  const providers = providersQuery.isError
    ? { google: false, github: false, dev: false, guest: false }
    : (providersQuery.data ?? null);
  const [devName, setDevName] = useState('explorer');
  const [error, setError] = useState<string | null>(null);

  const paramError = search.get('error');
  const displayError = formatLoginError(paramError, devLoginMut.error ?? guestLoginMut.error, error);

  const startGoogle = useCallback(() => {
    const returnOrigin = encodeURIComponent(window.location.origin);
    window.location.href = apiUrl(`/auth/google?returnOrigin=${returnOrigin}`);
  }, []);

  const startGithub = useCallback(() => {
    const returnOrigin = encodeURIComponent(window.location.origin);
    window.location.href = apiUrl(`/auth/github?returnOrigin=${returnOrigin}`);
  }, []);

  const handleDevLogin = useCallback(() => {
    setError(null);
    devLoginMut.mutate(devName.trim() || 'explorer');
  }, [devLoginMut, devName]);

  const handleGuestLogin = useCallback(() => {
    setError(null);
    guestLoginMut.mutate();
  }, [guestLoginMut]);

  const providerCount = [providers?.google, providers?.github, providers?.guest].filter(Boolean).length;

  if (!sessionReady) {
    return (
      <div className="auth-page login-page">
        <p className="login-status">Checking session…</p>
      </div>
    );
  }

  if (token) {
    return <Navigate to="/lobby" replace />;
  }

  return (
    <div className="auth-page login-page">
      <div className="login-shell">
        <h1 className="login-title">{APP_NAME} Login</h1>

        {displayError ? <p className="login-error">{displayError}</p> : null}

        {providerCount > 0 ? (
          <div className="login-providers">
            {providers?.google ? (
              <button type="button" className="login-provider login-provider--google" onClick={startGoogle}>
                <GoogleIcon />
                <span>Sign in with Google</span>
              </button>
            ) : null}

            {providers?.github ? (
              <button type="button" className="login-provider login-provider--github" onClick={startGithub}>
                <GitHubIcon />
                <span>Sign in with GitHub</span>
              </button>
            ) : null}

            {providers?.guest ? (
              <button
                type="button"
                className="login-provider login-provider--guest"
                disabled={guestLoginMut.isPending}
                onClick={handleGuestLogin}
              >
                <GuestIcon />
                <span>{guestLoginMut.isPending ? 'Signing in…' : 'Continue as guest'}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {!providers?.google && !providers?.github && !providers?.guest && !providers?.dev && providers !== null ? (
          <p className="login-empty">No sign-in providers are configured.</p>
        ) : null}

        {providers?.dev ? (
          <details className="login-dev">
            <summary>Developer sign-in</summary>
            <div className="login-dev-panel">
              <input
                value={devName}
                onChange={(event) => setDevName(event.target.value)}
                placeholder="Display name"
                aria-label="Display name"
              />
              <button type="button" disabled={devLoginMut.isPending} onClick={handleDevLogin}>
                {devLoginMut.isPending ? 'Signing in…' : 'Continue'}
              </button>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
