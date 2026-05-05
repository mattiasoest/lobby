import grassBg from '../../assets/bg/grass.jpg';
import type { Ticker } from 'pixi.js';
import { Application, Assets, Container, Graphics, TilingSprite } from 'pixi.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerDTO } from '../../types.ts';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** World position sync to server (Hz) */
const POSITION_SYNC_HZ = 30;
const SYNC_MS = 1000 / POSITION_SYNC_HZ;

/** Local movement speed (px/s) */
const MOVE_PX_PER_SEC = 110;

/**
 * Playback delay bounds: shallow buffers use the min so motion starts sooner;
 * once depth builds, ramp toward max for steadier bracketing.
 */
const REMOTE_RENDER_DELAY_MAX_MS = 105;
const REMOTE_RENDER_DELAY_MIN_MS = 45;

/** Drop buffered samples older than this to cap memory. */
const REMOTE_SAMPLE_TTL_MS = 2500;

const MAX_REMOTE_SAMPLES = 48;

/**
 * Drop front anchors if the gap before the next sample exceeds ~2 network steps.
 * Keeps interpolation segments short so idle→motion doesn't span huge time windows.
 */
const MAX_REMOTE_SEGMENT_MS = SYNC_MS * 2 + 24;

/** Ignore jittery duplicate snapshots (world px). */
const REMOTE_SNAP_EPS_SQ = 0.06 * 0.06;

/** Soft follow from last drawn pos → buffer target (higher = snappier, lower = silkier). */
const REMOTE_DISPLAY_LAMBDA = 26;
/** After rest→motion, follow buffer target more tightly for a longer window. */
const REMOTE_DISPLAY_LAMBDA_BURST = 64;
const REMOTE_BURST_DURATION_MS = 308;
/** Smoothed speed below this (px/s) counts as “idle” for wake detection. */
const REMOTE_BURST_IDLE_SPEED_PX_S = 22;
/** Smoothed speed above this after idle starts the burst window (lower = catches gentle starts). */
const REMOTE_BURST_WAKE_SPEED_PX_S = 43;
/** During burst, shave ms off render delay (floor still applies). */
const REMOTE_BURST_DELAY_SHAVE_MS = 20;
const REMOTE_RENDER_DELAY_FLOOR_MS = 25;

type RemoteSample = { t: number; x: number; y: number }

function dropRemoteStaleAnchors(samples: RemoteSample[]): void {
  while (samples.length >= 2) {
    const a = samples[0];
    const b = samples[1];
    if (b.t - a.t > MAX_REMOTE_SEGMENT_MS) {
      samples.shift();
    } else {
      break;
    }
  }
}

/** No-op: kept so stale callers cannot throw after removing squash behavior. */
function squashRemoteIdleLeadIn(_samples: RemoteSample[]): void {}

function remoteRenderDelayMs(samples: RemoteSample[]): number {
  if (samples.length <= 2) return REMOTE_RENDER_DELAY_MIN_MS;
  const span = REMOTE_RENDER_DELAY_MAX_MS - REMOTE_RENDER_DELAY_MIN_MS;
  const depth = clamp((samples.length - 2) / 3, 0, 1);
  return REMOTE_RENDER_DELAY_MIN_MS + span * depth;
}

function smoothstep01(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function posFromRemoteBuffer(samples: RemoteSample[], playbackT: number): { x: number; y: number } {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (samples.length === 1) return { x: samples[0].x, y: samples[0].y };

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (playbackT <= first.t) return { x: first.x, y: first.y };
  if (playbackT >= last.t) return { x: last.x, y: last.y };

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (playbackT <= b.t) {
      const span = b.t - a.t;
      const uLin = span < 1e-6 ? 0 : clamp((playbackT - a.t) / span, 0, 1);
      const u = smoothstep01(uLin);
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
      };
    }
  }
  return { x: last.x, y: last.y };
}

