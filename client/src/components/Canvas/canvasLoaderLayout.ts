export type CanvasLoaderLayout = {
  width: number;
  height: number;
};

/** Pixel bounds of the Pixi view — shared by Suspense fallback and bootstrap overlay. */
export function canvasViewPixels(tileSize: number, viewCols: number, viewRows: number): CanvasLoaderLayout {
  return { width: viewCols * tileSize, height: viewRows * tileSize };
}
