import type { Container } from 'pixi.js';
import { clampWorldTopLeft } from '../core/worldMath.ts';
import { WalkEntity, type NpcKind, type WalkTextureMap } from '../entities/npcs/WalkEntity.ts';
import { Bull } from '../entities/npcs/Bull.ts';
import { Cow } from '../entities/npcs/Cow.ts';
import { Deer } from '../entities/npcs/Deer.ts';
import { Penguin } from '../entities/npcs/Penguin.ts';
import { Slime } from '../entities/npcs/Slime.ts';
import { FrogBlue } from '../entities/npcs/FrogBlue.ts';
import { HopEntity } from '../entities/npcs/HopEntity.ts';
import { HighlandBull } from '../entities/npcs/HighlandBull.ts';
import type { MinimapAnimal } from '../views/Minimap.ts';
import type { GameDimensions } from '../types.ts';

type AnimalHomeAnchors = {
  bull: { x: number; y: number };
  cow: { x: number; y: number };
  deer: { x: number; y: number }[];
};

export class AnimalSystem {
  private static readonly ROOM_1_FROG_BLUE_COUNT = 10;
  private static readonly ROOM_2_SLIME_COUNT = 10;
  private static readonly ROOM_3_HIGHLAND_BULL_COUNT = 5;
  private static readonly ROOM_4_PENGUIN_COUNT = 8;

  private walkEntities: WalkEntity[] = [];
  private hopEntities: HopEntity[] = [];
  private walkTextures: WalkTextureMap | null = null;

  setTextures(textures: WalkTextureMap | null): void {
    this.walkTextures = textures;
  }

  spawn(roomId: number, dims: GameDimensions, actorLayer: Container): void {
    this.destroyEntities();

    const textures = this.walkTextures;
    if (!textures) return;

    const { tileSize, worldCols, worldRows } = dims;
    const homes = this.homeAnchors(roomId, tileSize, worldCols, worldRows);

    if (roomId !== 1 && roomId !== 2 && roomId !== 4) {
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
      this.walkEntities.push(bull);

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
      this.walkEntities.push(cow);
    }

    for (let i = 0; i < WalkEntity.DEER_COUNT; i++) {
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
      this.walkEntities.push(deer);
    }

    if (roomId === 1 && textures.frogBlue) {
      const frogHomes = this.frogBlueHomes(tileSize, worldCols, worldRows, AnimalSystem.ROOM_1_FROG_BLUE_COUNT);
      for (let i = 0; i < frogHomes.length; i++) {
        const home = frogHomes[i];
        if (!home) continue;
        const frog = new FrogBlue(
          textures.frogBlue,
          tileSize,
          worldCols,
          worldRows,
          home.x,
          home.y,
          this.seedBase(roomId, 'frogBlue', i),
          roomId,
        );
        frog.view.zIndex = home.y;
        actorLayer.addChild(frog.view);
        this.hopEntities.push(frog);
      }
    }

    if (roomId === 3 && textures.highlandBull) {
      const highlandBullHomes = this.highlandBullHomes(
        tileSize,
        worldCols,
        worldRows,
        AnimalSystem.ROOM_3_HIGHLAND_BULL_COUNT,
      );
      for (let i = 0; i < highlandBullHomes.length; i++) {
        const home = highlandBullHomes[i];
        if (!home) continue;
        const highlandBull = new HighlandBull(
          textures.highlandBull,
          tileSize,
          worldCols,
          worldRows,
          home.x,
          home.y,
          this.seedBase(roomId, 'highlandBull', i),
          roomId,
        );
        highlandBull.view.zIndex = home.y;
        actorLayer.addChild(highlandBull.view);
        this.walkEntities.push(highlandBull);
      }
    }

    if (roomId === 2 && textures.slime) {
      const slimeHomes = this.slimeHomes(tileSize, worldCols, worldRows, AnimalSystem.ROOM_2_SLIME_COUNT);
      for (let i = 0; i < slimeHomes.length; i++) {
        const home = slimeHomes[i];
        if (!home) continue;
        const slime = new Slime(
          textures.slime,
          tileSize,
          worldCols,
          worldRows,
          home.x,
          home.y,
          this.seedBase(roomId, 'slime', i),
          roomId,
        );
        slime.view.zIndex = home.y;
        actorLayer.addChild(slime.view);
        this.walkEntities.push(slime);
      }
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
        this.walkEntities.push(penguin);
      }
    }

