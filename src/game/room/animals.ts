import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { clampWorldTopLeft } from './worldMath.ts';

/** Pixel size of one frame in an animal spritesheet (32×32 cell). */
export const ANIMAL_FRAME_SIZE = 32;
/** Each row holds 4 frames (sheet is 128×96 → 4 cols × 3 rows). */
export const ANIMAL_FRAMES_PER_ROW = 4;

/** Walk-cycle playback rate. Slower than the player walk so animals look heavier. */
const ANIMAL_WALK_FPS = 6;

/** Wander movement speed (px/s). Roughly a quarter of the player MOVE_PX_PER_SEC. */
const ANIMAL_MOVE_PX_PER_SEC = 26;

/** Idle pause range between wander legs. */
const PAUSE_MIN_MS = 1500;
const PAUSE_MAX_MS = 4200;

/** Max distance (px) a new wander target can be from the animal's home anchor. */
const WANDER_RADIUS_PX = 192;

/** Number of randomized legs in the precomputed tour (excluding the home-return corrections). */
const TOUR_LEG_COUNT = 120;

/** Source row indices inside an animal spritesheet. */
const SHEET_ROW_LEFT = 0;
const SHEET_ROW_DOWN = 1;
const SHEET_ROW_UP = 2;

export type AnimalKind = 'bull' | 'cow';
export type AnimalDirection = 'left' | 'right' | 'down' | 'up';

const KIND_SEED_SALT: Record<AnimalKind, number> = { bull: 0x6b75_6c00, cow: 0x636f_7700 };

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

