import { io } from 'socket.io-client';

export type RoomSocketOptions = {
  roomId: number
  token: string
}

/** In dev, hit the API host directly so Socket.IO avoids Vite's WS proxy (Engine.IO often gets ECONNRESET there). */
function socketServerUrl(): string | undefined {
  if (import.meta.env.PROD) return undefined;
  const raw = import.meta.env.VITE_PROXY_TARGET ?? 'http://localhost:3001';
  return raw.replace(/\/$/, '');
}

export function createRoomSocket({ roomId, token }: RoomSocketOptions) {
  const namespace = `/room-${roomId}`;
  const base = socketServerUrl();
  const urlOrNamespace = base ? `${base}${namespace}` : namespace;
  return io(urlOrNamespace, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });
}
