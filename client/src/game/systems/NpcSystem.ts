import type { Container } from 'pixi.js';
import { getRoomConfig } from '../config/roomConfig.ts';
import { clampWorldTopLeft } from '../core/worldMath.ts';
import { scatterNpcHomesInWorld } from '../core/npc/npcWander.ts';
import { WalkEntity, type LoadedNpcTextures, type NpcType, type WalkTextureSet } from '../entities/npcs/WalkEntity.ts';
import { Bull } from '../entities/npcs/Bull.ts';
import { Cow } from '../entities/npcs/Cow.ts';
import { Deer } from '../entities/npcs/Deer.ts';
import { Penguin } from '../entities/npcs/Penguin.ts';
import { Slime } from '../entities/npcs/Slime.ts';
import { FrogBlue } from '../entities/npcs/FrogBlue.ts';
import { HopEntity } from '../entities/npcs/HopEntity.ts';
import { HighlandBull } from '../entities/npcs/HighlandBull.ts';
import type { HopTextureSet } from '../entities/npcs/HopEntity.ts';
import type { MinimapNpc } from '../views/Minimap.ts';
import type { GameDimensions } from '../types.ts';

type NpcHomeAnchors = {
  bull: { x: number; y: number };
  cow: { x: number; y: number };
  deer: { x: number; y: number }[];
};

export class NpcSystem {
  private walkEntities: WalkEntity[] = [];
  private hopEntities: HopEntity[] = [];
  private npcTextures: LoadedNpcTextures | null = null;

  setTextures(textures: LoadedNpcTextures | null): void {
    this.npcTextures = textures;
  }

  spawn(roomId: number, dims: GameDimensions, actorLayer: Container): void {
    this.destroyEntities();

    const textures = this.npcTextures;
    const config = getRoomConfig(roomId);
    if (!textures || !config) return;

    const { tileSize, worldCols, worldRows } = dims;
    const homes = this.homeAnchors(roomId, tileSize, worldCols, worldRows);

    for (const spawn of config.npcs) {
      this.spawnNpcType(roomId, spawn.type, spawn.count, textures, homes, tileSize, worldCols, worldRows, actorLayer);
    }

    actorLayer.sortChildren();
  }

