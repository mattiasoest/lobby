import { MOVE_PX_PER_SEC, SYNC_MS } from '../core/constants.ts';
import { clampWorldTopLeft, moveTopLeftWithEntityCollisions, resolveEntityOverlaps } from '../core/worldMath.ts';
import type { EntityObstacle } from '../core/worldMath.ts';
import type { RoomCanvasSyncState } from '../core/syncState.ts';
import { roomServerTimeMs } from '../core/syncState.ts';
import type { AnimalSystem } from './AnimalSystem.ts';
import type { ChatNpcSystem } from './ChatNpcSystem.ts';
import type { RemoteInterpolationSystem } from './RemoteInterpolationSystem.ts';
import type { MovementResult, MoveVector } from '../types.ts';

export class MovementSystem {
  localPx = { x: 0, y: 0 };
  private localWasMovingRef = false;
  private lastSyncAtRef = 0;
  private lastMovementResult: MovementResult = {
    startedMove: false,
    stoppedMove: false,
    pushedByCollision: false,
    len: 0,
  };

  getLastMovementResult(): MovementResult {
    return this.lastMovementResult;
  }

  getLocalPx(): { x: number; y: number } {
    return this.localPx;
  }

  setLocalPx(x: number, y: number): void {
    this.localPx.x = x;
    this.localPx.y = y;
  }

  restoreLocalPxFromSync(
    syncState: RoomCanvasSyncState,
    fallbackSpawn: { x: number; y: number },
    tileSize: number,
    worldCols: number,
    worldRows: number,
    animalSystem: AnimalSystem,
    chatNpcSystem: ChatNpcSystem,
    remoteSystem: RemoteInterpolationSystem,
  ): void {
    const localPlayer = syncState.localId
      ? syncState.players.find((player) => player.id === syncState.localId)
      : undefined;
    const source = syncState.localPx ?? localPlayer ?? fallbackSpawn;
    this.localPx = clampWorldTopLeft(source.x, source.y, tileSize, worldCols, worldRows);
    this.resolveLocalSpawnOverlap(syncState, tileSize, worldCols, worldRows, animalSystem, chatNpcSystem, remoteSystem);
  }

  resolveLocalSpawnOverlap(
    syncState: RoomCanvasSyncState,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    animalSystem: AnimalSystem,
    chatNpcSystem: ChatNpcSystem,
    remoteSystem: RemoteInterpolationSystem,
  ): void {
    const localId = syncState.localId;
    const roomNowMs = roomServerTimeMs(syncState);
    animalSystem.update(roomNowMs);
    const animalObstacles = animalSystem.getObstacles();
    let spawnX = this.localPx.x;
    let spawnY = this.localPx.y;
    if (animalObstacles.length > 0) {
      const cleared = resolveEntityOverlaps(
        spawnX,
        spawnY,
        animalObstacles,
        tileSize,
        worldCols,
        worldRows,
        1,
        Number.POSITIVE_INFINITY,
      );
      spawnX = cleared.x;
      spawnY = cleared.y;
    }
    const staticObstacles = chatNpcSystem.getObstacles();
    if (staticObstacles.length > 0) {
      const cleared = resolveEntityOverlaps(
        spawnX,
        spawnY,
        staticObstacles,
        tileSize,
        worldCols,
        worldRows,
        1,
        Number.POSITIVE_INFINITY,
      );
      spawnX = cleared.x;
      spawnY = cleared.y;
    }
    const resolved = resolveEntityOverlaps(
      spawnX,
      spawnY,
      remoteSystem.getObstacles(localId, syncState),
      tileSize,
      worldCols,
      worldRows,
      1,
    );
    this.localPx.x = resolved.x;
    this.localPx.y = resolved.y;
  }

  update(
    dt: number,
    move: MoveVector,
    remotePlayerObstacles: EntityObstacle[],
    animalObstacles: EntityObstacle[],
    staticObstacles: EntityObstacle[],
    tileSize: number,
    worldCols: number,
    worldRows: number,
  ): MovementResult {
    const local = this.localPx;
    const { vx, vy, len } = move;
    const blockObstacles = [...remotePlayerObstacles, ...animalObstacles, ...staticObstacles];
    const step = MOVE_PX_PER_SEC * dt;
    const localBeforeMove = { x: local.x, y: local.y };

    if (len > 0) {
      const moved = moveTopLeftWithEntityCollisions(
        local.x,
        local.y,
        vx * step,
        vy * step,
        blockObstacles,
        tileSize,
        worldCols,
        worldRows,
        dt,
        remotePlayerObstacles,
      );
      local.x = moved.x;
      local.y = moved.y;
    }

    if (animalObstacles.length > 0) {
      const cleared = resolveEntityOverlaps(
        local.x,
        local.y,
        animalObstacles,
        tileSize,
        worldCols,
        worldRows,
        dt,
        Number.POSITIVE_INFINITY,
      );
      local.x = cleared.x;
      local.y = cleared.y;
    }

    const resolvedRemotes = resolveEntityOverlaps(
      local.x,
      local.y,
      remotePlayerObstacles,
      tileSize,
      worldCols,
      worldRows,
      dt,
    );
    local.x = resolvedRemotes.x;
    local.y = resolvedRemotes.y;

    const pushedByCollision = local.x !== localBeforeMove.x || local.y !== localBeforeMove.y;
    const wasMoving = this.localWasMovingRef;
    const startedMove = len > 0 && !wasMoving;
    const stoppedMove = len === 0 && wasMoving;
    this.localWasMovingRef = len > 0;

    this.lastMovementResult = { startedMove, stoppedMove, pushedByCollision, len };
    return this.lastMovementResult;
  }

  applyRoomSpawn(
    syncState: RoomCanvasSyncState,
    worldSpawnX: number,
    worldSpawnY: number,
    animalSystem: AnimalSystem,
    chatNpcSystem: ChatNpcSystem,
    remoteSystem: RemoteInterpolationSystem,
  ): void {
    const spawn = clampWorldTopLeft(
      worldSpawnX,
      worldSpawnY,
      syncState.tileSize,
      syncState.worldCols,
      syncState.worldRows,
    );
    this.localPx = { ...spawn };
    this.resolveLocalSpawnOverlap(
      syncState,
      syncState.tileSize,
      syncState.worldCols,
      syncState.worldRows,
      animalSystem,
      chatNpcSystem,
      remoteSystem,
    );
    syncState.localPx = { x: this.localPx.x, y: this.localPx.y };
    this.localWasMovingRef = false;
    this.lastSyncAtRef = 0;
  }

  maybeSyncPosition(now: number, syncState: RoomCanvasSyncState, result: MovementResult): void {
    const { startedMove, stoppedMove, pushedByCollision, len } = result;
    const throttleMoving = len > 0 && now - this.lastSyncAtRef >= SYNC_MS;
    const throttlePushed = pushedByCollision && now - this.lastSyncAtRef >= SYNC_MS;
    if (startedMove || stoppedMove || throttleMoving || throttlePushed) {
      this.lastSyncAtRef = now;
      syncState.onPositionSync({ x: this.localPx.x, y: this.localPx.y });
    }
  }

  resetSyncTimer(): void {
    this.lastSyncAtRef = 0;
    this.localWasMovingRef = false;
  }
}
