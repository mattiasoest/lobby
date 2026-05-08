/** Distinct fill colors for PIXI avatars (0xRRGGBB). Keep in sync with server `avatarColor.ts`. */
const AVATAR_PALETTE = [
  0xef4444, 0xf97316, 0xeab308, 0x22c55e, 0x14b8a6, 0x3b82f6, 0x8b5cf6, 0xec4899, 0x06b6d4, 0x84cc16, 0xf59e0b,
  0x6366f1,
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
