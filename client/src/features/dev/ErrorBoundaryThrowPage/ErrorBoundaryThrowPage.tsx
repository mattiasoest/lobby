import { Navigate, useParams } from 'react-router-dom';
import { AppErrorBoundary } from '@/components/AppErrorBoundary/AppErrorBoundary.tsx';
import { ErrorPreviewNav } from '@/components/ErrorPreviewNav/ErrorPreviewNav.tsx';
import { errorFixtureFor, isErrorPreviewVariant } from '../errorPreviewFixtures.ts';
import styles from './ErrorBoundaryThrowPage.css';

export function ErrorBoundaryThrowPage() {
  const { variant } = useParams();

  if (!isErrorPreviewVariant(variant)) {
    return <Navigate to="/dev/errors/boundary/chunk" replace />;
  }

  throw errorFixtureFor(variant);
}

export function ErrorBoundaryThrowShell() {
  const { variant } = useParams();

  if (!isErrorPreviewVariant(variant)) {
    return <Navigate to="/dev/errors/boundary/chunk" replace />;
  }

  return (
    <div className={styles.gallery}>
      <ErrorPreviewNav mode="boundary" activeVariant={variant} />
      <AppErrorBoundary key={variant}>
        <ErrorBoundaryThrowPage />
      </AppErrorBoundary>
    </div>
  );
}
