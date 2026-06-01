import type { Server } from 'socket.io';
import { ROOM_IDS } from '../domain/rooms.js';
import type { AuthGuard } from '../auth/AuthGuard.js';
import type { RealtimeControllers } from './createRealtimeControllers.js';

export type RealtimeDeps = {
  authGuard: AuthGuard;
  controllers: RealtimeControllers;
};

/** Realtime transport wiring: namespaces → RoomController. */
export function registerRoomNamespaces(io: Server, deps: RealtimeDeps): void {
  for (const roomId of ROOM_IDS) {
    const nsp = io.of(`/room-${roomId}`);
    nsp.use(deps.authGuard.socketAuth);

    const controller = deps.controllers.createRoomController(roomId, nsp);

    nsp.on('connection', (socket) => {
      const authedSocket = socket as import('socket.io').Socket & {
        data: { user: import('../auth/AuthGuard.js').AuthUser };
      };

      controller.onConnect(authedSocket);

      socket.on('player:join', (payload: { x: number; y: number }) => {
        void controller.onPlayerJoin(authedSocket, payload);
      });

      socket.on('player:move', (payload: { x: number; y: number }) => {
        controller.onPlayerMove(authedSocket, payload);
      });

      socket.on('player:leave', () => {
        controller.onPlayerLeave(authedSocket);
      });

      socket.on('chat:send', (payload: { content: string }) => {
        void controller.onChatSend(authedSocket, payload);
      });

      socket.on('disconnect', () => {
        controller.onDisconnect(authedSocket);
      });
    });
  }
}
