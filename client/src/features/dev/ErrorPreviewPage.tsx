import { Navigate, useParams } from 'react-router-dom';
import { AppErrorScreen } from '../../components/UI/AppErrorScreen.tsx';
import { appErrorScreenPropsFromDetails } from '../../components/UI/appErrorScreenProps.ts';
import { describeAppError } from '../../components/UI/describeAppError.ts';
import { ErrorPreviewNav } from './ErrorPreviewNav.tsx';
import { errorFixtureFor, isErrorPreviewVariant } from './errorPreviewFixtures.ts';

export function ErrorPreviewPage() {
  const { variant } = useParams();

  if (!isErrorPreviewVariant(variant)) {
    return <Navigate to="/dev/errors/preview/chunk" replace />;
  }

  const props = appErrorScreenPropsFromDetails(describeAppError(errorFixtureFor(variant)));

  return (
    <div className="dev-error-gallery">
      <ErrorPreviewNav mode="preview" activeVariant={variant} />
      <AppErrorScreen {...props} />
    </div>
  );
}
