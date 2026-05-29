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
  /** Client-authoritative local avatar position; survives view resizes and runner recycle. */
  localPx: { x: number; y: number } | null;
  keysDisabled: boolean;
  onPositionSync: (pos: { x: number; y: number }) => void;
  /** Set by {@link PixiCanvas} when the runner is ready; draws speech in the world layer only. */
  showSpeechBubble?: (playerSocketId: string, text: string) => void;
  /** Clears all speech graphics (e.g. on room switch). */
  clearSpeechBubbles?: () => void;
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
    localPx: null,
    keysDisabled: false,
    onPositionSync: () => {},
    minimapSnapshot: null,
    serverClockOffsetMs: null,
  };
}
