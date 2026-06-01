import type { AppConfig } from '../config/env.js';
import type { Services } from '../services/createServices.js';
import { AuthController } from './controllers/AuthController.js';
import { AuthTokensController } from './controllers/AuthTokensController.js';
import { MeController } from './controllers/MeController.js';
import { MessagesController } from './controllers/MessagesController.js';

export type HttpControllers = {
  auth: AuthController;
  authTokens: AuthTokensController;
  me: MeController;
  messages: MessagesController;
};

export function createHttpControllers(services: Services, config: AppConfig): HttpControllers {
  return {
    auth: new AuthController(services.auth, config),
    authTokens: new AuthTokensController(services.session, config),
    me: new MeController(services.user),
    messages: new MessagesController(services.message),
  };
}
