import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { configureAuthApi } from '../services/api.ts';
import { apiUrl } from '../services/apiOrigin.ts';
import { refreshAccessFromCookieSingleFlight } from '../services/credentialRefresh.ts';
import { clearLegacyAccessToken, decodeJwtUsername } from './store';

type AuthValue = {
  token: string | null
  username: string | null
  /** False until the first `/api/auth/refresh` bootstrap attempt finishes (avoids flash to /login). */
  sessionReady: boolean
  setToken: (token: string | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null);

/** OAuth lands on /auth/callback#access=…&rt=… — that page installs the cookie via /session,
 *  so bootstrap-refresh would race ahead with no cookie and emit a noisy 401. */
function isOAuthCallbackEntry(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith('/auth/callback')) return true;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return params.has('access') || params.has('token');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  const username = useMemo(() => decodeJwtUsername(token), [token]);

  useEffect(() => {
    clearLegacyAccessToken();
    if (isOAuthCallbackEntry()) {
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const outcome = await refreshAccessFromCookieSingleFlight();
        if (!cancelled && outcome.ok && outcome.accessToken) {
          setTokenState(outcome.accessToken);
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setToken = useCallback((t: string | null) => {
    setTokenState(t);
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const outcome = await refreshAccessFromCookieSingleFlight();
    if (!outcome.ok || !outcome.accessToken) return null;
    setTokenState(outcome.accessToken);
    return outcome.accessToken;
  }, []);

  useEffect(() => {
    configureAuthApi(refreshAccessToken);
    return () => configureAuthApi(null);
  }, [refreshAccessToken]);

  const logout = useCallback(async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore network errors — still drop local session */
    }
    setTokenState(null);
    clearLegacyAccessToken();
  }, []);

  const value = useMemo(
    () => ({ token, username, sessionReady, setToken, logout }),
    [token, username, sessionReady, setToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
