import type { ComponentProps } from 'react';
import { reloadApp } from '@/utils/chunkLoadError.ts';
import type { AppErrorDetails } from '@/utils/describeAppError.ts';
import type { AppErrorScreen } from './AppErrorScreen.tsx';

type AppErrorScreenProps = ComponentProps<typeof AppErrorScreen>;

export function appErrorScreenPropsFromDetails(details: AppErrorDetails): AppErrorScreenProps {
  return {
    title: details.title,
    message: details.message,
    primaryAction: {
      label: details.isChunkLoad ? 'Refresh page' : 'Try again',
      onClick: reloadApp,
    },
    secondaryAction: {
      label: 'Go to lobby',
      onClick: () => {
        window.location.assign('/lobby');
      },
    },
  };
}
