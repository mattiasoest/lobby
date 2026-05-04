import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppChrome } from '../components/UI/AppChrome.tsx';
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage.tsx';
import { LoginPage } from '../features/auth/LoginPage.tsx';
import { LobbyPage } from '../features/lobby/LobbyPage.tsx';
import { RoomRouteGate } from '../features/room/RoomGate.tsx';
import { useAuth } from './authContext.tsx';

function ProtectedLayout() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AppChrome>
      <Outlet />
    </AppChrome>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/lobby', element: <LobbyPage /> },
      { path: '/room/:roomId', element: <RoomRouteGate /> },
    ],
  },
  { path: '/', element: <Navigate to="/lobby" replace /> },
  { path: '*', element: <Navigate to="/lobby" replace /> },
]);
