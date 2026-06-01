import styles from './LoadingIndicatorFallback.css';

type LoadingIndicatorFallbackProps = {
  overlay?: boolean;
  /** Loader only — for panels that already provide their own frame (e.g. avatar selector). */
  inline?: boolean;
  label?: string;
  ariaLabel?: string;
};

/**
 * Shared loading shell for lazy-chunk Suspense, Pixi init overlay, and inline panel fallbacks.
 * Fills the sized mount host (aspect-ratio layout) unless `inline` is set.
 */
export function LoadingIndicatorFallback({
  overlay = false,
  inline = false,
  label = 'Loading canvas…',
  ariaLabel = 'Loading room canvas',
}: LoadingIndicatorFallbackProps) {
  const loader = (
    <div className={styles.loader}>
      <div className={styles.loaderRings} aria-hidden>
        <span className={`${styles.loaderRing} ${styles.loaderRingTrack}`} />
        <span className={`${styles.loaderRing} ${styles.loaderRingSpin}`} />
      </div>
      <p className={`${styles.loaderLabel} muted`}>{label}</p>
    </div>
  );

  if (inline) {
    return (
      <div className={styles.inlineShell} aria-busy="true" aria-live="polite" aria-label={ariaLabel}>
        {loader}
      </div>
    );
  }

  return (
    <div
      className={[styles.mountFallback, overlay ? styles.mountFallbackOverlay : ''].filter(Boolean).join(' ')}
      style={{ width: '100%', height: '100%' }}
      aria-busy="true"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      {loader}
    </div>
  );
}
