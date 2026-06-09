import { PLAYER_IDLE_SHEET_SRC } from './avatarConfig.ts';

/**
 * Holds the decoded preview <img> for the packed idle sheet. Keeping a live reference
 * keeps the image in the browser's available-image list so it is not evicted under memory
 * pressure (e.g. the WebGL context churn from entering/leaving rooms).
 */
const retainedPreviewImage: { current: HTMLImageElement | null } = { current: null };
let previewSheetLoadPromise: Promise<void> | null = null;
let idlePixiCachePromise: Promise<void> | null = null;

export function areAvatarPreviewSheetsLoaded(): boolean {
  return retainedPreviewImage.current !== null;
}

function loadPreviewSheet(url: string): Promise<void> {
  if (retainedPreviewImage.current) return Promise.resolve();

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const markLoaded = () => {
      if (settled) return;
      settled = true;
      retainedPreviewImage.current = img;
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

/** Seed Pixi Cache from the lobby-decoded image so room bootstrap does not re-fetch the PNG. */
async function warmIdleSheetInPixiCache(): Promise<void> {
  if (idlePixiCachePromise) return idlePixiCachePromise;

  idlePixiCachePromise = (async () => {
    const { Cache, Texture } = await import('pixi.js');
    if (Cache.has(PLAYER_IDLE_SHEET_SRC)) return;

    const img = retainedPreviewImage.current;
    if (!img) return;

    const texture = Texture.from(img);
    texture.source.scaleMode = 'nearest';
    Cache.set(PLAYER_IDLE_SHEET_SRC, texture);
  })().finally(() => {
    idlePixiCachePromise = null;
  });

  return idlePixiCachePromise;
}

export function preloadAvatarPreviewSheets(): Promise<void> {
  return loadPreviewSheet(PLAYER_IDLE_SHEET_SRC).then(() => warmIdleSheetInPixiCache());
}

function ensureAvatarPreviewSheetsPromise(): Promise<void> {
  if (areAvatarPreviewSheetsLoaded()) return Promise.resolve();
  if (previewSheetLoadPromise == null) {
    previewSheetLoadPromise = preloadAvatarPreviewSheets().finally(() => {
      previewSheetLoadPromise = null;
    });
  }
  return previewSheetLoadPromise;
}

/** Resolves when lobby avatar preview sheets are ready (shared with {@link readAvatarPreviewSheets}). */
export function whenAvatarPreviewSheetsReady(): Promise<void> {
  return ensureAvatarPreviewSheetsPromise();
}

/** Suspend until the packed idle sheet is decoded for lobby previews (cached after first load). */
export function readAvatarPreviewSheets(): void {
  if (areAvatarPreviewSheetsLoaded()) return;
  throw ensureAvatarPreviewSheetsPromise();
}
