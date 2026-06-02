import type { Container } from 'pixi.js';
import { clampWorldTopLeft } from '../core/worldMath.ts';
import { Animal, type AnimalKind, type AnimalTextureMap } from '../entities/npcs/Animal.ts';
import { Bull } from '../entities/npcs/Bull.ts';
import { Cow } from '../entities/npcs/Cow.ts';
import { Deer } from '../entities/npcs/Deer.ts';
import { Penguin } from '../entities/npcs/Penguin.ts';
import type { MinimapAnimal } from '../views/Minimap.ts';
import type { GameDimensions } from '../types.ts';

type AnimalHomeAnchors = {
  bull: { x: number; y: number };
  cow: { x: number; y: number };
  deer: { x: number; y: number }[];
};

export class AnimalSystem {
  private static readonly ROOM_4_PENGUIN_COUNT = 8;

  private animals: Animal[] = [];
  private animalTextures: AnimalTextureMap | null = null;

  setTextures(textures: AnimalTextureMap | null): void {
    this.animalTextures = textures;
  }

  spawn(roomId: number, dims: GameDimensions, actorLayer: Container): void {
    this.destroyAnimals();

    const textures = this.animalTextures;
    if (!textures) return;

    const { tileSize, worldCols, worldRows } = dims;
    const homes = this.homeAnchors(roomId, tileSize, worldCols, worldRows);

    if (roomId !== 4) {
      const bull = new Bull(
        textures.bull,
        tileSize,
        worldCols,
        worldRows,
        homes.bull.x,
        homes.bull.y,
        this.seedBase(roomId, 'bull'),
        roomId,
      );
      bull.view.zIndex = homes.bull.y;
      actorLayer.addChild(bull.view);
      this.animals.push(bull);

      const cow = new Cow(
        textures.cow,
        tileSize,
        worldCols,
        worldRows,
        homes.cow.x,
        homes.cow.y,
        this.seedBase(roomId, 'cow'),
        roomId,
      );
      cow.view.zIndex = homes.cow.y;
      actorLayer.addChild(cow.view);
      this.animals.push(cow);
    }

    for (let i = 0; i < Animal.DEER_COUNT; i++) {
      const home = homes.deer[i];
      if (!home) continue;
      const deer = new Deer(
        textures.deer,
        tileSize,
        worldCols,
        worldRows,
        home.x,
        home.y,
        this.seedBase(roomId, 'deer', i),
        roomId,
      );
      deer.view.zIndex = home.y;
      actorLayer.addChild(deer.view);
      this.animals.push(deer);
    }

    if (roomId === 4 && textures.penguin) {
      const penguinHomes = this.penguinHomes(tileSize, worldCols, worldRows, AnimalSystem.ROOM_4_PENGUIN_COUNT);
      for (let i = 0; i < penguinHomes.length; i++) {
        const home = penguinHomes[i];
        if (!home) continue;
        const penguin = new Penguin(
          textures.penguin,
          tileSize,
          worldCols,
          worldRows,
          home.x,
          home.y,
          this.seedBase(roomId, 'penguin', i),
          roomId,
        );
        penguin.view.zIndex = home.y;
        actorLayer.addChild(penguin.view);
        this.animals.push(penguin);
      }
    }

    actorLayer.sortChildren();
  }

  update(roomNowMs: number): void {
    for (const animal of this.animals) {
      animal.update(roomNowMs);
      const animalPos = animal.getPosition();
      animal.view.zIndex = animalPos.y;
    }
  }

  getObstacles(): { x: number; y: number }[] {
    return this.animals.map((animal) => animal.getPosition());
  }

  getMinimapAnimals(size: number): MinimapAnimal[] {
    const avatarCenter = (topLeftX: number, topLeftY: number) => ({
      x: topLeftX + size / 2,
      y: topLeftY + size / 2,
    });
    return this.animals.map((animal) => {
      const pos = animal.getPosition();
      const center = avatarCenter(pos.x, pos.y);
      return { kind: animal.kind, x: center.x, y: center.y };
    });
  }

  /**
   * Deterministic per-room placement for the bull, cow, and deer herd. Same `roomId` always yields
   * the same spawn anchors so a player revisiting a room sees the animals in familiar positions.
   */
  private homeAnchors(roomId: number, tileSize: number, worldCols: number, worldRows: number): AnimalHomeAnchors {
    const worldW = worldCols * tileSize;
    const worldH = worldRows * tileSize;
    const cx = worldW / 2;
    const cy = worldH / 2;
    const radius = Math.min(worldW, worldH) * 0.28;

    const anglePrng = Animal.mulberry32(Animal.fnv1aHash(roomId, 0xa11_face));
    const bullAngle = anglePrng() * Math.PI * 2;
    const cowAngle = bullAngle + Math.PI + (anglePrng() - 0.5) * 0.6;
    const deerSectorCenter = bullAngle + (2 * Math.PI) / 3 + (anglePrng() - 0.5) * 0.35;
    const deerSpread = 0.55;

    const bullRaw = { x: cx + Math.cos(bullAngle) * radius, y: cy + Math.sin(bullAngle) * radius };
    const cowRaw = { x: cx + Math.cos(cowAngle) * radius, y: cy + Math.sin(cowAngle) * radius };

    const deerHomes: { x: number; y: number }[] = [];
    for (let i = 0; i < Animal.DEER_COUNT; i++) {
      const offset =
        Animal.DEER_COUNT <= 1 ? 0 : ((i - (Animal.DEER_COUNT - 1) / 2) / (Animal.DEER_COUNT - 1)) * deerSpread;
      const angle = deerSectorCenter + offset + (anglePrng() - 0.5) * 0.2;
      const raw = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
      deerHomes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return {
      bull: clampWorldTopLeft(bullRaw.x, bullRaw.y, tileSize, worldCols, worldRows),
      cow: clampWorldTopLeft(cowRaw.x, cowRaw.y, tileSize, worldCols, worldRows),
      deer: deerHomes,
    };
  }

  /** Deterministic spawn anchors for room 4 penguins, spread across the world. */
  private penguinHomes(
    tileSize: number,
    worldCols: number,
    worldRows: number,
    count: number,
  ): { x: number; y: number }[] {
    const worldW = worldCols * tileSize;
    const worldH = worldRows * tileSize;
    const marginX = worldW * 0.1;
    const marginY = worldH * 0.1;
    const spanX = worldW - marginX * 2;
    const spanY = worldH - marginY * 2;
    const homes: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
      const prng = Animal.mulberry32(Animal.fnv1aHash(4, Animal.KIND_SEED_SALT.penguin, i, 0x706f_736e));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

  /** Seed for the per-animal PRNG; stable for the same `(roomId, kind, instance)`. */
  private seedBase(roomId: number, kind: AnimalKind, instance = 0): number {
    return Animal.fnv1aHash(roomId, Animal.KIND_SEED_SALT[kind], instance);
  }

  private destroyAnimals(): void {
    for (const animal of this.animals) animal.destroy();
    this.animals = [];
  }

  destroy(): void {
    this.destroyAnimals();
    this.animalTextures = null;
  }
}
