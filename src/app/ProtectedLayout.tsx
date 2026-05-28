import { Navigate, Outlet } from 'react-router-dom';
import { AppChrome } from '../components/UI/AppChrome.tsx';
import { useAuth } from './authContext.tsx';
import { AvatarProvider } from './avatarContext.tsx';

export function ProtectedLayout() {
  const { token, sessionReady } = useAuth();

  if (!sessionReady) {
    return (
      <div className="auth-page">
        <p>Loading session…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AvatarProvider>
      <AppChrome>
        <Outlet />
      </AppChrome>
    </AvatarProvider>
  );
}