    actorLayer.sortChildren();
  }

  update(roomNowMs: number): void {
    for (const entity of this.walkEntities) {
      entity.update(roomNowMs);
      const pos = entity.getPosition();
      entity.view.zIndex = pos.y;
    }
    for (const hopper of this.hopEntities) {
      hopper.update(roomNowMs);
      const hopperPos = hopper.getPosition();
      hopper.view.zIndex = hopperPos.y;
    }
  }

  getObstacles(): { x: number; y: number }[] {
    return [
      ...this.walkEntities.map((entity) => entity.getPosition()),
      ...this.hopEntities.map((hopper) => hopper.getPosition()),
    ];
  }

  getMinimapAnimals(size: number): MinimapAnimal[] {
    const avatarCenter = (topLeftX: number, topLeftY: number) => ({
      x: topLeftX + size / 2,
      y: topLeftY + size / 2,
    });
    const walkMarkers = this.walkEntities.map((entity) => {
      const pos = entity.getPosition();
      const center = avatarCenter(pos.x, pos.y);
      return { kind: entity.kind, x: center.x, y: center.y };
    });
    const hopperMarkers = this.hopEntities.map((hopper) => {
      const pos = hopper.getPosition();
      const center = avatarCenter(pos.x, pos.y);
      return { kind: hopper.kind, x: center.x, y: center.y };
    });
    return [...walkMarkers, ...hopperMarkers];
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

    const anglePrng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(roomId, 0xa11_face));
    const bullAngle = anglePrng() * Math.PI * 2;
    const cowAngle = bullAngle + Math.PI + (anglePrng() - 0.5) * 0.6;
    const deerSectorCenter = bullAngle + (2 * Math.PI) / 3 + (anglePrng() - 0.5) * 0.35;
    const deerSpread = 0.55;

    const bullRaw = { x: cx + Math.cos(bullAngle) * radius, y: cy + Math.sin(bullAngle) * radius };
    const cowRaw = { x: cx + Math.cos(cowAngle) * radius, y: cy + Math.sin(cowAngle) * radius };

    const deerHomes: { x: number; y: number }[] = [];
    for (let i = 0; i < WalkEntity.DEER_COUNT; i++) {
      const offset =
        WalkEntity.DEER_COUNT <= 1
          ? 0
          : ((i - (WalkEntity.DEER_COUNT - 1) / 2) / (WalkEntity.DEER_COUNT - 1)) * deerSpread;
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

  /** Deterministic spawn anchors for room 1 blue frogs, spread across the world. */
  private frogBlueHomes(
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
      const prng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(1, WalkEntity.KIND_SEED_SALT.frogBlue, i, 0x6672_6f67));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

  /** Deterministic spawn anchors for room 3 highland bulls, spread across the world. */
  private highlandBullHomes(
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
      const prng = WalkEntity.mulberry32(
        WalkEntity.fnv1aHash(3, WalkEntity.KIND_SEED_SALT.highlandBull, i, 0x6869_6768),
      );
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

  /** Deterministic spawn anchors for room 2 slimes, spread across the world. */
  private slimeHomes(
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
      const prng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(2, WalkEntity.KIND_SEED_SALT.slime, i, 0x736c_696d));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
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
      const prng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(4, WalkEntity.KIND_SEED_SALT.penguin, i, 0x706f_736e));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

  /** Seed for the per-animal PRNG; stable for the same `(roomId, kind, instance)`. */
  private seedBase(roomId: number, kind: NpcKind, instance = 0): number {
    return WalkEntity.fnv1aHash(roomId, WalkEntity.KIND_SEED_SALT[kind], instance);
  }

  private destroyEntities(): void {
    for (const entity of this.walkEntities) entity.destroy();
    for (const hopper of this.hopEntities) hopper.destroy();
    this.walkEntities = [];
    this.hopEntities = [];
  }

  destroy(): void {
    this.destroyEntities();
    this.walkTextures = null;
  }
}
