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
  graphic: Graphics;
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

function createFlakeGraphic(): Graphics {
  const g = new Graphics();
  g.circle(0, 0, 1).fill({ color: 0xffffff, alpha: 1 });
  g.eventMode = 'none';
  g.cullable = true;
  return g;
}

function syncFlakeGraphic(f: Flake, elapsedSec: number): void {
  const drawX = f.x + Math.sin(elapsedSec * f.wobbleFreq + f.phase) * f.wobbleAmp;
  f.graphic.position.set(drawX, f.y);
  f.graphic.scale.set(f.radius);
  f.graphic.alpha = f.alpha;
}

/**
 * World-space snow attached to a world container. Flakes live in world coords,
 * so as the camera moves the player walks **through** the snow rather than the
 * snow following the player. Flakes that drift off the visible viewport are
 * recycled at the top of the current view.
 *
 * Each flake is a pooled Graphics child drawn once; only transforms update each frame.
 */
export function createWorldSnow(parent: Container): WorldSnowApi {
  const flakes: Flake[] = [];
  let elapsedSec = 0;
  let seeded = false;

  const newFlake = (view: WorldViewport, fromTop: boolean): Omit<Flake, 'graphic'> => {
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
    for (const f of flakes) {
      parent.removeChild(f.graphic);
      f.graphic.destroy();
    }
    flakes.length = 0;
    for (let i = 0; i < count; i++) {
      const state = newFlake(view, false);
      const graphic = createFlakeGraphic();
      const flake: Flake = { ...state, graphic };
      syncFlakeGraphic(flake, 0);
      parent.addChild(graphic);
      flakes.push(flake);
    }
  };

  const update = (deltaMS: number, viewport: WorldViewport): void => {
    if (!seeded) {
      seed(viewport);
      seeded = true;
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
      } else if (f.x > right + margin) {
        f.x = viewport.left - margin;
      } else if (f.x < viewport.left - margin) {
        f.x = right + margin;
      }
      syncFlakeGraphic(f, elapsedSec);
    }
  };

  return {
    update,
    destroy: () => {
      for (const f of flakes) {
        parent.removeChild(f.graphic);
        f.graphic.destroy();
      }
      flakes.length = 0;
    },
  };
}
