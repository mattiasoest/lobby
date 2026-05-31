import { APP_NAME } from '@/app/config.ts';
import authPage from '@/styles/authPage.module.css';
import styles from './AppErrorScreen.css';

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
    <div className={`${authPage.page} ${styles.errorPage}`}>
      <div className={styles.shell}>
        <p className={styles.kicker}>{APP_NAME}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
          {secondaryAction ? (
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
