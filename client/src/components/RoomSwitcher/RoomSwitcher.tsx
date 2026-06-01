import { Link } from 'react-router-dom';
import { ROOM_IDS } from '@/app/constants.ts';
import layout from '@/styles/layout.module.css';
import styles from './RoomSwitcher.css';

export function RoomSwitcher({ roomId }: { roomId: number }) {
  return (
    <div className={`${layout.track} ${styles.bar} room-switcher-bar`}>
      <nav className={styles.switcher} aria-label="Switch room">
        {ROOM_IDS.map((id) => (
          <Link
            key={id}
            to={`/room/${id}`}
            className={`${styles.btn}${id === roomId ? ` ${styles.btnActive}` : ''}`}
            aria-current={id === roomId ? 'page' : undefined}
          >
            Room {id}
          </Link>
        ))}
      </nav>
    </div>
  );
}
