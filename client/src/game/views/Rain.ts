import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from '../core/constants.ts';
import { clearParticleGraphics, seedParticleCount, updateFallingParticles } from './particleFall.ts';
import type { WorldViewport } from './worldViewport.ts';

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

    updateFallingParticles(
      this.drops,
      deltaMS,
      viewport,
      Rain.WIND_PX_PER_SEC,
      24,
      (drop) => this.resetDrop(drop, viewport, true),
      (drop) => Rain.syncDropGraphic(drop),
    );
  }

  destroy(): void {
    clearParticleGraphics(this.parent, this.drops);
  }

  private seed(view: WorldViewport): void {
    const count = seedParticleCount(view, Rain.AREA_PER_DROP, Rain.MIN_DROPS, Rain.MAX_DROPS);
    clearParticleGraphics(this.parent, this.drops);
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
