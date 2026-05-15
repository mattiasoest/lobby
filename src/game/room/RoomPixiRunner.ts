import type { Ticker } from 'pixi.js';
import { Application, Assets, Container, Graphics, Text, TilingSprite } from 'pixi.js';
import type { PlayerDTO } from '../../types.ts';
import {
  MAX_REMOTE_SAMPLES,
  MOVE_PX_PER_SEC,
  REMOTE_BURST_DELAY_SHAVE_MS,
  REMOTE_BURST_DURATION_MS,
  REMOTE_BURST_IDLE_SPEED_PX_S,
  REMOTE_BURST_WAKE_SPEED_PX_S,
  REMOTE_DISPLAY_LAMBDA,
  REMOTE_DISPLAY_LAMBDA_BURST,
  REMOTE_RENDER_DELAY_FLOOR_MS,
  REMOTE_SAMPLE_TTL_MS,
  REMOTE_SNAP_EPS_SQ,
  SYNC_MS,
} from './constants.ts';
import { isTypingTarget, MOVE_KEYS, createMoveKeysState, setMoveKey } from './keyboard.ts';
import {
  SPEECH_BAND_ABOVE_AVATAR_PX,
  PLAYER_NAME_LABEL_BOTTOM_GAP_PX,
  createSpeechBubbleGroup,
  type SpeechBubbleLayout,
} from './speechBubble.ts';
import { avatarColorOrFallback } from './playerColor.ts';
import {
  PlayerAvatar,
  loadCharacterTextures,
  spriteOverhangForTileSize,
  type CharacterTextureSet,
} from './playerAvatar.ts';
import type { RoomCanvasSyncState } from './syncState.ts';
import {
  clampWorldTopLeft,
  dropRemoteStaleAnchors,
  posFromRemoteBuffer,
  remoteRenderDelayMs,
  scrollWorldPx,
  type RemoteSample,
} from './worldMath.ts';
import { createViewportRain, rainEnabledForRoomId, type ViewportRainApi } from './roomRain.ts';

export type RoomPixiRunnerOptions = {
  mount: HTMLElement;
  syncRef: { current: RoomCanvasSyncState };
  dimensions: {
    tileSize: number;
    viewCols: number;
    viewRows: number;
    worldCols: number;
    worldRows: number;
  };
  worldSpawnPx: { x: number; y: number };
  roomId: number;
  /** Resolved asset URL (e.g. Vite import). */
  grassTextureSrc: string;
  /** Character spritesheet URLs (Vite imports). */
  characterTextureSrc: {
    idle: string;
    walk: string;
  };
  onBootstrapComplete?: () => void;
};

/**
 * Pixi lifecycle + avatar movement + remote interpolation + speech bubbles.
 * React keeps a mutable {@link RoomCanvasSyncState} ref updated each render; the ticker reads from it.
 */
export class RoomPixiRunner {
  private readonly opts: RoomPixiRunnerOptions;
  private cancelBootstrap = false;
  private app: Application | null = null;
  private worldRef: Container | null = null;
  private layerRef: Container | null = null;
  private speechBubbleWorldRef: Container | null = null;
  private speechBubbleLayoutRef = new Map<string, SpeechBubbleLayout>();
  /** Avatar + name label; position is world top-left of the avatar quad. */
  private playerRootByIdRef = new Map<string, Container>();
  private playerAvatarByIdRef = new Map<string, PlayerAvatar>();
  /** Last rendered world position per player; used to derive velocity for the avatar animation. */
  private prevRenderedPxRef = new Map<string, { x: number; y: number }>();
  private characterTextures: CharacterTextureSet | null = null;
  private tickerFn: ((ticker: Ticker) => void) | null = null;
  private viewportRain: ViewportRainApi | null = null;

  private keysInternal = createMoveKeysState();
  private localPxRef = { x: 0, y: 0 };
  private remotePxRef = new Map<string, { x: number; y: number }>();
  private remoteSampleBufRef = new Map<string, RemoteSample[]>();
  private lastServerSnapRef = new Map<string, { x: number; y: number }>();
  private lastSyncAtRef = 0;
  private localWasMovingRef = false;
  private remoteTargetPrevRef = new Map<string, { x: number; y: number }>();
  private remoteSpeedSmoothedRef = new Map<string, number>();
  private remoteBurstUntilRef = new Map<string, number>();

