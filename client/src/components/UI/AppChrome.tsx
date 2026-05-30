import { Link } from 'react-router-dom';
import { useRef, type ReactNode } from 'react';
import { APP_NAME } from '../../app/config.ts';
import { useAuth } from '../../app/authContext.tsx';
import { useGameFrameWidth } from '../../utils/useGameFrameWidth.ts';

export function AppChrome({ children }: { children: ReactNode }) {
  const { logout, username } = useAuth();
  const frameTrackRef = useRef<HTMLElement>(null);
  useGameFrameWidth(frameTrackRef);

  return (
    <div className="chrome">
      <div className="game-column">
        <header className="chrome-header">
          <Link to="/lobby" className="chrome-brand">
            {APP_NAME}
          </Link>
          <div className="chrome-user">{username ?? 'Player'}</div>
          <button type="button" className="chrome-logout" onClick={logout}>
            Log out
          </button>
        </header>
        <main ref={frameTrackRef} className="chrome-body">
          {children}
        </main>
      </div>
    </div>
  );
}
