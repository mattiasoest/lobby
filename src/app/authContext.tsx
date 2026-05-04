import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearStoredToken,
  decodeJwtUsername,
  getStoredToken,
  setStoredToken as persistToken,
} from './store';

type AuthValue = {
  token: string | null
  username: string | null
  setToken: (token: string | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getStoredToken());

  const username = useMemo(() => decodeJwtUsername(token), [token]);

  const setToken = useCallback((t: string | null) => {
    setTokenState(t);
    if (t) persistToken(t);
    else clearStoredToken();
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    clearStoredToken();
  }, []);

  const value = useMemo(
    () => ({ token, username, setToken, logout }),
    [token, username, setToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
