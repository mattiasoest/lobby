import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { MessagesController } from '../controllers/MessagesController.js';

export function createMessagesRouter(
  messagesController: MessagesController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.get('/rooms/:roomId/messages', requireAuth, messagesController.listRoomMessages);
  return router;
}
