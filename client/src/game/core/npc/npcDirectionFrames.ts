import type { Texture } from 'pixi.js';

export type NpcCardinalDirection = 'left' | 'right' | 'down' | 'up';

export type NpcDirectionTextureSet = {
  left: Texture[];
  down: Texture[];
  up: Texture[];
  idleLeft?: Texture[];
  idleDown?: Texture[];
  idleUp?: Texture[];
};

export function hasNpcIdleTextures(tex: NpcDirectionTextureSet): boolean {
  return !!(tex.idleLeft ?? tex.idleDown ?? tex.idleUp);
}

export function selectNpcDirectionFrames(
  direction: NpcCardinalDirection,
  tex: NpcDirectionTextureSet,
  useIdle: boolean,
  horizontalProfileFacesRight: boolean,
): { frames: Texture[]; flipX: boolean } {
  let frames: Texture[];
  let flipX = false;
  switch (direction) {
    case 'right':
      frames = useIdle && tex.idleLeft ? tex.idleLeft : tex.left;
      flipX = !horizontalProfileFacesRight;
      break;
    case 'left':
      frames = useIdle && tex.idleLeft ? tex.idleLeft : tex.left;
      flipX = horizontalProfileFacesRight;
      break;
    case 'up':
      frames = useIdle && tex.idleUp ? tex.idleUp : tex.up;
      break;
    case 'down':
    default:
      frames = useIdle && tex.idleDown ? tex.idleDown : tex.down;
      break;
  }
  return { frames, flipX };
}
