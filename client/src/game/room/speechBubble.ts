import { Container, Graphics, Text } from 'pixi.js';
import { ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from './pixelTypography.ts';

const SPEECH_TAIL_H = 7;
const SPEECH_PAD = 10;
const SPEECH_RADIUS = 8;
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
/** Body + tail fill; lower = more see-through to the world behind. */
const SPEECH_BUBBLE_FILL_ALPHA = 0.62;
const SPEECH_BUBBLE_STROKE_ALPHA = 0.32;

export type SpeechBubbleLayout = {
  group: Container;
  width: number;
  height: number;
};

export function createSpeechBubbleGroup(trimmed: string): SpeechBubbleLayout {
  const label = new Text({
    text: trimmed,
    ...roomWorldCanvasTextOptions(),
    style: {
      fontFamily: ROOM_PIXEL_FONT_STACK,
      fontSize: 13,
      letterSpacing: 0,
      lineHeight: 18,
      fill: 0x0f172a,
      wordWrap: true,
      wordWrapWidth: SPEECH_WRAP,
    },
  });

  const innerW = Math.max(label.width, 1);
  const innerH = Math.max(label.height, 1);
  const bubbleW = Math.ceil(innerW + SPEECH_PAD * 2);
  const bubbleBodyH = Math.ceil(innerH + SPEECH_PAD * 2);

  const gfx = new Graphics();
  gfx
    .roundRect(0, 0, bubbleW, bubbleBodyH, SPEECH_RADIUS)
    .fill({ color: 0xf8fafc, alpha: SPEECH_BUBBLE_FILL_ALPHA })
    .stroke({ width: 1, color: 0x94a3b8, alpha: SPEECH_BUBBLE_STROKE_ALPHA });
  const mid = bubbleW / 2;
  const tailBottom = bubbleBodyH + SPEECH_TAIL_H;
  gfx.poly([mid - 7, bubbleBodyH, mid + 7, bubbleBodyH, mid, tailBottom], true).fill({
    color: 0xf8fafc,
    alpha: SPEECH_BUBBLE_FILL_ALPHA,
  });

  label.position.set(SPEECH_PAD, SPEECH_PAD);

  const group = new Container();
  group.addChild(gfx);
  group.addChild(label);

  const totalH = bubbleBodyH + SPEECH_TAIL_H;
  return { group, width: bubbleW, height: totalH };
}
