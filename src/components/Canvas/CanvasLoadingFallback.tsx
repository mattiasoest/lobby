import type { CanvasLoaderLayout } from './canvasLoaderLayout.ts';

export type CanvasLoadingFallbackProps = CanvasLoaderLayout;

/**
 * Canvas loading shell — same component for lazy-chunk Suspense and Pixi init overlay so visuals stay identical.
 */
export function CanvasLoadingFallback({ width, height }: CanvasLoadingFallbackProps) {
  return (
    <div
      className="pixi-mount pixi-mount--fallback"
      style={{ width, height }}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading room canvas"
    >
      <div className="pixi-canvas-loader">
        <div className="pixi-canvas-loader__rings" aria-hidden>
          <span className="pixi-canvas-loader__ring pixi-canvas-loader__ring--track" />
          <span className="pixi-canvas-loader__ring pixi-canvas-loader__ring--spin" />
        </div>
        <p className="pixi-canvas-loader__label muted">Loading canvas…</p>
      </div>
    </div>
  );
}
