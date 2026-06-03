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
