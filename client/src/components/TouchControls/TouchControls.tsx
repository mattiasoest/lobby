import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import touchStyles from './TouchControls.css';

export type TouchControlsProps = {
  /** Normalized joystick vector; x/y in [-1, 1], (0, 0) on release. */
  onMove: (x: number, y: number) => void;
};

/** Max thumb travel from the base center (px); keep in sync with the CSS base/thumb sizes. */
const JOYSTICK_RADIUS_PX = 40;
/** Pushes below this fraction of the radius read as idle so a resting thumb does not drift. */
const DEAD_ZONE = 0.14;

/**
 * Transparent on-screen joystick for touch devices. Drag anywhere inside the pad; the thumb tracks
 * the finger (clamped to a circle) and emits a normalized movement vector to {@link TouchControlsProps.onMove}.
 */
export function TouchControls({ onMove }: TouchControlsProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);

  const setThumb = useCallback((dx: number, dy: number) => {
    const thumb = thumbRef.current;
    if (thumb) thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS_PX) {
        dx = (dx / dist) * JOYSTICK_RADIUS_PX;
        dy = (dy / dist) * JOYSTICK_RADIUS_PX;
      }
      setThumb(dx, dy);

      let nx = dx / JOYSTICK_RADIUS_PX;
      let ny = dy / JOYSTICK_RADIUS_PX;
      if (Math.hypot(nx, ny) < DEAD_ZONE) {
        nx = 0;
        ny = 0;
      }
      onMove(nx, ny);
    },
    [onMove, setThumb],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== null) return;
      activePointerRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromPoint(e.clientX, e.clientY);
    },
    [updateFromPoint],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== e.pointerId) return;
      updateFromPoint(e.clientX, e.clientY);
    },
    [updateFromPoint],
  );

  const release = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== e.pointerId) return;
      activePointerRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setThumb(0, 0);
      onMove(0, 0);
    },
    [onMove, setThumb],
  );

  return (
    <div
      ref={baseRef}
      className={touchStyles.root}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      aria-hidden
    >
      <div ref={thumbRef} className={touchStyles.thumb} />
    </div>
  );
}