  private keyDown = (keyEvent: KeyboardEvent) => {
    if (this.opts.syncRef.current.keysDisabled || isTypingTarget(keyEvent.target)) return;
    if (!MOVE_KEYS.has(keyEvent.key)) return;
    setMoveKey(this.keysInternal, keyEvent.key, true);
    keyEvent.preventDefault();
  };

  private keyUp = (keyEvent: KeyboardEvent) => {
    if (!MOVE_KEYS.has(keyEvent.key)) return;
    setMoveKey(this.keysInternal, keyEvent.key, false);
    keyEvent.preventDefault();
  };

  private blur = () => {
    Object.assign(this.keysInternal, createMoveKeysState());
  };

  constructor(opts: RoomPixiRunnerOptions) {
    this.opts = opts;
  }

  async init(): Promise<void> {
    const {
      mount,
      dimensions: { tileSize, viewCols, viewRows, worldCols, worldRows },
      worldSpawnPx,
      grassTextureSrc,
      characterTextureSrc,
      onBootstrapComplete,
    } = this.opts;

    const viewPixelW = viewCols * tileSize;
    const viewPixelH = viewRows * tileSize;
    const worldPixelW = worldCols * tileSize;
    const worldPixelH = worldRows * tileSize;

    const app = new Application();
    await app.init({
      width: viewPixelW,
      height: viewPixelH,
      backgroundColor: 0x1a2e1a,
      antialias: true,
    });
    if (this.cancelBootstrap) {
      await app.destroy();
      return;
    }

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.dataset.pixiCanvas = '';
    mount.appendChild(canvas);
    this.app = app;

    const world = new Container();
    this.worldRef = world;

    const [grassResult, characterResult] = await Promise.all([
      Assets.load(grassTextureSrc).catch(() => null),
      loadCharacterTextures(characterTextureSrc.idle, characterTextureSrc.walk),
    ]);
    const grassTexture = grassResult ?? null;
    this.characterTextures = characterResult;
    if (this.cancelBootstrap) {
      await app.destroy();
      return;
    }
    if (grassTexture) {
      const grass = new TilingSprite({
        texture: grassTexture,
        width: worldPixelW,
        height: worldPixelH,
      });
      world.addChild(grass);
    }

    const layer = new Container();
    this.layerRef = layer;
    world.addChild(layer);

    const speechBubbleRoot = new Container();
    this.speechBubbleWorldRef = speechBubbleRoot;
    world.addChild(speechBubbleRoot);

    app.stage.addChild(world);

    if (rainEnabledForRoomId(this.opts.roomId)) {
      this.viewportRain = createViewportRain(viewPixelW, viewPixelH, app.stage);
    }

    const spawn = clampWorldTopLeft(worldSpawnPx.x, worldSpawnPx.y, tileSize, worldCols, worldRows);
    this.localPxRef = { ...spawn };
    this.lastSyncAtRef = 0;
    this.localWasMovingRef = false;

    const pad0 = tileSize * 0.14;
    const size0 = tileSize - pad0 * 2;

    const tickRun = (ticker: Ticker) => {
      const now = performance.now();
      const syncState = this.opts.syncRef.current;
      const { tileSize, worldCols, worldRows, viewCols, viewRows, localId } = syncState;
      const pad = tileSize * 0.14;
      const size = tileSize - pad * 2;
      const worldW = worldCols * tileSize;
      const worldH = worldRows * tileSize;
      const viewW = viewCols * tileSize;
      const viewH = viewRows * tileSize;

      const moveKeys = this.keysInternal;
      let vx = 0;
      let vy = 0;
      if (moveKeys.left) vx -= 1;
      if (moveKeys.right) vx += 1;
      if (moveKeys.up) vy -= 1;
      if (moveKeys.down) vy += 1;
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        vx /= len;
        vy /= len;
      }

      const dt = ticker.deltaMS / 1000;
      const step = MOVE_PX_PER_SEC * dt;
      const local = this.localPxRef;
      if (len > 0) {
        local.x += vx * step;
        local.y += vy * step;
        const clampedTopLeft = clampWorldTopLeft(local.x, local.y, tileSize, worldCols, worldRows);
        local.x = clampedTopLeft.x;
        local.y = clampedTopLeft.y;
      }

      const wasMoving = this.localWasMovingRef;
      const startedMove = len > 0 && !wasMoving;
      const stoppedMove = len === 0 && wasMoving;
      this.localWasMovingRef = len > 0;

      const playerList = syncState.players;
      for (const player of playerList) {
        if (localId && player.id === localId) continue;

        let samples = this.remoteSampleBufRef.get(player.id);
        if (!samples) {
          samples = [{ time: now, x: player.x, y: player.y }];
          this.remoteSampleBufRef.set(player.id, samples);
          this.lastServerSnapRef.set(player.id, { x: player.x, y: player.y });
        } else {
          const prev = this.lastServerSnapRef.get(player.id);
          const moved = !prev || (player.x - prev.x) ** 2 + (player.y - prev.y) ** 2 > REMOTE_SNAP_EPS_SQ;
          if (moved) {
            this.lastServerSnapRef.set(player.id, { x: player.x, y: player.y });
            samples.push({ time: now, x: player.x, y: player.y });
            while (samples.length > MAX_REMOTE_SAMPLES) {
              samples.shift();
            }
          }
        }

        const arr = this.remoteSampleBufRef.get(player.id);
        if (arr && arr.length > 0) {
          const cutoff = now - REMOTE_SAMPLE_TTL_MS;
          while (arr.length > 1 && arr[0].time < cutoff) {
            arr.shift();
          }
          dropRemoteStaleAnchors(arr);
        }

        const ready = this.remoteSampleBufRef.get(player.id) ?? [];
        const baseDelay = remoteRenderDelayMs(ready);
        let burst = now < (this.remoteBurstUntilRef.get(player.id) ?? 0);

        let playbackDelay = burst
          ? Math.max(REMOTE_RENDER_DELAY_FLOOR_MS, baseDelay - REMOTE_BURST_DELAY_SHAVE_MS)
          : baseDelay;
        let target = posFromRemoteBuffer(ready, now - playbackDelay);

        const prevTarget = this.remoteTargetPrevRef.get(player.id);
        let instSpeed = 0;
        if (prevTarget) {
          const invDt = 1 / Math.max(dt, 1e-4);
          instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
        }
        const prevSmooth = this.remoteSpeedSmoothedRef.get(player.id) ?? 0;
        let smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;

        const woke =
          prevTarget !== undefined &&
          prevSmooth < REMOTE_BURST_IDLE_SPEED_PX_S &&
          smoothSpeed > REMOTE_BURST_WAKE_SPEED_PX_S;

        if (woke) {
          this.remoteBurstUntilRef.set(player.id, now + REMOTE_BURST_DURATION_MS);
          if (!burst) {
            burst = true;
            playbackDelay = Math.max(REMOTE_RENDER_DELAY_FLOOR_MS, baseDelay - REMOTE_BURST_DELAY_SHAVE_MS);
            target = posFromRemoteBuffer(ready, now - playbackDelay);
            if (prevTarget) {
              const invDt = 1 / Math.max(dt, 1e-4);
              instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
              smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;
            }
          }
        }

        this.remoteSpeedSmoothedRef.set(player.id, smoothSpeed);
        this.remoteTargetPrevRef.set(player.id, { x: target.x, y: target.y });

        const prevDrawn = this.remotePxRef.get(player.id);
        const lambda = burst ? REMOTE_DISPLAY_LAMBDA_BURST : REMOTE_DISPLAY_LAMBDA;
        const blend = 1 - Math.exp(-lambda * dt);
        if (!prevDrawn) {
          this.remotePxRef.set(player.id, { ...target });
        } else {
          this.remotePxRef.set(player.id, {
            x: prevDrawn.x + (target.x - prevDrawn.x) * blend,
            y: prevDrawn.y + (target.y - prevDrawn.y) * blend,
          });
        }
      }

      const remoteIds = new Set<string>();
      for (const player of playerList) {
        if (!(localId && player.id === localId)) remoteIds.add(player.id);
      }
      for (const id of [...this.remoteSampleBufRef.keys()]) {
        if (!remoteIds.has(id)) {
          this.remoteSampleBufRef.delete(id);
          this.lastServerSnapRef.delete(id);
          this.remotePxRef.delete(id);
          this.remoteTargetPrevRef.delete(id);
          this.remoteSpeedSmoothedRef.delete(id);
          this.remoteBurstUntilRef.delete(id);
        }
      }

      const worldContainer = this.worldRef;
      if (worldContainer) {
        const { left, top } = scrollWorldPx(local.x, local.y, size, viewW, viewH, worldW, worldH);
        worldContainer.position.set(-left, -top);
      }

      const spriteOverhang = spriteOverhangForTileSize(tileSize);
      const dtSec = Math.max(dt, 1e-4);
      const dtMs = ticker.deltaMS;
      for (const player of playerList) {
        const root = this.playerRootByIdRef.get(player.id);
        if (!root) continue;
        const isLocal = !!localId && player.id === localId;
        const pos = isLocal ? local : this.remotePxRef.get(player.id);
        if (!pos) continue;
        root.position.set(pos.x, pos.y);

        const avatar = this.playerAvatarByIdRef.get(player.id);
        if (avatar) {
          const prev = this.prevRenderedPxRef.get(player.id);
          let vxPxS = 0;
          let vyPxS = 0;
          if (prev) {
            vxPxS = (pos.x - prev.x) / dtSec;
            vyPxS = (pos.y - prev.y) / dtSec;
          }
          avatar.update(dtMs, vxPxS, vyPxS);
          this.prevRenderedPxRef.set(player.id, { x: pos.x, y: pos.y });
        }
      }

      // Drop prev-position cache for players that have left.
      const activeIds = new Set<string>();
      for (const player of playerList) activeIds.add(player.id);
      for (const id of [...this.prevRenderedPxRef.keys()]) {
        if (!activeIds.has(id)) this.prevRenderedPxRef.delete(id);
      }

      const speechWorld = this.speechBubbleWorldRef;
      const layout = this.speechBubbleLayoutRef;
      if (!speechWorld || layout.size === 0) {
        if (speechWorld) speechWorld.visible = false;
      } else {
        speechWorld.visible = true;
        for (const [pid, { group, width: bubbleWidth, height: bubbleHeight }] of layout) {
          const isLocalBubble = !!localId && pid === localId;
          const pos = isLocalBubble ? local : this.remotePxRef.get(pid);
          const stillHere = playerList.some((player) => player.id === pid);
          if (!pos || !stillHere) {
            group.visible = false;
            continue;
          }
          group.visible = true;
          group.position.set(
            pos.x + size / 2 - bubbleWidth / 2,
            pos.y - spriteOverhang - SPEECH_BAND_ABOVE_AVATAR_PX - bubbleHeight,
          );
        }
      }

      /** Throttled (~{@link SYNC_MS}) position sync to React + socket only while moving, not every tick while idle. */
      const throttleMoving = len > 0 && now - this.lastSyncAtRef >= SYNC_MS;
      if (startedMove || stoppedMove || throttleMoving) {
        this.lastSyncAtRef = now;
        syncState.onPositionSync({ x: local.x, y: local.y });
      }

      this.viewportRain?.update(ticker.deltaMS);
    };

