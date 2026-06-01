import type { Namespace } from 'socket.io';
import type { Services } from '../services/createServices.js';
import { RoomController } from './controllers/RoomController.js';

export type RealtimeControllers = {
  createRoomController(roomId: number, nsp: Namespace): RoomController;
};

export function createRealtimeControllers(services: Services): RealtimeControllers {
  const roomServices = {
    user: services.user,
    message: services.message,
    chatNpc: services.chatNpc,
  };

  return {
    createRoomController: (roomId, nsp) => new RoomController(roomId, nsp, roomServices),
  };
}
