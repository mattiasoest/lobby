/** Camera-visible rectangle in world coordinates. */
export type WorldViewport = { left: number; top: number; w: number; h: number };

export function wrapParticleX(x: number, viewport: WorldViewport, margin: number): number {
  const right = viewport.left + viewport.w;
  if (x > right + margin) return viewport.left - margin;
  if (x < viewport.left - margin) return right + margin;
  return x;
}
