import { Navigate, useParams } from 'react-router-dom';
import { AppErrorScreen } from '@/components/AppErrorScreen/AppErrorScreen.tsx';
import { appErrorScreenPropsFromDetails } from '@/components/AppErrorScreen/appErrorScreenProps.ts';
import { describeAppError } from '@/utils/describeAppError.ts';
import { ErrorPreviewNav } from '@/components/ErrorPreviewNav/ErrorPreviewNav.tsx';
import { errorFixtureFor, isErrorPreviewVariant } from '../errorPreviewFixtures.ts';
import styles from './ErrorPreviewPage.css';

export function ErrorPreviewPage() {
  const { variant } = useParams();

  if (!isErrorPreviewVariant(variant)) {
    return <Navigate to="/dev/errors/preview/chunk" replace />;
  }

  const props = appErrorScreenPropsFromDetails(describeAppError(errorFixtureFor(variant)));

  return (
    <div className={styles.gallery}>
      <ErrorPreviewNav mode="preview" activeVariant={variant} />
      <AppErrorScreen {...props} />
    </div>
  );
}