/** FNV-1a 32-bit hash; deterministic across JS runtimes. */
function fnv1aHash(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    const x = v | 0;
    h = Math.imul(h ^ (x & 0xff), 0x01000193);
    h = Math.imul(h ^ ((x >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((x >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((x >>> 24) & 0xff), 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG; emits floats in [0,1). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One walk leg in the precomputed tour. Cumulative ms from cycle start. */
type AnimalLeg = {
  /** Cycle-phase ms when the walk begins (after the preceding pause). */
  startMs: number;
  /** Cycle-phase ms when the destination is reached. */
  arriveMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  direction: AnimalDirection;
};

/**
 * Decorative wandering animal. Owns a {@link Container} (`view`) that callers parent into the
 * animal layer. Position, direction, and walk frame are pure functions of wall-clock time
 * (`Date.now()`) and a per-animal seed: every client in the room renders the same state at the
 * same moment, with no server input required.
 *
 * Position uses the same coordinate convention as players: `(x, y)` is the world top-left of
 * the inner padded quad (see {@link clampWorldTopLeft}).
 */
export class Animal {
  readonly view: Container;
  private readonly sprite: Sprite;
  private readonly textures: AnimalTextureSet;
  private readonly homeX: number;
  private readonly homeY: number;

  /** Precomputed tour; the animal cycles through this forever in lockstep with wall-clock. */
  private readonly legs: AnimalLeg[];
  /** Total length (ms) of one tour cycle including pauses; cycle phase = `Date.now() % cycleMs`. */
  private readonly cycleMs: number;
  /** Linear-scan cache for findLeg; valid index into {@link legs}. */
  private cachedLegIdx = 0;

  private x: number;
  private y: number;
  private direction: AnimalDirection = 'down';
  private frameIndex = 0;

  constructor(
    textures: AnimalTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
  ) {
    this.textures = textures;
    this.homeX = homeX;
    this.homeY = homeY;
    this.x = homeX;
    this.y = homeY;

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

    const { legs, cycleMs } = buildAnimalTour(seedBase, tileSize, worldCols, worldRows, homeX, homeY);
    this.legs = legs;
    this.cycleMs = cycleMs;

    this.applyFrame();
  }

  /**
   * Compute position/direction/frame for the current wall-clock instant. Stateless beyond the
   * cached leg index, which is only an optimization (recovers correctly after a wrap or a long
   * pause).
   */
  update(): void {
    const phaseMs = Date.now() % this.cycleMs;
    const legs = this.legs;

    let idx = this.cachedLegIdx;
    if (idx < 0 || idx >= legs.length) idx = 0;
    if (phaseMs < legs[idx].startMs) idx = 0;
    while (idx + 1 < legs.length && phaseMs >= legs[idx + 1].startMs) idx += 1;
    this.cachedLegIdx = idx;

    const leg = legs[idx];

    if (phaseMs < leg.startMs) {
      // Before the first leg of the cycle: paused at home, facing down (initial state).
      this.x = this.homeX;
      this.y = this.homeY;
      this.direction = 'down';
      this.frameIndex = 0;
    } else if (phaseMs < leg.arriveMs) {
      const span = Math.max(1, leg.arriveMs - leg.startMs);
      const u = (phaseMs - leg.startMs) / span;
      this.x = leg.fromX + (leg.toX - leg.fromX) * u;
      this.y = leg.fromY + (leg.toY - leg.fromY) * u;
      this.direction = leg.direction;
      this.frameIndex = Math.floor(((phaseMs - leg.startMs) * ANIMAL_WALK_FPS) / 1000);
    } else {
      // Past arrival: paused at this leg's destination until the next leg's start.
      this.x = leg.toX;
      this.y = leg.toY;
      this.direction = leg.direction;
      this.frameIndex = 0;
    }

    this.view.position.set(this.x, this.y);
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
 * Build a deterministic, seamlessly looping wander tour. The tour ends with up to two
 * axis-aligned corrective legs back to home so cycle wraparound is invisible.
 *
 * Every leg is single-axis (horizontal OR vertical), satisfying the "no diagonal" constraint.
 */
function buildAnimalTour(
  seedBase: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
  homeX: number,
  homeY: number,
): { legs: AnimalLeg[]; cycleMs: number } {
  const prng = mulberry32(seedBase);
  const legs: AnimalLeg[] = [];
  let cx = homeX;
  let cy = homeY;
  let cumMs = 0;

  const pushLeg = (toX: number, toY: number, pauseMs: number): void => {
    cumMs += pauseMs;
    const startMs = cumMs;
    const dx = toX - cx;
    const dy = toY - cy;
    const dist = Math.hypot(dx, dy);
    const travelMs = (dist / ANIMAL_MOVE_PX_PER_SEC) * 1000;
    const arriveMs = startMs + Math.max(travelMs, 1);

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const direction: AnimalDirection = ax >= ay ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';

    legs.push({ startMs, arriveMs, fromX: cx, fromY: cy, toX, toY, direction });
    cumMs = arriveMs;
    cx = toX;
    cy = toY;
  };

  for (let i = 0; i < TOUR_LEG_COUNT; i++) {
    const pauseMs = PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);

    // 4-directional wander: pick an axis, then a target within ±WANDER_RADIUS_PX of home on
    // that axis. The other axis keeps the animal's current value so movement stays axis-pure.
    const horizontal = prng() < 0.5;
    const homeAxis = horizontal ? homeX : homeY;
    const newAxisPos = homeAxis + (prng() * 2 - 1) * WANDER_RADIUS_PX;
    const rawX = horizontal ? newAxisPos : cx;
    const rawY = horizontal ? cy : newAxisPos;
    const clamped = clampWorldTopLeft(rawX, rawY, tileSize, worldCols, worldRows);

    pushLeg(clamped.x, clamped.y, pauseMs);
  }

  // Corrective legs back to home so the cycle wraps cleanly. Each leg is single-axis.
  if (Math.abs(cx - homeX) > 1e-3) {
    pushLeg(homeX, cy, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
  }
  if (Math.abs(cy - homeY) > 1e-3) {
    pushLeg(cx, homeY, PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
  }

  // Final pause at home before the cycle restarts.
  cumMs += PAUSE_MIN_MS + prng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);

  return { legs, cycleMs: cumMs };
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

  const anglePrng = mulberry32(fnv1aHash(roomId, 0xa11_face));
  const bullAngle = anglePrng() * Math.PI * 2;
  // Place the cow roughly opposite the bull (±~17°) so they don't overlap on spawn.
  const cowAngle = bullAngle + Math.PI + (anglePrng() - 0.5) * 0.6;

  const bullRaw = { x: cx + Math.cos(bullAngle) * radius, y: cy + Math.sin(bullAngle) * radius };
  const cowRaw = { x: cx + Math.cos(cowAngle) * radius, y: cy + Math.sin(cowAngle) * radius };

  return {
    bull: clampWorldTopLeft(bullRaw.x, bullRaw.y, tileSize, worldCols, worldRows),
    cow: clampWorldTopLeft(cowRaw.x, cowRaw.y, tileSize, worldCols, worldRows),
  };
}

/** Seed for the per-animal PRNG; stable across processes for the same `(roomId, kind)`. */
export function animalSeedBase(roomId: number, kind: AnimalKind): number {
  return fnv1aHash(roomId, KIND_SEED_SALT[kind]);
}
