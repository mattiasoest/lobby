import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from './constants.ts';
import type { WorldViewport } from './roomSnow.ts';

export function rainEnabledForRoomId(roomId: number): boolean {
  const r = roomId | 0;
  return r === 2 || r === 3;
}

type Drop = { x: number; y: number; vy: number; length: number };

const MIN_DROPS = 95;
const MAX_DROPS = 340;
/** Target rain density in world-space px² per drop (screen density ÷ zoom²). */
const AREA_PER_DROP = 4800 / (ROOM_CAMERA_ZOOM * ROOM_CAMERA_ZOOM);

/** ~wind: horizontal drift in world px/sec (screen wind ÷ zoom). */
const WIND_PX_PER_SEC = 28 / ROOM_CAMERA_ZOOM;
/** Streak tilt from vertical (sin/cos multiplier on length) */
const SLANT_X = 0.22;
const SLANT_Y = 0.98;

export type WorldRainApi = {
  update: (deltaMS: number, viewport: WorldViewport) => void;
  destroy: () => void;
};

/**
 * World-space rain attached to the weather container. Drops live in world coords,
 * so as the camera moves the player walks through the rain rather than the rain
 * staying fixed to the screen (which made fall speed look tied to movement).
 */
export function createWorldRain(parent: Container): WorldRainApi {
  const g = new Graphics();
  g.eventMode = 'none';
  parent.addChild(g);

  const drops: Drop[] = [];
  let seeded = false;

  const newDrop = (view: WorldViewport, fromTop: boolean): Drop => ({
    x: view.left + Math.random() * view.w,
    y: fromTop ? view.top - 12 - Math.random() * 48 : view.top + Math.random() * view.h,
    vy: (380 + Math.random() * 140) / ROOM_CAMERA_ZOOM,
    length: (5 + Math.random() * 11) / ROOM_CAMERA_ZOOM,
  });

  const seed = (view: WorldViewport): void => {
    let count = Math.round((view.w * view.h) / AREA_PER_DROP);
    count = Math.max(MIN_DROPS, Math.min(MAX_DROPS, count));
    drops.length = 0;
    for (let i = 0; i < count; i++) {
      drops.push(newDrop(view, false));
    }
  };

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

  const update = (deltaMS: number, viewport: WorldViewport): void => {
    if (!seeded) {
      seed(viewport);
      seeded = true;
      repaint();
      return;
    }

    const dt = deltaMS / 1000;
    const wind = WIND_PX_PER_SEC * dt;
    const margin = 24;
    const bottom = viewport.top + viewport.h;
    const right = viewport.left + viewport.w;

    for (const d of drops) {
      d.y += d.vy * dt;
      d.x += wind;
      if (d.y > bottom + margin) {
        Object.assign(d, newDrop(viewport, true));
        continue;
      }
      if (d.x > right + margin) {
        d.x = viewport.left - margin;
      } else if (d.x < viewport.left - margin) {
        d.x = right + margin;
      }
    }
    repaint();
  };

  return {
    update,
    destroy: () => {
      parent.removeChild(g);
      g.destroy();
    },
  };
}
