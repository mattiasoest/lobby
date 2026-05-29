import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';

export function snowEnabledForRoomId(roomId: number): boolean {
  return (roomId | 0) === 4;
}

/** Camera-visible rectangle in world coordinates. */
export type WorldViewport = { left: number; top: number; w: number; h: number };

type Flake = {
  x: number;
  y: number;
  vy: number;
  radius: number;
  /** Random phase so flakes don't sway in lockstep */
  phase: number;
  wobbleFreq: number;
  wobbleAmp: number;
  alpha: number;
};

const MIN_FLAKES = 80;
const MAX_FLAKES = 320;
/** Target snow density — world-space pixels per flake. World coords are smaller than screen by ROOM_CAMERA_ZOOM. */
const AREA_PER_FLAKE = 900;
/** Gentle background wind in world px/sec */
const WIND_PX_PER_SEC = 6;

export type WorldSnowApi = {
  /** Drive the simulation; pass the current world-space camera viewport. */
  update: (deltaMS: number, viewport: WorldViewport) => void;
  destroy: () => void;
};

/**
 * World-space snow attached to a world container. Flakes live in world coords,
 * so as the camera moves the player walks **through** the snow rather than the
 * snow following the player. Flakes that drift off the visible viewport are
 * recycled at the top of the current view.
 */
export function createWorldSnow(parent: Container): WorldSnowApi {
  const g = new Graphics();
  g.eventMode = 'none';
  parent.addChild(g);

  const flakes: Flake[] = [];
  let elapsedSec = 0;
  let seeded = false;

  const newFlake = (view: WorldViewport, fromTop: boolean): Flake => {
    const radius = 0.6 + Math.random() * 1.1;
    return {
      x: view.left + Math.random() * view.w,
      y: fromTop ? view.top - radius - Math.random() * 18 : view.top + Math.random() * view.h,
      vy: 18 + Math.random() * 34,
      radius,
      phase: Math.random() * Math.PI * 2,
      wobbleFreq: 0.5 + Math.random() * 1.2,
      wobbleAmp: 1.5 + Math.random() * 4.5,
      alpha: 0.55 + Math.random() * 0.4,
    };
  };

  const seed = (view: WorldViewport): void => {
    let count = Math.round((view.w * view.h) / AREA_PER_FLAKE);
    count = Math.max(MIN_FLAKES, Math.min(MAX_FLAKES, count));
    flakes.length = 0;
    for (let i = 0; i < count; i++) {
      flakes.push(newFlake(view, false));
    }
  };

  const repaint = (): void => {
    const ctx = g.context;
    ctx.clear();
    for (const f of flakes) {
      const drawX = f.x + Math.sin(elapsedSec * f.wobbleFreq + f.phase) * f.wobbleAmp;
      g.circle(drawX, f.y, f.radius).fill({ color: 0xffffff, alpha: f.alpha });
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
    elapsedSec += dt;
    const wind = WIND_PX_PER_SEC * dt;
    const margin = 24;
    const bottom = viewport.top + viewport.h;
    const right = viewport.left + viewport.w;

    for (const f of flakes) {
      f.y += f.vy * dt;
      f.x += wind;
      if (f.y > bottom + margin) {
        Object.assign(f, newFlake(viewport, true));
        continue;
      }
      if (f.x > right + margin) {
        f.x = viewport.left - margin;
      } else if (f.x < viewport.left - margin) {
        f.x = right + margin;
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
