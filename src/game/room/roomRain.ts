import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';

export function rainEnabledForRoomId(roomId: number): boolean {
  const r = roomId | 0;
  return r === 2 || r === 3;
}

type Drop = { x: number; y: number; vy: number; length: number };

const MIN_DROPS = 120;
const MAX_DROPS = 420;
/** Target rain density (~px² per drop); tuned for TILE=32 / ~32×20 view */
const AREA_PER_DROP = 3800;

/** ~wind: horizontal drift in px/sec */
const WIND_PX_PER_SEC = 28;
/** Streak tilt from vertical (sin/cos multiplier on length) */
const SLANT_X = 0.22;
const SLANT_Y = 0.98;

export type ViewportRainApi = {
  update: (deltaMS: number) => void;
  destroy: () => void;
};

/**
 * Screen-space rain above the scrolling world.
 * Draws translucent streaks inside [0,viewW)×[0,viewH).
 */
export function createViewportRain(viewW: number, viewH: number, stage: Container): ViewportRainApi {
  const w = Math.max(1, viewW);
  const h = Math.max(1, viewH);

  const drops: Drop[] = [];
  let count = Math.round((w * h) / AREA_PER_DROP);
  count = Math.max(MIN_DROPS, Math.min(MAX_DROPS, count));

  const seedDrop = (): Drop => ({
    x: Math.random() * w,
    y: Math.random() * h - h * 0.5,
    vy: 380 + Math.random() * 140,
    length: 5 + Math.random() * 11,
  });

  for (let i = 0; i < count; i++) {
    drops.push(seedDrop());
  }

  const g = new Graphics();
  g.eventMode = 'none';
  stage.addChild(g);

  const repaint = (): void => {
    const ctx = g.context;
    ctx.clear();
    for (const d of drops) {
      const lx = d.x - SLANT_X * d.length;
      const ly = d.y - SLANT_Y * d.length;
      g.moveTo(lx, ly).lineTo(d.x, d.y).stroke({
        width: 1,
        color: 0xb8d4ff,
        alpha: 0.4,
      });
    }
  };

  const update = (deltaMS: number): void => {
    const dt = deltaMS / 1000;
    const wind = WIND_PX_PER_SEC * dt;
    for (const d of drops) {
      d.y += d.vy * dt;
      d.x += wind;
      const margin = d.length + 8;
      if (d.y > h + margin) {
        d.y = -margin - Math.random() * 48;
        d.x = Math.random() * w;
      }
      if (d.x > w + margin) {
        d.x = -margin;
      } else if (d.x < -margin) {
        d.x = w + margin;
      }
    }
    repaint();
  };

  repaint();

  return {
    update,
    destroy: () => {
      stage.removeChild(g);
      g.destroy();
    },
  };
}
