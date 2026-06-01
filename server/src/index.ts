import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { createDatabase } from './infrastructure/db/createDatabase.js';
import { Logger } from './infrastructure/logging/Logger.js';
import { AuthGuard } from './auth/AuthGuard.js';
import { createServices } from './services/createServices.js';
import { createHttpControllers } from './http/createHttpControllers.js';
import { createRealtimeControllers } from './realtime/createRealtimeControllers.js';
import { HttpApp } from './app/HttpApp.js';
import { RealtimeServer } from './app/RealtimeServer.js';

// Composition root — see server/README.md for layered architecture (HTTP + realtime → services).

const config = loadConfig();
const logger = Logger.fromConfig(config);
const { db } = createDatabase(config.databaseUrl);
const services = createServices(db, config);
const httpControllers = createHttpControllers(services, config);
const realtimeControllers = createRealtimeControllers(services);
const authGuard = new AuthGuard(config.jwtSecret);

const httpApp = new HttpApp({ config, controllers: httpControllers, authGuard });
const realtimeServer = new RealtimeServer(httpApp.express, {
  config,
  authGuard,
  controllers: realtimeControllers,
});

try {
  await services.seed.ensureChatNpcUsers();
} catch (error) {
  logger.error('ensureChatNpcUsers failed', error);
  process.exit(1);
}

realtimeServer.httpServer.listen(config.port, () => {
  logger.info('Server listening', { url: `http://localhost:${config.port}` });
  if (!config.groqApiKey) {
    logger.warn('GROQ_API_KEY is not set — room ChatNpcs will not reply to chat');
  }
});
