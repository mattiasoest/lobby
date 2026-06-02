import { Animal, ANIMAL_SPRITE_SIZE_PX, type AnimalTextureSet } from './Animal.ts';

const DEER_IDLE_FPS = 3;

export class Deer extends Animal {
  readonly kind = 'deer' as const;

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
    return DEER_IDLE_FPS;
  }

  protected override get useIdleTextures(): boolean {
    const tex = this.textures;
    return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
  }
}
