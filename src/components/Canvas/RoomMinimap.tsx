import { useEffect, useRef, type RefObject } from 'react';
import { drawMinimap, MINIMAP_HEIGHT, MINIMAP_WIDTH } from '../../game/room/minimap.ts';
import type { RoomCanvasSyncState } from '../../game/room/syncState.ts';

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

  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    const paint = () => {
      const canvas = canvasRef.current;
      const snapshot = syncRef.current?.minimapSnapshot;
      if (canvas && snapshot) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawMinimap(ctx, snapshot, MINIMAP_WIDTH, MINIMAP_HEIGHT);
        }
      }
      rafId = requestAnimationFrame(paint);
    };

    rafId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafId);
  }, [active, syncRef]);

  return <canvas ref={canvasRef} className="room-minimap" width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} aria-hidden />;
}
