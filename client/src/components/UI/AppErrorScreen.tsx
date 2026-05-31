import { APP_NAME } from '../../app/config.ts';

type AppErrorAction = {
  label: string;
  onClick: () => void;
};

type AppErrorScreenProps = {
  title: string;
  message: string;
  primaryAction: AppErrorAction;
  secondaryAction?: AppErrorAction;
};

export function AppErrorScreen({ title, message, primaryAction, secondaryAction }: AppErrorScreenProps) {
  return (
    <div className="auth-page app-error-page">
      <div className="app-error-shell">
        <p className="app-error-kicker">{APP_NAME}</p>
        <h1 className="app-error-title">{title}</h1>
        <p className="app-error-message">{message}</p>
        <div className="app-error-actions">
          <button type="button" className="app-error-btn app-error-btn--primary" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
          {secondaryAction ? (
            <button type="button" className="app-error-btn app-error-btn--secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
