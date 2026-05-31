import { isTypingTarget, MOVE_KEYS, createMoveKeysState, setMoveKey } from '../config/keyboard.ts';
import type { RoomCanvasSyncState } from '../core/syncState.ts';
import type { MoveVector } from '../types.ts';

export class InputSystem {
  private keysInternal = createMoveKeysState();
  private touchVecRef = { x: 0, y: 0 };
  private readonly syncRef: { current: RoomCanvasSyncState };

  constructor(syncRef: { current: RoomCanvasSyncState }) {
    this.syncRef = syncRef;
  }

  private keyDown = (keyEvent: KeyboardEvent) => {
    if (this.syncRef.current.keysDisabled || isTypingTarget(keyEvent.target)) return;
    if (!MOVE_KEYS.has(keyEvent.key)) return;
    setMoveKey(this.keysInternal, keyEvent.key, true);
    keyEvent.preventDefault();
  };

  private keyUp = (keyEvent: KeyboardEvent) => {
    if (!MOVE_KEYS.has(keyEvent.key)) return;
    setMoveKey(this.keysInternal, keyEvent.key, false);
    keyEvent.preventDefault();
  };

  private blur = () => {
    Object.assign(this.keysInternal, createMoveKeysState());
    this.touchVecRef.x = 0;
    this.touchVecRef.y = 0;
  };

  attach(): void {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
  }

  setMoveVector(x: number, y: number): void {
    if (this.syncRef.current.keysDisabled) {
      this.touchVecRef.x = 0;
      this.touchVecRef.y = 0;
      return;
    }
    this.touchVecRef.x = Math.max(-1, Math.min(1, x));
    this.touchVecRef.y = Math.max(-1, Math.min(1, y));
  }

  clear(): void {
    Object.assign(this.keysInternal, createMoveKeysState());
    this.touchVecRef.x = 0;
    this.touchVecRef.y = 0;
  }

  getMoveVector(): MoveVector {
    const moveKeys = this.keysInternal;
    let vx = 0;
    let vy = 0;
    if (moveKeys.left) vx -= 1;
    if (moveKeys.right) vx += 1;
    if (moveKeys.up) vy -= 1;
    if (moveKeys.down) vy += 1;
    vx += this.touchVecRef.x;
    vy += this.touchVecRef.y;
    let len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
      len = 1;
    }
    return { vx, vy, len };
  }
}
