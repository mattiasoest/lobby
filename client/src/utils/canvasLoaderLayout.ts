export type CanvasLoaderLayout = {
  width: number;
  height: number;
};

/** Room view / world grid — keep in sync with {@link RoomPage} and `:root` `--game-frame-width-fallback`. */
export const ROOM_TILE_SIZE = 32;
export const ROOM_VIEW_WIDTH_PX = 960;
export const ROOM_VIEW_HEIGHT_PX = 576;
/** Minimum canvas height when the panel is shorter than the default view. */
export const ROOM_VIEW_HEIGHT_MIN_PX = 320;
export const ROOM_WORLD_COLS = 48;
export const ROOM_WORLD_ROWS = 32;

/** Default game column width before the canvas frame is measured. */
export function roomDefaultFrameWidthPx(): number {
  return ROOM_VIEW_WIDTH_PX;
}

/** Pixel bounds of the Pixi view — shared by Suspense fallback and bootstrap overlay. */
export function roomCanvasViewLayout(viewHeightPx: number): CanvasLoaderLayout {
  return { width: ROOM_VIEW_WIDTH_PX, height: viewHeightPx };
}
