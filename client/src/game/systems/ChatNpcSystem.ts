import { Container, FederatedPointerEvent, Rectangle, Text } from 'pixi.js';
import { chatNpcAnchorPx, CHAT_NPC_MARKER_COLOR, getRoomChatNpc } from '../config/chatNpc.ts';
import { Merchant, type MerchantIdleFrames } from '../entities/Merchant.ts';
import type { EntityObstacle } from '../core/worldMath.ts';
import { ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from '../core/pixelTypography.ts';
import { SpeechBubble } from '../views/SpeechBubble.ts';
import type { GameDimensions } from '../types.ts';

const SPEECH_BUBBLE_DURATION_MS = 4000;
const INTERACT_MARKER_GAP_BELOW_NAME_PX = 0;
const NAME_LABEL_GAP_ABOVE_STALL_PX = 4;
/** Y offsets from base — instant snaps, no tween (SNES-style float). */
const INTERACT_MARKER_KEYFRAME_OFFSETS_PX = [0, -1, -2, -1] as const;
/** Low cadence like 16-bit UI ticks (~4 frames/sec). */
const INTERACT_MARKER_FPS = 4;
/** Nudge collision box toward the stall counter (sprite is bottom-center anchored). */
const MERCHANT_COLLISION_OFFSET_X_PX = 6;
const MERCHANT_COLLISION_OFFSET_Y_PX = 5;

export class ChatNpcSystem {
  private root: Container | null = null;
  private merchant: Merchant | null = null;
  private nameLabel: Text | null = null;
  private interactMarker: Text | null = null;
  private interactMarkerBaseY = 0;
  private markerFrameIndex = 0;
  private markerFrameTimerMs = 0;
  private speechBubble: SpeechBubble | null = null;
  private speechHideTimer: ReturnType<typeof setTimeout> | null = null;
  private position = { x: 0, y: 0 };
  private onTap: (() => void) | null = null;

  setOnTap(handler: (() => void) | null): void {
    this.onTap = handler;
  }

  spawn(
    roomId: number,
    dims: GameDimensions,
    actorLayer: Container,
    merchantIdleFrames: MerchantIdleFrames | null | undefined,
    onTap?: () => void,
  ): void {
    this.destroy();
    this.onTap = onTap ?? null;

    const chatNpc = getRoomChatNpc(roomId);
    if (!chatNpc || !merchantIdleFrames?.length) return;

    const { tileSize, worldCols, worldRows } = dims;
    this.position = chatNpcAnchorPx(roomId, tileSize, worldCols, worldRows);

    const displayW = Merchant.displayWidth;
    const displayH = Merchant.displayHeight;
    const nameCenterX = displayW / 2;

    const root = new Container();
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.hitArea = new Rectangle(0, 0, displayW, displayH);
    root.on('pointertap', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      const native = event.nativeEvent;
      if (native instanceof Event && 'preventDefault' in native) {
        native.preventDefault();
      }
      this.onTap?.();
    });

    const merchant = new Merchant(merchantIdleFrames);
    root.addChild(merchant.view);

    root.position.set(this.position.x, this.position.y);
    root.zIndex = this.position.y + displayH;
    actorLayer.addChild(root);
    actorLayer.sortChildren();

    const nameLabel = new Text({
      text: chatNpc.username,
      ...roomWorldCanvasTextOptions(),
      style: {
        fontFamily: ROOM_PIXEL_FONT_STACK,
        fontSize: 11,
        letterSpacing: 0,
        lineHeight: 14,
        fill: 0xf8fafc,
        stroke: { color: 0x0f172a, width: 3 },
        align: 'center',
      },
    });
    nameLabel.anchor.set(0.5, 1);
    const nameLabelY = -NAME_LABEL_GAP_ABOVE_STALL_PX;
    nameLabel.position.set(nameCenterX, nameLabelY);
    root.addChild(nameLabel);

    this.interactMarkerBaseY = nameLabelY + INTERACT_MARKER_GAP_BELOW_NAME_PX;
    const interactMarker = new Text({
      text: '!',
      ...roomWorldCanvasTextOptions(),
      style: {
        fontFamily: ROOM_PIXEL_FONT_STACK,
        fontSize: 14,
        letterSpacing: 0,
        lineHeight: 16,
        fill: CHAT_NPC_MARKER_COLOR,
        stroke: { color: 0x14532d, width: 3 },
        align: 'center',
      },
    });
    interactMarker.anchor.set(0.5, 0);
    interactMarker.position.set(nameCenterX, this.interactMarkerBaseY);
    root.addChild(interactMarker);
    this.markerFrameIndex = Math.floor(Math.random() * INTERACT_MARKER_KEYFRAME_OFFSETS_PX.length);
    this.markerFrameTimerMs = 0;

    this.root = root;
    this.merchant = merchant;
    this.nameLabel = nameLabel;
    this.interactMarker = interactMarker;
  }

  update(dtMs: number): void {
    this.merchant?.update(dtMs);
    this.updateInteractMarker(dtMs);
    this.updateSpeechBubblePosition();
  }

  /** Stepped keyframe float — holds each pose then snaps to the next offset. */
  private updateInteractMarker(dtMs: number): void {
    const marker = this.interactMarker;
    if (!marker) return;

    const msPerFrame = 1000 / INTERACT_MARKER_FPS;
    this.markerFrameTimerMs += dtMs;
    while (this.markerFrameTimerMs >= msPerFrame) {
      this.markerFrameTimerMs -= msPerFrame;
      this.markerFrameIndex = (this.markerFrameIndex + 1) % INTERACT_MARKER_KEYFRAME_OFFSETS_PX.length;
    }

    const offsetY = INTERACT_MARKER_KEYFRAME_OFFSETS_PX[this.markerFrameIndex] ?? 0;
    marker.position.y = Math.round(this.interactMarkerBaseY + offsetY);
  }

  getMinimapChatNpc(): { x: number; y: number } | null {
    if (!this.root) return null;
    return {
      x: this.position.x + Merchant.displayWidth / 2,
      y: this.position.y + Merchant.displayHeight / 2,
    };
  }

  getObstacles(): EntityObstacle[] {
    if (!this.root) return [];
    const collScale = 0.5 * 1.3;
    const collW = Merchant.displayWidth * collScale;
    const collH = Merchant.displayHeight * collScale;
    return [
      {
        x: this.position.x + (Merchant.displayWidth - collW) / 2 + MERCHANT_COLLISION_OFFSET_X_PX,
        y: this.position.y + (Merchant.displayHeight - collH) / 2 + MERCHANT_COLLISION_OFFSET_Y_PX,
        width: collW,
        height: collH,
      },
    ];
  }

  showSpeechBubble(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.speechHideTimer) clearTimeout(this.speechHideTimer);
    this.speechBubble?.group.destroy({ children: true });
    this.speechBubble = SpeechBubble.create(trimmed);

    this.speechHideTimer = window.setTimeout(() => {
      this.speechBubble?.group.destroy({ children: true });
      this.speechBubble = null;
      this.speechHideTimer = null;
    }, SPEECH_BUBBLE_DURATION_MS);

    this.updateSpeechBubblePosition();
  }

  private updateSpeechBubblePosition(): void {
    const bubble = this.speechBubble;
    const root = this.root;
    if (!bubble || !root?.parent) return;

    const bubbleCenterX = Merchant.displayWidth / 2;
    const bandAboveStall =
      NAME_LABEL_GAP_ABOVE_STALL_PX +
      SpeechBubble.PLAYER_NAME_LABEL_TEXT_HEIGHT_PX +
      SpeechBubble.PLAYER_NAME_LABEL_BOTTOM_GAP_PX +
      SpeechBubble.SPEECH_CLEAR_BELOW_BUBBLE_PX;

    if (bubble.group.parent !== root.parent) {
      root.parent.addChild(bubble.group);
    }

    bubble.group.position.set(
      this.position.x + bubbleCenterX - bubble.width / 2,
      this.position.y - bandAboveStall - bubble.height,
    );
    bubble.group.zIndex = this.position.y + Merchant.displayHeight + 1;
    root.parent.sortChildren();
  }

  destroy(): void {
    if (this.speechHideTimer) clearTimeout(this.speechHideTimer);
    this.speechHideTimer = null;
    this.speechBubble?.group.destroy({ children: true });
    this.speechBubble = null;

    this.merchant?.destroy();
    this.root?.destroy({ children: true });
    this.nameLabel?.destroy();
    this.root = null;
    this.merchant = null;
    this.nameLabel = null;
    this.interactMarker = null;
    this.onTap = null;
  }
}
