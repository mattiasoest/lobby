import type { Container } from 'pixi.js';
import { getRoomConfig } from '../config/roomConfig.ts';
import { clampWorldTopLeft } from '../core/worldMath.ts';
import { WalkEntity, type LoadedNpcTextures, type NpcType } from '../entities/npcs/WalkEntity.ts';
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
        for (let i = 0; i < count; i++) {
          const home = homes.deer[i];
          if (!home) continue;
          const deer = new Deer(
            walkTextures,
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
        return;
      }
      case 'frogBlue': {
        const hopTextures = textures.frogBlue as HopTextureSet | undefined;
        if (!hopTextures) return;
        const frogHomes = this.frogBlueHomes(tileSize, worldCols, worldRows, count);
        for (let i = 0; i < frogHomes.length; i++) {
          const home = frogHomes[i];
          if (!home) continue;
          const frog = new FrogBlue(
            hopTextures,
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
        return;
      }
      case 'highlandBull': {
        const walkTextures = textures.highlandBull;
        if (!walkTextures) return;
        const highlandBullHomes = this.highlandBullHomes(tileSize, worldCols, worldRows, count);
        for (let i = 0; i < highlandBullHomes.length; i++) {
          const home = highlandBullHomes[i];
          if (!home) continue;
          const highlandBull = new HighlandBull(
            walkTextures,
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
        return;
      }
      case 'slime': {
        const walkTextures = textures.slime;
        if (!walkTextures) return;
        const slimeHomes = this.slimeHomes(tileSize, worldCols, worldRows, count);
        for (let i = 0; i < slimeHomes.length; i++) {
          const home = slimeHomes[i];
          if (!home) continue;
          const slime = new Slime(
            walkTextures,
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
        return;
      }
      case 'penguin': {
        const walkTextures = textures.penguin;
        if (!walkTextures) return;
        const penguinHomes = this.penguinHomes(tileSize, worldCols, worldRows, count);
        for (let i = 0; i < penguinHomes.length; i++) {
          const home = penguinHomes[i];
          if (!home) continue;
          const penguin = new Penguin(
            walkTextures,
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
      const prng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(1, WalkEntity.TYPE_SEED_SALT.frogBlue, i, 0x6672_6f67));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

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
        WalkEntity.fnv1aHash(3, WalkEntity.TYPE_SEED_SALT.highlandBull, i, 0x6869_6768),
      );
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

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
      const prng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(2, WalkEntity.TYPE_SEED_SALT.slime, i, 0x736c_696d));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
  }

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
      const prng = WalkEntity.mulberry32(WalkEntity.fnv1aHash(4, WalkEntity.TYPE_SEED_SALT.penguin, i, 0x706f_736e));
      const raw = { x: marginX + prng() * spanX, y: marginY + prng() * spanY };
      homes.push(clampWorldTopLeft(raw.x, raw.y, tileSize, worldCols, worldRows));
    }

    return homes;
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
