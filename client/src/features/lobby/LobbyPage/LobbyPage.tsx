import { Link } from 'react-router-dom';
import { ROOM_IDS } from '@/app/constants.ts';
import { AvatarSelector } from '@/components/AvatarSelector/AvatarSelector.tsx';
import layout from '@/styles/layout.module.css';
import styles from './LobbyPage.css';

export function LobbyPage() {
  return (
    <div className={styles.page}>
      <div className={`${layout.track} ${styles.grid}`}>
        <h1>Select a room</h1>
        <div className={styles.roomCards}>
          {ROOM_IDS.map((id) => (
            <Link key={id} className={styles.roomCard} to={`/room/${id}`}>
              Room {id}
            </Link>
          ))}
        </div>
        <AvatarSelector />
      </div>
    </div>
  );
}
