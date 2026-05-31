import { Link } from 'react-router-dom';
import { useRef, type ReactNode } from 'react';
import { APP_NAME } from '@/app/config.ts';
import { useAuth } from '@/app/authContext.tsx';
import layout from '@/styles/layout.module.css';
import { useGameFrameWidth } from '@/utils/useGameFrameWidth.ts';
import styles from './AppChrome.css';

export function AppChrome({ children }: { children: ReactNode }) {
  const { logout, username } = useAuth();
  const frameTrackRef = useRef<HTMLElement>(null);
  useGameFrameWidth(frameTrackRef);

  return (
    <div className={styles.root}>
      <div className={layout.gameColumn}>
        <header className={`${layout.track} ${styles.header} chrome-header`}>
          <Link to="/lobby" className={styles.brand}>
            {APP_NAME}
          </Link>
          <div className={styles.user}>{username ?? 'Player'}</div>
          <button type="button" className={styles.logout} onClick={logout}>
            Log out
          </button>
        </header>
        <main ref={frameTrackRef} className={styles.body}>
          {children}
        </main>
      </div>
    </div>
  );
}
