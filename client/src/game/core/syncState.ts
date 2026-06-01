import type { PlayerDTO } from '../../types.ts';
import type { MinimapSnapshot } from '../views/Minimap.ts';

export type RoomCanvasSyncState = {
  players: PlayerDTO[];
  localId: string | null;
  tileSize: number;
  /** Viewport width in pixels (may differ from the default view width during resize). */
  viewPixelW: number;
  /** Viewport height in pixels (may shrink when the panel is shorter than the default view). */
  viewPixelH: number;
  worldCols: number;
  worldRows: number;
  /** Client-authoritative local avatar position; survives view resizes and game recycle. */
  localPx: { x: number; y: number } | null;
  keysDisabled: boolean;
  onPositionSync: (pos: { x: number; y: number }) => void;
  /** Set by {@link PixiCanvas} when the game is ready; draws speech in the world layer only. */
  showSpeechBubble?: (playerSocketId: string, text: string) => void;
  /** Speech bubble above the room ChatNpc (not keyed to player roster). */
  showChatNpcSpeechBubble?: (text: string) => void;
  /** Fired when the room ChatNpc is tapped on the canvas. */
  onChatNpcTap?: () => void;
  /** Clears all speech graphics (e.g. on room switch). */
  clearSpeechBubbles?: () => void;
  /** Updated each Pixi tick by {@link Game}; read by the minimap overlay. */
  minimapSnapshot: MinimapSnapshot | null;
  /** `serverNowMs - Date.now()` from the latest {@link room:clock} event; null until synced. */
  serverClockOffsetMs: number | null;
  /**
   * Server send time (Date.now, ms) of the latest `players:update`. The ticker stamps remote
   * samples with this so interpolation replays true server spacing instead of arrival jitter.
   * 0 before the first timestamped snapshot.
   */
  playersServerStampMs: number;
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
    viewPixelW: 960,
    viewPixelH: 576,
    worldCols: 48,
    worldRows: 32,
    localPx: null,
    keysDisabled: false,
    onPositionSync: () => {},
    minimapSnapshot: null,
    serverClockOffsetMs: null,
    playersServerStampMs: 0,
  };
}
