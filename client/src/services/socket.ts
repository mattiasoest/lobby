import { io } from 'socket.io-client';
import { apiOrigin } from './apiOrigin.ts';

export type RoomSocketOptions = {
  roomId: number;
  token: string;
};

/** When the API is on another host (dev or split prod deploy), connect there; else same-origin (reverse proxy). */
function socketHttpBase(): string | undefined {
  const base = apiOrigin();
  return base === '' ? undefined : base;
}

export function createRoomSocket({ roomId, token }: RoomSocketOptions) {
  const namespace = `/room-${roomId}`;
  const base = socketHttpBase();
  const urlOrNamespace = base ? `${base}${namespace}` : namespace;
  return io(urlOrNamespace, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });
}
