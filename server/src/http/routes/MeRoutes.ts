import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { MeController } from '../controllers/MeController.js';

export function createMeRouter(meController: MeController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.get('/me', requireAuth, meController.getMe);
  router.patch('/me', requireAuth, meController.patchMe);
  return router;
}
