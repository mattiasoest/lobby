import defaultIdlePng from '../../assets/character/default/idle.png';
import defaultWalkPng from '../../assets/character/default/walk.png';
import option1IdlePng from '../../assets/character/option1/idle.png';
import option1WalkPng from '../../assets/character/option1/walk.png';
import option2IdlePng from '../../assets/character/option2/idle.png';
import option2WalkPng from '../../assets/character/option2/walk.png';
import option3IdlePng from '../../assets/character/option3/idle.png';
import option3WalkPng from '../../assets/character/option3/walk.png';

export const DEFAULT_AVATAR_ID = 'default';
export const OPTION1_AVATAR_ID = 'option1';
export const OPTION2_AVATAR_ID = 'option2';
export const OPTION3_AVATAR_ID = 'option3';
export const CHARACTER_FRAME_SIZE = 32;

export type AvatarCharacterTextures = {
  idle: string;
  walk: string;
};

export const AVATAR_CHARACTER_TEXTURES: Record<string, AvatarCharacterTextures> = {
  [DEFAULT_AVATAR_ID]: { idle: defaultIdlePng, walk: defaultWalkPng },
  [OPTION1_AVATAR_ID]: { idle: option1IdlePng, walk: option1WalkPng },
  [OPTION2_AVATAR_ID]: { idle: option2IdlePng, walk: option2WalkPng },
  [OPTION3_AVATAR_ID]: { idle: option3IdlePng, walk: option3WalkPng },
};

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
    preview: { sheetSrc: defaultIdlePng, col: 0, row: 0 },
  },
  {
    id: OPTION1_AVATAR_ID,
    label: 'Explorer',
    unlocked: true,
    minimapColor: 0xf97316,
    preview: { sheetSrc: option1IdlePng, col: 0, row: 0 },
  },
  {
    id: OPTION2_AVATAR_ID,
    label: 'Wayfarer',
    unlocked: true,
    minimapColor: 0x22c55e,
    preview: { sheetSrc: option2IdlePng, col: 0, row: 0 },
  },
  {
    id: OPTION3_AVATAR_ID,
    label: 'Wanderer',
    unlocked: true,
    minimapColor: 0xa855f7,
    preview: { sheetSrc: option3IdlePng, col: 0, row: 0 },
  },
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

export function characterTexturesForAvatarId(id: string): AvatarCharacterTextures | undefined {
  return AVATAR_CHARACTER_TEXTURES[sanitizeAvatarId(id)];
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

/**
 * Holds the decoded preview <img> elements for their whole lifetime. Keeping a live reference
 * keeps the image in the browser's available-image list so it is not evicted under memory
 * pressure (e.g. the WebGL context churn from entering/leaving rooms). Without this, the URL
 * would still be cached as "loaded" while the bitmap was dropped, painting blank CSS sprites.
 */
const retainedPreviewImages = new Map<string, HTMLImageElement>();

export function getUnlockedAvatarPreviewSheetUrls(): string[] {
  const urls = new Set<string>();
  for (const option of AVATAR_OPTIONS) {
    if (option.unlocked && option.preview?.sheetSrc) {
      urls.add(option.preview.sheetSrc);
    }
  }
  return [...urls];
}

export function areAvatarPreviewSheetsLoaded(urls: string[] = getUnlockedAvatarPreviewSheetUrls()): boolean {
  return urls.every((url) => retainedPreviewImages.has(url));
}

function loadPreviewSheet(url: string): Promise<void> {
  if (retainedPreviewImages.has(url)) return Promise.resolve();

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const markLoaded = () => {
      if (settled) return;
      settled = true;
      retainedPreviewImages.set(url, img);
      resolve();
    };

    img.onload = () => {
      const decoded = img.decode?.();
      if (decoded) {
        void decoded.finally(markLoaded);
        return;
      }
      markLoaded();
    };
    img.onerror = markLoaded;
    img.src = url;
    if (img.complete) {
      markLoaded();
    }
  });
}

export function preloadAvatarPreviewSheets(urls: string[] = getUnlockedAvatarPreviewSheetUrls()): Promise<void> {
  return Promise.all(urls.map(loadPreviewSheet)).then(() => undefined);
}

let previewSheetsLoadPromise: Promise<void> | null = null;

/** Suspend until unlocked avatar preview spritesheets are decoded (cached after first load). */
export function readAvatarPreviewSheets(): void {
  if (areAvatarPreviewSheetsLoaded()) return;

  if (previewSheetsLoadPromise == null) {
    previewSheetsLoadPromise = preloadAvatarPreviewSheets().finally(() => {
      previewSheetsLoadPromise = null;
    });
  }
  throw previewSheetsLoadPromise;
}
