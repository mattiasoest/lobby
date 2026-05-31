import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';

/** Camera-visible rectangle in world coordinates. */
export type WorldViewport = { left: number; top: number; w: number; h: number };

type Flake = {
  x: number;
  y: number;
  vy: number;
  radius: number;
  phase: number;
  wobbleFreq: number;
  wobbleAmp: number;
  alpha: number;
  graphic: Graphics;
};

/**
 * World-space snow attached to a world container. Flakes live in world coords,
 * so as the camera moves the player walks through the snow rather than the
 * snow following the player.
 */
export class Snow {
  static enabledForRoomId(roomId: number): boolean {
    return (roomId | 0) === 4;
  }

  private static readonly MIN_FLAKES = 80;
  private static readonly MAX_FLAKES = 320;
  private static readonly AREA_PER_FLAKE = 900;
  private static readonly WIND_PX_PER_SEC = 6;

  private readonly parent: Container;
  private readonly flakes: Flake[] = [];
  private elapsedSec = 0;
  private seeded = false;

  constructor(parent: Container) {
    this.parent = parent;
  }

  update(deltaMS: number, viewport: WorldViewport): void {
    if (!this.seeded) {
      this.seed(viewport);
      this.seeded = true;
      return;
    }

    const dt = deltaMS / 1000;
    this.elapsedSec += dt;
    const wind = Snow.WIND_PX_PER_SEC * dt;
    const margin = 24;
    const bottom = viewport.top + viewport.h;
    const right = viewport.left + viewport.w;

    for (const flake of this.flakes) {
      flake.y += flake.vy * dt;
      flake.x += wind;
      if (flake.y > bottom + margin) {
        Object.assign(flake, Snow.newFlake(viewport, true));
      } else if (flake.x > right + margin) {
        flake.x = viewport.left - margin;
      } else if (flake.x < viewport.left - margin) {
        flake.x = right + margin;
      }
      Snow.syncFlakeGraphic(flake, this.elapsedSec);
    }
  }

  destroy(): void {
    for (const flake of this.flakes) {
      this.parent.removeChild(flake.graphic);
      flake.graphic.destroy();
    }
    this.flakes.length = 0;
  }

  private seed(view: WorldViewport): void {
    let count = Math.round((view.w * view.h) / Snow.AREA_PER_FLAKE);
    count = Math.max(Snow.MIN_FLAKES, Math.min(Snow.MAX_FLAKES, count));
    for (const flake of this.flakes) {
      this.parent.removeChild(flake.graphic);
      flake.graphic.destroy();
    }
    this.flakes.length = 0;
    for (let i = 0; i < count; i++) {
      const state = Snow.newFlake(view, false);
      const graphic = Snow.createFlakeGraphic();
      const flake: Flake = { ...state, graphic };
      Snow.syncFlakeGraphic(flake, 0);
      this.parent.addChild(graphic);
      this.flakes.push(flake);
    }
  }

  private static newFlake(view: WorldViewport, fromTop: boolean): Omit<Flake, 'graphic'> {
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
  }

  private static createFlakeGraphic(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, 1).fill({ color: 0xffffff, alpha: 1 });
    g.eventMode = 'none';
    g.cullable = true;
    return g;
  }

  private static syncFlakeGraphic(flake: Flake, elapsedSec: number): void {
    const drawX = flake.x + Math.sin(elapsedSec * flake.wobbleFreq + flake.phase) * flake.wobbleAmp;
    flake.graphic.position.set(drawX, flake.y);
    flake.graphic.scale.set(flake.radius);
    flake.graphic.alpha = flake.alpha;
  }
}
