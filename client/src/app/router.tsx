import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RouteErrorPage } from '../components/UI/RouteErrorPage.tsx';
import { devErrorPreviewRoutes } from '../features/dev/errorPreviewRoutes.tsx';
import { importWithChunkRetry } from '../utils/chunkLoadError.ts';
import { ProtectedLayout } from './ProtectedLayout.tsx';

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/login',
        lazy: () =>
          importWithChunkRetry(() =>
            import('../features/auth/LoginPage.tsx').then((m) => ({ Component: m.LoginPage })),
          ),
      },
      {
        path: '/auth/callback',
        lazy: () =>
          importWithChunkRetry(() =>
            import('../features/auth/AuthCallbackPage.tsx').then((m) => ({ Component: m.AuthCallbackPage })),
          ),
      },
      {
        element: <ProtectedLayout />,
        children: [
          {
            path: '/lobby',
            lazy: () =>
              importWithChunkRetry(() =>
                import('../features/lobby/LobbyPage.tsx').then((m) => ({ Component: m.LobbyPage })),
              ),
          },
          {
            path: '/room/:roomId',
            lazy: () =>
              importWithChunkRetry(() =>
                import('../features/room/RoomGate.tsx').then((m) => ({ Component: m.RoomRouteGate })),
              ),
          },
        ],
      },
      ...(import.meta.env.DEV ? devErrorPreviewRoutes : []),
      { path: '/', element: <Navigate to="/lobby" replace /> },
      { path: '*', element: <Navigate to="/lobby" replace /> },
    ],
  },
]);
