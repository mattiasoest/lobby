/**
 * Loaded via Google Fonts in `index.html`; keep in sync with {@link ROOM_PIXEL_FACE_SPECS}.
 * Pixi renders text via the browser canvas API, so families must exist in `document.fonts`.
 *
 * Uses **Pixelify Sans** instead of Silkscreen: Silkscreen is uppercase-only by design,
 * while Pixelify Sans keeps pixel styling with full lowercase.
 */
import type { CanvasTextOptions } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from './constants.ts';

export const ROOM_PIXEL_FONT_STACK = '"Pixelify Sans", monospace';

/** Passed to {@link FontFaceSet.load}; weights/sizes tuned for Pixi usages in the room runner. */
export const ROOM_PIXEL_FACE_SPECS = ['400 11px Pixelify Sans', '400 13px Pixelify Sans'] as const;

/** Cap avoids huge atlas surfaces on exotic `devicePixelRatio` values (e.g. 3–4× zoom simulators). */
const ROOM_UI_TEXT_RESOLUTION_MAX_DPR = 3;

/**
 * Internal canvas scale factor for Pixi {@link Text} under {@link ROOM_CAMERA_ZOOM}: without this,
 * the browser rasterizes glyphs once at ~11–13 px logical size then the stage zoom/filter blurs edges.
 *
 * Prefer an **integer** `ROOM_CAMERA_ZOOM` if sprites and text should all snap crisply together.
 */
export function roomCanvasUiTextRasterResolution(): number {
  const dprRaw =
    typeof globalThis !== 'undefined' &&
    'devicePixelRatio' in globalThis &&
    typeof (globalThis as Window & typeof globalThis).devicePixelRatio === 'number'
      ? ((globalThis as Window & typeof globalThis).devicePixelRatio as number)
      : 1;
  const dpr = Math.min(Math.max(dprRaw, 1), ROOM_UI_TEXT_RESOLUTION_MAX_DPR);
  return Math.max(2, Math.ceil(ROOM_CAMERA_ZOOM * dpr));
}

/** Options spread onto Pixi Canvas `Text` in the zoomed world for sharper retro lettering. */
export function roomWorldCanvasTextOptions(): Pick<
  CanvasTextOptions,
  'resolution' | 'roundPixels' | 'autoGenerateMipmaps' | 'textureStyle'
> {
  return {
    resolution: roomCanvasUiTextRasterResolution(),
    roundPixels: true,
    autoGenerateMipmaps: false,
    textureStyle: { scaleMode: 'nearest' },
  };
}