function scrollWorldPx(
  avatarLeft: number,
  avatarTop: number,
  avatarSize: number,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number
) {
  const cx = avatarLeft + avatarSize / 2;
  const cy = avatarTop + avatarSize / 2;
  const maxLeft = Math.max(0, worldW - viewW);
  const maxTop = Math.max(0, worldH - viewH);
  return {
    left: clamp(cx - viewW / 2, 0, maxLeft),
    top: clamp(cy - viewH / 2, 0, maxTop),
  };
}

function clampWorldTopLeft(
  x: number,
  y: number,
  tileSize: number,
  worldCols: number,
  worldRows: number
) {
  const pad = tileSize * 0.14;
  const size = tileSize - pad * 2;
  const w = worldCols * tileSize;
  const h = worldRows * tileSize;
  return {
    x: clamp(x, pad, w - pad - size),
    y: clamp(y, pad, h - pad - size),
  };
}

type Props = {
  tileSize: number
  viewCols: number
  viewRows: number
  worldCols: number
  worldRows: number
  /** Initial / reset position for local avatar (world px, top-left of sprite) */
  worldSpawnPx: { x: number; y: number }
  players: PlayerDTO[]
  localId: string | null
  roomId: number
  keysDisabled?: boolean
  /** Matches POSITION_SYNC_HZ; parent emits to socket */
  onPositionSync: (pos: { x: number; y: number }) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return target.closest('textarea, input, select, button') !== null;
}

