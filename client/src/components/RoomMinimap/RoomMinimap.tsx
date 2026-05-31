import { useEffect, useRef, type RefObject } from 'react';
import type { RoomCanvasSyncState } from '../../game/core/syncState.ts';
import { Minimap } from '../../game/views/Minimap.ts';
import styles from './RoomMinimap.css';

export type RoomMinimapProps = {
  syncRef: RefObject<RoomCanvasSyncState>;
  /** When false the rAF loop stops (e.g. while the canvas is still bootstrapping). */
  active: boolean;
};

/**
 * Screen-space minimap overlay. Reads {@link RoomCanvasSyncState.minimapSnapshot}, which the Pixi
 * runner updates each tick, and repaints on requestAnimationFrame.
 */
export function RoomMinimap({ syncRef, active }: RoomMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef(new Minimap());

  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    const paint = () => {
      const canvas = canvasRef.current;
      const snapshot = syncRef.current?.minimapSnapshot;
      if (canvas && snapshot) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          minimapRef.current.draw(ctx, snapshot);
        }
      }
      rafId = requestAnimationFrame(paint);
    };

    rafId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafId);
  }, [active, syncRef]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.minimap}
      width={Minimap.DEFAULT_WIDTH}
      height={Minimap.DEFAULT_HEIGHT}
      aria-hidden
    />
  );
}
