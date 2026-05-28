import type { Ticker } from 'pixi.js';
import { Application, Assets, Container, Graphics, Text, TilingSprite } from 'pixi.js';
import type { PlayerDTO } from '../../types.ts';
import {
  MAX_REMOTE_SAMPLES,
  MOVE_PX_PER_SEC,
  ROOM_CAMERA_ZOOM,
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
import { ROOM_PIXEL_FACE_SPECS, ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from './pixelTypography.ts';
import type { RoomCanvasSyncState } from './syncState.ts';
import {
  clampWorldTopLeft,
  dropRemoteStaleAnchors,
  entityInnerQuad,
  moveTopLeftWithEntityCollisions,
  posFromRemoteBuffer,
  remoteRenderDelayMs,
  resolveEntityOverlaps,
  scrollWorldPx,
  type RemoteSample,
} from './worldMath.ts';
import { createWorldRain, rainEnabledForRoomId, type WorldRainApi } from './roomRain.ts';
import { createWorldSnow, snowEnabledForRoomId, type WorldSnowApi } from './roomSnow.ts';
import { Animal, animalHomeAnchors, animalSeedBase, loadAnimalTextures, type AnimalTextureMap } from './animals.ts';
import type { MinimapSnapshot } from './Minimap.ts';

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
  /** Animal spritesheet URLs (Vite imports). */
  animalTextureSrc: {
    bull: string;
    cow: string;
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
  private playerBodyLayerRef: Container | null = null;
  private playerNameLayerRef: Container | null = null;
  private animalsRef: Animal[] = [];
  private animalTextures: AnimalTextureMap | null = null;
  private speechBubbleWorldRef: Container | null = null;
  private speechBubbleLayoutRef = new Map<string, SpeechBubbleLayout>();
  /** Avatar body; position is world top-left of the avatar quad. */
  private playerRootByIdRef = new Map<string, Container>();
  private playerNameLabelByIdRef = new Map<string, Text>();
  private playerAvatarByIdRef = new Map<string, PlayerAvatar>();
  /** Last rendered world position per player; used to derive velocity for the avatar animation. */
  private prevRenderedPxRef = new Map<string, { x: number; y: number }>();
  private characterTextures: CharacterTextureSet | null = null;
  private tickerFn: ((ticker: Ticker) => void) | null = null;
  private worldRain: WorldRainApi | null = null;
  private worldSnow: WorldSnowApi | null = null;

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
      animalTextureSrc,
      onBootstrapComplete,
    } = this.opts;

    await Promise.all(ROOM_PIXEL_FACE_SPECS.map((spec) => document.fonts.load(spec))).catch(() => {
      /** Remote fonts blocked or offline — labels fall back to generic monospace stack. */
    });

    const viewPixelW = viewCols * tileSize;
    const viewPixelH = viewRows * tileSize;
    const worldPixelW = worldCols * tileSize;
    const worldPixelH = worldRows * tileSize;

    const app = new Application();
    await app.init({
      width: viewPixelW,
      height: viewPixelH,
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

    const [grassResult, characterResult, animalResult] = await Promise.all([
      Assets.load(grassTextureSrc).catch(() => null),
      loadCharacterTextures(characterTextureSrc.idle, characterTextureSrc.walk),
      loadAnimalTextures(animalTextureSrc.bull, animalTextureSrc.cow),
    ]);
    const grassTexture = grassResult ?? null;
    this.characterTextures = characterResult;
    this.animalTextures = animalResult;
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

    const playerBodyLayer = new Container();
    playerBodyLayer.sortableChildren = true;
    this.playerBodyLayerRef = playerBodyLayer;
    world.addChild(playerBodyLayer);
    this.spawnAnimals();

    // Weather lives inside `world` so flake positions are world coordinates and the camera
    // walks through them. Inserted before speech bubbles so chat stays readable.
    const weatherWorld = new Container();
    weatherWorld.eventMode = 'none';
    world.addChild(weatherWorld);
    if (snowEnabledForRoomId(this.opts.roomId)) {
      this.worldSnow = createWorldSnow(weatherWorld);
    }
    if (rainEnabledForRoomId(this.opts.roomId)) {
      this.worldRain = createWorldRain(weatherWorld);
    }

    const playerNameLayer = new Container();
    playerNameLayer.sortableChildren = true;
    this.playerNameLayerRef = playerNameLayer;
    world.addChild(playerNameLayer);

    const speechBubbleRoot = new Container();
    this.speechBubbleWorldRef = speechBubbleRoot;
    world.addChild(speechBubbleRoot);

    const viewRoot = new Container();
    viewRoot.scale.set(ROOM_CAMERA_ZOOM, ROOM_CAMERA_ZOOM);
    viewRoot.addChild(world);
    app.stage.addChild(viewRoot);

    const spawn = clampWorldTopLeft(worldSpawnPx.x, worldSpawnPx.y, tileSize, worldCols, worldRows);
    this.localPxRef = { ...spawn };
    this.resolveLocalSpawnOverlap(tileSize, worldCols, worldRows);
    this.lastSyncAtRef = 0;
    this.localWasMovingRef = false;

    const pad0 = tileSize * 0.14;
    const size0 = tileSize - pad0 * 2;

    const tickRun = (ticker: Ticker) => {
      const now = performance.now();
      const syncState = this.opts.syncRef.current;
      const { tileSize, worldCols, worldRows, viewCols, viewRows, localId } = syncState;
      const { pad, size } = entityInnerQuad(tileSize);
      const worldW = worldCols * tileSize;
      const worldH = worldRows * tileSize;
      const viewW = (viewCols * tileSize) / ROOM_CAMERA_ZOOM;
      const viewH = (viewRows * tileSize) / ROOM_CAMERA_ZOOM;

      const local = this.localPxRef;
      const playerPositions = this.collectPlayerPositions(localId, local);
      const dt = ticker.deltaMS / 1000;

      const animalList = this.animalsRef;
      const playerBodyLayer = this.playerBodyLayerRef;
      if (animalList.length > 0) {
        for (const animal of animalList) {
          animal.update(playerPositions, dt);
          const animalPos = animal.getPosition();
          animal.view.zIndex = animalPos.y;
        }
      }

      const remotePlayerObstacles = this.collectRemotePlayerObstacles(localId);
      const animalObstacles = this.collectAnimalObstacles();
      const blockObstacles = [...remotePlayerObstacles, ...animalObstacles];

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
      } else {
        const resolved = resolveEntityOverlaps(
          local.x,
          local.y,
          remotePlayerObstacles,
          tileSize,
          worldCols,
          worldRows,
          dt,
        );
        local.x = resolved.x;
        local.y = resolved.y;
      }
      const pushedByCollision = local.x !== localBeforeMove.x || local.y !== localBeforeMove.y;

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

      let viewLeft = 0;
      let viewTop = 0;
      const worldContainer = this.worldRef;
      if (worldContainer) {
        const scrolled = scrollWorldPx(local.x, local.y, size, viewW, viewH, worldW, worldH);
        viewLeft = scrolled.left;
        viewTop = scrolled.top;
        worldContainer.position.set(-viewLeft, -viewTop);
      }

      const spriteOverhang = spriteOverhangForTileSize(tileSize);
      const dtSec = Math.max(dt, 1e-4);
      const dtMs = ticker.deltaMS;

      const nameCenterX = this.characterTextures ? size / 2 - pad : size / 2;
      const nameLabelY = -spriteOverhang - PLAYER_NAME_LABEL_BOTTOM_GAP_PX;
      const playerNameLayer = this.playerNameLayerRef;

      for (const player of playerList) {
        const root = this.playerRootByIdRef.get(player.id);
        if (!root) continue;
        const isLocal = !!localId && player.id === localId;
        const pos = isLocal ? local : this.remotePxRef.get(player.id);
        if (!pos) continue;
        root.position.set(pos.x, pos.y);
        root.zIndex = pos.y;

        const nameLabel = this.playerNameLabelByIdRef.get(player.id);
        if (nameLabel) {
          nameLabel.position.set(pos.x + nameCenterX, pos.y + nameLabelY);
          nameLabel.zIndex = pos.y;
        }

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

      playerBodyLayer?.sortChildren();
      playerNameLayer?.sortChildren();

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
          const bubbleCenterX = this.characterTextures ? size / 2 - pad : size / 2;
          group.position.set(
            pos.x + bubbleCenterX - bubbleWidth / 2,
            pos.y - spriteOverhang - SPEECH_BAND_ABOVE_AVATAR_PX - bubbleHeight,
          );
        }
      }

      /** Throttled (~{@link SYNC_MS}) position sync to React + socket while moving or when pushed by collision. */
      const throttleMoving = len > 0 && now - this.lastSyncAtRef >= SYNC_MS;
      const throttlePushed = pushedByCollision && now - this.lastSyncAtRef >= SYNC_MS;
      if (startedMove || stoppedMove || throttleMoving || throttlePushed) {
        this.lastSyncAtRef = now;
        syncState.onPositionSync({ x: local.x, y: local.y });
      }

      const avatarCenter = (topLeftX: number, topLeftY: number) => ({
        x: topLeftX + size / 2,
        y: topLeftY + size / 2,
      });
      const minimapPlayers = [];
      for (const player of playerList) {
        const isLocalPlayer = !!localId && player.id === localId;
        const pos = isLocalPlayer ? local : this.remotePxRef.get(player.id);
        if (!pos) continue;
        const center = avatarCenter(pos.x, pos.y);
        minimapPlayers.push({
          id: player.id,
          x: center.x,
          y: center.y,
          color: avatarColorOrFallback(player.id, player.color),
          isLocal: isLocalPlayer,
        });
      }
      const minimapAnimals = animalList.map((animal) => {
        const pos = animal.getPosition();
        const center = avatarCenter(pos.x, pos.y);
        return { kind: animal.kind, x: center.x, y: center.y };
      });
      syncState.minimapSnapshot = {
        worldW,
        worldH,
        viewport: { x: viewLeft, y: viewTop, w: viewW, h: viewH },
        players: minimapPlayers,
        animals: minimapAnimals,
      } satisfies MinimapSnapshot;

      const weatherViewport = { left: viewLeft, top: viewTop, w: viewW, h: viewH };
      this.worldRain?.update(ticker.deltaMS, weatherViewport);
      this.worldSnow?.update(ticker.deltaMS, weatherViewport);
    };

    this.tickerFn = tickRun;
    app.ticker.add(tickRun);

    const { left, top } = scrollWorldPx(
      this.localPxRef.x,
      this.localPxRef.y,
      size0,
      viewPixelW / ROOM_CAMERA_ZOOM,
      viewPixelH / ROOM_CAMERA_ZOOM,
      worldPixelW,
      worldPixelH,
    );
    world.position.set(-left, -top);

    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);

    onBootstrapComplete?.();
  }

  private collectPlayerPositions(
    localId: string | null,
    localPx: { x: number; y: number },
  ): { x: number; y: number }[] {
    const syncState = this.opts.syncRef.current;
    const positions: { x: number; y: number }[] = [];
    for (const player of syncState.players) {
      if (localId && player.id === localId) {
        positions.push({ x: localPx.x, y: localPx.y });
        continue;
      }
      const remotePos = this.remotePxRef.get(player.id);
      positions.push(remotePos ?? { x: player.x, y: player.y });
    }
    return positions;
  }

  private collectRemotePlayerObstacles(localId: string | null): { x: number; y: number }[] {
    const syncState = this.opts.syncRef.current;
    const obstacles: { x: number; y: number }[] = [];
    for (const player of syncState.players) {
      if (localId && player.id === localId) continue;
      const remotePos = this.remotePxRef.get(player.id);
      obstacles.push(remotePos ?? { x: player.x, y: player.y });
    }
    return obstacles;
  }

  private collectAnimalObstacles(): { x: number; y: number }[] {
    return this.animalsRef.map((animal) => animal.getPosition());
  }

  private resolveLocalSpawnOverlap(tileSize: number, worldCols: number, worldRows: number): void {
    const localId = this.opts.syncRef.current.localId;
    const localPx = this.localPxRef;
    const playerPositions = this.collectPlayerPositions(localId, localPx);
    for (const animal of this.animalsRef) {
      animal.update(playerPositions, 1 / 60);
    }
    const resolved = resolveEntityOverlaps(
      localPx.x,
      localPx.y,
      this.collectRemotePlayerObstacles(localId),
      tileSize,
      worldCols,
      worldRows,
      1,
    );
    this.localPxRef.x = resolved.x;
    this.localPxRef.y = resolved.y;
  }

  /**
   * Populate the animal layer with one bull + one cow at deterministic per-room positions.
   * Safe to call when {@link animalTextures} failed to load — simply does nothing.
   */
  private spawnAnimals(): void {
    const bodyLayer = this.playerBodyLayerRef;
    const textures = this.animalTextures;
    if (!bodyLayer || !textures) return;

    for (const animal of this.animalsRef) animal.destroy();
    this.animalsRef = [];

    const { tileSize, worldCols, worldRows } = this.opts.dimensions;
    const homes = animalHomeAnchors(this.opts.roomId, tileSize, worldCols, worldRows);

    const bull = new Animal(
      'bull',
      textures.bull,
      tileSize,
      worldCols,
      worldRows,
      homes.bull.x,
      homes.bull.y,
      animalSeedBase(this.opts.roomId, 'bull'),
    );
    bull.view.zIndex = homes.bull.y;
    bodyLayer.addChild(bull.view);
    this.animalsRef.push(bull);

    const cow = new Animal(
      'cow',
      textures.cow,
      tileSize,
      worldCols,
      worldRows,
      homes.cow.x,
      homes.cow.y,
      animalSeedBase(this.opts.roomId, 'cow'),
    );
    cow.view.zIndex = homes.cow.y;
    bodyLayer.addChild(cow.view);
    this.animalsRef.push(cow);
    bodyLayer.sortChildren();
  }

  rebuildPlayerLayer(players: PlayerDTO[], localId: string | null, tileSize: number): void {
    const bodyLayer = this.playerBodyLayerRef;
    const nameLayer = this.playerNameLayerRef;
    if (!bodyLayer || !nameLayer) return;

    for (const root of [...this.playerRootByIdRef.values()]) {
      bodyLayer.removeChild(root);
      root.destroy({ children: true });
    }
    for (let idx = nameLayer.children.length - 1; idx >= 0; idx -= 1) {
      nameLayer.removeChildAt(idx).destroy({ children: true });
    }
    this.playerRootByIdRef.clear();
    this.playerNameLabelByIdRef.clear();
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
        ...roomWorldCanvasTextOptions(),
        style: {
          fontFamily: ROOM_PIXEL_FONT_STACK,
          fontSize: 11,
          letterSpacing: 0,
          lineHeight: 14,
          fill: 0xf8fafc,
          stroke: { color: 0x0f172a, width: 3 },
          align: 'center',
        },
      });
      nameLabel.anchor.set(0.5, 1);
      // Sprite view is shifted left by pad; sprite center world-x is size/2 - pad (Graphic fallback stays size/2).
      const nameCenterX = characterTextures ? size / 2 - pad : size / 2;

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
      root.zIndex = py;
      nameLabel.position.set(px + nameCenterX, py - spriteOverhang - PLAYER_NAME_LABEL_BOTTOM_GAP_PX);
      nameLabel.zIndex = py;
      this.prevRenderedPxRef.set(player.id, { x: px, y: py });
      this.playerRootByIdRef.set(player.id, root);
      this.playerNameLabelByIdRef.set(player.id, nameLabel);
      bodyLayer.addChild(root);
      nameLayer.addChild(nameLabel);
    }

    bodyLayer.sortChildren();
    nameLayer.sortChildren();
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
    this.resolveLocalSpawnOverlap(syncState.tileSize, syncState.worldCols, syncState.worldRows);
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
        (viewCols * tileSize) / ROOM_CAMERA_ZOOM,
        (viewRows * tileSize) / ROOM_CAMERA_ZOOM,
        worldCols * tileSize,
        worldRows * tileSize,
      );
      worldContainer.position.set(-left, -top);
    }
    syncState.onPositionSync({ x: this.localPxRef.x, y: this.localPxRef.y });
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

    this.worldRain?.destroy();
    this.worldRain = null;
    this.worldSnow?.destroy();
    this.worldSnow = null;

    const app = this.app;
    if (app?.ticker && this.tickerFn) {
      app.ticker.remove(this.tickerFn);
    }
    this.tickerFn = null;
    this.playerRootByIdRef.clear();
    this.playerNameLabelByIdRef.clear();
    this.playerAvatarByIdRef.clear();
    this.prevRenderedPxRef.clear();
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();
    this.characterTextures = null;
    for (const animal of this.animalsRef) animal.destroy();
    this.animalsRef = [];
    this.animalTextures = null;
    this.opts.syncRef.current.minimapSnapshot = null;
    this.playerBodyLayerRef = null;
    this.playerNameLayerRef = null;
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