const MOVE_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'w',
  'W',
  'a',
  'A',
  's',
  'S',
  'd',
  'D',
]);

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
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const layerRef = useRef<Container | null>(null);
  const spriteByIdRef = useRef<Map<string, Graphics>>(new Map());
  const tickerFnRef = useRef<((ticker: Ticker) => void) | null>(null);

  const tileSizeRef = useRef(tileSize);
  const viewColsRef = useRef(viewCols);
  const viewRowsRef = useRef(viewRows);
  const worldColsRef = useRef(worldCols);
  const worldRowsRef = useRef(worldRows);
  const playersRef = useRef(players);
  const localIdRef = useRef(localId);
  const onPositionSyncRef = useRef(onPositionSync);
  const keysRef = useRef({ up: false, down: false, left: false, right: false });

  const localPxRef = useRef({ x: worldSpawnPx.x, y: worldSpawnPx.y });
  const remotePxRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const remoteSampleBufRef = useRef<Map<string, RemoteSample[]>>(new Map());
  const lastServerSnapRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastSyncAtRef = useRef(0);
  /** True when local player had movement keys active last tick (for instant first sync on key-down). */
  const localWasMovingRef = useRef(false);
  /** Per-remote: previous buffer target (world px) for speed estimate. */
  const remoteTargetPrevRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const remoteSpeedSmoothedRef = useRef<Map<string, number>>(new Map());
  const remoteBurstUntilRef = useRef<Map<string, number>>(new Map());

  tileSizeRef.current = tileSize;
  viewColsRef.current = viewCols;
  viewRowsRef.current = viewRows;
  worldColsRef.current = worldCols;
  worldRowsRef.current = worldRows;
  playersRef.current = players;
  localIdRef.current = localId;
  onPositionSyncRef.current = onPositionSync;

  const playerIdsSig = useMemo(
    () => players.map((p) => p.id).sort().join(','),
    [players]
  );

  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!mountRef.current) return;

    async function bootstrap() {
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
      if (cancelled) {
        await app.destroy();
        return;
      }

      const mount = mountRef.current;
      if (!mount) {
        await app.destroy();
        return;
      }

      const canvas = app.canvas as HTMLCanvasElement;
      canvas.dataset.pixiCanvas = '';
      mount.appendChild(canvas);
      appRef.current = app;

      const world = new Container();
      worldRef.current = world;

      let grassTexture;
      try {
        grassTexture = await Assets.load(grassBg);
      } catch {
        grassTexture = null;
      }
      if (!cancelled && grassTexture) {
        const grass = new TilingSprite({
          texture: grassTexture,
          width: worldPixelW,
          height: worldPixelH,
        });
        world.addChild(grass);
      }

      const layer = new Container();
      layerRef.current = layer;
      world.addChild(layer);

      app.stage.addChild(world);

      const spawn = clampWorldTopLeft(
        worldSpawnPx.x,
        worldSpawnPx.y,
        tileSize,
        worldCols,
        worldRows
      );
      localPxRef.current = { ...spawn };
      lastSyncAtRef.current = 0;
      localWasMovingRef.current = false;

      const pad0 = tileSize * 0.14;
      const size0 = tileSize - pad0 * 2;

      function tickRun(ticker: Ticker) {
        const now = performance.now();
        const ts = tileSizeRef.current;
        const wc = worldColsRef.current;
        const wr = worldRowsRef.current;
        const vc = viewColsRef.current;
        const vr = viewRowsRef.current;
        const lid = localIdRef.current;
        const pad = ts * 0.14;
        const size = ts - pad * 2;
        const worldW = wc * ts;
        const worldH = wr * ts;
        const viewW = vc * ts;
        const viewH = vr * ts;

        const k = keysRef.current;
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
        const local = localPxRef.current;
        if (len > 0) {
          local.x += vx * step;
          local.y += vy * step;
          const c = clampWorldTopLeft(local.x, local.y, ts, wc, wr);
          local.x = c.x;
          local.y = c.y;
        }

        const startedMove = len > 0 && !localWasMovingRef.current;
        localWasMovingRef.current = len > 0;

        const plist = playersRef.current;
        for (const p of plist) {
          if (lid && p.id === lid) continue;

          let samples = remoteSampleBufRef.current.get(p.id);
          if (!samples) {
            samples = [{ t: now, x: p.x, y: p.y }];
            remoteSampleBufRef.current.set(p.id, samples);
            lastServerSnapRef.current.set(p.id, { x: p.x, y: p.y });
          } else {
            const prev = lastServerSnapRef.current.get(p.id);
            const moved =
              !prev ||
              (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 > REMOTE_SNAP_EPS_SQ;
            if (moved) {
              lastServerSnapRef.current.set(p.id, { x: p.x, y: p.y });
              samples.push({ t: now, x: p.x, y: p.y });
              while (samples.length > MAX_REMOTE_SAMPLES) {
                samples.shift();
              }
            }
          }

          const arr = remoteSampleBufRef.current.get(p.id);
          if (arr && arr.length > 0) {
            const cutoff = now - REMOTE_SAMPLE_TTL_MS;
            while (arr.length > 1 && arr[0].t < cutoff) {
              arr.shift();
            }
            squashRemoteIdleLeadIn(arr);
            dropRemoteStaleAnchors(arr);
          }

          const ready = remoteSampleBufRef.current.get(p.id) ?? [];
          const baseDelay = remoteRenderDelayMs(ready);
          let burst = now < (remoteBurstUntilRef.current.get(p.id) ?? 0);

          let playbackDelay = burst
            ? Math.max(REMOTE_RENDER_DELAY_FLOOR_MS, baseDelay - REMOTE_BURST_DELAY_SHAVE_MS)
            : baseDelay;
          let target = posFromRemoteBuffer(ready, now - playbackDelay);

          const prevTarget = remoteTargetPrevRef.current.get(p.id);
          let instSpeed = 0;
          if (prevTarget) {
            const invDt = 1 / Math.max(dt, 1e-4);
            instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
          }
          const prevSmooth = remoteSpeedSmoothedRef.current.get(p.id) ?? 0;
          let smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;

          const woke =
            prevTarget !== undefined &&
            prevSmooth < REMOTE_BURST_IDLE_SPEED_PX_S &&
            smoothSpeed > REMOTE_BURST_WAKE_SPEED_PX_S;

          if (woke) {
            remoteBurstUntilRef.current.set(p.id, now + REMOTE_BURST_DURATION_MS);
            if (!burst) {
              burst = true;
              playbackDelay = Math.max(
                REMOTE_RENDER_DELAY_FLOOR_MS,
                baseDelay - REMOTE_BURST_DELAY_SHAVE_MS
              );
              target = posFromRemoteBuffer(ready, now - playbackDelay);
              if (prevTarget) {
                const invDt = 1 / Math.max(dt, 1e-4);
                instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
                smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;
              }
            }
          }

          remoteSpeedSmoothedRef.current.set(p.id, smoothSpeed);
          remoteTargetPrevRef.current.set(p.id, { x: target.x, y: target.y });

          const prevDrawn = remotePxRef.current.get(p.id);
          const lambda = burst ? REMOTE_DISPLAY_LAMBDA_BURST : REMOTE_DISPLAY_LAMBDA;
          const blend = 1 - Math.exp(-lambda * dt);
          if (!prevDrawn) {
            remotePxRef.current.set(p.id, { ...target });
          } else {
            remotePxRef.current.set(p.id, {
              x: prevDrawn.x + (target.x - prevDrawn.x) * blend,
              y: prevDrawn.y + (target.y - prevDrawn.y) * blend,
            });
          }
        }

        const remoteIds = new Set<string>();
        for (const p of plist) {
          if (!(lid && p.id === lid)) remoteIds.add(p.id);
        }
        for (const id of [...remoteSampleBufRef.current.keys()]) {
          if (!remoteIds.has(id)) {
            remoteSampleBufRef.current.delete(id);
            lastServerSnapRef.current.delete(id);
            remotePxRef.current.delete(id);
            remoteTargetPrevRef.current.delete(id);
            remoteSpeedSmoothedRef.current.delete(id);
            remoteBurstUntilRef.current.delete(id);
          }
        }

        const w = worldRef.current;
        if (w) {
          const { left, top } = scrollWorldPx(
            local.x,
            local.y,
            size,
            viewW,
            viewH,
            worldW,
            worldH
          );
          w.position.set(-left, -top);
        }

        for (const p of plist) {
          const gfx = spriteByIdRef.current.get(p.id);
          if (!gfx) continue;
          const isLocal = !!lid && p.id === lid;
          const pos = isLocal ? local : remotePxRef.current.get(p.id);
          if (!pos) continue;
          gfx.position.set(pos.x, pos.y);
        }

        if (startedMove || now - lastSyncAtRef.current >= SYNC_MS) {
          lastSyncAtRef.current = now;
          onPositionSyncRef.current({ x: local.x, y: local.y });
        }
      }

      tickerFnRef.current = tickRun;
      app.ticker.add(tickRun);

      const { left, top } = scrollWorldPx(
        localPxRef.current.x,
        localPxRef.current.y,
        size0,
        viewPixelW,
        viewPixelH,
        worldPixelW,
        worldPixelH
      );
      world.position.set(-left, -top);

      setCanvasReady(true);
    }

    void bootstrap();

    return () => {
      cancelled = true;
      setCanvasReady(false);
      const app = appRef.current;
      if (app?.ticker && tickerFnRef.current) {
        app.ticker.remove(tickerFnRef.current);
      }
      tickerFnRef.current = null;
      spriteByIdRef.current.clear();
      remotePxRef.current.clear();
      remoteSampleBufRef.current.clear();
      lastServerSnapRef.current.clear();
      remoteTargetPrevRef.current.clear();
      remoteSpeedSmoothedRef.current.clear();
      remoteBurstUntilRef.current.clear();
      layerRef.current = null;
      worldRef.current = null;

      appRef.current = null;
      void app?.destroy(true);
      const node = mountRef.current;
      while (node?.firstChild) node.removeChild(node.firstChild);
    };
  }, [tileSize, viewCols, viewRows, worldCols, worldRows]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !canvasReady) return;

    for (let idx = layer.children.length - 1; idx >= 0; idx -= 1) {
      layer.removeChildAt(idx).destroy({ children: true });
    }
    spriteByIdRef.current.clear();
    remotePxRef.current.clear();
    remoteSampleBufRef.current.clear();
    lastServerSnapRef.current.clear();
    remoteTargetPrevRef.current.clear();
    remoteSpeedSmoothedRef.current.clear();
    remoteBurstUntilRef.current.clear();

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const lid = localId;
    const tSeed = performance.now();

    for (const p of players) {
      const graphic = new Graphics();
      const isLocal = !!lid && p.id === lid;
      graphic.rect(0, 0, size, size);
      graphic.fill({ color: isLocal ? 0x34d399 : 0x60a5fa });
      let px = p.x;
      let py = p.y;
      if (isLocal) {
        const loc = localPxRef.current;
        px = loc.x;
        py = loc.y;
      } else {
        remotePxRef.current.set(p.id, { x: p.x, y: p.y });
        remoteSampleBufRef.current.set(p.id, [{ t: tSeed, x: p.x, y: p.y }]);
        lastServerSnapRef.current.set(p.id, { x: p.x, y: p.y });
      }
      graphic.position.set(px, py);
      spriteByIdRef.current.set(p.id, graphic);
      layer.addChild(graphic);
    }
  }, [canvasReady, localId, playerIdsSig, tileSize]);

  useEffect(() => {
    const spawn = clampWorldTopLeft(
      worldSpawnPx.x,
      worldSpawnPx.y,
      tileSizeRef.current,
      worldColsRef.current,
      worldRowsRef.current
    );
    localPxRef.current = { ...spawn };
    remotePxRef.current.clear();
    remoteSampleBufRef.current.clear();
    lastServerSnapRef.current.clear();
    remoteTargetPrevRef.current.clear();
    remoteSpeedSmoothedRef.current.clear();
    remoteBurstUntilRef.current.clear();
    localWasMovingRef.current = false;
    lastSyncAtRef.current = 0;

    const w = worldRef.current;
    const ts = tileSizeRef.current;
    const wc = worldColsRef.current;
    const wr = worldRowsRef.current;
    const vc = viewColsRef.current;
    const vr = viewRowsRef.current;
    if (w && canvasReady) {
      const pad = ts * 0.14;
      const size = ts - pad * 2;
      const loc = localPxRef.current;
      const { left, top } = scrollWorldPx(
        loc.x,
        loc.y,
        size,
        vc * ts,
        vr * ts,
        wc * ts,
        wr * ts
      );
      w.position.set(-left, -top);
    }
    onPositionSyncRef.current({ x: spawn.x, y: spawn.y });
  }, [roomId, canvasReady, worldSpawnPx.x, worldSpawnPx.y]);

  useEffect(() => {
    if (keysDisabled) {
      keysRef.current = { up: false, down: false, left: false, right: false };
    }
  }, [keysDisabled]);

  useEffect(() => {
    function setMoveKey(code: string, down: boolean) {
      switch (code) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          keysRef.current.up = down;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          keysRef.current.down = down;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          keysRef.current.left = down;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          keysRef.current.right = down;
          break;
        default:
          break;
      }
    }

    function onDown(e: KeyboardEvent) {
      if (keysDisabled || isTypingTarget(e.target)) return;
      if (!MOVE_KEYS.has(e.key)) return;
      setMoveKey(e.key, true);
      e.preventDefault();
    }

    function onUp(e: KeyboardEvent) {
      if (!MOVE_KEYS.has(e.key)) return;
      setMoveKey(e.key, false);
      e.preventDefault();
    }

    function blur() {
      keysRef.current = { up: false, down: false, left: false, right: false };
    }

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', blur);
    };
  }, [keysDisabled]);

  return <div ref={mountRef} className="pixi-mount" aria-label="Room canvas" />;
}
