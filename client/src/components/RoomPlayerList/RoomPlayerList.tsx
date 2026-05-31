import { useSyncExternalStore } from 'react';
import { PlayerList } from '@/components/PlayerList/PlayerList.tsx';
import type { PlayerListPositionStore } from '@/utils/playerListPositionStore.ts';

export function RoomPlayerList({ store, className }: { store: PlayerListPositionStore; className?: string }) {
  const players = useSyncExternalStore(store.subscribe, store.getSnapshot, () => []);
  return <PlayerList players={players} className={className} />;
}
