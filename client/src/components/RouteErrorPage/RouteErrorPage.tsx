import { useRouteError } from 'react-router-dom';
import { AppErrorScreen } from '@/components/AppErrorScreen/AppErrorScreen.tsx';
import { appErrorScreenPropsFromDetails } from '@/components/AppErrorScreen/appErrorScreenProps.ts';
import { describeAppError } from '@/utils/describeAppError.ts';

export function RouteErrorPage() {
  const error = useRouteError();

  return <AppErrorScreen {...appErrorScreenPropsFromDetails(describeAppError(error))} />;
}
