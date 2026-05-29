import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './ProtectedLayout.tsx';

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('../features/auth/LoginPage.tsx').then((m) => ({ Component: m.LoginPage })),
  },
  {
    path: '/auth/callback',
    lazy: () => import('../features/auth/AuthCallbackPage.tsx').then((m) => ({ Component: m.AuthCallbackPage })),
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        path: '/lobby',
        lazy: () => import('../features/lobby/LobbyPage.tsx').then((m) => ({ Component: m.LobbyPage })),
      },
      {
        path: '/room/:roomId',
        lazy: () => import('../features/room/RoomGate.tsx').then((m) => ({ Component: m.RoomRouteGate })),
      },
    ],
  },
  { path: '/', element: <Navigate to="/lobby" replace /> },
  { path: '*', element: <Navigate to="/lobby" replace /> },
]);
