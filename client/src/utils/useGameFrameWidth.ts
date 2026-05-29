import { useLayoutEffect, type RefObject } from 'react';
import { measureGameFrameTrackWidthPx, publishGameFrameWidthPx } from './gameFrameLayout.ts';

/**
 * Publishes the live game-column track width to `--game-frame-width` on `:root`, so the header,
 * lobby, room tabs, and player list match the canvas host before the room canvas mounts.
 */
export function useGameFrameWidth(trackRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const sync = () => {
      publishGameFrameWidthPx(measureGameFrameTrackWidthPx(track));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(track);
    window.addEventListener('resize', sync);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      vv?.removeEventListener('resize', sync);
    };
  }, [trackRef]);
}
