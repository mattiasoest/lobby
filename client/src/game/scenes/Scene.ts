import { Assets, Container, TilingSprite, type Texture } from 'pixi.js';
import { ROOM_CAMERA_ZOOM } from '../core/constants.ts';
import { Animal, type AnimalTextureMap } from '../entities/npcs/Animal.ts';
import { Merchant, type MerchantIdleFrames } from '../entities/Merchant.ts';
import { Player, type CharacterTextureSet } from '../entities/Player.ts';
import { ROOM_PIXEL_FACE_SPECS } from '../core/pixelTypography.ts';

export type RoomAssets = {
  grassTexture: Texture | null;
  characterTexturesByAvatarId: Map<string, CharacterTextureSet>;
  animalTextures: AnimalTextureMap | null;
  merchantIdleFrames: MerchantIdleFrames | null;
};

export type SceneOptions = {
  worldPixelW: number;
  worldPixelH: number;
  grassTexture: Texture | null;
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

  static async loadAssets(
    grassTextureSrc: string,
    characterTextureSrcByAvatarId: Record<string, { idle: string; walk: string }>,
    animalTextureSrc: { bull: string; cow: string; deer: { idle: string; walk: string } },
    merchantTextureSrc: string,
  ): Promise<RoomAssets> {
    const characterLoadEntries = Object.entries(characterTextureSrcByAvatarId);
    const [grassResult, characterResults, animalResult, merchantIdleFrames] = await Promise.all([
      Assets.load(grassTextureSrc).catch(() => null),
      Promise.all(
        characterLoadEntries.map(async ([avatarId, src]) => {
          const textures = await Player.loadTextures(src.idle, src.walk);
          return [avatarId, textures] as const;
        }),
      ),
      Animal.loadTextures(animalTextureSrc.bull, animalTextureSrc.cow, animalTextureSrc.deer),
      Merchant.loadIdleFrames(merchantTextureSrc),
    ]);

    const characterTexturesByAvatarId = new Map(
      characterResults.flatMap(([avatarId, textures]) => (textures ? [[avatarId, textures]] : [])),
    );

    return {
      grassTexture: (grassResult as Texture | null) ?? null,
      characterTexturesByAvatarId,
      animalTextures: animalResult,
      merchantIdleFrames,
    };
  }

  constructor(opts: SceneOptions) {
    const { worldPixelW, worldPixelH, grassTexture } = opts;

    const world = new Container();
    this.world = world;

    if (grassTexture) {
      const grass = new TilingSprite({
        texture: grassTexture,
        width: worldPixelW,
        height: worldPixelH,
      });
      this.background = grass;
      world.addChild(grass);
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
