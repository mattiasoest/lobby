import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../app/authContext.tsx';

export function AppChrome({ children }: { children: ReactNode }) {
  const { logout, username } = useAuth();
  return (
    <div className="chrome">
      <div className="game-column">
        <header className="chrome-header">
          <Link to="/lobby" className="chrome-brand">
            Lobby
          </Link>
          <div className="chrome-user">{username ?? 'Player'}</div>
          <button type="button" className="chrome-logout" onClick={logout}>
            Log out
          </button>
        </header>
        <main className="chrome-body">{children}</main>
      </div>
    </div>
  );
}
