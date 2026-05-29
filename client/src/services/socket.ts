import { io } from 'socket.io-client';
import { apiOrigin } from './apiOrigin.ts';

export type RoomSocketOptions = {
  roomId: number;
  token: string;
};

/** In dev, hit the API host directly so cookies + WS match REST (matches `apiOrigin()`). */
function socketHttpBase(): string | undefined {
  if (import.meta.env.PROD) return undefined;
  return apiOrigin();
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
