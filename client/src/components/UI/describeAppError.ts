import { isRouteErrorResponse } from 'react-router-dom';
import { isChunkLoadError } from '../../utils/chunkLoadError.ts';

export type AppErrorDetails = {
  title: string;
  message: string;
  isChunkLoad: boolean;
};

export function describeAppError(error: unknown): AppErrorDetails {
  if (isChunkLoadError(error)) {
    return {
      title: 'New version available',
      message:
        'The app was updated while this tab was open. Refresh to load the latest version and continue where you left off.',
      isChunkLoad: true,
    };
  }

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        title: 'Page not found',
        message: "That route doesn't exist. Head back to the lobby and pick a room from there.",
        isChunkLoad: false,
      };
    }

    return {
      title: 'Something went wrong',
      message: error.statusText || 'An unexpected error occurred while loading this page.',
      isChunkLoad: false,
    };
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return {
    title: 'Something went wrong',
    message,
    isChunkLoad: false,
  };
}
