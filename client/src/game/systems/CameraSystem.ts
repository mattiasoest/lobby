import type { Container } from 'pixi.js';
import { scrollWorldPx } from '../core/worldMath.ts';
import type { Viewport } from '../types.ts';

export class CameraSystem {
  update(
    world: Container,
    localPx: { x: number; y: number },
    size: number,
    viewW: number,
    viewH: number,
    worldW: number,
    worldH: number,
  ): Viewport {
    const scrolled = scrollWorldPx(localPx.x, localPx.y, size, viewW, viewH, worldW, worldH);
    world.position.set(-scrolled.left, -scrolled.top);
    return { left: scrolled.left, top: scrolled.top, w: viewW, h: viewH };
  }
}
