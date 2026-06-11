import { Assets, Container, TilingSprite, type Texture } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from '../core/constants.ts';
import { backgroundSrcForKey, merchantAssetSrc, npcAssetSrcForType } from '../config/npcAssets.ts';
import { getRoomConfig, npcTypesForRoom } from '../config/roomConfig.ts';
import { Bull } from '../entities/npcs/Bull.ts';
import { Cow } from '../entities/npcs/Cow.ts';
import { Deer } from '../entities/npcs/Deer.ts';
import { FrogBlue } from '../entities/npcs/FrogBlue.ts';
import { HighlandBull } from '../entities/npcs/HighlandBull.ts';
import { Penguin } from '../entities/npcs/Penguin.ts';
import { PenguinMini } from '../entities/npcs/PenguinMini.ts';
import { Slime } from '../entities/npcs/Slime.ts';
import { Bomber } from '../entities/npcs/Bomber.ts';
import { type LoadedNpcTextures, type NpcType, type NpcTextureSet } from '../entities/npcs/WalkEntity.ts';
import { Merchant, type MerchantIdleFrames } from '../entities/Merchant.ts';
import { Player, type CharacterTextureSet } from '../entities/Player.ts';
import { ROOM_PIXEL_FACE_SPECS } from '../core/pixelTypography.ts';

export type NpcTextureCache = Map<NpcType, NpcTextureSet>;

export type RoomLoadedAssets = {
  backgroundTexture: Texture | null;
  npcTextures: LoadedNpcTextures;
  merchantIdleFrames: MerchantIdleFrames | null;
};

export type BootstrapAssets = RoomLoadedAssets & {
  characterTexturesByAvatarId: Map<string, CharacterTextureSet>;
};

export type SceneOptions = {
  worldPixelW: number;
  worldPixelH: number;
  backgroundTexture: Texture | null;
};

/**
 * Owns the Pixi scene hierarchy: zoomed view root, world container, background,
 * actor/weather/name/speech layers.
 */
export class Scene {
  readonly viewRoot: Container;
  readonly world: Container;
  readonly actorLayer: Container;
  readonly weatherWorld: Container;
  readonly playerNameLayer: Container;
  readonly speechBubbleWorld: Container;
  background: TilingSprite | null = null;

  static async loadFonts(): Promise<void> {
    await Promise.all(ROOM_PIXEL_FACE_SPECS.map((spec) => document.fonts.load(spec))).catch(() => {
      /** Remote fonts blocked or offline — labels fall back to generic monospace stack. */
    });
  }

  static async loadBootstrapAssets(
    roomId: number,
    npcTextureCache: NpcTextureCache,
    merchantFramesCache: { current: MerchantIdleFrames | null },
    avatarIds: readonly string[],
  ): Promise<BootstrapAssets> {
    const [roomAssets, characterTexturesByAvatarId] = await Promise.all([
      loadRoomAssets(roomId, npcTextureCache, merchantFramesCache),
      Player.loadAllCharacterTextures(avatarIds),
    ]);

    return { ...roomAssets, characterTexturesByAvatarId };
  }

  constructor(opts: SceneOptions) {
    const { worldPixelW, worldPixelH, backgroundTexture } = opts;

    const world = new Container();
    this.world = world;

    if (backgroundTexture) {
      const backgroundTile = new TilingSprite({
        texture: backgroundTexture,
        width: worldPixelW,
        height: worldPixelH,
      });
      this.background = backgroundTile;
      world.addChild(backgroundTile);
    }

    const actorLayer = new Container();
    actorLayer.sortableChildren = true;
    this.actorLayer = actorLayer;
    world.addChild(actorLayer);

    const weatherWorld = new Container();
    weatherWorld.eventMode = 'none';
    this.weatherWorld = weatherWorld;
    world.addChild(weatherWorld);

    const playerNameLayer = new Container();
    playerNameLayer.sortableChildren = true;
    this.playerNameLayer = playerNameLayer;
    world.addChild(playerNameLayer);

    const speechBubbleRoot = new Container();
    this.speechBubbleWorld = speechBubbleRoot;
    world.addChild(speechBubbleRoot);

    const viewRoot = new Container();
    viewRoot.scale.set(ROOM_CAMERA_ZOOM, ROOM_CAMERA_ZOOM);
    viewRoot.addChild(world);
    this.viewRoot = viewRoot;
  }

  setBackgroundTexture(texture: Texture, worldPixelW: number, worldPixelH: number): void {
    if (this.background) {
      this.background.texture = texture;
      this.background.width = worldPixelW;
      this.background.height = worldPixelH;
    }
  }

  destroy(): void {
    this.background = null;
  }
}

export async function loadRoomAssets(
  roomId: number,
  npcTextureCache: NpcTextureCache,
  merchantFramesCache: { current: MerchantIdleFrames | null },
): Promise<RoomLoadedAssets> {
  const config = getRoomConfig(roomId);
  if (!config) {
    return { backgroundTexture: null, npcTextures: {}, merchantIdleFrames: null };
  }

  const backgroundSrc = backgroundSrcForKey(config.backgroundKey);
  const npcTypes = npcTypesForRoom(roomId);

  const loadTypes = npcTypes.map(async (npcType) => {
    if (npcTextureCache.has(npcType)) return;
    const textures = await loadNpcTexturesForType(npcType);
    if (textures) npcTextureCache.set(npcType, textures);
  });

  const merchantLoad =
    config.merchant && !merchantFramesCache.current
      ? Merchant.loadIdleFrames(merchantAssetSrc()).then((frames) => {
          if (frames) merchantFramesCache.current = frames;
        })
      : Promise.resolve();

  const [backgroundTexture] = await Promise.all([
    Assets.load(backgroundSrc).catch(() => null) as Promise<Texture | null>,
    ...loadTypes,
    merchantLoad,
  ]);

  const npcTextures: LoadedNpcTextures = {};
  for (const npcType of npcTypes) {
    const textures = npcTextureCache.get(npcType);
    if (textures) npcTextures[npcType] = textures;
  }

  return {
    backgroundTexture,
    npcTextures,
    merchantIdleFrames: config.merchant ? merchantFramesCache.current : null,
  };
}

async function loadNpcTexturesForType(npcType: NpcType): Promise<NpcTextureSet | null> {
  const asset = npcAssetSrcForType(npcType);
  switch (asset.type) {
    case 'bull':
      return Bull.loadTextures(asset.src);
    case 'cow':
      return Cow.loadTextures(asset.src);
    case 'deer':
      return Deer.loadTextures(asset.idle, asset.walk);
    case 'frogBlue':
      return FrogBlue.loadTextures(asset.src);
    case 'highlandBull':
      return HighlandBull.loadTextures(asset.src);
    case 'penguin':
      return Penguin.loadTextures(asset.src);
    case 'penguinMini':
      return PenguinMini.loadTextures(asset.src);
    case 'slime':
      return Slime.loadTextures(asset.idle, asset.walk);
    case 'bomber':
      return Bomber.loadTextures(asset.idle, asset.walk, asset.run);
  }
}
