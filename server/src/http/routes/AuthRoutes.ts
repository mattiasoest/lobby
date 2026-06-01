import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AuthController } from '../controllers/AuthController.js';

export function createAuthRouter(
  authController: AuthController,
  guestLoginRateLimit: RequestHandler,
): Router {
  const router = Router();
  router.get('/providers', authController.getProviders);
  router.post('/guest-login', guestLoginRateLimit, authController.guestLogin);
  router.post('/dev-login', authController.devLogin);
  return router;
}
