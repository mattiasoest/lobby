import type { RouteObject } from 'react-router-dom';
import { errorFixtureFor, isErrorPreviewVariant } from './errorPreviewFixtures.ts';

export const devErrorPreviewRoutes: RouteObject[] = [
  {
    path: '/dev/errors',
    lazy: () => import('./ErrorPreviewIndexPage.tsx').then((m) => ({ Component: m.ErrorPreviewIndexPage })),
  },
  {
    path: '/dev/errors/preview/:variant',
    lazy: () => import('./ErrorPreviewPage.tsx').then((m) => ({ Component: m.ErrorPreviewPage })),
  },
  {
    path: '/dev/errors/live/:variant',
    loader: ({ params }) => {
      if (!isErrorPreviewVariant(params.variant)) {
        throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }
      throw errorFixtureFor(params.variant);
    },
    lazy: () => import('./ErrorPreviewUnreachablePage.tsx').then((m) => ({ Component: m.ErrorPreviewUnreachablePage })),
  },
  {
    path: '/dev/errors/boundary/:variant',
    lazy: () => import('./ErrorBoundaryThrowPage.tsx').then((m) => ({ Component: m.ErrorBoundaryThrowShell })),
  },
];
