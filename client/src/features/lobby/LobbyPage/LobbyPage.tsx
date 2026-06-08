import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { whenAvatarPreviewSheetsReady } from '@/game/config/avatars.ts';
import { preloadRoomSharedAssets } from '@/game/config/roomSharedAssets.ts';
import { ROOM_IDS } from '@/app/constants.ts';
import { AvatarSelector } from '@/components/AvatarSelector/AvatarSelector.tsx';
import layout from '@/styles/layout.module.css';
import styles from './LobbyPage.css';

export function LobbyPage() {
  useEffect(() => {
    let cancelled = false;
    void whenAvatarPreviewSheetsReady().then(() => {
      if (!cancelled) void preloadRoomSharedAssets();
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
