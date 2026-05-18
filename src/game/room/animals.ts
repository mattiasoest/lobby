import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { clampWorldTopLeft } from './worldMath.ts';

/** Pixel size of one frame in an animal spritesheet (32×32 cell). */
export const ANIMAL_FRAME_SIZE = 32;
/** Each row holds 4 frames (sheet is 128×96 → 4 cols × 3 rows). */
export const ANIMAL_FRAMES_PER_ROW = 4;

/** Walk-cycle playback rate. Slower than the player walk so animals look heavier. */
const ANIMAL_WALK_FPS = 6;

/** Wander movement speed (px/s). Roughly a quarter of {@link MOVE_PX_PER_SEC}. */
const ANIMAL_MOVE_PX_PER_SEC = 26;

/** Idle pause range between wander legs. */
const PAUSE_MIN_MS = 1500;
const PAUSE_MAX_MS = 4200;

/** Max distance (px) a new wander target can be from the animal's home anchor. */
const WANDER_RADIUS_PX = 192;

/** Distance² (px²) at which the animal considers itself "arrived" at its target. */
const ARRIVE_EPS_SQ = 4;

/** Source row indices inside an animal spritesheet. */
const SHEET_ROW_LEFT = 0;
const SHEET_ROW_DOWN = 1;
const SHEET_ROW_UP = 2;

export type AnimalKind = 'bull' | 'cow';
export type AnimalDirection = 'left' | 'right' | 'down' | 'up';

export type AnimalTextureSet = {
  /** Used for left, and flipped horizontally for right. */
  left: Texture[];
  down: Texture[];
  up: Texture[];
};

export type AnimalTextureMap = Record<AnimalKind, AnimalTextureSet>;

function sliceRow(base: Texture, row: number, frameCount: number): Texture[] {
  const frames: Texture[] = [];
  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    frames.push(
      new Texture({
        source: base.source,
        frame: new Rectangle(
          frameIdx * ANIMAL_FRAME_SIZE,
          row * ANIMAL_FRAME_SIZE,
          ANIMAL_FRAME_SIZE,
          ANIMAL_FRAME_SIZE,
        ),
      }),
    );
  }
  return frames;
}

async function loadOneAnimalSheet(src: string): Promise<AnimalTextureSet | null> {
  try {
    const base = await Assets.load<Texture>(src);
    base.source.scaleMode = 'nearest';
    return {
      left: sliceRow(base, SHEET_ROW_LEFT, ANIMAL_FRAMES_PER_ROW),
      down: sliceRow(base, SHEET_ROW_DOWN, ANIMAL_FRAMES_PER_ROW),
      up: sliceRow(base, SHEET_ROW_UP, ANIMAL_FRAMES_PER_ROW),
    };
  } catch {
    return null;
  }
}

/**
 * Load bull + cow spritesheets in parallel. Returns `null` if either fails
 * (caller skips spawning animals; the room still renders).
 */
export async function loadAnimalTextures(bullSrc: string, cowSrc: string): Promise<AnimalTextureMap | null> {
  const [bull, cow] = await Promise.all([loadOneAnimalSheet(bullSrc), loadOneAnimalSheet(cowSrc)]);
  if (!bull || !cow) return null;
  return { bull, cow };
}

type AnimalState = 'walk' | 'idle';

/**
 * Decorative wandering animal. Owns a {@link Container} (`view`) that callers parent into the
 * animal layer. The animal walks toward random targets within {@link WANDER_RADIUS_PX} of its
 * home anchor, pausing briefly between legs.
 *
 * Position tracking uses the same coordinate convention as players: `(x, y)` is the world
 * top-left of the inner padded quad (see {@link clampWorldTopLeft}).
 */
export class Animal {
  readonly view: Container;
  private readonly sprite: Sprite;
  private readonly textures: AnimalTextureSet;

  private direction: AnimalDirection = 'down';
  private state: AnimalState = 'idle';
  private frameIndex = 0;
  private frameTimerMs = 0;

  private readonly homeX: number;
  private readonly homeY: number;
  private x: number;
  private y: number;
  private targetX: number;
  private targetY: number;
  /** Wall-clock ms at which the current idle pause ends (`0` = not paused yet). */
  private pauseUntilMs = 0;

  constructor(textures: AnimalTextureSet, tileSize: number, homeX: number, homeY: number) {
    this.textures = textures;
    this.homeX = homeX;
    this.homeY = homeY;
    this.x = homeX;
    this.y = homeY;
    this.targetX = homeX;
    this.targetY = homeY;

    const view = new Container();
    const sprite = new Sprite(textures.down[0]);
    sprite.anchor.set(0.5, 0.5);
    sprite.width = tileSize;
    sprite.height = tileSize;

    // Mirror the player avatar's chained offset (view at -pad, sprite at innerSize/2)
    // collapsed into a single container so the view origin is the inner padded quad's top-left.
    const pad = tileSize * 0.14;
    const innerSize = tileSize - pad * 2;
    sprite.position.set(innerSize / 2 - pad, innerSize / 2 - pad);

    view.addChild(sprite);
    view.position.set(this.x, this.y);

    this.sprite = sprite;
    this.view = view;
    this.applyFrame();
  }

