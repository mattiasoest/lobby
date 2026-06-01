import { Router } from 'express';
import type { AuthTokensController } from '../controllers/AuthTokensController.js';
import { sessionJsonParser } from '../controllers/AuthTokensController.js';

export function createAuthTokensRouter(authTokensController: AuthTokensController): Router {
  const router = Router();
  router.post('/session', sessionJsonParser, authTokensController.bindSession);
  router.post('/refresh', authTokensController.refresh);
  router.post('/logout', authTokensController.logout);
  return router;
}
