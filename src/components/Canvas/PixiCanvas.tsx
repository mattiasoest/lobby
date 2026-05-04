import { Application, Container, Graphics } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import type { PlayerDTO } from '../../types.ts';

type Props = {
  tileSize: number
  cols: number
  rows: number
  players: PlayerDTO[]
  localId: string | null
  /** When true (e.g. chat input focused), arrow keys stay in the composer */
  keysDisabled?: boolean
  /** Grid delta request from keyboard; parent clamps and owns authoritative position */
  onMoveIntent: (dx: number, dy: number) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return target.closest('textarea, input, select, button') !== null;
}

export function PixiCanvas({
  tileSize,
  cols,
  rows,
  players,
  localId,
  keysDisabled,
  onMoveIntent,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<Container | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!mountRef.current) return;

    async function bootstrap() {
      const app = new Application();
      await app.init({
        width: cols * tileSize,
        height: rows * tileSize,
        backgroundColor: 0x111827,
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

      const layer = new Container();
      layerRef.current = layer;
      app.stage.addChild(layer);
      setCanvasReady(true);
    }

    void bootstrap();

    return () => {
      cancelled = true;
      setCanvasReady(false);
      layerRef.current = null;

      const app = appRef.current;
      appRef.current = null;
      void app?.destroy(true);
      const node = mountRef.current;
      while (node?.firstChild) node.removeChild(node.firstChild);
    };
  }, [cols, rows, tileSize]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !canvasReady) return;

    for (let idx = layer.children.length - 1; idx >= 0; idx -= 1) {
      layer.removeChildAt(idx).destroy({ children: true });
    }

    for (const p of players) {
      const graphic = new Graphics();
      const isLocal = !!localId && p.id === localId;
      const pad = tileSize * 0.14;
      const size = tileSize - pad * 2;
      const px = p.x * tileSize + pad;
      const py = p.y * tileSize + pad;

      graphic.rect(0, 0, size, size);
      graphic.fill({ color: isLocal ? 0x34d399 : 0x60a5fa });
      graphic.position.set(px, py);
      layer.addChild(graphic);
    }
  }, [canvasReady, localId, players, tileSize]);

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
