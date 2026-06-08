import { Merchant, type MerchantIdleFrames } from '../entities/Merchant.ts';
import { Bomber } from '../entities/npcs/Bomber.ts';
import type { NpcType, NpcTextureSet } from '../entities/npcs/WalkEntity.ts';
import type { NpcTextureCache } from '../scenes/Scene.ts';
import { merchantAssetSrc, npcAssetSrcForType } from './npcAssets.ts';

/** Merchant idle frames — same asset in every room. */
export const sharedMerchantFramesCache: { current: MerchantIdleFrames | null } = { current: null };

/** NPC textures loaded once and reused across room switches and game recreates. */
export const sharedNpcTextureCache: NpcTextureCache = new Map<NpcType, NpcTextureSet>();

let preloadPromise: Promise<void> | null = null;

/** Warm merchant + bomber sheets before Pixi bootstrap (every room uses both). */
export function preloadRoomSharedAssets(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const tasks: Promise<unknown>[] = [];

    if (!sharedMerchantFramesCache.current) {
      tasks.push(
        Merchant.loadIdleFrames(merchantAssetSrc()).then((frames) => {
          if (frames) sharedMerchantFramesCache.current = frames;
        }),
      );
    }

    if (!sharedNpcTextureCache.has('bomber')) {
      const asset = npcAssetSrcForType('bomber');
      if (asset.type === 'bomber') {
        tasks.push(
          Bomber.loadTextures(asset.idle, asset.walk, asset.run).then((textures) => {
            if (textures) sharedNpcTextureCache.set('bomber', textures);
          }),
        );
      }
    }

    await Promise.all(tasks);
  })();

  return preloadPromise;
}
