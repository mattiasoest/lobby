import desertBg from '@/assets/bg/desert.jpg';
import grassBg from '@/assets/bg/grass.jpg';
import spaceBg from '@/assets/bg/space.jpg';
import snowBg from '@/assets/bg/snow.jpg';
import bullSpriteSrc from '@/assets/entities/bull/bull.png';
import cowSpriteSrc from '@/assets/entities/cow/cow.png';
import deerIdleSpriteSrc from '@/assets/entities/deer/deer_idle.png';
import deerWalkSpriteSrc from '@/assets/entities/deer/deer_walk.png';
import frogBlueSpriteSrc from '@/assets/entities/frogBlue/frogBlue.png';
import highlandBullSpriteSrc from '@/assets/entities/highlandBull/highlandBull.png';
import merchantSpriteSrc from '@/assets/entities/merchant/merchant.png';
import penguinSpriteSrc from '@/assets/entities/penguin/penguin.png';
import slimeIdleSpriteSrc from '@/assets/entities/slimeBlue/idle.png';
import slimeWalkSpriteSrc from '@/assets/entities/slimeBlue/walk.png';
import type { RoomBackgroundKey } from './roomConfig.ts';
import type { NpcType } from '../entities/npcs/WalkEntity.ts';

const BACKGROUND_SRC_BY_KEY: Record<RoomBackgroundKey, string> = {
  grass: grassBg,
  space: spaceBg,
  desert: desertBg,
  snow: snowBg,
};

export type NpcAssetSrc =
  | { type: 'bull' | 'cow' | 'frogBlue' | 'highlandBull' | 'penguin'; src: string }
  | { type: 'deer' | 'slime'; idle: string; walk: string };

export function backgroundSrcForKey(key: RoomBackgroundKey): string {
  return BACKGROUND_SRC_BY_KEY[key];
}

export function merchantAssetSrc(): string {
  return merchantSpriteSrc;
}

export function npcAssetSrcForType(npcType: NpcType): NpcAssetSrc {
  switch (npcType) {
    case 'bull':
      return { type: 'bull', src: bullSpriteSrc };
    case 'cow':
      return { type: 'cow', src: cowSpriteSrc };
    case 'deer':
      return { type: 'deer', idle: deerIdleSpriteSrc, walk: deerWalkSpriteSrc };
    case 'frogBlue':
      return { type: 'frogBlue', src: frogBlueSpriteSrc };
    case 'highlandBull':
      return { type: 'highlandBull', src: highlandBullSpriteSrc };
    case 'penguin':
      return { type: 'penguin', src: penguinSpriteSrc };
    case 'slime':
      return { type: 'slime', idle: slimeIdleSpriteSrc, walk: slimeWalkSpriteSrc };
  }
}
