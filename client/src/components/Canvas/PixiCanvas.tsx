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

/** Whole-tile columns from inner host width (no CSS scale). */
const MIN_LAYOUT_VIEW_COLS = 1;

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
  /** Width in whole tiles — buffer is `layoutViewCols * tileSize` px (no CSS bitmap scale). */
  const [layoutViewCols, setLayoutViewCols] = useState(viewCols);
  useLayoutEffect(() => {
    const mount = mountRef.current;
    const host = mount?.closest('.pixi-mount-host');
    if (!host) return;

    const measure = () => {
      const style = getComputedStyle(host);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const aw = Math.max(0, host.clientWidth - padX);
      const cols = aw < tileSize ? 1 : Math.min(worldCols, Math.max(MIN_LAYOUT_VIEW_COLS, Math.floor(aw / tileSize)));
      setLayoutViewCols((prev) => (prev === cols ? prev : cols));
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
    syncState.viewCols = layoutViewCols;
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
    layoutViewCols,
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
      dimensions: { tileSize, viewCols: layoutViewCols, viewRows, worldCols, worldRows },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- worldSpawnPx only used for init; changing it must not recreate runner
  }, [tileSize, layoutViewCols, viewRows, worldCols, worldRows, roomId]);

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

  const frameW = layoutViewCols * tileSize;
  const frameH = viewRows * tileSize;

  return (
    <div
      className="pixi-canvas-frame"
      style={{
        position: 'relative',
        width: frameW,
        maxWidth: '100%',
        minWidth: 0,
        marginLeft: 'auto',
        marginRight: 'auto',
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
