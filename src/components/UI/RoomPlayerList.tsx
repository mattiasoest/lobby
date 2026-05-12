import { useSyncExternalStore } from 'react';
import { PlayerList } from './PlayerList.tsx';
import type { PlayerListPositionStore } from './playerListPositionStore.ts';

export function RoomPlayerList({ store }: { store: PlayerListPositionStore }) {
  const players = useSyncExternalStore(store.subscribe, store.getSnapshot, () => []);
  return <PlayerList players={players} />;
}
