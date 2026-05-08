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
import type { RoomCanvasSyncState } from './syncState.ts';
import {
  clampWorldTopLeft,
  dropRemoteStaleAnchors,
  posFromRemoteBuffer,
  remoteRenderDelayMs,
  scrollWorldPx,
  type RemoteSample,
} from './worldMath.ts';

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
  /** Resolved asset URL (e.g. Vite import). */
  grassTextureSrc: string;
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
  private tickerFn: ((ticker: Ticker) => void) | null = null;

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

  private keyDown = (e: KeyboardEvent) => {
    if (this.opts.syncRef.current.keysDisabled || isTypingTarget(e.target)) return;
    if (!MOVE_KEYS.has(e.key)) return;
    setMoveKey(this.keysInternal, e.key, true);
    e.preventDefault();
  };

  private keyUp = (e: KeyboardEvent) => {
    if (!MOVE_KEYS.has(e.key)) return;
    setMoveKey(this.keysInternal, e.key, false);
    e.preventDefault();
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

    let grassTexture;
    try {
      grassTexture = await Assets.load(grassTextureSrc);
    } catch {
      grassTexture = null;
    }
    if (!this.cancelBootstrap && grassTexture) {
      const grass = new TilingSprite({
        texture: grassTexture,
        width: worldPixelW,
        height: worldPixelH,
      });
      world.addChild(grass);
    }
    if (this.cancelBootstrap) {
      await app.destroy();
      return;
    }

    const layer = new Container();
    this.layerRef = layer;
    world.addChild(layer);

    const speechBubbleRoot = new Container();
    this.speechBubbleWorldRef = speechBubbleRoot;
    world.addChild(speechBubbleRoot);

    app.stage.addChild(world);

    const spawn = clampWorldTopLeft(worldSpawnPx.x, worldSpawnPx.y, tileSize, worldCols, worldRows);
    this.localPxRef = { ...spawn };
    this.lastSyncAtRef = 0;
    this.localWasMovingRef = false;

    const pad0 = tileSize * 0.14;
    const size0 = tileSize - pad0 * 2;

    const tickRun = (ticker: Ticker) => {
      const now = performance.now();
      const sSync = this.opts.syncRef.current;
      const ts = sSync.tileSize;
      const wc = sSync.worldCols;
      const wr = sSync.worldRows;
      const vc = sSync.viewCols;
      const vr = sSync.viewRows;
      const lid = sSync.localId;
      const pad = ts * 0.14;
      const size = ts - pad * 2;
      const worldW = wc * ts;
      const worldH = wr * ts;
      const viewW = vc * ts;
      const viewH = vr * ts;

      const k = this.keysInternal;
      let vx = 0;
      let vy = 0;
      if (k.left) vx -= 1;
      if (k.right) vx += 1;
      if (k.up) vy -= 1;
      if (k.down) vy += 1;
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
        const c = clampWorldTopLeft(local.x, local.y, ts, wc, wr);
        local.x = c.x;
        local.y = c.y;
      }

      const startedMove = len > 0 && !this.localWasMovingRef;
      this.localWasMovingRef = len > 0;

      const plist = sSync.players;
      for (const p of plist) {
        if (lid && p.id === lid) continue;

        let samples = this.remoteSampleBufRef.get(p.id);
        if (!samples) {
          samples = [{ t: now, x: p.x, y: p.y }];
          this.remoteSampleBufRef.set(p.id, samples);
          this.lastServerSnapRef.set(p.id, { x: p.x, y: p.y });
        } else {
          const prev = this.lastServerSnapRef.get(p.id);
          const moved = !prev || (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 > REMOTE_SNAP_EPS_SQ;
          if (moved) {
            this.lastServerSnapRef.set(p.id, { x: p.x, y: p.y });
            samples.push({ t: now, x: p.x, y: p.y });
            while (samples.length > MAX_REMOTE_SAMPLES) {
              samples.shift();
            }
          }
        }

        const arr = this.remoteSampleBufRef.get(p.id);
        if (arr && arr.length > 0) {
          const cutoff = now - REMOTE_SAMPLE_TTL_MS;
          while (arr.length > 1 && arr[0].t < cutoff) {
            arr.shift();
          }
          dropRemoteStaleAnchors(arr);
        }

        const ready = this.remoteSampleBufRef.get(p.id) ?? [];
        const baseDelay = remoteRenderDelayMs(ready);
        let burst = now < (this.remoteBurstUntilRef.get(p.id) ?? 0);

        let playbackDelay = burst
          ? Math.max(REMOTE_RENDER_DELAY_FLOOR_MS, baseDelay - REMOTE_BURST_DELAY_SHAVE_MS)
          : baseDelay;
        let target = posFromRemoteBuffer(ready, now - playbackDelay);

        const prevTarget = this.remoteTargetPrevRef.get(p.id);
        let instSpeed = 0;
        if (prevTarget) {
          const invDt = 1 / Math.max(dt, 1e-4);
          instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
        }
        const prevSmooth = this.remoteSpeedSmoothedRef.get(p.id) ?? 0;
        let smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;

        const woke =
          prevTarget !== undefined &&
          prevSmooth < REMOTE_BURST_IDLE_SPEED_PX_S &&
          smoothSpeed > REMOTE_BURST_WAKE_SPEED_PX_S;

        if (woke) {
          this.remoteBurstUntilRef.set(p.id, now + REMOTE_BURST_DURATION_MS);
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

        this.remoteSpeedSmoothedRef.set(p.id, smoothSpeed);
        this.remoteTargetPrevRef.set(p.id, { x: target.x, y: target.y });

        const prevDrawn = this.remotePxRef.get(p.id);
        const lambda = burst ? REMOTE_DISPLAY_LAMBDA_BURST : REMOTE_DISPLAY_LAMBDA;
        const blend = 1 - Math.exp(-lambda * dt);
        if (!prevDrawn) {
          this.remotePxRef.set(p.id, { ...target });
        } else {
          this.remotePxRef.set(p.id, {
            x: prevDrawn.x + (target.x - prevDrawn.x) * blend,
            y: prevDrawn.y + (target.y - prevDrawn.y) * blend,
          });
        }
      }

      const remoteIds = new Set<string>();
      for (const p of plist) {
        if (!(lid && p.id === lid)) remoteIds.add(p.id);
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

      const w = this.worldRef;
      if (w) {
        const { left, top } = scrollWorldPx(local.x, local.y, size, viewW, viewH, worldW, worldH);
        w.position.set(-left, -top);
      }

      for (const p of plist) {
        const root = this.playerRootByIdRef.get(p.id);
        if (!root) continue;
        const isLocal = !!lid && p.id === lid;
        const pos = isLocal ? local : this.remotePxRef.get(p.id);
        if (!pos) continue;
        root.position.set(pos.x, pos.y);
      }

      const speechWorld = this.speechBubbleWorldRef;
      const layout = this.speechBubbleLayoutRef;
      if (!speechWorld || layout.size === 0) {
        if (speechWorld) speechWorld.visible = false;
      } else {
        speechWorld.visible = true;
        for (const [pid, { group, width: bw, height: bh }] of layout) {
          const isLocalBubble = !!lid && pid === lid;
          const pos = isLocalBubble ? local : this.remotePxRef.get(pid);
          const stillHere = plist.some((p) => p.id === pid);
          if (!pos || !stillHere) {
            group.visible = false;
            continue;
          }
          group.visible = true;
          group.position.set(pos.x + size / 2 - bw / 2, pos.y - SPEECH_BAND_ABOVE_AVATAR_PX - bh);
        }
      }

      if (startedMove || now - this.lastSyncAtRef >= SYNC_MS) {
        this.lastSyncAtRef = now;
        sSync.onPositionSync({ x: local.x, y: local.y });
      }
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
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const tSeed = performance.now();

    for (const p of players) {
      const root = new Container();
      const graphic = new Graphics();
      const isLocal = !!localId && p.id === localId;
      graphic.rect(0, 0, size, size);
      graphic.fill({ color: avatarColorOrFallback(p.id, p.color) });

      const nameLabel = new Text({
        text: p.username || 'Player',
        style: {
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          fontSize: 11,
          fill: 0xf9fafb,
          stroke: { color: 0x111827, width: 3 },
          align: 'center',
        },
      });
      nameLabel.anchor.set(0.5, 1);
      nameLabel.position.set(size / 2, -PLAYER_NAME_LABEL_BOTTOM_GAP_PX);

      root.addChild(graphic);
      root.addChild(nameLabel);

      let px = p.x;
      let py = p.y;
      if (isLocal) {
        const loc = this.localPxRef;
        px = loc.x;
        py = loc.y;
      } else {
        this.remotePxRef.set(p.id, { x: p.x, y: p.y });
        this.remoteSampleBufRef.set(p.id, [{ t: tSeed, x: p.x, y: p.y }]);
        this.lastServerSnapRef.set(p.id, { x: p.x, y: p.y });
      }
      root.position.set(px, py);
      this.playerRootByIdRef.set(p.id, root);
      layer.addChild(root);
    }
  }

  applyRoomSpawn(worldSpawnX: number, worldSpawnY: number): void {
    const s = this.opts.syncRef.current;
    const spawn = clampWorldTopLeft(worldSpawnX, worldSpawnY, s.tileSize, s.worldCols, s.worldRows);
    this.localPxRef = { ...spawn };
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();
    this.localWasMovingRef = false;
    this.lastSyncAtRef = 0;

    const w = this.worldRef;
    const ts = s.tileSize;
    const wc = s.worldCols;
    const wr = s.worldRows;
    const vc = s.viewCols;
    const vr = s.viewRows;
    if (w) {
      const pad = ts * 0.14;
      const size = ts - pad * 2;
      const loc = this.localPxRef;
      const { left, top } = scrollWorldPx(loc.x, loc.y, size, vc * ts, vr * ts, wc * ts, wr * ts);
      w.position.set(-left, -top);
    }
    s.onPositionSync({ x: spawn.x, y: spawn.y });
  }

  rebuildSpeechBubbles(
    localSpeechBubble: string | null,
    localId: string | null,
    remoteSpeechBubbles: ReadonlyMap<string, string>,
  ): void {
    const parent = this.speechBubbleWorldRef;
    if (!parent) return;

    for (const c of [...parent.children]) {
      parent.removeChild(c);
      c.destroy({ children: true });
    }
    this.speechBubbleLayoutRef.clear();

    type Entry = { playerId: string; text: string };
    const entries: Entry[] = [];
    const localTrimmed = localSpeechBubble?.trim();
    if (localTrimmed && localId) entries.push({ playerId: localId, text: localTrimmed });
    for (const [socketId, raw] of remoteSpeechBubbles) {
      const t = raw.trim();
      if (!t || socketId === localId) continue;
      entries.push({ playerId: socketId, text: t });
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

    const app = this.app;
    if (app?.ticker && this.tickerFn) {
      app.ticker.remove(this.tickerFn);
    }
    this.tickerFn = null;
    this.playerRootByIdRef.clear();
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();
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