    this.tickerFn = tickRun;
    app.ticker.add(tickRun);

    const { left, top } = scrollWorldPx(
      this.localPxRef.x,
      this.localPxRef.y,
      size0,
      viewPixelW,
      viewPixelH,
      worldPixelW,
      worldPixelH,
    );
    world.position.set(-left, -top);

    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);

    onBootstrapComplete?.();
  }

  rebuildPlayerLayer(players: PlayerDTO[], localId: string | null, tileSize: number): void {
    const layer = this.layerRef;
    if (!layer) return;

    for (let idx = layer.children.length - 1; idx >= 0; idx -= 1) {
      layer.removeChildAt(idx).destroy({ children: true });
    }
    this.playerRootByIdRef.clear();
    this.playerAvatarByIdRef.clear();
    this.prevRenderedPxRef.clear();
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const spriteOverhang = spriteOverhangForTileSize(tileSize);
    const tSeed = performance.now();
    const characterTextures = this.characterTextures;

    for (const player of players) {
      const root = new Container();
      const isLocal = !!localId && player.id === localId;

      if (characterTextures) {
        const avatar = new PlayerAvatar(characterTextures, tileSize);
        // Offset sprite container so the 32×32 art aligns with the full tileSize tile
        // (root.position is the inner padded quad's top-left).
        avatar.view.position.set(-pad, -pad);
        root.addChild(avatar.view);
        this.playerAvatarByIdRef.set(player.id, avatar);
      } else {
        // Texture load failed — fall back to the original colored block.
        const graphic = new Graphics();
        graphic.rect(0, 0, size, size);
        graphic.fill({ color: avatarColorOrFallback(player.id, player.color) });
        root.addChild(graphic);
      }

      const nameLabel = new Text({
        text: player.username || 'Player',
        style: {
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          fontSize: 11,
          fill: 0xf9fafb,
          stroke: { color: 0x111827, width: 3 },
          align: 'center',
        },
      });
      nameLabel.anchor.set(0.5, 1);
      nameLabel.position.set(size / 2, -spriteOverhang - PLAYER_NAME_LABEL_BOTTOM_GAP_PX);

      root.addChild(nameLabel);

      let px = player.x;
      let py = player.y;
      if (isLocal) {
        const loc = this.localPxRef;
        px = loc.x;
        py = loc.y;
      } else {
        this.remotePxRef.set(player.id, { x: player.x, y: player.y });
        this.remoteSampleBufRef.set(player.id, [{ time: tSeed, x: player.x, y: player.y }]);
        this.lastServerSnapRef.set(player.id, { x: player.x, y: player.y });
      }
      root.position.set(px, py);
      this.prevRenderedPxRef.set(player.id, { x: px, y: py });
      this.playerRootByIdRef.set(player.id, root);
      layer.addChild(root);
    }
  }

  applyRoomSpawn(worldSpawnX: number, worldSpawnY: number): void {
    const syncState = this.opts.syncRef.current;
    const spawn = clampWorldTopLeft(
      worldSpawnX,
      worldSpawnY,
      syncState.tileSize,
      syncState.worldCols,
      syncState.worldRows,
    );
    this.localPxRef = { ...spawn };
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();
    this.prevRenderedPxRef.clear();
    this.localWasMovingRef = false;
    this.lastSyncAtRef = 0;

    const worldContainer = this.worldRef;
    const { tileSize, worldCols, worldRows, viewCols, viewRows } = syncState;
    if (worldContainer) {
      const pad = tileSize * 0.14;
      const size = tileSize - pad * 2;
      const loc = this.localPxRef;
      const { left, top } = scrollWorldPx(
        loc.x,
        loc.y,
        size,
        viewCols * tileSize,
        viewRows * tileSize,
        worldCols * tileSize,
        worldRows * tileSize,
      );
      worldContainer.position.set(-left, -top);
    }
    syncState.onPositionSync({ x: spawn.x, y: spawn.y });
  }

  rebuildSpeechBubbles(
    localSpeechBubble: string | null,
    localId: string | null,
    remoteSpeechBubbles: ReadonlyMap<string, string>,
  ): void {
    const parent = this.speechBubbleWorldRef;
    if (!parent) return;

    for (const child of [...parent.children]) {
      parent.removeChild(child);
      child.destroy({ children: true });
    }
    this.speechBubbleLayoutRef.clear();

    type Entry = { playerId: string; text: string };
    const entries: Entry[] = [];
    const localTrimmed = localSpeechBubble?.trim();
    if (localTrimmed && localId) entries.push({ playerId: localId, text: localTrimmed });
    for (const [socketId, raw] of remoteSpeechBubbles) {
      const trimmedRemote = raw.trim();
      if (!trimmedRemote || socketId === localId) continue;
      entries.push({ playerId: socketId, text: trimmedRemote });
    }

    for (const { playerId, text } of entries) {
      const built = createSpeechBubbleGroup(text);
      parent.addChild(built.group);
      this.speechBubbleLayoutRef.set(playerId, built);
    }
  }

  clearMovementKeys(): void {
    Object.assign(this.keysInternal, createMoveKeysState());
  }

  destroy(): void {
    this.cancelBootstrap = true;
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);

    this.viewportRain?.destroy();
    this.viewportRain = null;

    const app = this.app;
    if (app?.ticker && this.tickerFn) {
      app.ticker.remove(this.tickerFn);
    }
    this.tickerFn = null;
    this.playerRootByIdRef.clear();
    this.playerAvatarByIdRef.clear();
    this.prevRenderedPxRef.clear();
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();
    this.characterTextures = null;
    this.layerRef = null;
    this.speechBubbleWorldRef = null;
    this.speechBubbleLayoutRef.clear();
    this.worldRef = null;

    this.app = null;
    void app?.destroy(true);

    const mountEl = this.opts.mount;
    while (mountEl.firstChild) {
      mountEl.removeChild(mountEl.firstChild);
    }
  }
}
