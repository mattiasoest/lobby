import { Navigate, useParams } from 'react-router-dom';
import { AppErrorBoundary } from '../../components/UI/AppErrorBoundary.tsx';
import { ErrorPreviewNav } from './ErrorPreviewNav.tsx';
import { errorFixtureFor, isErrorPreviewVariant } from './errorPreviewFixtures.ts';

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
    <div className="dev-error-gallery">
      <ErrorPreviewNav mode="boundary" activeVariant={variant} />
      <AppErrorBoundary key={variant}>
        <ErrorBoundaryThrowPage />
      </AppErrorBoundary>
    </div>
  );
}
