import { Assets, type Texture } from 'pixi.js';
import { Entity } from '../../entities/Entity.ts';
import { WALK_ENTITY_SPRITE_SIZE_PX, type WalkTextureSet } from '../../entities/npcs/WalkEntity.ts';

export const WALK_FRAMES_PER_ROW = 4;
export const SHEET_ROW_LEFT = 0;
export const SHEET_ROW_DOWN = 1;
export const SHEET_ROW_UP = 2;

/** Down/up rows sit high in their cells; trim bleed from the row above. */
export const STANDARD_ROW_INSET = {
  down: { top: 1 },
  up: { top: 1 },
} as const;

export async function loadThreeRowWalkSheet(src: string): Promise<WalkTextureSet | null> {
  try {
    const base = await Assets.load<Texture>(src);
    base.source.scaleMode = 'nearest';
    return {
      left: Entity.sliceSpritesheetRow(base, SHEET_ROW_LEFT, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      down: Entity.sliceSpritesheetRow(
        base,
        SHEET_ROW_DOWN,
        WALK_FRAMES_PER_ROW,
        WALK_ENTITY_SPRITE_SIZE_PX,
        STANDARD_ROW_INSET.down,
      ),
      up: Entity.sliceSpritesheetRow(
        base,
        SHEET_ROW_UP,
        WALK_FRAMES_PER_ROW,
        WALK_ENTITY_SPRITE_SIZE_PX,
        STANDARD_ROW_INSET.up,
      ),
    };
  } catch {
    return null;
  }
}

export async function loadFiveRowWalkWithIdleSheet(src: string): Promise<WalkTextureSet | null> {
  const ROW_IDLE_LEFT = 3;
  const ROW_IDLE_DOWN = 4;
  try {
    const base = await Assets.load<Texture>(src);
    base.source.scaleMode = 'nearest';
    return {
      left: Entity.sliceSpritesheetRow(base, SHEET_ROW_LEFT, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      down: Entity.sliceSpritesheetRow(
        base,
        SHEET_ROW_DOWN,
        WALK_FRAMES_PER_ROW,
        WALK_ENTITY_SPRITE_SIZE_PX,
        STANDARD_ROW_INSET.down,
      ),
      up: Entity.sliceSpritesheetRow(
        base,
        SHEET_ROW_UP,
        WALK_FRAMES_PER_ROW,
        WALK_ENTITY_SPRITE_SIZE_PX,
        STANDARD_ROW_INSET.up,
      ),
      idleLeft: Entity.sliceSpritesheetRow(base, ROW_IDLE_LEFT, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      idleDown: Entity.sliceSpritesheetRow(base, ROW_IDLE_DOWN, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
    };
  } catch {
    return null;
  }
}

export async function loadIdleAndWalkSheets(
  idleSrc: string,
  walkSrc: string,
  idleFramesPerRow = WALK_FRAMES_PER_ROW,
): Promise<WalkTextureSet | null> {
  try {
    const [idleBase, walkBase] = await Promise.all([Assets.load<Texture>(idleSrc), Assets.load<Texture>(walkSrc)]);
    idleBase.source.scaleMode = 'nearest';
    walkBase.source.scaleMode = 'nearest';
    return {
      left: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_LEFT, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      down: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_DOWN, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      up: Entity.sliceSpritesheetRow(walkBase, SHEET_ROW_UP, WALK_FRAMES_PER_ROW, WALK_ENTITY_SPRITE_SIZE_PX),
      idleLeft: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_LEFT, idleFramesPerRow, WALK_ENTITY_SPRITE_SIZE_PX),
      idleDown: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_DOWN, idleFramesPerRow, WALK_ENTITY_SPRITE_SIZE_PX),
      idleUp: Entity.sliceSpritesheetRow(idleBase, SHEET_ROW_UP, idleFramesPerRow, WALK_ENTITY_SPRITE_SIZE_PX),
    };
  } catch {
    return null;
  }
}
