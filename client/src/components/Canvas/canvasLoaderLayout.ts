export type CanvasLoaderLayout = {
  width: number;
  height: number;
};

/** Room view / world grid — keep in sync with {@link RoomPage} and `:root` `--game-frame-width-fallback`. */
export const ROOM_TILE_SIZE = 32;
export const ROOM_VIEW_COLS = 30;
export const ROOM_VIEW_ROWS = 18;
export const ROOM_WORLD_COLS = 48;
export const ROOM_WORLD_ROWS = 32;

/** Default game column width before the canvas frame is measured (viewCols × tile). */
export function roomDefaultFrameWidthPx(): number {
  return ROOM_VIEW_COLS * ROOM_TILE_SIZE;
}

/** Pixel bounds of the Pixi view — shared by Suspense fallback and bootstrap overlay. */
export function canvasViewPixels(tileSize: number, viewCols: number, viewRows: number): CanvasLoaderLayout {
  return { width: viewCols * tileSize, height: viewRows * tileSize };
}