  private spawnNpcType(
    roomId: number,
    npcType: NpcType,
    count: number,
    textures: LoadedNpcTextures,
    homes: NpcHomeAnchors,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    actorLayer: Container,
  ): void {
    switch (npcType) {
      case 'bull': {
        const walkTextures = textures.bull;
        if (!walkTextures || count < 1) return;
        const bull = new Bull(
          walkTextures,
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
        return;
      }
      case 'cow': {
        const walkTextures = textures.cow;
        if (!walkTextures || count < 1) return;
        const cow = new Cow(
          walkTextures,
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
        return;
      }
      case 'deer': {
        const walkTextures = textures.deer;
        if (!walkTextures) return;
        this.spawnWalkNpcInstances(
          Deer,
          walkTextures,
          homes.deer.slice(0, count),
          roomId,
          'deer',
          tileSize,
          worldCols,
          worldRows,
          actorLayer,
        );
        return;
      }
      case 'frogBlue': {
        const hopTextures = textures.frogBlue as HopTextureSet | undefined;
        if (!hopTextures) return;
        this.spawnHopNpcInstances(
          FrogBlue,
          hopTextures,
          this.scatteredHomes(tileSize, worldCols, worldRows, count, 1, 'frogBlue', 0x6672_6f67),
          roomId,
          'frogBlue',
          tileSize,
          worldCols,
          worldRows,
          actorLayer,
        );
        return;
      }
      case 'highlandBull': {
        const walkTextures = textures.highlandBull;
        if (!walkTextures) return;
        this.spawnWalkNpcInstances(
          HighlandBull,
          walkTextures,
          this.scatteredHomes(tileSize, worldCols, worldRows, count, 3, 'highlandBull', 0x6869_6768),
          roomId,
          'highlandBull',
          tileSize,
          worldCols,
          worldRows,
          actorLayer,
        );
        return;
      }
      case 'slime': {
        const walkTextures = textures.slime;
        if (!walkTextures) return;
        this.spawnWalkNpcInstances(
          Slime,
          walkTextures,
          this.scatteredHomes(tileSize, worldCols, worldRows, count, 2, 'slime', 0x736c_696d),
          roomId,
          'slime',
          tileSize,
          worldCols,
          worldRows,
          actorLayer,
        );
        return;
      }
      case 'penguin': {
        const walkTextures = textures.penguin;
        if (!walkTextures) return;
        this.spawnWalkNpcInstances(
          Penguin,
          walkTextures,
          this.scatteredHomes(tileSize, worldCols, worldRows, count, 4, 'penguin', 0x706f_736e),
          roomId,
          'penguin',
          tileSize,
          worldCols,
          worldRows,
          actorLayer,
        );
      }
    }
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

  getMinimapNpcs(size: number): MinimapNpc[] {
    const avatarCenter = (topLeftX: number, topLeftY: number) => ({
      x: topLeftX + size / 2,
      y: topLeftY + size / 2,
    });
    const walkMarkers = this.walkEntities.map((entity) => {
      const pos = entity.getPosition();
      const center = avatarCenter(pos.x, pos.y);
      return { type: entity.type, x: center.x, y: center.y };
    });
    const hopperMarkers = this.hopEntities.map((hopper) => {
      const pos = hopper.getPosition();
      const center = avatarCenter(pos.x, pos.y);
      return { type: hopper.type, x: center.x, y: center.y };
    });
    return [...walkMarkers, ...hopperMarkers];
  }

  /**
   * Deterministic per-room placement for the bull, cow, and deer herd. Same `roomId` always yields
   * the same spawn anchors so a player revisiting a room sees NPCs in familiar positions.
   */
  private homeAnchors(roomId: number, tileSize: number, worldCols: number, worldRows: number): NpcHomeAnchors {
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

  private scatteredHomes(
    tileSize: number,
    worldCols: number,
    worldRows: number,
    count: number,
    layoutSalt: number,
    npcType: NpcType,
    typeSalt: number,
  ): { x: number; y: number }[] {
    return scatterNpcHomesInWorld(
      tileSize,
      worldCols,
      worldRows,
      count,
      WalkEntity.fnv1aHash(layoutSalt, WalkEntity.TYPE_SEED_SALT[npcType], typeSalt),
    );
  }

  private spawnWalkNpcInstances<T extends WalkEntity>(
    Ctor: new (
      textures: WalkTextureSet,
      tileSize: number,
      worldCols: number,
      worldRows: number,
      homeX: number,
      homeY: number,
      seedBase: number,
      roomId: number,
    ) => T,
    walkTextures: WalkTextureSet,
    npcHomes: { x: number; y: number }[],
    roomId: number,
    npcType: NpcType,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    actorLayer: Container,
  ): void {
    for (let i = 0; i < npcHomes.length; i++) {
      const home = npcHomes[i];
      if (!home) continue;
      const entity = new Ctor(
        walkTextures,
        tileSize,
        worldCols,
        worldRows,
        home.x,
        home.y,
        this.seedBase(roomId, npcType, i),
        roomId,
      );
      entity.view.zIndex = home.y;
      actorLayer.addChild(entity.view);
      this.walkEntities.push(entity);
    }
  }

  private spawnHopNpcInstances<T extends HopEntity>(
    Ctor: new (
      textures: HopTextureSet,
      tileSize: number,
      worldCols: number,
      worldRows: number,
      homeX: number,
      homeY: number,
      seedBase: number,
      roomId: number,
    ) => T,
    hopTextures: HopTextureSet,
    npcHomes: { x: number; y: number }[],
    roomId: number,
    npcType: NpcType,
    tileSize: number,
    worldCols: number,
    worldRows: number,
    actorLayer: Container,
  ): void {
    for (let i = 0; i < npcHomes.length; i++) {
      const home = npcHomes[i];
      if (!home) continue;
      const hopper = new Ctor(
        hopTextures,
        tileSize,
        worldCols,
        worldRows,
        home.x,
        home.y,
        this.seedBase(roomId, npcType, i),
        roomId,
      );
      hopper.view.zIndex = home.y;
      actorLayer.addChild(hopper.view);
      this.hopEntities.push(hopper);
    }
  }

  private seedBase(roomId: number, npcType: NpcType, instance = 0): number {
    return WalkEntity.fnv1aHash(roomId, WalkEntity.TYPE_SEED_SALT[npcType], instance);
  }

  private destroyEntities(): void {
    for (const entity of this.walkEntities) entity.destroy();
    for (const hopper of this.hopEntities) hopper.destroy();
    this.walkEntities = [];
    this.hopEntities = [];
  }

  destroy(): void {
    this.destroyEntities();
    this.npcTextures = null;
  }
}
