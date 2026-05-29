import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from './constants.ts';
import type { WorldViewport } from './roomSnow.ts';

export function rainEnabledForRoomId(roomId: number): boolean {
  const r = roomId | 0;
  return r === 2 || r === 3;
}

type Drop = {
  x: number;
  y: number;
  vy: number;
  length: number;
  graphic: Graphics;
};

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

/** Match original world-space streak: tip at (0,0), tail at (-SLANT * length). */
function drawDropShape(g: Graphics, length: number): void {
  g.clear();
  g.moveTo(-SLANT_X * length, -SLANT_Y * length)
    .lineTo(0, 0)
    .stroke({
      width: 1,
      color: 0xb8d4ff,
      alpha: 0.4,
    });
}

function createDropGraphic(length: number): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  g.cullable = true;
  drawDropShape(g, length);
  return g;
}

function syncDropGraphic(d: Drop): void {
  d.graphic.position.set(d.x, d.y);
}

/**
 * World-space rain attached to the weather container. Drops live in world coords,
 * so as the camera moves the player walks through the rain rather than the rain
 * staying fixed to the screen (which made fall speed look tied to movement).
 *
 * Each drop is a pooled Graphics child; position updates every frame, geometry
 * redraws only when a drop is recycled (same streak shape as the original batch draw).
 * Drops that fall below the viewport are recycled at the top instead of destroyed.
 */
export function createWorldRain(parent: Container): WorldRainApi {
  const drops: Drop[] = [];
  let seeded = false;

  const newDrop = (view: WorldViewport, fromTop: boolean): Omit<Drop, 'graphic'> => ({
    x: view.left + Math.random() * view.w,
    y: fromTop ? view.top - 12 - Math.random() * 48 : view.top + Math.random() * view.h,
    vy: (380 + Math.random() * 140) / ROOM_CAMERA_ZOOM,
    length: (5 + Math.random() * 11) / ROOM_CAMERA_ZOOM,
  });

  const resetDrop = (d: Drop, view: WorldViewport, fromTop: boolean): void => {
    Object.assign(d, newDrop(view, fromTop));
    drawDropShape(d.graphic, d.length);
    syncDropGraphic(d);
  };

  const seed = (view: WorldViewport): void => {
    let count = Math.round((view.w * view.h) / AREA_PER_DROP);
    count = Math.max(MIN_DROPS, Math.min(MAX_DROPS, count));
    for (const d of drops) {
      parent.removeChild(d.graphic);
      d.graphic.destroy();
    }
    drops.length = 0;
    for (let i = 0; i < count; i++) {
      const state = newDrop(view, false);
      const graphic = createDropGraphic(state.length);
      const drop: Drop = { ...state, graphic };
      syncDropGraphic(drop);
      parent.addChild(graphic);
      drops.push(drop);
    }
  };

  const update = (deltaMS: number, viewport: WorldViewport): void => {
    if (!seeded) {
      seed(viewport);
      seeded = true;
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
        resetDrop(d, viewport, true);
        continue;
      }
      if (d.x > right + margin) {
        d.x = viewport.left - margin;
      } else if (d.x < viewport.left - margin) {
        d.x = right + margin;
      }
      syncDropGraphic(d);
    }
  };

  return {
    update,
    destroy: () => {
      for (const d of drops) {
        parent.removeChild(d.graphic);
        d.graphic.destroy();
      }
      drops.length = 0;
    },
  };
}
