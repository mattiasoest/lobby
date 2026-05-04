import grassBg from '../../assets/bg/grass.jpg';
import type { Ticker } from 'pixi.js';
import { Application, Assets, Container, Graphics, TilingSprite } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import type { PlayerDTO } from '../../types.ts';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Tiles per second traveled while interpolating toward the logical cell. (~9 ≈ 110ms per cell) */
const MOVE_TILES_PER_SEC = 9;

/** Scroll tile origin so `cameraTarget` sits near viewport center without showing void past world bounds. */
function scrollTileOrigin(
  cameraTarget: { x: number; y: number },
  viewCols: number,
  viewRows: number,
  worldCols: number,
  worldRows: number
) {
  const maxSX = Math.max(0, worldCols - viewCols);
  const maxSY = Math.max(0, worldRows - viewRows);
  const cx = clamp(
    cameraTarget.x - Math.floor((viewCols - 1) / 2),
    0,
    maxSX
  );
  const cy = clamp(cameraTarget.y - Math.floor((viewRows - 1) / 2), 0, maxSY);
  return { sx: cx, sy: cy };
}

function stepTowardAxis(current: number, goal: number, maxDelta: number) {
  const d = goal - current;
  if (Math.abs(d) <= 1e-5) return goal;
  const ad = Math.abs(d);
  if (ad <= maxDelta) return goal;
  return current + Math.sign(d) * maxDelta;
}

type Props = {
  tileSize: number
  viewCols: number
  viewRows: number
  worldCols: number
  worldRows: number
  /** Local player's logical grid — smooth visual + camera lerps toward this. */
  cameraTarget: { x: number; y: number }
  players: PlayerDTO[]
  localId: string | null
  /** Resets interpolated camera/player when entering another room */
  roomId: number
  keysDisabled?: boolean
  onMoveIntent: (dx: number, dy: number) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return target.closest('textarea, input, select, button') !== null;
}

export function PixiCanvas({
  tileSize,
  viewCols,
  viewRows,
  worldCols,
  worldRows,
  cameraTarget,
  players,
  localId,
  keysDisabled,
  onMoveIntent,
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
  const cameraGoalRef = useRef(cameraTarget);
  const playersRef = useRef(players);
  const localIdRef = useRef(localId);
  const smoothCamRef = useRef({ x: cameraTarget.x, y: cameraTarget.y });

  tileSizeRef.current = tileSize;
  viewColsRef.current = viewCols;
  viewRowsRef.current = viewRows;
  worldColsRef.current = worldCols;
  worldRowsRef.current = worldRows;
  cameraGoalRef.current = cameraTarget;
  playersRef.current = players;
  localIdRef.current = localId;

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

      smoothCamRef.current = {
        x: cameraGoalRef.current.x,
        y: cameraGoalRef.current.y,
      };

      function tickRun(ticker: Ticker) {
        const ts = tileSizeRef.current;
        const goal = cameraGoalRef.current;
        const smooth = smoothCamRef.current;
        const step = MOVE_TILES_PER_SEC * (ticker.deltaMS / 1000);

        smooth.x = stepTowardAxis(smooth.x, goal.x, step);
        smooth.y = stepTowardAxis(smooth.y, goal.y, step);

        const w = worldRef.current;
        if (w) {
          const { sx, sy } = scrollTileOrigin(
            smooth,
            viewColsRef.current,
            viewRowsRef.current,
            worldColsRef.current,
            worldRowsRef.current
          );
          w.position.set(-sx * ts, -sy * ts);
        }

        const pad = ts * 0.14;
        const lid = localIdRef.current;
        for (const p of playersRef.current) {
          const gfx = spriteByIdRef.current.get(p.id);
          if (!gfx) continue;
          const isLocal = !!lid && p.id === lid;
          const gx = isLocal ? smooth.x : p.x;
          const gy = isLocal ? smooth.y : p.y;
          gfx.position.set(gx * ts + pad, gy * ts + pad);
        }
      }

      tickerFnRef.current = tickRun;
      app.ticker.add(tickRun);

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

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const smooth = smoothCamRef.current;

    for (const p of players) {
      const graphic = new Graphics();
      const isLocal = !!localId && p.id === localId;
      graphic.rect(0, 0, size, size);
      graphic.fill({ color: isLocal ? 0x34d399 : 0x60a5fa });
      const gx = isLocal ? smooth.x : p.x;
      const gy = isLocal ? smooth.y : p.y;
      graphic.position.set(gx * tileSize + pad, gy * tileSize + pad);
      spriteByIdRef.current.set(p.id, graphic);
      layer.addChild(graphic);
    }
  }, [canvasReady, localId, players, tileSize]);

  useEffect(() => {
    smoothCamRef.current.x = cameraGoalRef.current.x;
    smoothCamRef.current.y = cameraGoalRef.current.y;
    const w = worldRef.current;
    if (!w) return;
    const ts = tileSizeRef.current;
    const { sx, sy } = scrollTileOrigin(
      smoothCamRef.current,
      viewColsRef.current,
      viewRowsRef.current,
      worldColsRef.current,
      worldRowsRef.current
    );
    w.position.set(-sx * ts, -sy * ts);
  }, [roomId]);

  useEffect(() => {
    const moveCb = onMoveIntent;
    function onKey(e: KeyboardEvent) {
      if (keysDisabled || isTypingTarget(e.target)) return;
      let dx = 0;
      let dy = 0;
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) dx = -1;
      else if (['ArrowRight', 'd', 'D'].includes(e.key)) dx = 1;
      else if (['ArrowUp', 'w', 'W'].includes(e.key)) dy = -1;
      else if (['ArrowDown', 's', 'S'].includes(e.key)) dy = 1;
      else return;
      e.preventDefault();
      moveCb(dx, dy);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysDisabled, onMoveIntent]);

  return <div ref={mountRef} className="pixi-mount" aria-label="Room canvas" />;
}
