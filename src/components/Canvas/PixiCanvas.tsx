import grassBg from '../../assets/bg/grass.jpg';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RoomPixiRunner, createInitialSyncState, type RoomCanvasSyncState } from '../../game/room/index.ts';
import type { PlayerDTO } from '../../types.ts';

export type PixiCanvasProps = {
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
};

/**
 * React mount + prop sync for the room Pixi stack. Game loop and scene graph live in {@link RoomPixiRunner}.
 */
export function PixiCanvas({
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
}: PixiCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<RoomCanvasSyncState>(createInitialSyncState());
  const runnerRef = useRef<RoomPixiRunner | null>(null);

  useLayoutEffect(() => {
    const s = syncRef.current;
    s.players = players;
    s.localId = localId;
    s.tileSize = tileSize;
    s.viewCols = viewCols;
    s.viewRows = viewRows;
    s.worldCols = worldCols;
    s.worldRows = worldRows;
    s.keysDisabled = keysDisabled ?? false;
    s.onPositionSync = onPositionSync;
    s.localSpeechBubble = localSpeechBubble;
    s.remoteSpeechBubbles = remoteSpeechBubbles;
  }, [
    players,
    localId,
    tileSize,
    viewCols,
    viewRows,
    worldCols,
    worldRows,
    keysDisabled,
    onPositionSync,
    localSpeechBubble,
    remoteSpeechBubbles,
  ]);

  const playerIdsSig = useMemo(
    () =>
      players
        .map((p) => p.id)
        .sort()
        .join(','),
    [players],
  );

  const [canvasReady, setCanvasReady] = useState(false);

  // Only view/world dimensions recreate Pixi; spawn is handled by applyRoomSpawn.
  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;

    const runner = new RoomPixiRunner({
      mount,
      syncRef,
      dimensions: { tileSize, viewCols, viewRows, worldCols, worldRows },
      worldSpawnPx,
      grassTextureSrc: grassBg,
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
  }, [tileSize, viewCols, viewRows, worldCols, worldRows]);

  useEffect(() => {
    const r = runnerRef.current;
    if (!r || !canvasReady) return;
    // Re-run only when the player *set* changes (IDs), tile size, or local socket id—not on every
    // positional snapshot. Rebuilding wipes remote interpolation buffers and causes jitter.
    r.rebuildPlayerLayer(players, localId, tileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- players omitted on purpose; playerIdsSig gates rebuilds
  }, [canvasReady, localId, playerIdsSig, tileSize]);

  useEffect(() => {
    const r = runnerRef.current;
    if (!r || !canvasReady) return;
    r.applyRoomSpawn(worldSpawnPx.x, worldSpawnPx.y);
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

  return <div ref={mountRef} className="pixi-mount" aria-label="Room canvas" />;
}
