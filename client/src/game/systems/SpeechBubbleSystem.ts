import type { Container } from 'pixi.js';
import { SpeechBubble } from '../views/SpeechBubble.ts';
import { Entity } from '../entities/Entity.ts';
import type { FrameContext } from '../types.ts';

/** How long speech bubbles stay visible above avatars (ms). */
const SPEECH_BUBBLE_DURATION_MS = 4000;

export class SpeechBubbleSystem {
  private speechBubbleWorldRef: Container | null = null;
  private speechBubbleLayoutRef = new Map<string, SpeechBubble>();
  private speechTextByPlayerId = new Map<string, string>();
  private speechHideTimersRef = new Map<string, ReturnType<typeof setTimeout>>();
  private characterTextureCount = 0;

  setWorldContainer(container: Container): void {
    this.speechBubbleWorldRef = container;
  }

  setCharacterTextureCount(count: number): void {
    this.characterTextureCount = count;
  }

  showSpeechBubble(playerSocketId: string, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.speechTextByPlayerId.set(playerSocketId, trimmed);

    const prevTimer = this.speechHideTimersRef.get(playerSocketId);
    if (prevTimer) clearTimeout(prevTimer);
    const timerId = window.setTimeout(() => {
      this.speechTextByPlayerId.delete(playerSocketId);
      this.speechHideTimersRef.delete(playerSocketId);
      this.rebuildSpeechBubbleGraphics();
    }, SPEECH_BUBBLE_DURATION_MS);
    this.speechHideTimersRef.set(playerSocketId, timerId);

    this.rebuildSpeechBubbleGraphics();
  }

  clearSpeechBubbles(): void {
    for (const timerId of this.speechHideTimersRef.values()) clearTimeout(timerId);
    this.speechHideTimersRef.clear();
    this.speechTextByPlayerId.clear();
    this.rebuildSpeechBubbleGraphics();
  }

  private rebuildSpeechBubbleGraphics(): void {
    const parent = this.speechBubbleWorldRef;
    if (!parent) return;

    for (const child of [...parent.children]) {
      parent.removeChild(child);
      child.destroy({ children: true });
    }
    this.speechBubbleLayoutRef.clear();

    for (const [playerId, text] of this.speechTextByPlayerId) {
      const built = SpeechBubble.create(text);
      parent.addChild(built.group);
      this.speechBubbleLayoutRef.set(playerId, built);
    }
  }

  render(fc: FrameContext, localPx: { x: number; y: number }, remotePx: Map<string, { x: number; y: number }>): void {
    const { syncState, size, pad, tileSize } = fc;
    const { players, localId } = syncState;
    const speechWorld = this.speechBubbleWorldRef;
    const layout = this.speechBubbleLayoutRef;
    const useSpriteLayout = this.characterTextureCount > 0;
    const spriteOverhang = Entity.spriteOverhangForTileSize(tileSize);

    if (!speechWorld || layout.size === 0) {
      if (speechWorld) speechWorld.visible = false;
      return;
    }

    speechWorld.visible = true;
    for (const [pid, { group, width: bubbleWidth, height: bubbleHeight }] of layout) {
      const isLocalBubble = !!localId && pid === localId;
      const pos = isLocalBubble ? localPx : remotePx.get(pid);
      const stillHere = players.some((player) => player.id === pid);
      if (!pos || !stillHere) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      const bubbleCenterX = useSpriteLayout ? size / 2 - pad : size / 2;
      group.position.set(
        pos.x + bubbleCenterX - bubbleWidth / 2,
        pos.y - spriteOverhang - SpeechBubble.SPEECH_BAND_ABOVE_AVATAR_PX - bubbleHeight,
      );
    }
  }

  destroy(): void {
    this.clearSpeechBubbles();
    this.speechBubbleWorldRef = null;
    this.speechBubbleLayoutRef.clear();
  }
}
