const TILE_PX = 32;
const WORLD_COLS = 48;
const WORLD_ROWS = 32;

/**
 * Fixed rate at which we re-broadcast moving players. Clients may send `player:move` far faster
 * (up to their render rate); we coalesce those into one snapshot per tick so fan-out stays
 * O(players) per tick instead of O(moves) — this is what keeps production from flooding and
 * jittering. Roster changes (join/leave) flush immediately regardless of the tick.
 */
const BROADCAST_HZ = 20;
const BROADCAST_INTERVAL_MS = Math.round(1000 / BROADCAST_HZ);

export type PlayerPublic = {
  id: string;
  username: string;
  x: number;
  y: number;
  userId: string;
  avatarId: string;
};

/**
 * `t` is the server send time (Date.now, ms). Clients replay remote movement on a timeline anchored
 * to these timestamps so per-packet network jitter doesn't distort the motion.
 */
export type PlayersUpdate = {
  t: number;
  players: PlayerPublic[];
};

function clampPlayerPx(rawX: unknown, rawY: unknown): { x: number; y: number } {
  const pad = TILE_PX * 0.14;
  const size = TILE_PX - pad * 2;
  const worldWidthPx = WORLD_COLS * TILE_PX;
  const worldHeightPx = WORLD_ROWS * TILE_PX;
  const min = pad;
  const maxX = worldWidthPx - pad - size;
  const maxY = worldHeightPx - pad - size;
  const nx = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : min;
  const ny = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : min;
  return {
    x: Math.min(Math.max(nx, min), maxX),
    y: Math.min(Math.max(ny, min), maxY),
  };
}

export class PlayerPresence {
  private readonly players = new Map<string, PlayerPublic>();
  private movesPending = false;

  constructor(private readonly nsp: import('socket.io').Namespace) {
    const broadcastTimer = setInterval(() => {
      if (!this.movesPending) return;
      this.movesPending = false;
      this.emitPlayers();
    }, BROADCAST_INTERVAL_MS);
    broadcastTimer.unref?.();
  }

  join(
    socketId: string,
    user: { sub: string; username: string },
    position: { x: number; y: number },
    avatarId: string,
  ): void {
    const clamped = clampPlayerPx(position.x, position.y);
    this.players.set(socketId, {
      id: socketId,
      username: user.username,
      x: clamped.x,
      y: clamped.y,
      userId: user.sub,
      avatarId,
    });
    this.flushNow();
  }

  move(socketId: string, position: { x: number; y: number }): void {
    const row = this.players.get(socketId);
    if (!row) return;
    const clamped = clampPlayerPx(position.x, position.y);
    row.x = clamped.x;
    row.y = clamped.y;
    this.movesPending = true;
  }

  leave(socketId: string): void {
    this.players.delete(socketId);
    this.flushNow();
  }

  private emitPlayers(): void {
    const payload: PlayersUpdate = { t: Date.now(), players: [...this.players.values()] };
    this.nsp.emit('players:update', payload);
  }

  private flushNow(): void {
    this.movesPending = false;
    this.emitPlayers();
  }
}
