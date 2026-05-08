/** Distinct avatar fills for PIXI (0xRRGGBB), tuned for contrast on the grass tile. */
export const AVATAR_PALETTE = [
  0xef4444, 0xe11d48, 0xf43f5e, 0xf97316, 0xea580c, 0xf59e0b, 0xeab308, 0xfacc15, 0x84cc16, 0x65a30d, 0x22c55e,
  0x15803d, 0x166534, 0x047857, 0x14b8a6, 0x0d9488, 0x155e75, 0x06b6d4, 0x0891b2, 0x0ea5e9, 0x0369a1, 0x3b82f6,
  0x2563eb, 0x1d4ed8, 0x4338ca, 0x4f46e5, 0x6366f1, 0x7c3aed, 0x7e22ce, 0x8b5cf6, 0xa855f7, 0xd946ef, 0xc026d3,
  0xec4899, 0xf472b6, 0xbe185d, 0xfb7185, 0xc2410c, 0xb45309, 0xa16207,
] as const;

/** Same 24-bit clamp as server `sanitizeAvatarColor`; invalid → `null`. */
export function clampRgbInt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw) & 0xffffff;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(n)) return Math.floor(n) & 0xffffff;
  }
  return null;
}

export function rgbIntToCssHex(rgb: number): string {
  return `#${(Math.floor(rgb) & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function cssHexToRgbInt(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return Number.parseInt(m[1], 16);
}

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