  /**
   * Drive wander AI + animation. `tileSize`/`worldCols`/`worldRows` clamp targets so the
   * animal can actually reach them, and `now` (performance.now) gates pause durations.
   */
  update(dtMs: number, tileSize: number, worldCols: number, worldRows: number, now: number): void {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= ARRIVE_EPS_SQ) {
      this.state = 'idle';
      if (this.pauseUntilMs === 0) {
        this.pauseUntilMs = now + PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
      } else if (now >= this.pauseUntilMs) {
        // 4-directional wander: each leg moves on a single axis so the animal never walks
        // diagonally. The non-chosen axis keeps the animal's current value; the chosen axis
        // picks a value within ±WANDER_RADIUS_PX of home so the animal stays tethered.
        const horizontal = Math.random() < 0.5;
        const homeAxis = horizontal ? this.homeX : this.homeY;
        const newAxisPos = homeAxis + (Math.random() * 2 - 1) * WANDER_RADIUS_PX;
        const rawX = horizontal ? newAxisPos : this.x;
        const rawY = horizontal ? this.y : newAxisPos;
        const clamped = clampWorldTopLeft(rawX, rawY, tileSize, worldCols, worldRows);
        this.targetX = clamped.x;
        this.targetY = clamped.y;
        this.pauseUntilMs = 0;
      }
    } else {
      const dist = Math.sqrt(distSq);
      const dt = dtMs / 1000;
      const step = Math.min(ANIMAL_MOVE_PX_PER_SEC * dt, dist);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;

      const clamped = clampWorldTopLeft(this.x, this.y, tileSize, worldCols, worldRows);
      this.x = clamped.x;
      this.y = clamped.y;

      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax >= ay) {
        this.direction = dx >= 0 ? 'right' : 'left';
      } else {
        this.direction = dy >= 0 ? 'down' : 'up';
      }
      this.state = 'walk';
    }

    this.view.position.set(this.x, this.y);

    if (this.state === 'walk') {
      const msPerFrame = 1000 / ANIMAL_WALK_FPS;
      this.frameTimerMs += dtMs;
      while (this.frameTimerMs >= msPerFrame) {
        this.frameTimerMs -= msPerFrame;
        this.frameIndex += 1;
      }
    } else {
      this.frameTimerMs = 0;
      this.frameIndex = 0;
    }

    this.applyFrame();
  }

  private applyFrame(): void {
    let frames: Texture[];
    let flipX = false;
    switch (this.direction) {
      case 'right':
        frames = this.textures.left;
        flipX = true;
        break;
      case 'left':
        frames = this.textures.left;
        break;
      case 'up':
        frames = this.textures.up;
        break;
      case 'down':
      default:
        frames = this.textures.down;
        break;
    }

    const idx = ((this.frameIndex % frames.length) + frames.length) % frames.length;
    this.sprite.texture = frames[idx];

    const targetScaleX = flipX ? -1 : 1;
    if (Math.sign(this.sprite.scale.x) !== targetScaleX) {
      this.sprite.scale.x = targetScaleX * Math.abs(this.sprite.scale.x);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

/**
 * Deterministic per-room placement for the bull + cow. Same `roomId` always yields the same
 * spawn anchors so a player revisiting a room sees the animals in familiar starting positions.
 */
export function animalHomeAnchors(
  roomId: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
): Record<AnimalKind, { x: number; y: number }> {
  const worldW = worldCols * tileSize;
  const worldH = worldRows * tileSize;
  const cx = worldW / 2;
  const cy = worldH / 2;
  const radius = Math.min(worldW, worldH) * 0.28;

  const seedRand = (salt: number) => {
    let h = ((roomId | 0) * 374761393 + salt * 668265263) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const bullAngle = seedRand(1) * Math.PI * 2;
  // Place the cow roughly opposite the bull (±~17°) so they don't overlap on spawn.
  const cowAngle = bullAngle + Math.PI + (seedRand(2) - 0.5) * 0.6;

  const bullRaw = { x: cx + Math.cos(bullAngle) * radius, y: cy + Math.sin(bullAngle) * radius };
  const cowRaw = { x: cx + Math.cos(cowAngle) * radius, y: cy + Math.sin(cowAngle) * radius };

  return {
    bull: clampWorldTopLeft(bullRaw.x, bullRaw.y, tileSize, worldCols, worldRows),
    cow: clampWorldTopLeft(cowRaw.x, cowRaw.y, tileSize, worldCols, worldRows),
  };
}
