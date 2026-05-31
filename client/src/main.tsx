import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { APP_NAME } from '@/app/config.ts';
import { AuthProvider } from '@/app/authContext.tsx';
import { router } from '@/app/router.tsx';
import { AppErrorBoundary } from '@/components/AppErrorBoundary/AppErrorBoundary.tsx';
import { queryClient } from '@/query/queryClient.ts';
import { clearChunkReloadAttempt } from '@/utils/chunkLoadError.ts';
import authPage from '@/styles/authPage.module.css';
import '@/styles/global.css';

clearChunkReloadAttempt();

document.title = APP_NAME;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense
            fallback={
              <div className={authPage.page}>
                <p className="muted">Loading…</p>
              </div>
            }
          >
            <RouterProvider router={router} />
          </Suspense>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
);
