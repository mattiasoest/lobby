import type { Texture } from 'pixi.js';

export type NpcCardinalDirection = 'left' | 'right' | 'down' | 'up';

export type NpcDirectionTextureSet = {
  left: Texture[];
  down: Texture[];
  up: Texture[];
  idleLeft?: Texture[];
  idleDown?: Texture[];
  idleUp?: Texture[];
  runLeft?: Texture[];
  runDown?: Texture[];
  runUp?: Texture[];
};

export type NpcMotionKind = 'idle' | 'walk' | 'run';

export function hasNpcIdleTextures(tex: NpcDirectionTextureSet): boolean {
  return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
}

export function hasNpcRunTextures(tex: NpcDirectionTextureSet): boolean {
  return !!(tex.runLeft ?? tex.runDown ?? tex.runUp);
}

export function selectNpcDirectionFrames(
  direction: NpcCardinalDirection,
  tex: NpcDirectionTextureSet,
  motion: NpcMotionKind,
  horizontalProfileFacesRight: boolean,
): { frames: Texture[]; flipX: boolean } {
  let frames: Texture[];
  let flipX = false;
  switch (direction) {
    case 'right': {
      if (motion === 'idle' && tex.idleLeft) frames = tex.idleLeft;
      else if (motion === 'run' && tex.runLeft) frames = tex.runLeft;
      else frames = tex.left;
      flipX = !horizontalProfileFacesRight;
      break;
    }
    case 'left': {
      if (motion === 'idle' && tex.idleLeft) frames = tex.idleLeft;
      else if (motion === 'run' && tex.runLeft) frames = tex.runLeft;
      else frames = tex.left;
      flipX = horizontalProfileFacesRight;
      break;
    }
    case 'up':
      if (motion === 'idle' && tex.idleUp) frames = tex.idleUp;
      else if (motion === 'run' && tex.runUp) frames = tex.runUp;
      else frames = tex.up;
      break;
    case 'down':
    default:
      if (motion === 'idle' && tex.idleDown) frames = tex.idleDown;
      else if (motion === 'run' && tex.runDown) frames = tex.runDown;
      else frames = tex.down;
      break;
  }
  return { frames, flipX };
}
