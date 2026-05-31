import { Navigate, Outlet } from 'react-router-dom';
import authPage from '@/styles/authPage.module.css';
import { useAuth } from './authContext.tsx';
import { AvatarProvider } from './avatarContext.tsx';
import { AppChrome } from '@/components/AppChrome/AppChrome.tsx';

export function ProtectedLayout() {
  const { token, sessionReady } = useAuth();

  if (!sessionReady) {
    return (
      <div className={authPage.page}>
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
