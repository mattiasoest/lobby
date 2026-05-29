import { useLayoutEffect } from 'react';

const FRAME_SELECTOR = '.pixi-canvas-frame';
const VAR_NAME = '--game-frame-width';

/**
 * Publishes the live `.pixi-canvas-frame` width (border included) to
 * `--game-frame-width` on `:root`, so the header, room tabs, and player list can match the
 * canvas's actual rendered width and stay centered with equal left/right spacing.
 */
export function useGameFrameWidth(active: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const frame = document.querySelector<HTMLElement>(FRAME_SELECTOR);
      if (!frame) return;
      const w = frame.getBoundingClientRect().width;
      if (w > 0) root.style.setProperty(VAR_NAME, `${Math.round(w)}px`);
    };

    if (!active) return;

    sync();
    const ro = new ResizeObserver(sync);
    const frame = document.querySelector<HTMLElement>(FRAME_SELECTOR);
    if (frame) ro.observe(frame);
    return () => ro.disconnect();
  }, [active]);
}
