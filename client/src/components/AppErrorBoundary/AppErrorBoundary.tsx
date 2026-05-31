import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reloadApp } from '@/utils/chunkLoadError.ts';
import { AppErrorScreen } from '@/components/AppErrorScreen/AppErrorScreen.tsx';
import { describeAppError } from '@/utils/describeAppError.ts';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: unknown;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('App error boundary caught an error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const details = describeAppError(error);

    return (
      <AppErrorScreen
        title={details.title}
        message={details.message}
        primaryAction={{
          label: details.isChunkLoad ? 'Refresh page' : 'Try again',
          onClick: details.isChunkLoad ? reloadApp : this.reset,
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
}
