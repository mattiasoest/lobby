import { Animal, type AnimalTextureSet } from './Animal.ts';

export class Bull extends Animal {
  readonly kind = 'bull' as const;

  constructor(
    textures: AnimalTextureSet,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    homeX: number,
    homeY: number,
    seedBase: number,
  ) {
    super(textures, tileSize, worldCols, worldRows, homeX, homeY, seedBase);
  }
}
