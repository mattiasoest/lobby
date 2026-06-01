import desertBg from '@/assets/bg/desert.jpg';
import grassBg from '@/assets/bg/grass.jpg';
import spaceBg from '@/assets/bg/space.jpg';
import snowBg from '@/assets/bg/snow.jpg';
import bullSpriteSrc from '@/assets/entities/bull/bull.png';
import cowSpriteSrc from '@/assets/entities/cow/cow.png';
import deerIdleSpriteSrc from '@/assets/entities/deer/deer_idle.png';
import deerWalkSpriteSrc from '@/assets/entities/deer/deer_walk.png';
import merchantSpriteSrc from '@/assets/entities/merchant/merchant.png';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Game } from '../../game/Game.ts';
import type { RoomCanvasSyncState } from '../../game/core/syncState.ts';
import { AVATAR_CHARACTER_TEXTURES } from '../../game/config/avatars.ts';
import { backgroundTextureSrcForRoomId } from '../../game/config/roomBackground.ts';
import { TouchControls } from '@/components/TouchControls/TouchControls.tsx';
import { useIsTouchDevice } from '@/utils/useIsTouchDevice.ts';
import { clampGameViewWidthPx } from '@/utils/gameFrameLayout.ts';
import { ROOM_VIEW_WIDTH_PX } from '@/utils/canvasLoaderLayout.ts';
import type { PlayerDTO } from '@/types.ts';
import canvasStyles from './canvas.module.css';

const MIN_VIEW_WIDTH_PX = 1;

export type PixiCanvasProps = {
  /** Shared with {@link RoomPage}: socket updates `players` here; React props are for structure/rebuilds only. */
  syncRef: RefObject<RoomCanvasSyncState>;
  tileSize: number;
  viewHeightPx: number;
  worldCols: number;
  worldRows: number;
  worldSpawnPx: { x: number; y: number };
  players: PlayerDTO[];
  localId: string | null;
  roomId: number;
  keysDisabled?: boolean;
  onPositionSync: (pos: { x: number; y: number }) => void;
  /** Fires when the WebGL game finishes bootstrap or tears down (recreates game). */
  onCanvasReady?: (ready: boolean) => void;
};

function clampViewWidthPx(availablePx: number, tileSize: number, worldCols: number): number {
  if (availablePx < MIN_VIEW_WIDTH_PX) return MIN_VIEW_WIDTH_PX;
  return clampGameViewWidthPx(availablePx, tileSize, worldCols);
}

/**
 * React mount + prop sync for the room Pixi stack. Game loop and scene graph live in {@link Game}.
 */
