import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

/** Source spritesheet: 384×64 px, 4 idle frames in one row. */
export const MERCHANT_SHEET_FRAME_WIDTH = 96;
export const MERCHANT_SHEET_FRAME_HEIGHT = 64;
export const MERCHANT_IDLE_FRAME_COUNT = 4;
export const MERCHANT_IDLE_FPS = 4;

export type MerchantIdleFrames = Texture[];

/**
 * Idle-animated merchant stall for room {@link ChatNpcSystem}.
 * Renders at native pixel size (96×64) with bottom-center anchoring inside `view`.
 */
export class Merchant {
  static readonly displayWidth = MERCHANT_SHEET_FRAME_WIDTH;
  static readonly displayHeight = MERCHANT_SHEET_FRAME_HEIGHT;

  readonly view: Container;
  private readonly sprite: Sprite;
  private readonly idleFrames: MerchantIdleFrames;
  private frameIndex = 0;
  private frameTimerMs = 0;

  constructor(idleFrames: MerchantIdleFrames) {
    this.idleFrames = idleFrames;

    const view = new Container();
    const sprite = new Sprite(idleFrames[0]);
    sprite.anchor.set(0.5, 1);
    sprite.position.set(Merchant.displayWidth / 2, Merchant.displayHeight);
    view.addChild(sprite);

    this.view = view;
    this.sprite = sprite;
  }

  static sliceIdleFrames(base: Texture): MerchantIdleFrames {
    const frames: MerchantIdleFrames = [];
    for (let frameIdx = 0; frameIdx < MERCHANT_IDLE_FRAME_COUNT; frameIdx++) {
      frames.push(
        new Texture({
          source: base.source,
          frame: new Rectangle(
            frameIdx * MERCHANT_SHEET_FRAME_WIDTH,
            0,
            MERCHANT_SHEET_FRAME_WIDTH,
            MERCHANT_SHEET_FRAME_HEIGHT,
          ),
        }),
      );
    }
    return frames;
  }

  static async loadIdleFrames(src: string): Promise<MerchantIdleFrames | null> {
    try {
      const base = await Assets.load<Texture>(src);
      base.source.scaleMode = 'nearest';
      return Merchant.sliceIdleFrames(base);
    } catch {
      return null;
    }
  }

  update(dtMs: number): void {
    if (this.idleFrames.length === 0) return;

    const msPerFrame = 1000 / MERCHANT_IDLE_FPS;
    this.frameTimerMs += dtMs;
    while (this.frameTimerMs >= msPerFrame) {
      this.frameTimerMs -= msPerFrame;
      this.frameIndex = (this.frameIndex + 1) % this.idleFrames.length;
    }

    const frame = this.idleFrames[this.frameIndex];
    if (frame) this.sprite.texture = frame;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
