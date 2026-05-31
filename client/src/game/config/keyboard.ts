export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return target.closest('textarea, input, select, button') !== null;
}

export const MOVE_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'w',
  'W',
  'a',
  'A',
  's',
  'S',
  'd',
  'D',
]);

export type MoveKeysState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export function createMoveKeysState(): MoveKeysState {
  return { up: false, down: false, left: false, right: false };
}

export function setMoveKey(keys: MoveKeysState, code: string, down: boolean) {
  switch (code) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      keys.up = down;
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      keys.down = down;
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      keys.left = down;
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      keys.right = down;
      break;
    default:
      break;
  }
}
