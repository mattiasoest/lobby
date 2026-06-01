import type { RoomCanvasSyncState } from './core/syncState.ts';

export type GameDimensions = {
  tileSize: number;
  viewPixelW: number;
  viewPixelH: number;
  worldCols: number;
  worldRows: number;
};

export type GameOptions = {
  mount: HTMLElement;
  syncRef: { current: RoomCanvasSyncState };
  dimensions: GameDimensions;
  worldSpawnPx: { x: number; y: number };
  roomId: number;
  /** Resolved room background asset URL (e.g. Vite import). */
  backgroundTextureSrc: string;
  /** Character spritesheet URLs keyed by avatar id (Vite imports). */
  characterTextureSrcByAvatarId: Record<string, { idle: string; walk: string }>;
  /** Animal spritesheet URLs (Vite imports). */
  animalTextureSrc: {
    bull: string;
    cow: string;
    deer: { idle: string; walk: string };
  };
  /** Merchant stall spritesheet URL for room ChatNpc (Vite import). */
  merchantTextureSrc: string;
  onBootstrapComplete?: () => void;
};

export type FrameContext = {
  now: number;
  dt: number;
  dtMs: number;
  dtSec: number;
  roomNowMs: number;
  syncState: RoomCanvasSyncState;
  tileSize: number;
  worldCols: number;
  worldRows: number;
  viewPixelW: number;
  viewPixelH: number;
  localId: string | null;
  pad: number;
  size: number;
  worldW: number;
  worldH: number;
  viewW: number;
  viewH: number;
};

export type Viewport = {
  left: number;
  top: number;
  w: number;
  h: number;
};

export type MoveVector = {
  vx: number;
  vy: number;
  len: number;
};

export type MovementResult = {
  startedMove: boolean;
  stoppedMove: boolean;
  pushedByCollision: boolean;
  len: number;
};
