import grassBg from '../../assets/bg/grass.jpg';
import snowBg from '../../assets/bg/snow.jpg';
import bullSpriteSrc from '../../assets/entities/bull/bull.png';
import cowSpriteSrc from '../../assets/entities/cow/cow.png';
import deerIdleSpriteSrc from '../../assets/entities/deer/deer_idle.png';
import deerWalkSpriteSrc from '../../assets/entities/deer/deer_walk.png';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { RoomPixiRunner, type RoomCanvasSyncState } from '../../game/room/index.ts';
import { AVATAR_CHARACTER_TEXTURES } from '../../game/room/avatars.ts';
import { backgroundTextureSrcForRoomId } from '../../game/room/roomBackground.ts';
import { TouchControls } from '../UI/TouchControls.tsx';
import { useIsTouchDevice } from '../../utils/useIsTouchDevice.ts';
import type { PlayerDTO } from '../../types.ts';

const MIN_VIEW_WIDTH_PX = 1;

export type PixiCanvasProps = {
  /** Shared with {@link RoomPage}: socket updates `players` here; React props are for structure/rebuilds only. */
  syncRef: RefObject<RoomCanvasSyncState>;
  tileSize: number;
  viewCols: number;
  viewRows: number;
  worldCols: number;
  worldRows: number;
  worldSpawnPx: { x: number; y: number };
  players: PlayerDTO[];
  localId: string | null;
  roomId: number;
  localSpeechBubble: string | null;
  remoteSpeechBubbles: ReadonlyMap<string, string>;
  keysDisabled?: boolean;
  onPositionSync: (pos: { x: number; y: number }) => void;
  /** Fires when the WebGL runner finishes bootstrap or tears down (recreates runner). */
  onCanvasReady?: (ready: boolean) => void;
};

function clampViewWidthPx(availablePx: number, tileSize: number, worldCols: number): number {
  const maxW = worldCols * tileSize;
  if (availablePx < MIN_VIEW_WIDTH_PX) return MIN_VIEW_WIDTH_PX;
  return Math.min(maxW, Math.round(availablePx));
}

/**
 * React mount + prop sync for the room Pixi stack. Game loop and scene graph live in {@link RoomPixiRunner}.
 */
const PixiCanvasInner = memo(function PixiCanvas({
  syncRef,
  tileSize,
  viewCols,
  viewRows,
  worldCols,
  worldRows,
  worldSpawnPx,
  players,
  localId,
  keysDisabled,
  onPositionSync,
  roomId,
  localSpeechBubble,
  remoteSpeechBubbles,
  onCanvasReady,
}: PixiCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<RoomPixiRunner | null>(null);
  const [layoutViewWidthPx, setLayoutViewWidthPx] = useState(() => viewCols * tileSize);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    const host = mount?.closest('.pixi-mount-host');
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
    syncState.viewCols = layoutViewWidthPx / tileSize;
    syncState.viewRows = viewRows;
    syncState.worldCols = worldCols;
    syncState.worldRows = worldRows;
    syncState.keysDisabled = keysDisabled ?? false;
    syncState.onPositionSync = onPositionSync;
    syncState.localSpeechBubble = localSpeechBubble;
    syncState.remoteSpeechBubbles = remoteSpeechBubbles;
  }, [
    syncRef,
    localId,
    tileSize,
    layoutViewWidthPx,
    viewRows,
    worldCols,
    worldRows,
    keysDisabled,
    onPositionSync,
    localSpeechBubble,
    remoteSpeechBubbles,
  ]);

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

  const handleMoveVector = useCallback((x: number, y: number) => {
    runnerRef.current?.setMoveVector(x, y);
  }, []);

  // Only view/world dimensions recreate Pixi; spawn is handled by applyRoomSpawn.
  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;
    const runner = new RoomPixiRunner({
      mount,
      syncRef,
      dimensions: { tileSize, viewPixelW: layoutViewWidthPx, viewRows, worldCols, worldRows },
      worldSpawnPx,
      roomId,
      grassTextureSrc: backgroundTextureSrcForRoomId(roomId, grassBg, snowBg),
      characterTextureSrcByAvatarId: AVATAR_CHARACTER_TEXTURES,
      animalTextureSrc: {
        bull: bullSpriteSrc,
        cow: cowSpriteSrc,
        deer: { idle: deerIdleSpriteSrc, walk: deerWalkSpriteSrc },
      },
      onBootstrapComplete: () => {
        if (!cancelled) setCanvasReady(true);
      },
    });
    runnerRef.current = runner;

    void runner.init();

    return () => {
      cancelled = true;
      setCanvasReady(false);
      runner.destroy();
      runnerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view width resizes via resizeView; worldSpawnPx only used for init
  }, [tileSize, viewRows, worldCols, worldRows, roomId]);

  useLayoutEffect(() => {
    if (!canvasReady) return;
    runnerRef.current?.resizeView(layoutViewWidthPx);
  }, [canvasReady, layoutViewWidthPx]);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner || !canvasReady) return;
    // Re-run only when the player *set* changes (IDs), tile size, or local socket id—not on every
    // positional snapshot. Rebuilding wipes remote interpolation buffers and causes jitter.
    runner.rebuildPlayerLayer(players, localId, tileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- players omitted on purpose; playerLayerSig gates rebuilds
  }, [canvasReady, localId, playerLayerSig, tileSize]);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner || !canvasReady) return;
    runner.applyRoomSpawn(worldSpawnPx.x, worldSpawnPx.y);
  }, [canvasReady, roomId, worldSpawnPx.x, worldSpawnPx.y]);

  useEffect(() => {
    if (keysDisabled) {
      runnerRef.current?.clearMovementKeys();
    }
  }, [keysDisabled]);

  useEffect(() => {
    if (!canvasReady) return;
    runnerRef.current?.rebuildSpeechBubbles(localSpeechBubble, localId, remoteSpeechBubbles);
  }, [canvasReady, localId, localSpeechBubble, remoteSpeechBubbles]);

  useEffect(() => {
    if (!canvasReady) return;
    onCanvasReady?.(canvasReady);
  }, [canvasReady, onCanvasReady]);

  const frameH = viewRows * tileSize;

  return (
    <div
      className="pixi-canvas-frame"
      style={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        height: frameH,
        boxSizing: 'border-box',
      }}
    >
      <div ref={mountRef} className="pixi-mount pixi-mount__surface" />
      {isTouchDevice && canvasReady && (
        <div className="touch-controls-slot">
          <TouchControls onMove={handleMoveVector} />
        </div>
      )}
    </div>
  );
});

export const PixiCanvas = PixiCanvasInner;
