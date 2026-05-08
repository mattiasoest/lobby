import { Container, Graphics, Text } from 'pixi.js';

const SPEECH_TAIL_H = 7;
const SPEECH_PAD = 10;
const SPEECH_RADIUS = 8;
export const SPEECH_ABOVE_AVATAR = 6;
const SPEECH_WRAP = 204;

export type SpeechBubbleLayout = {
  group: Container;
  width: number;
  height: number;
};

export function createSpeechBubbleGroup(trimmed: string): SpeechBubbleLayout {
  const label = new Text({
    text: trimmed,
    style: {
      fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      fill: 0x0f172a,
      wordWrap: true,
      wordWrapWidth: SPEECH_WRAP,
      lineHeight: 17,
    },
  });

  const innerW = Math.max(label.width, 1);
  const innerH = Math.max(label.height, 1);
  const bubbleW = Math.ceil(innerW + SPEECH_PAD * 2);
  const bubbleBodyH = Math.ceil(innerH + SPEECH_PAD * 2);

  const gfx = new Graphics();
  gfx
    .roundRect(0, 0, bubbleW, bubbleBodyH, SPEECH_RADIUS)
    .fill({ color: 0xf8fafc, alpha: 0.97 })
    .stroke({ width: 1, color: 0x94a3b8, alpha: 0.55 });
  const mid = bubbleW / 2;
  const tailBottom = bubbleBodyH + SPEECH_TAIL_H;
  gfx.poly([mid - 7, bubbleBodyH, mid + 7, bubbleBodyH, mid, tailBottom], true).fill({ color: 0xf8fafc, alpha: 0.97 });

  label.position.set(SPEECH_PAD, SPEECH_PAD);

  const group = new Container();
  group.addChild(gfx);
  group.addChild(label);

  const totalH = bubbleBodyH + SPEECH_TAIL_H;
  return { group, width: bubbleW, height: totalH };
}
