import { useMemo } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AppChrome } from '../components/UI/AppChrome.tsx';
import { useAuth } from './authContext.tsx';
import { decodeJwtPayload } from './store.ts';
import { AvatarColorProvider } from './avatarColorContext.tsx';

export function ProtectedLayout() {
  const { token, sessionReady } = useAuth();
  const colorScope = useMemo(() => {
    const sub = decodeJwtPayload(token)?.sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : '__anon__';
  }, [token]);

  if (!sessionReady) {
    return (
      <div className="auth-page">
        <p>Loading session…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AvatarColorProvider key={colorScope} storageScope={colorScope}>
      <AppChrome>
        <Outlet />
      </AppChrome>
    </AvatarColorProvider>
  );
}
