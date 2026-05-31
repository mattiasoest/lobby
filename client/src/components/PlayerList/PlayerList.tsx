import type { PlayerDTO } from '@/types.ts';
import layout from '@/styles/layout.module.css';
import styles from './PlayerList.css';

export function PlayerList({ players, className }: { players: PlayerDTO[]; className?: string }) {
  return (
    <aside className={[layout.track, styles.root, className].filter(Boolean).join(' ')}>
      <h3 className={styles.title}>In room ({players.length})</h3>
      <div className={styles.names}>
        <ul>
          {players.map((player) => (
            <li key={player.id}>
              {player.username}{' '}
              <small className="muted">
                ({Math.round(player.x)}, {Math.round(player.y)})
              </small>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
