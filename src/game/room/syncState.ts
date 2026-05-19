import type { PlayerDTO } from '../../types.ts';
import type { MinimapSnapshot } from './Minimap.ts';

export type RoomCanvasSyncState = {
  players: PlayerDTO[];
  localId: string | null;
  tileSize: number;
  viewCols: number;
  viewRows: number;
  worldCols: number;
  worldRows: number;
  keysDisabled: boolean;
  onPositionSync: (pos: { x: number; y: number }) => void;
  localSpeechBubble: string | null;
  remoteSpeechBubbles: ReadonlyMap<string, string>;
  /** Updated each Pixi tick by {@link RoomPixiRunner}; read by the minimap overlay. */
  minimapSnapshot: MinimapSnapshot | null;
};

export function createInitialSyncState(): RoomCanvasSyncState {
  return {
    players: [],
    localId: null,
    tileSize: 32,
    viewCols: 24,
    viewRows: 16,
    worldCols: 48,
    worldRows: 32,
    keysDisabled: false,
    onPositionSync: () => {},
    localSpeechBubble: null,
    remoteSpeechBubbles: new Map(),
    minimapSnapshot: null,
  };
}
