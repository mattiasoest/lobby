import type { AppConfig } from '../config/env.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { AuthService } from './AuthService.js';
import { SessionService } from './SessionService.js';
import { UserService } from './UserService.js';
import { MessageService } from './MessageService.js';
import { ChatNpcService } from './ChatNpcService.js';
import { SeedService } from './SeedService.js';
import { ChatNpcRateLimiter } from '../realtime/ChatNpcRateLimiter.js';

export type Services = {
  auth: AuthService;
  session: SessionService;
  user: UserService;
  message: MessageService;
  chatNpc: ChatNpcService;
  seed: SeedService;
};

export function createServices(db: AppDatabase, config: AppConfig): Services {
  const chatNpcRateLimiter = new ChatNpcRateLimiter();
  const message = new MessageService(db);

  return {
    auth: new AuthService(db, config),
    session: new SessionService(db, config),
    user: new UserService(db),
    message,
    chatNpc: new ChatNpcService(db, message, config.groqApiKey, chatNpcRateLimiter),
    seed: new SeedService(db),
  };
}