const PixiCanvasInner = memo(function PixiCanvas({
  syncRef,
  tileSize,
  viewHeightPx,
  worldCols,
  worldRows,
  worldSpawnPx,
  players,
  localId,
  keysDisabled,
  onPositionSync,
  roomId,
  onCanvasReady,
}: PixiCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const prevRoomIdRef = useRef(roomId);
  const [layoutViewWidthPx, setLayoutViewWidthPx] = useState(() => ROOM_VIEW_WIDTH_PX);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    const host = mount?.closest('.pixi-mount-host') ?? mount?.parentElement;
    if (!host) return;

    const measure = () => {
      const style = getComputedStyle(host);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const aw = Math.max(0, host.clientWidth - padX);
      const w = clampViewWidthPx(aw, tileSize, worldCols);
      setLayoutViewWidthPx((prev) => (prev === w ? prev : w));
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => ro.disconnect();
  }, [tileSize, worldCols]);

  useLayoutEffect(() => {
    const syncState = syncRef.current;
    if (!syncState) return;
    // `players` is owned by RoomPage's socket handler for live coords — do not overwrite here.
    syncState.localId = localId;
    syncState.tileSize = tileSize;
    syncState.viewPixelW = layoutViewWidthPx;
    syncState.viewPixelH = viewHeightPx;
    syncState.worldCols = worldCols;
    syncState.worldRows = worldRows;
    syncState.keysDisabled = keysDisabled ?? false;
    syncState.onPositionSync = onPositionSync;
  }, [syncRef, localId, tileSize, layoutViewWidthPx, viewHeightPx, worldCols, worldRows, keysDisabled, onPositionSync]);

  const playerLayerSig = useMemo(
    () =>
      players
        .map((player) => JSON.stringify([player.id, player.username, player.avatarId]))
        .sort()
        .join('|'),
    [players],
  );

  const [canvasReady, setCanvasReady] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  useEffect(() => {
    const syncState = syncRef.current;
    const game = gameRef.current;
    if (!canvasReady || !game) {
      syncState.showSpeechBubble = undefined;
      syncState.clearSpeechBubbles = undefined;
      return;
    }
    syncState.showSpeechBubble = (playerSocketId, text) => {
      game.showSpeechBubble(playerSocketId, text);
    };
    syncState.clearSpeechBubbles = () => {
      game.clearSpeechBubbles();
    };
    return () => {
      syncState.showSpeechBubble = undefined;
      syncState.clearSpeechBubbles = undefined;
    };
  }, [canvasReady, syncRef]);

  const handleMoveVector = useCallback((x: number, y: number) => {
    gameRef.current?.setMoveVector(x, y);
  }, []);

  // Only view/world dimensions recreate Pixi; spawn is handled by applyRoomSpawn.
  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;
    const game = new Game({
      mount,
      syncRef,
      dimensions: { tileSize, viewPixelW: layoutViewWidthPx, viewPixelH: viewHeightPx, worldCols, worldRows },
      worldSpawnPx,
      roomId,
      backgroundTextureSrc: backgroundTextureSrcForRoomId(roomId, grassBg, spaceBg, desertBg, snowBg),
      characterTextureSrcByAvatarId: AVATAR_CHARACTER_TEXTURES,
      animalTextureSrc: {
        bull: bullSpriteSrc,
        cow: cowSpriteSrc,
        deer: { idle: deerIdleSpriteSrc, walk: deerWalkSpriteSrc },
      },
      merchantTextureSrc: merchantSpriteSrc,
      onBootstrapComplete: () => {
        if (!cancelled) setCanvasReady(true);
      },
    });
    gameRef.current = game;

    void game.init();

    return () => {
      cancelled = true;
      setCanvasReady(false);
      game.destroy();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- room changes use switchRoom; worldSpawnPx only used for init
  }, [tileSize, worldCols, worldRows]);

  useLayoutEffect(() => {
    if (!canvasReady) return;
    gameRef.current?.resizeView(layoutViewWidthPx, viewHeightPx);
  }, [canvasReady, layoutViewWidthPx, viewHeightPx]);

  useLayoutEffect(() => {
    const game = gameRef.current;
    if (!game || !canvasReady) return;
    game.syncPlayerLayer(players, localId, tileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- players omitted on purpose; playerLayerSig gates syncs
  }, [canvasReady, localId, playerLayerSig, tileSize, roomId]);

  useLayoutEffect(() => {
    const game = gameRef.current;
    if (!game || !canvasReady) return;
    if (prevRoomIdRef.current === roomId) return;
    prevRoomIdRef.current = roomId;
    void game.switchRoom(
      roomId,
      worldSpawnPx,
      backgroundTextureSrcForRoomId(roomId, grassBg, spaceBg, desertBg, snowBg),
    );
  }, [canvasReady, roomId, worldSpawnPx]);

  useLayoutEffect(() => {
    if (!canvasReady) return;
    gameRef.current?.resizeView(layoutViewWidthPx, viewHeightPx);
  }, [canvasReady, layoutViewWidthPx, viewHeightPx]);

  useEffect(() => {
    if (keysDisabled) {
      gameRef.current?.clearMovementKeys();
    }
  }, [keysDisabled]);

  useEffect(() => {
    if (!canvasReady) return;
    onCanvasReady?.(canvasReady);
  }, [canvasReady, onCanvasReady]);

  const frameH = viewHeightPx;

  return (
    <div
      className={canvasStyles.canvasFrame}
      style={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        height: frameH,
        boxSizing: 'border-box',
      }}
    >
      <div ref={mountRef} className={canvasStyles.mountSurface} />
      {isTouchDevice && canvasReady && (
        <div className={canvasStyles.touchControlsSlot}>
          <TouchControls onMove={handleMoveVector} />
        </div>
      )}
    </div>
  );
});

export const PixiCanvas = PixiCanvasInner;
