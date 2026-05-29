import { Container, Graphics, Text } from 'pixi.js';
import { ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from './pixelTypography.ts';

/** Light bubble — white fill, soft gray shadow, no outline. */
const PAL = {
  panel: 0xf4f4f4,
  shadow: 0x3a4468,
  text: 0x232544,
} as const;

const SPEECH_TAIL_H = 9;
const SPEECH_PAD = 8;
const SPEECH_SHADOW = 3;
/** Overlap tail into the body so there is no seam above the connector. */
const TAIL_BODY_OVERLAP_PX = 1;
const SPEECH_WRAP = 204;
/** Bottom of name label relative to avatar top-left; must match {@link PLAYER_NAME_LABEL_BOTTOM_GAP_PX} in RoomPixiRunner. */
export const PLAYER_NAME_LABEL_BOTTOM_GAP_PX = 3;
/** Nominal single-line height for pixel-font player names (RoomPixiRunner). */
export const PLAYER_NAME_LABEL_TEXT_HEIGHT_PX = 14;
/** Tail-to-name: vertical gap between bubble bottom and top of name glyphs. */
export const SPEECH_CLEAR_BELOW_BUBBLE_PX = 4;
/**
 * World-space distance from avatar top (y) upward through the name band + clearance.
 * Speech bubble tail bottom is placed at pos.y - this value.
 */
export const SPEECH_BAND_ABOVE_AVATAR_PX =
  PLAYER_NAME_LABEL_BOTTOM_GAP_PX + PLAYER_NAME_LABEL_TEXT_HEIGHT_PX + SPEECH_CLEAR_BELOW_BUBBLE_PX;

export type SpeechBubbleLayout = {
  group: Container;
  width: number;
  height: number;
};

/** Pixel tail growing down from the bubble body toward the player. */
function drawPixelTail(
  gfx: Graphics,
  bubbleW: number,
  bubbleBodyH: number,
  ox: number,
  oy: number,
  color: number,
  alpha: number,
): void {
  const mid = Math.floor(bubbleW / 2);
  const y = bubbleBodyH - TAIL_BODY_OVERLAP_PX + oy;
  gfx.rect(mid - 6 + ox, y, 12, 3).fill({ color, alpha });
  gfx.rect(mid - 3 + ox, y + 3, 6, 3).fill({ color, alpha });
  gfx.rect(mid - 1 + ox, y + 6, 2, 3).fill({ color, alpha });
}

function drawBubbleShape(
  gfx: Graphics,
  bubbleW: number,
  bubbleBodyH: number,
  ox: number,
  oy: number,
  mode: 'shadow' | 'body',
): void {
  const fill = mode === 'shadow' ? PAL.shadow : PAL.panel;
  const alpha = mode === 'shadow' ? 1 : 0.98;

  gfx.rect(ox, oy, bubbleW, bubbleBodyH).fill({ color: fill, alpha });
  drawPixelTail(gfx, bubbleW, bubbleBodyH, ox, oy, fill, alpha);
}

export function createSpeechBubbleGroup(trimmed: string): SpeechBubbleLayout {
  const label = new Text({
    text: trimmed,
    ...roomWorldCanvasTextOptions(),
    style: {
      fontFamily: ROOM_PIXEL_FONT_STACK,
      fontSize: 13,
      letterSpacing: 0,
      lineHeight: 18,
      fill: PAL.text,
      wordWrap: true,
      wordWrapWidth: SPEECH_WRAP,
    },
  });

  const innerW = Math.max(label.width, 1);
  const innerH = Math.max(label.height, 1);
  const bubbleW = Math.ceil(innerW + SPEECH_PAD * 2);
  const bubbleBodyH = Math.ceil(innerH + SPEECH_PAD * 2);

  const gfx = new Graphics();
  drawBubbleShape(gfx, bubbleW, bubbleBodyH, SPEECH_SHADOW, SPEECH_SHADOW, 'shadow');
  drawBubbleShape(gfx, bubbleW, bubbleBodyH, 0, 0, 'body');

  label.position.set(SPEECH_PAD, SPEECH_PAD);

  const group = new Container();
  group.addChild(gfx);
  group.addChild(label);

  const totalH = bubbleBodyH + SPEECH_TAIL_H - TAIL_BODY_OVERLAP_PX;
  return {
    group,
    width: bubbleW + SPEECH_SHADOW,
    height: totalH + SPEECH_SHADOW,
  };
}
