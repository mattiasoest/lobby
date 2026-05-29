/**
 * Canvas loading shell — same component for lazy-chunk Suspense and Pixi init overlay so visuals stay identical.
 * Fills the sized mount host (aspect-ratio layout).
 */
export function CanvasLoadingFallback() {
  return (
    <div
      className="pixi-mount pixi-mount--fallback"
      style={{ width: '100%', height: '100%' }}
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
