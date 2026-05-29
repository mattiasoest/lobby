import type { PlayerDTO } from '../../types.ts';
import type { MinimapSnapshot } from './minimap.ts';

export type RoomCanvasSyncState = {
  players: PlayerDTO[];
  localId: string | null;
  tileSize: number;
  /** Viewport width in pixels (may differ from whole tile columns during resize). */
  viewPixelW: number;
  /** Legacy tile-column estimate; `viewPixelW / tileSize`. */
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
  /** `serverNowMs - Date.now()` from the latest {@link room:clock} event; null until synced. */
  serverClockOffsetMs: number | null;
};

/** Estimated server wall time; falls back to local clock before the first sync. */
export function roomServerTimeMs(syncState: Pick<RoomCanvasSyncState, 'serverClockOffsetMs'>): number {
  const offset = syncState.serverClockOffsetMs;
  return offset === null ? Date.now() : Date.now() + offset;
}

export function createInitialSyncState(): RoomCanvasSyncState {
  return {
    players: [],
    localId: null,
    tileSize: 32,
    viewPixelW: 24 * 32,
    viewCols: 24,
    viewRows: 16,
    worldCols: 48,
    worldRows: 32,
    keysDisabled: false,
    onPositionSync: () => {},
    localSpeechBubble: null,
    remoteSpeechBubbles: new Map(),
    minimapSnapshot: null,
    serverClockOffsetMs: null,
  };
}
