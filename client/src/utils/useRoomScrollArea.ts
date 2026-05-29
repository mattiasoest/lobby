import { useLayoutEffect, useState, type RefObject } from 'react';
import { ROOM_VIEW_ROWS, ROOM_VIEW_ROWS_MIN } from '../components/Canvas/canvasLoaderLayout.ts';

const BOTTOM_MARGIN_PX = 8;
const MIN_PANEL_PX = 200;
const STACK_GAP_PX = 12;
const PANEL_GAP_PX = 8;
/** Fixed chrome above `.player-list__names` (title, border, padding). */
const PLAYER_LIST_CHROME_PX = 44;
/** ~one list row at 18px/150% line-height. */
const PLAYER_ROW_PX = 27;
const PLAYER_ROW_GAP_PX = 8;
const MIN_VISIBLE_PLAYERS = 1;

const MIN_PLAYER_LIST_NAMES_PX = MIN_VISIBLE_PLAYERS * PLAYER_ROW_PX + (MIN_VISIBLE_PLAYERS - 1) * PLAYER_ROW_GAP_PX;
const MIN_PLAYER_LIST_BLOCK_PX = PLAYER_LIST_CHROME_PX + MIN_PLAYER_LIST_NAMES_PX;

function viewportHeightPx(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

export function measureRoomPanelMaxHeight(stackEl: HTMLElement | null): number {
  if (!stackEl) return MIN_PANEL_PX;
  const top = stackEl.getBoundingClientRect().top;
  const available = viewportHeightPx() - top - BOTTOM_MARGIN_PX;
  return Math.max(MIN_PANEL_PX, Math.floor(available));
}

export type RoomPanelLayout = {
  stackMaxHeightPx: number;
  viewRows: number;
  showPlayerList: boolean;
};

function resolveRoomPanelLayout(stackEl: HTMLElement | null, tileSize: number, fullViewRows: number): RoomPanelLayout {
  const stackMaxHeightPx = measureRoomPanelMaxHeight(stackEl);
  const switcher = document.querySelector('.room-switcher-bar');
  const switcherH = switcher?.getBoundingClientRect().height ?? 0;
  const panelMaxPx = stackMaxHeightPx - switcherH - STACK_GAP_PX;
  const fullCanvasPx = fullViewRows * tileSize;

  const listSpacePx = panelMaxPx - fullCanvasPx - PANEL_GAP_PX;
  const showPlayerList = listSpacePx >= MIN_PLAYER_LIST_BLOCK_PX;

  if (fullCanvasPx <= panelMaxPx) {
    return { stackMaxHeightPx, viewRows: fullViewRows, showPlayerList };
  }

  const rows = Math.max(ROOM_VIEW_ROWS_MIN, Math.min(fullViewRows, Math.floor(panelMaxPx / tileSize)));
  return { stackMaxHeightPx, viewRows: rows, showPlayerList: false };
}

/**
 * Caps the in-room column to the viewport. Keeps the full canvas when it fits; shows the player
 * list only if at least one name fits below it, otherwise hides the list entirely (no canvas
 * shrink for the list).
 */
export function useRoomPanelLayout(
  stackRef: RefObject<HTMLElement | null>,
  tileSize: number,
  fullViewRows = ROOM_VIEW_ROWS,
): RoomPanelLayout {
  const [layout, setLayout] = useState<RoomPanelLayout>(() => ({
    stackMaxHeightPx: MIN_PANEL_PX,
    viewRows: fullViewRows,
    showPlayerList: true,
  }));

  useLayoutEffect(() => {
    const update = () => setLayout(resolveRoomPanelLayout(stackRef.current, tileSize, fullViewRows));

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
  }, [stackRef, tileSize, fullViewRows]);

  return layout;
}
