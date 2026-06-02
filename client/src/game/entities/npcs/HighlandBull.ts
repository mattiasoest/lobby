import { Animal, ANIMAL_SPRITE_SIZE_PX, type AnimalTextureSet } from './Animal.ts';

const HIGHLAND_BULL_IDLE_FPS = 3;

export class HighlandBull extends Animal {
  readonly kind = 'highlandBull' as const;

  constructor(
    textures: AnimalTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
    roomId: number,
  ) {
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase, ANIMAL_SPRITE_SIZE_PX, roomId);
  }

  protected override get idleFps(): number | null {
    return HIGHLAND_BULL_IDLE_FPS;
  }

  protected override get useIdleTextures(): boolean {
    const tex = this.textures;
    return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
  }
}
