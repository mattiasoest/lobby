import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { queryClient } from '../query/queryClient.ts';
import { queryKeys } from '../query/keys.ts';
import { configureAuthApi } from '../services/api.ts';
import { apiUrl } from '../services/apiOrigin.ts';
import { refreshAccessFromCookieSingleFlight } from '../services/credentialRefresh.ts';
import { clearLegacyAccessToken, decodeJwtUsername } from './store';

type AuthValue = {
  token: string | null;
  username: string | null;
  /** False until the first `/api/auth/refresh` bootstrap attempt finishes (avoids flash to /login). */
  sessionReady: boolean;
  setToken: (token: string | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** OAuth lands on /auth/callback#access=…&rt=… — that page installs the cookie via /session,
 *  so bootstrap-refresh would race ahead with no cookie and emit a noisy 401. */
function isOAuthCallbackEntry(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith('/auth/callback')) return true;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return params.has('access') || params.has('token');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [skipBootstrap] = useState(() => isOAuthCallbackEntry());
  /** `undefined` = follow bootstrap query; otherwise explicit session token (including forced `null` after logout). */
  const [tokenOverride, setTokenOverride] = useState<string | null | undefined>(undefined);

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.auth.bootstrap,
    queryFn: async (): Promise<string | null> => {
      const outcome = await refreshAccessFromCookieSingleFlight();
      return outcome.ok && outcome.accessToken ? outcome.accessToken : null;
    },
    enabled: !skipBootstrap,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  const bootstrapToken =
    typeof bootstrapQuery.data === 'string' && bootstrapQuery.data.length > 0 ? bootstrapQuery.data : null;
  const token = tokenOverride !== undefined ? tokenOverride : bootstrapToken;

  const username = useMemo(() => decodeJwtUsername(token), [token]);

  /** OAuth callback skips refresh; otherwise wait until the first bootstrap attempt finishes. */
  const sessionReady = skipBootstrap || bootstrapQuery.isFetched;

  useEffect(() => {
    clearLegacyAccessToken();
  }, []);

  const setToken = useCallback((newToken: string | null) => {
    setTokenOverride(newToken);
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const outcome = await refreshAccessFromCookieSingleFlight();
    if (!outcome.ok || !outcome.accessToken) return null;
    setTokenOverride(outcome.accessToken);
    return outcome.accessToken;
  }, []);

  useEffect(() => {
    configureAuthApi(refreshAccessToken);
    return () => configureAuthApi(null);
  }, [refreshAccessToken]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        /* ignore network errors — still drop local session */
      }
    },
    onSettled: () => {
      queryClient.clear();
      setTokenOverride(null);
      clearLegacyAccessToken();
    },
  });

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo(
    () => ({ token, username, sessionReady, setToken, logout }),
    [token, username, sessionReady, setToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* eslint-disable react-refresh/only-export-components -- paired hook for AuthProvider */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
