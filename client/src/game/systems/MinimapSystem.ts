import { avatarMinimapColor } from '../config/avatars.ts';
import type { RoomCanvasSyncState } from '../core/syncState.ts';
import type { MinimapSnapshot } from '../views/Minimap.ts';
import type { Viewport } from '../types.ts';
import type { AnimalSystem } from './AnimalSystem.ts';
import type { ChatNpcSystem } from './ChatNpcSystem.ts';

export class MinimapSystem {
  write(
    syncState: RoomCanvasSyncState,
    localPx: { x: number; y: number },
    remotePx: Map<string, { x: number; y: number }>,
    viewport: Viewport,
    worldW: number,
    worldH: number,
    size: number,
    animalSystem: AnimalSystem,
    chatNpcSystem: ChatNpcSystem,
  ): void {
    const { players, localId } = syncState;
    const avatarCenter = (topLeftX: number, topLeftY: number) => ({
      x: topLeftX + size / 2,
      y: topLeftY + size / 2,
    });

    const minimapPlayers = [];
    for (const player of players) {
      const isLocalPlayer = !!localId && player.id === localId;
      const pos = isLocalPlayer ? localPx : remotePx.get(player.id);
      if (!pos) continue;
      const center = avatarCenter(pos.x, pos.y);
      minimapPlayers.push({
        id: player.id,
        x: center.x,
        y: center.y,
        color: avatarMinimapColor(player.avatarId),
        isLocal: isLocalPlayer,
      });
    }

    syncState.minimapSnapshot = {
      worldW,
      worldH,
      viewport: { x: viewport.left, y: viewport.top, w: viewport.w, h: viewport.h },
      players: minimapPlayers,
      animals: animalSystem.getMinimapAnimals(size),
      chatNpc: chatNpcSystem.getMinimapChatNpc(),
    } satisfies MinimapSnapshot;
    syncState.localPx = { x: localPx.x, y: localPx.y };
  }
}
