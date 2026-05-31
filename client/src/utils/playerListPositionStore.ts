import type { PlayerDTO } from '@/types.ts';

export type PlayerListPositionStore = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => PlayerDTO[];
};

export function createPlayerListPositionStore(): PlayerListPositionStore & {
  publish: (players: PlayerDTO[]) => void;
} {
  let snapshot: PlayerDTO[] = [];
  const listeners = new Set<() => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot() {
      return snapshot;
    },
    publish(next) {
      snapshot = next;
      for (const l of listeners) l();
    },
  };
}
