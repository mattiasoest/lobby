import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage.tsx';
import { LoginPage } from '../features/auth/LoginPage.tsx';
import { LobbyPage } from '../features/lobby/LobbyPage.tsx';
import { RoomRouteGate } from '../features/room/RoomGate.tsx';
import { ProtectedLayout } from './ProtectedLayout.tsx';

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
