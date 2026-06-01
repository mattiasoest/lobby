import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from '../core/constants.ts';
import type { WorldViewport } from './Snow.ts';

type Drop = {
  x: number;
  y: number;
  vy: number;
  length: number;
  graphic: Graphics;
};

/**
 * World-space rain attached to the weather container. Drops live in world coords,
 * so as the camera moves the player walks through the rain rather than the rain
 * staying fixed to the screen.
 */
export class Rain {
  static enabledForRoomId(roomId: number): boolean {
    return (roomId | 0) === 2;
  }

  private static readonly MIN_DROPS = 95;
  private static readonly MAX_DROPS = 340;
  private static readonly AREA_PER_DROP = 4800 / (ROOM_CAMERA_ZOOM * ROOM_CAMERA_ZOOM);
  private static readonly WIND_PX_PER_SEC = 28 / ROOM_CAMERA_ZOOM;
  private static readonly SLANT_X = 0.22;
  private static readonly SLANT_Y = 0.98;

  private readonly parent: Container;
  private readonly drops: Drop[] = [];
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
    const wind = Rain.WIND_PX_PER_SEC * dt;
    const margin = 24;
    const bottom = viewport.top + viewport.h;
    const right = viewport.left + viewport.w;

    for (const drop of this.drops) {
      drop.y += drop.vy * dt;
      drop.x += wind;
      if (drop.y > bottom + margin) {
        this.resetDrop(drop, viewport, true);
        continue;
      }
      if (drop.x > right + margin) {
        drop.x = viewport.left - margin;
      } else if (drop.x < viewport.left - margin) {
        drop.x = right + margin;
      }
      Rain.syncDropGraphic(drop);
    }
  }

  destroy(): void {
    for (const drop of this.drops) {
      this.parent.removeChild(drop.graphic);
      drop.graphic.destroy();
    }
    this.drops.length = 0;
  }

  private seed(view: WorldViewport): void {
    let count = Math.round((view.w * view.h) / Rain.AREA_PER_DROP);
    count = Math.max(Rain.MIN_DROPS, Math.min(Rain.MAX_DROPS, count));
    for (const drop of this.drops) {
      this.parent.removeChild(drop.graphic);
      drop.graphic.destroy();
    }
    this.drops.length = 0;
    for (let i = 0; i < count; i++) {
      const state = Rain.newDrop(view, false);
      const graphic = Rain.createDropGraphic(state.length);
      const drop: Drop = { ...state, graphic };
      Rain.syncDropGraphic(drop);
      this.parent.addChild(graphic);
      this.drops.push(drop);
    }
  }

  private resetDrop(drop: Drop, view: WorldViewport, fromTop: boolean): void {
    Object.assign(drop, Rain.newDrop(view, fromTop));
    Rain.drawDropShape(drop.graphic, drop.length);
    Rain.syncDropGraphic(drop);
  }

  private static newDrop(view: WorldViewport, fromTop: boolean): Omit<Drop, 'graphic'> {
    return {
      x: view.left + Math.random() * view.w,
      y: fromTop ? view.top - 12 - Math.random() * 48 : view.top + Math.random() * view.h,
      vy: (380 + Math.random() * 140) / ROOM_CAMERA_ZOOM,
      length: (5 + Math.random() * 11) / ROOM_CAMERA_ZOOM,
    };
  }

  private static drawDropShape(g: Graphics, length: number): void {
    g.clear();
    g.moveTo(-Rain.SLANT_X * length, -Rain.SLANT_Y * length)
      .lineTo(0, 0)
      .stroke({
        width: 1,
        color: 0xb8d4ff,
        alpha: 0.4,
      });
  }

  private static createDropGraphic(length: number): Graphics {
    const g = new Graphics();
    g.eventMode = 'none';
    g.cullable = true;
    Rain.drawDropShape(g, length);
    return g;
  }

  private static syncDropGraphic(drop: Drop): void {
    drop.graphic.position.set(drop.x, drop.y);
  }
}
