import { createServer as createHttpServer, type Server } from 'node:http';
import type { Express } from 'express';
import { Server as IOServer } from 'socket.io';
import type { AppConfig } from '../config/env.js';
import { parseAllowedOrigins } from '../config/cors.js';
import type { AuthGuard } from '../auth/AuthGuard.js';
import { registerRoomNamespaces } from '../realtime/registerRoomNamespaces.js';
import type { RealtimeControllers } from '../realtime/createRealtimeControllers.js';

export type RealtimeServerDeps = {
  config: AppConfig;
  authGuard: AuthGuard;
  controllers: RealtimeControllers;
};

export class RealtimeServer {
  readonly httpServer: Server;

  constructor(app: Express, deps: RealtimeServerDeps) {
    const allowedOrigins = parseAllowedOrigins(deps.config.frontendUrl);
    this.httpServer = createHttpServer(app);
    const io = new IOServer(this.httpServer, {
      cors: { origin: allowedOrigins, credentials: true, methods: ['GET', 'POST'] },
      path: '/socket.io',
    });

    registerRoomNamespaces(io, { authGuard: deps.authGuard, controllers: deps.controllers });
  }
}
