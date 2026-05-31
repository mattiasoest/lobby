import { useRouteError } from 'react-router-dom';
import { reloadApp } from '../../utils/chunkLoadError.ts';
import { AppErrorScreen } from './AppErrorScreen.tsx';
import { describeAppError } from './describeAppError.ts';

export function RouteErrorPage() {
  const error = useRouteError();
  const details = describeAppError(error);

  return (
    <AppErrorScreen
      title={details.title}
      message={details.message}
      primaryAction={{
        label: details.isChunkLoad ? 'Refresh page' : 'Try again',
        onClick: reloadApp,
      }}
      secondaryAction={{
        label: 'Go to lobby',
        onClick: () => {
          window.location.assign('/lobby');
        },
      }}
    />
  );
}
