import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

/**
 * Base for world entities rendered as a 32×32 sprite inside a padded tile quad.
 * Owns the Pixi {@link Container} (`view`) and {@link Sprite} used for display.
 */
export abstract class Entity {
  static readonly TILE_PAD_RATIO = 0.14;

  readonly view: Container;
  protected readonly sprite: Sprite;
  readonly tileSize: number;
  readonly pad: number;
  readonly innerSize: number;

  protected constructor(tileSize: number, initialTexture: Texture, spriteLocalX: number, spriteLocalY: number) {
    const { pad, innerSize } = Entity.layoutForTileSize(tileSize);
    this.tileSize = tileSize;
    this.pad = pad;
    this.innerSize = innerSize;

    const view = new Container();
    const sprite = new Sprite(initialTexture);
    sprite.anchor.set(0.5, 0.5);
    sprite.width = tileSize;
    sprite.height = tileSize;
    sprite.position.set(spriteLocalX, spriteLocalY);

    view.addChild(sprite);
    this.view = view;
    this.sprite = sprite;
  }

  static layoutForTileSize(tileSize: number): { pad: number; innerSize: number } {
    const pad = tileSize * Entity.TILE_PAD_RATIO;
    const innerSize = tileSize - pad * 2;
    return { pad, innerSize };
  }

  /** How far the 32×32 sprite extends above the inner padded quad's top edge. */
  static spriteOverhangForTileSize(tileSize: number): number {
    return Math.ceil(tileSize * Entity.TILE_PAD_RATIO);
  }

  static sliceSpritesheetRow(
    base: Texture,
    row: number,
    frameCount: number,
    frameSize: number,
    inset?: { top?: number; right?: number; bottom?: number; left?: number },
    columnOffsetPx = 0,
  ): Texture[] {
    const top = inset?.top ?? 0;
    const right = inset?.right ?? 0;
    const bottom = inset?.bottom ?? 0;
    const left = inset?.left ?? 0;
    const frameW = frameSize - left - right;
    const frameH = frameSize - top - bottom;
    const rowY = row * frameSize + top;
    const frames: Texture[] = [];
    for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
      frames.push(
        new Texture({
          source: base.source,
          frame: new Rectangle(columnOffsetPx + frameIdx * frameSize + left, rowY, frameW, frameH),
        }),
      );
    }
    return frames;
  }

  protected applySpriteDisplaySize(sizePx: number): void {
    this.sprite.width = sizePx;
    this.sprite.height = sizePx;
  }

  protected setSpriteTexture(texture: Texture): void {
    this.sprite.texture = texture;
  }

  protected setSpriteFlipX(flipX: boolean): void {
    const targetScaleX = flipX ? -1 : 1;
    if (Math.sign(this.sprite.scale.x) !== targetScaleX) {
      this.sprite.scale.x = targetScaleX * Math.abs(this.sprite.scale.x);
    }
  }

  protected wrapFrameIndex(rawIdx: number, frameCount: number): number {
    return ((rawIdx % frameCount) + frameCount) % frameCount;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
