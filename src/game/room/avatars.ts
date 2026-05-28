import idlePng from '../../assets/character/idle.png';

export const DEFAULT_AVATAR_ID = 'default';
export const CHARACTER_FRAME_SIZE = 32;

export type AvatarOption = {
  id: string;
  label: string;
  unlocked: boolean;
  /** Minimap dot color when this avatar is active (0xRRGGBB). */
  minimapColor: number;
  /** CSS spritesheet preview; only for unlocked avatars. */
  preview?: { sheetSrc: string; col: number; row: number };
};

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: DEFAULT_AVATAR_ID,
    label: 'Traveler',
    unlocked: true,
    minimapColor: 0x3b82f6,
    preview: { sheetSrc: idlePng, col: 0, row: 0 },
  },
  { id: 'locked-2', label: '???', unlocked: false, minimapColor: 0x64748b },
  { id: 'locked-3', label: '???', unlocked: false, minimapColor: 0x64748b },
  { id: 'locked-4', label: '???', unlocked: false, minimapColor: 0x64748b },
  { id: 'locked-5', label: '???', unlocked: false, minimapColor: 0x64748b },
  { id: 'locked-6', label: '???', unlocked: false, minimapColor: 0x64748b },
];

const UNLOCKED_AVATAR_IDS = new Set(AVATAR_OPTIONS.filter((option) => option.unlocked).map((option) => option.id));

const AVATAR_BY_ID = new Map(AVATAR_OPTIONS.map((option) => [option.id, option]));

export function getAvatarOption(id: string): AvatarOption | undefined {
  return AVATAR_BY_ID.get(id);
}

export function isUnlockedAvatarId(id: string): boolean {
  return UNLOCKED_AVATAR_IDS.has(id);
}

export function sanitizeAvatarId(raw: unknown): string {
  if (typeof raw === 'string' && isUnlockedAvatarId(raw)) return raw;
  return DEFAULT_AVATAR_ID;
}

export function avatarMinimapColor(id: string): number {
  return getAvatarOption(sanitizeAvatarId(id))?.minimapColor ?? 0x3b82f6;
}

/** Idle sheet is 4 cols × 3 rows; scale display size to frame size for CSS spritesheet crop. */
export function avatarPreviewStyle(
  preview: NonNullable<AvatarOption['preview']>,
  displaySizePx: number,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const scale = displaySizePx / CHARACTER_FRAME_SIZE;
  const sheetWidthPx = 4 * CHARACTER_FRAME_SIZE * scale;
  const sheetHeightPx = 3 * CHARACTER_FRAME_SIZE * scale;
  return {
    backgroundImage: `url(${preview.sheetSrc})`,
    backgroundSize: `${sheetWidthPx}px ${sheetHeightPx}px`,
    backgroundPosition: `${-preview.col * CHARACTER_FRAME_SIZE * scale}px ${-preview.row * CHARACTER_FRAME_SIZE * scale}px`,
  };
}
