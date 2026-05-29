import { ROOM_TILE_SIZE, ROOM_WORLD_COLS } from '../components/Canvas/canvasLoaderLayout.ts';

export const GAME_FRAME_WIDTH_VAR = '--game-frame-width';

/** Horizontal track width for header, lobby, room tabs, and canvas host (content box, no clamp). */
export function measureGameFrameTrackWidthPx(hostEl: HTMLElement): number {
  const style = getComputedStyle(hostEl);
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  return Math.max(0, Math.round(hostEl.clientWidth - padX));
}

/** Pixi view width — same cap as {@link PixiCanvas} uses for the WebGL surface. */
export function clampGameViewWidthPx(
  availablePx: number,
  tileSize = ROOM_TILE_SIZE,
  worldCols = ROOM_WORLD_COLS,
): number {
  const maxW = worldCols * tileSize;
  if (availablePx < 1) return 1;
  return Math.min(maxW, Math.round(availablePx));
}

export function publishGameFrameWidthPx(widthPx: number): void {
  if (widthPx <= 0) return;
  document.documentElement.style.setProperty(GAME_FRAME_WIDTH_VAR, `${widthPx}px`);
}
