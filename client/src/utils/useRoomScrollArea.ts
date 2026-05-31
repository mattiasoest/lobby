import { useLayoutEffect, useState, type RefObject } from 'react';
import { ROOM_VIEW_HEIGHT_MIN_PX, ROOM_VIEW_HEIGHT_PX } from '../components/Canvas/canvasLoaderLayout.ts';

const BOTTOM_MARGIN_PX = 8;
const STACK_GAP_PX = 12;
const PANEL_GAP_PX = 8;

const PLAYER_LIST_MIN_PX = 66;

function viewportHeightPx(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function switcherHeightPx(): number {
  return document.querySelector('.room-switcher-bar')?.getBoundingClientRect().height ?? 0;
}

export type RoomPanelLayout = {
  stackMaxHeightPx: number;
  viewHeightPx: number;
  showPlayerList: boolean;
};

function resolveRoomPanelLayout(stackEl: HTMLElement | null, defaultCanvasHeightPx: number): RoomPanelLayout {
  const stackTop = stackEl?.getBoundingClientRect().top ?? 0;
  const stackMaxHeightPx = Math.max(
    ROOM_VIEW_HEIGHT_MIN_PX,
    Math.floor(viewportHeightPx() - stackTop - BOTTOM_MARGIN_PX),
  );
  const panelMaxPx = stackMaxHeightPx - switcherHeightPx() - STACK_GAP_PX;

  const listFits = panelMaxPx >= defaultCanvasHeightPx + PANEL_GAP_PX + PLAYER_LIST_MIN_PX;

  if (listFits) {
    return {
      stackMaxHeightPx,
      viewHeightPx: defaultCanvasHeightPx,
      showPlayerList: true,
    };
  }

  return {
    stackMaxHeightPx,
    viewHeightPx: Math.max(ROOM_VIEW_HEIGHT_MIN_PX, Math.floor(panelMaxPx)),
    showPlayerList: false,
  };
}

/**
 * Sizes the room panel to the viewport. Shows the in-room player list when the default canvas
 * plus one name row fit; otherwise hides the list and grows the canvas to the bottom of the panel.
 */
export function useRoomPanelLayout(
  stackRef: RefObject<HTMLElement | null>,
  defaultCanvasHeightPx = ROOM_VIEW_HEIGHT_PX,
): RoomPanelLayout {
  const [layout, setLayout] = useState<RoomPanelLayout>(() => ({
    stackMaxHeightPx: ROOM_VIEW_HEIGHT_MIN_PX,
    viewHeightPx: defaultCanvasHeightPx,
    showPlayerList: true,
  }));

  useLayoutEffect(() => {
    const update = () => setLayout(resolveRoomPanelLayout(stackRef.current, defaultCanvasHeightPx));

    update();
    window.addEventListener('resize', update);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);

    const ro = new ResizeObserver(update);
    const stack = stackRef.current;
    const header = document.querySelector('.chrome-header');
    const switcher = document.querySelector('.room-switcher-bar');
    if (stack) ro.observe(stack);
    if (header) ro.observe(header);
    if (switcher) ro.observe(switcher);

    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [stackRef, defaultCanvasHeightPx]);

  return layout;
}
