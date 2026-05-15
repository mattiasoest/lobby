import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

/** Pixel size of one frame in the character spritesheets. */
export const CHARACTER_FRAME_SIZE = 32;

/** Idle.png layout: 4 frames × 3 rows. Each row indexed by direction. */
const IDLE_FRAMES_PER_ROW = 4;
/** Walk.png layout: 6 frames × 3 rows. Each row indexed by direction. */
const WALK_FRAMES_PER_ROW = 6;

/** Animation speeds (frames/sec) — idle breathes slower than walk. */
const IDLE_FPS = 4;
const WALK_FPS = 9;

/**
 * Sub-pixel velocity that still counts as "idle".
 * Tuned to ignore micro jitter from interpolation smoothing on remote players.
 */
const MOTION_THRESHOLD_PX_S = 6;

export type CharacterDirection = 'front' | 'back' | 'left' | 'right';

/** Source row indices in each spritesheet. `left` reuses the `right` row and renders flipped. */
const SHEET_ROW_BY_DIR: Record<CharacterDirection, number> = {
  front: 0,
  back: 1,
  right: 2,
  left: 2,
};

export type CharacterTextureSet = {
  idle: Record<CharacterDirection, Texture[]>;
  walk: Record<CharacterDirection, Texture[]>;
};

function sliceRow(base: Texture, row: number, frameCount: number): Texture[] {
  const frames: Texture[] = [];
  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    frames.push(
      new Texture({
        source: base.source,
        frame: new Rectangle(
          frameIdx * CHARACTER_FRAME_SIZE,
          row * CHARACTER_FRAME_SIZE,
          CHARACTER_FRAME_SIZE,
          CHARACTER_FRAME_SIZE,
        ),
      }),
    );
  }
  return frames;
}

/**
 * Load both spritesheets and slice them into per-direction frame arrays.
 * Sets `nearest` scaling on the underlying source so pixel art stays crisp at any zoom.
 *
 * Returns `null` if either asset fails to load (caller falls back to colored block).
 */
export async function loadCharacterTextures(idleSrc: string, walkSrc: string): Promise<CharacterTextureSet | null> {
  try {
    const [idleBase, walkBase] = await Promise.all([Assets.load<Texture>(idleSrc), Assets.load<Texture>(walkSrc)]);
    idleBase.source.scaleMode = 'nearest';
    walkBase.source.scaleMode = 'nearest';

    return {
      idle: {
        front: sliceRow(idleBase, SHEET_ROW_BY_DIR.front, IDLE_FRAMES_PER_ROW),
        back: sliceRow(idleBase, SHEET_ROW_BY_DIR.back, IDLE_FRAMES_PER_ROW),
        right: sliceRow(idleBase, SHEET_ROW_BY_DIR.right, IDLE_FRAMES_PER_ROW),
        left: sliceRow(idleBase, SHEET_ROW_BY_DIR.left, IDLE_FRAMES_PER_ROW),
      },
      walk: {
        front: sliceRow(walkBase, SHEET_ROW_BY_DIR.front, WALK_FRAMES_PER_ROW),
        back: sliceRow(walkBase, SHEET_ROW_BY_DIR.back, WALK_FRAMES_PER_ROW),
        right: sliceRow(walkBase, SHEET_ROW_BY_DIR.right, WALK_FRAMES_PER_ROW),
        left: sliceRow(walkBase, SHEET_ROW_BY_DIR.left, WALK_FRAMES_PER_ROW),
      },
    };
  } catch {
    return null;
  }
}

type AvatarState = 'idle' | 'walk';

/**
 * Per-player animated sprite. Owns a {@link Container} (`view`) that callers parent into the
 * player root. Direction is updated from world velocity; last facing is preserved while idle.
 *
 * The sprite is drawn at native 32×32 covering the full tileSize quad (slightly overflowing the
 * inner padded quad by `pad` pixels — see {@link spriteOverhangForTileSize}).
 */
export class PlayerAvatar {
  readonly view: Container;
  private readonly sprite: Sprite;
  private readonly textures: CharacterTextureSet;
  private direction: CharacterDirection;
  private state: AvatarState = 'idle';
  private frameIndex = 0;
  private frameTimerMs = 0;

  constructor(textures: CharacterTextureSet, tileSize: number, initialDirection: CharacterDirection = 'front') {
    this.textures = textures;
    this.direction = initialDirection;

    const view = new Container();
    const sprite = new Sprite(textures.idle[initialDirection][0]);
    sprite.anchor.set(0.5, 0.5);
    sprite.width = tileSize;
    sprite.height = tileSize;

    // Root position is the inner padded quad's top-left; center the sprite on the inner quad
    // so the 32×32 art sits flush over the full tileSize tile.
    const pad = tileSize * 0.14;
    const innerSize = tileSize - pad * 2;
    sprite.position.set(innerSize / 2, innerSize / 2);

    view.addChild(sprite);
    this.sprite = sprite;
    this.view = view;
    this.applyFrame();
  }

  /**
   * Drive the animation from rendered-position delta.
   * `vx`/`vy` are world px/s (positive vy = downward / "front" direction).
   */
  update(dtMs: number, vx: number, vy: number): void {
    const speed = Math.hypot(vx, vy);
    const moving = speed > MOTION_THRESHOLD_PX_S;

    if (moving) {
      // Prefer horizontal facing on diagonals so side-view reads better than back/front on slants.
      if (Math.abs(vx) >= Math.abs(vy)) {
        this.direction = vx >= 0 ? 'right' : 'left';
      } else {
        this.direction = vy >= 0 ? 'front' : 'back';
      }
    }

    const nextState: AvatarState = moving ? 'walk' : 'idle';
    if (nextState !== this.state) {
      this.state = nextState;
      this.frameIndex = 0;
      this.frameTimerMs = 0;
    }

    const fps = this.state === 'walk' ? WALK_FPS : IDLE_FPS;
    const msPerFrame = 1000 / fps;
    this.frameTimerMs += dtMs;
    while (this.frameTimerMs >= msPerFrame) {
      this.frameTimerMs -= msPerFrame;
      this.frameIndex += 1;
    }

    this.applyFrame();
  }

  private applyFrame(): void {
    const frames = this.state === 'walk' ? this.textures.walk[this.direction] : this.textures.idle[this.direction];
    const idx = ((this.frameIndex % frames.length) + frames.length) % frames.length;
    this.sprite.texture = frames[idx];
    // Flip horizontally for `left` (reuses the `right` row).
    const targetScaleX = this.direction === 'left' ? -1 : 1;
    if (Math.sign(this.sprite.scale.x) !== targetScaleX) {
      this.sprite.scale.x = targetScaleX * Math.abs(this.sprite.scale.x);
    }
  }
}

/**
 * How far the 32×32 sprite extends above the inner padded quad's top edge.
 * Used to lift name labels / speech bubbles above the visible character art.
 */
export function spriteOverhangForTileSize(tileSize: number): number {
  return Math.ceil(tileSize * 0.14);
}
