import type { RoomId } from '../../app/constants.ts';
import type { NpcType } from '../entities/npcs/WalkEntity.ts';

export type RoomBackgroundKey = 'grass' | 'space' | 'desert' | 'snow';
export type RoomWeather = 'rain' | 'snow' | null;

export type RoomNpcSpawn = {
  type: NpcType;
  count: number;
};

export type RoomConfig = {
  backgroundKey: RoomBackgroundKey;
  weather: RoomWeather;
  merchant: boolean;
  npcs: RoomNpcSpawn[];
};

const ROOM_CONFIGS: Record<RoomId, RoomConfig> = {
  1: {
    backgroundKey: 'grass',
    weather: null,
    merchant: true,
    npcs: [
      { type: 'deer', count: 3 },
      { type: 'frogBlue', count: 10 },
    ],
  },
  2: {
    backgroundKey: 'space',
    weather: 'rain',
    merchant: true,
    npcs: [
      { type: 'deer', count: 3 },
      { type: 'slime', count: 10 },
    ],
  },
  3: {
    backgroundKey: 'desert',
    weather: null,
    merchant: true,
    npcs: [
      { type: 'deer', count: 3 },
      { type: 'bull', count: 1 },
      { type: 'cow', count: 1 },
      { type: 'highlandBull', count: 5 },
    ],
  },
  4: {
    backgroundKey: 'snow',
    weather: 'snow',
    merchant: true,
    npcs: [
      { type: 'deer', count: 3 },
      { type: 'penguin', count: 8 },
    ],
  },
};

export function getRoomConfig(roomId: number): RoomConfig | null {
  return ROOM_CONFIGS[roomId as RoomId] ?? null;
}

export function npcTypesForRoom(roomId: number): NpcType[] {
  const config = getRoomConfig(roomId);
  if (!config) return [];
  return [...new Set(config.npcs.map((spawn) => spawn.type))];
}
