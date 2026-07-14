import playerIdleSheetPng from '../../assets/character/characters_idle.png';
import playerWalkSheetPng from '../../assets/character/characters_walk.png';
import { DEFAULT_AVATAR_ID, isUnlockedAvatarId, sanitizeAvatarId, UNLOCKED_AVATAR_IDS } from '@shared/avatars';

export { DEFAULT_AVATAR_ID, isUnlockedAvatarId, sanitizeAvatarId, UNLOCKED_AVATAR_IDS };
export const OPTION1_AVATAR_ID = 'option1';
export const OPTION2_AVATAR_ID = 'option2';
export const OPTION3_AVATAR_ID = 'option3';
export const CHARACTER_FRAME_SIZE = 32;

/** Width in px of one avatar block inside the packed idle sheet (4 frames × 32px). */
export const PLAYER_IDLE_BLOCK_WIDTH = 128;
/** Width in px of one avatar block inside the packed walk sheet (6 frames × 32px). */
export const PLAYER_WALK_BLOCK_WIDTH = 192;
export const PLAYER_IDLE_SHEET_SRC = playerIdleSheetPng;
export const PLAYER_WALK_SHEET_SRC = playerWalkSheetPng;

/** Horizontal block order inside packed character sheets (default → option3). */
export const AVATAR_SHEET_ORDER = [DEFAULT_AVATAR_ID, OPTION1_AVATAR_ID, OPTION2_AVATAR_ID, OPTION3_AVATAR_ID] as const;

export type AvatarSheetId = (typeof AVATAR_SHEET_ORDER)[number];

export type AvatarOption = {
  id: string;
  label: string;
  unlocked: boolean;
  /** Minimap dot color when this avatar is active (0xRRGGBB). */
  minimapColor: number;
  /** Frame within the avatar block on the packed idle sheet (front-facing idle by default). */
  preview?: { col: number; row: number };
};

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: DEFAULT_AVATAR_ID,
    label: 'Traveler',
    unlocked: true,
    minimapColor: 0x3b82f6,
    preview: { col: 0, row: 0 },
  },
  {
    id: OPTION1_AVATAR_ID,
    label: 'Explorer',
    unlocked: true,
    minimapColor: 0xf97316,
    preview: { col: 0, row: 0 },
  },
  {
    id: OPTION2_AVATAR_ID,
    label: 'Wayfarer',
    unlocked: true,
    minimapColor: 0x22c55e,
    preview: { col: 0, row: 0 },
  },
  {
    id: OPTION3_AVATAR_ID,
    label: 'Wanderer',
    unlocked: true,
    minimapColor: 0xa855f7,
    preview: { col: 0, row: 0 },
  },
  { id: 'locked-5', label: '???', unlocked: false, minimapColor: 0x64748b },
  { id: 'locked-6', label: '???', unlocked: false, minimapColor: 0x64748b },
];

const AVATAR_BY_ID = new Map(AVATAR_OPTIONS.map((option) => [option.id, option]));

const AVATAR_SHEET_BLOCK_INDEX = new Map<string, number>(
  AVATAR_SHEET_ORDER.map((avatarId, index) => [avatarId, index]),
);

export function getAvatarOption(id: string): AvatarOption | undefined {
  return AVATAR_BY_ID.get(id);
}

export function avatarMinimapColor(id: string): number {
  return getAvatarOption(sanitizeAvatarId(id))?.minimapColor ?? 0x3b82f6;
}

export function avatarSheetBlockIndex(avatarId: string): number {
  return AVATAR_SHEET_BLOCK_INDEX.get(sanitizeAvatarId(avatarId)) ?? 0;
}

/** CSS crop for one avatar frame on the packed idle spritesheet. */
export function avatarPreviewStyle(
  avatarId: string,
  preview: NonNullable<AvatarOption['preview']>,
  displaySizePx: number,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const scale = displaySizePx / CHARACTER_FRAME_SIZE;
  const sheetWidthPx = AVATAR_SHEET_ORDER.length * PLAYER_IDLE_BLOCK_WIDTH * scale;
  const sheetHeightPx = 3 * CHARACTER_FRAME_SIZE * scale;
  const blockIndex = avatarSheetBlockIndex(avatarId);
  const frameX = blockIndex * PLAYER_IDLE_BLOCK_WIDTH + preview.col * CHARACTER_FRAME_SIZE;
  return {
    backgroundImage: `url(${PLAYER_IDLE_SHEET_SRC})`,
    backgroundSize: `${sheetWidthPx}px ${sheetHeightPx}px`,
    backgroundPosition: `${-frameX * scale}px ${-preview.row * CHARACTER_FRAME_SIZE * scale}px`,
  };
}
