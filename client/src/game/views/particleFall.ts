import type { Container } from 'pixi.js';
import type { WorldViewport } from './worldViewport.ts';
import { wrapParticleX } from './worldViewport.ts';

type FallingParticle = { x: number; y: number; vy: number };

export function seedParticleCount(
  view: WorldViewport,
  areaPerParticle: number,
  minCount: number,
  maxCount: number,
): number {
  const count = Math.max(minCount, Math.min(maxCount, Math.round((view.w * view.h) / areaPerParticle)));
  return count;
}

export function clearParticleGraphics<T extends { graphic: { destroy: () => void } }>(
  parent: Container,
  particles: T[],
): void {
  for (const particle of particles) {
    parent.removeChild(particle.graphic as never);
    particle.graphic.destroy();
  }
  particles.length = 0;
}

export function updateFallingParticles<T extends FallingParticle>(
  particles: T[],
  deltaMS: number,
  viewport: WorldViewport,
  windPxPerSec: number,
  margin: number,
  onResetFromTop: (particle: T) => void,
  onSyncGraphic: (particle: T) => void,
): void {
  const dt = deltaMS / 1000;
  const wind = windPxPerSec * dt;
  const bottom = viewport.top + viewport.h;

  for (const particle of particles) {
    particle.y += particle.vy * dt;
    particle.x += wind;
    if (particle.y > bottom + margin) {
      onResetFromTop(particle);
      continue;
    }
    particle.x = wrapParticleX(particle.x, viewport, margin);
    onSyncGraphic(particle);
  }
}
