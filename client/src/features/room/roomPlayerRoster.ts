import { LOCAL_DISPLAY_ID } from '../../game/core/constants.ts';
import type { PlayerDTO } from '@/types.ts';
import { decodeJwtPayload } from '@/utils/jwt.ts';

export function rosterStructureKey(players: PlayerDTO[]): string {
  if (players.length === 0) return '';
  return [...players]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}\0${p.username}\0${p.userId}\0${p.avatarId}`)
    .join('|');
}

/** Stable id for the local avatar row before the room socket connects (rekeyed to socket id on connect). */
export function resolveLocalPlayerId(socketId: string | null, claims: ReturnType<typeof decodeJwtPayload>): string {
  if (socketId) return socketId;
  if (typeof claims?.sub === 'string' && claims.sub.length > 0) return claims.sub;
  return LOCAL_DISPLAY_ID;
}

function buildLocalPreviewPlayer(
  localId: string,
  spawnPx: { x: number; y: number },
  username: string | null | undefined,
  claims: ReturnType<typeof decodeJwtPayload>,
  avatarId: string,
): PlayerDTO {
  const userId = typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : localId;
  return {
    id: localId,
    username: username ?? claims?.username ?? 'You',
    x: spawnPx.x,
    y: spawnPx.y,
    userId,
    avatarId,
  };
}

/** Ensures the ticker always has a local row — uses JWT auth before the room socket connects. */
export function withGhostPlayerIfNeeded(
  server: PlayerDTO[],
  socketId: string | null,
  spawnPx: { x: number; y: number },
  username: string | null | undefined,
  claims: ReturnType<typeof decodeJwtPayload>,
  avatarId: string,
): PlayerDTO[] {
  const localId = resolveLocalPlayerId(socketId, claims);
  if (server.some((player) => player.id === localId)) return server;
  const selfUserId = typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : null;
  if (selfUserId && server.some((player) => player.userId === selfUserId)) return server;
  return [...server, buildLocalPreviewPlayer(localId, spawnPx, username, claims, avatarId)];
}
