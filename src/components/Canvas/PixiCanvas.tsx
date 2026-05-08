import grassBg from '../../assets/bg/grass.jpg';
import { useEffect, useMemo, useRef, useState } from 'react';
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

  syncRef.current.players = players;
  syncRef.current.localId = localId;
  syncRef.current.tileSize = tileSize;
  syncRef.current.viewCols = viewCols;
  syncRef.current.viewRows = viewRows;
  syncRef.current.worldCols = worldCols;
  syncRef.current.worldRows = worldRows;
  syncRef.current.keysDisabled = keysDisabled ?? false;
  syncRef.current.onPositionSync = onPositionSync;
  syncRef.current.localSpeechBubble = localSpeechBubble;
  syncRef.current.remoteSpeechBubbles = remoteSpeechBubbles;

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
  }, [tileSize, viewCols, viewRows, worldCols, worldRows]);

  useEffect(() => {
    const r = runnerRef.current;
    if (!r || !canvasReady) return;
    // Re-run only when the player *set* changes (IDs), tile size, or local socket id—not on every
    // positional snapshot. Rebuilding wipes remote interpolation buffers and causes jitter.
    r.rebuildPlayerLayer(players, localId, tileSize);
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
