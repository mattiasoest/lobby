import styles from './CanvasLoadingFallback.css';

/**
 * Canvas loading shell — same component for lazy-chunk Suspense and Pixi init overlay so visuals stay identical.
 * Fills the sized mount host (aspect-ratio layout).
 */
export function CanvasLoadingFallback({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      className={[styles.mountFallback, overlay ? styles.mountFallbackOverlay : ''].filter(Boolean).join(' ')}
      style={{ width: '100%', height: '100%' }}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading room canvas"
    >
      <div className={styles.loader}>
        <div className={styles.loaderRings} aria-hidden>
          <span className={`${styles.loaderRing} ${styles.loaderRingTrack}`} />
          <span className={`${styles.loaderRing} ${styles.loaderRingSpin}`} />
        </div>
        <p className={`${styles.loaderLabel} muted`}>Loading canvas…</p>
      </div>
    </div>
  );
}
