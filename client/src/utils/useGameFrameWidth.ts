import { useLayoutEffect } from 'react';

const FRAME_SELECTOR = '.pixi-canvas-frame';
const VAR_NAME = '--game-frame-width';

/**
 * Publishes the live `.pixi-canvas-frame` width (border included) to
 * `--game-frame-width` on `:root`, so the header, room tabs, and player list can match the
 * canvas's actual rendered width and stay centered with equal left/right spacing.
 */
export function useGameFrameWidth(active: boolean, deps: readonly unknown[]) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty(VAR_NAME);

    if (!active) {
      clear();
      return;
    }

    const frame = document.querySelector<HTMLElement>(FRAME_SELECTOR);
    if (!frame) {
      clear();
      return;
    }

    const sync = () => {
      const w = frame.getBoundingClientRect().width;
      if (w > 0) root.style.setProperty(VAR_NAME, `${Math.round(w)}px`);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(frame);
    return () => {
      ro.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies meaningful deps
  }, deps);
}
