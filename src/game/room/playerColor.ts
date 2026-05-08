/** Distinct avatar fills for PIXI (0xRRGGBB), tuned for contrast on the grass tile. */
const AVATAR_PALETTE = [
  0xef4444, 0xe11d48, 0xf43f5e, 0xf97316, 0xea580c, 0xf59e0b, 0xeab308, 0xfacc15, 0x84cc16, 0x65a30d,
  0x22c55e, 0x15803d, 0x14b8a6, 0x0d9488, 0x06b6d4, 0x0891b2, 0x0ea5e9, 0x3b82f6, 0x2563eb, 0x1d4ed8,
  0x4f46e5, 0x6366f1, 0x7c3aed, 0x8b5cf6, 0xa855f7, 0xd946ef, 0xc026d3, 0xec4899, 0xf472b6, 0xfb7185,
  0xa16207, 0xdc2626,
] as const;

export function randomAvatarColor(): number {
  return AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)]!;
}

export function avatarColorOrFallback(id: string, color: number | undefined): number {
  if (typeof color === 'number' && Number.isFinite(color)) {
    return Math.floor(color) & 0xffffff;
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}
