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
const MOVE_PX_PER_SEC = 220;

/** Blend each remote snapshot toward the next over this window (≤ sync interval feels smooth). */
const REMOTE_INTERP_MS = 31;

/** Ignore sub-pixel server jitter (Squared distance threshold). */
const REMOTE_SNAP_EPS_SQ = 0.04 * 0.04;

type RemoteLerp = {
  from: { x: number; y: number }
  to: { x: number; y: number }
  startTime: number
}

function smoothstep01(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
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
  const remoteLerpRef = useRef<Map<string, RemoteLerp>>(new Map());
  const lastServerSnapRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastSyncAtRef = useRef(0);

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

        const plist = playersRef.current;
        for (const p of plist) {
          if (lid && p.id === lid) continue;
          const prev = lastServerSnapRef.current.get(p.id);
          const moved =
            !prev ||
            (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 > REMOTE_SNAP_EPS_SQ;
          if (moved) {
            lastServerSnapRef.current.set(p.id, { x: p.x, y: p.y });
            const curVisual = remotePxRef.current.get(p.id) ?? { x: p.x, y: p.y };
            remoteLerpRef.current.set(p.id, {
              from: { ...curVisual },
              to: { x: p.x, y: p.y },
              startTime: now,
            });
          }
        }

        for (const p of plist) {
          if (lid && p.id === lid) continue;
          const ls = remoteLerpRef.current.get(p.id);
          if (!ls) {
            remotePxRef.current.set(p.id, { x: p.x, y: p.y });
            continue;
          }
          const rawT = (now - ls.startTime) / REMOTE_INTERP_MS;
          if (rawT >= 1) {
            remotePxRef.current.set(p.id, { x: ls.to.x, y: ls.to.y });
          } else {
            const t = smoothstep01(rawT);
            remotePxRef.current.set(p.id, {
              x: ls.from.x + (ls.to.x - ls.from.x) * t,
              y: ls.from.y + (ls.to.y - ls.from.y) * t,
            });
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

        if (now - lastSyncAtRef.current >= SYNC_MS) {
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
      remoteLerpRef.current.clear();
      lastServerSnapRef.current.clear();
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
    remoteLerpRef.current.clear();
    lastServerSnapRef.current.clear();

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const lid = localId;

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
    remoteLerpRef.current.clear();
    lastServerSnapRef.current.clear();
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
