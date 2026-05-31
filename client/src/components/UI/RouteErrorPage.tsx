import { useRouteError } from 'react-router-dom';
import { AppErrorScreen } from './AppErrorScreen.tsx';
import { appErrorScreenPropsFromDetails } from './appErrorScreenProps.ts';
import { describeAppError } from './describeAppError.ts';

export function RouteErrorPage() {
  const error = useRouteError();

  return <AppErrorScreen {...appErrorScreenPropsFromDetails(describeAppError(error))} />;
}
