import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from '../core/pixelTypography.ts';

/** Light bubble — white fill, soft gray shadow, no outline. */
const PAL = {
  panel: 0xf4f4f4,
  shadow: 0x3a4468,
  text: 0x232544,
} as const;

export class SpeechBubble {
  /** Bottom of name label relative to avatar top-left; must match PlayerRenderSystem. */
  static readonly PLAYER_NAME_LABEL_BOTTOM_GAP_PX = 3;
  /** Nominal single-line height for pixel-font player names. */
  static readonly PLAYER_NAME_LABEL_TEXT_HEIGHT_PX = 14;
  /** Tail-to-name: vertical gap between bubble bottom and top of name glyphs. */
  static readonly SPEECH_CLEAR_BELOW_BUBBLE_PX = 4;
  /** World-space distance from avatar top upward through the name band + clearance. */
  static readonly SPEECH_BAND_ABOVE_AVATAR_PX =
    SpeechBubble.PLAYER_NAME_LABEL_BOTTOM_GAP_PX +
    SpeechBubble.PLAYER_NAME_LABEL_TEXT_HEIGHT_PX +
    SpeechBubble.SPEECH_CLEAR_BELOW_BUBBLE_PX;

  /** Total bubble width including shadow (px). */
  private static readonly SPEECH_MAX_WIDTH = 190;
  private static readonly SPEECH_TAIL_H = 9;
  private static readonly SPEECH_PAD = 7;
  private static readonly SPEECH_SHADOW = 2;
  private static readonly TAIL_BODY_OVERLAP_PX = 1;
  private static readonly SPEECH_WRAP =
    SpeechBubble.SPEECH_MAX_WIDTH - SpeechBubble.SPEECH_PAD * 2 - SpeechBubble.SPEECH_SHADOW;
  private static readonly SPEECH_FONT_SIZE = 10;
  private static readonly SPEECH_LINE_HEIGHT = 13;
  private static readonly SPEECH_MAX_LINES = 2;
  private static readonly SPEECH_ELLIPSIS = '...';

  readonly group: Container;
  readonly width: number;
  readonly height: number;

  private constructor(group: Container, width: number, height: number) {
    this.group = group;
    this.width = width;
    this.height = height;
  }

  static create(trimmed: string): SpeechBubble {
    const displayText = SpeechBubble.truncateToMaxLines(trimmed);

    const label = new Text({
      text: displayText,
      ...roomWorldCanvasTextOptions(),
      style: SpeechBubble.bubbleTextStyle(),
    });

    const innerW = Math.max(label.width, 1);
    const innerH = Math.max(label.height, 1);
    const bubbleW = Math.min(
      Math.ceil(innerW + SpeechBubble.SPEECH_PAD * 2),
      SpeechBubble.SPEECH_MAX_WIDTH - SpeechBubble.SPEECH_SHADOW,
    );
    const bubbleBodyH = Math.ceil(innerH + SpeechBubble.SPEECH_PAD * 2);

    const gfx = new Graphics();
    SpeechBubble.drawBubbleShape(
      gfx,
      bubbleW,
      bubbleBodyH,
      SpeechBubble.SPEECH_SHADOW,
      SpeechBubble.SPEECH_SHADOW,
      'shadow',
    );
    SpeechBubble.drawBubbleShape(gfx, bubbleW, bubbleBodyH, 0, 0, 'body');

    label.position.set(SpeechBubble.SPEECH_PAD, SpeechBubble.SPEECH_PAD);

    const group = new Container();
    group.addChild(gfx);
    group.addChild(label);

    const totalH = bubbleBodyH + SpeechBubble.SPEECH_TAIL_H - SpeechBubble.TAIL_BODY_OVERLAP_PX;
    return new SpeechBubble(group, bubbleW + SpeechBubble.SPEECH_SHADOW, totalH + SpeechBubble.SPEECH_SHADOW);
  }

  private static bubbleTextStyle(): TextStyleOptions {
    return {
      fontFamily: ROOM_PIXEL_FONT_STACK,
      fontSize: SpeechBubble.SPEECH_FONT_SIZE,
      letterSpacing: 0,
      lineHeight: SpeechBubble.SPEECH_LINE_HEIGHT,
      fill: PAL.text,
      wordWrap: true,
      wordWrapWidth: SpeechBubble.SPEECH_WRAP,
    };
  }

  private static maxTextHeightPx(): number {
    return SpeechBubble.SPEECH_LINE_HEIGHT * SpeechBubble.SPEECH_MAX_LINES;
  }

  private static fitsInMaxLines(text: string): boolean {
    const label = new Text({
      text,
      ...roomWorldCanvasTextOptions(),
      style: SpeechBubble.bubbleTextStyle(),
    });
    const fits = label.height <= SpeechBubble.maxTextHeightPx() + 0.5;
    label.destroy(true);
    return fits;
  }

  private static truncateToMaxLines(text: string): string {
    if (SpeechBubble.fitsInMaxLines(text)) return text;

    const ellipsis = SpeechBubble.SPEECH_ELLIPSIS;
    let lo = 0;
    let hi = text.length;

    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = `${text.slice(0, mid).trimEnd()}${ellipsis}`;
      if (SpeechBubble.fitsInMaxLines(candidate)) lo = mid;
      else hi = mid - 1;
    }

    if (lo === 0) return ellipsis;
    return `${text.slice(0, lo).trimEnd()}${ellipsis}`;
  }

  private static drawPixelTail(
    gfx: Graphics,
    bubbleW: number,
    bubbleBodyH: number,
    ox: number,
    oy: number,
    color: number,
    alpha: number,
  ): void {
    const mid = Math.floor(bubbleW / 2);
    const y = bubbleBodyH - SpeechBubble.TAIL_BODY_OVERLAP_PX + oy;
    gfx.rect(mid - 6 + ox, y, 12, 3).fill({ color, alpha });
    gfx.rect(mid - 3 + ox, y + 3, 6, 3).fill({ color, alpha });
    gfx.rect(mid - 1 + ox, y + 6, 2, 3).fill({ color, alpha });
  }

  private static drawBubbleShape(
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
    SpeechBubble.drawPixelTail(gfx, bubbleW, bubbleBodyH, ox, oy, fill, alpha);
  }
}
