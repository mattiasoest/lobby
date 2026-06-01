import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import passport from 'passport';
import type { AppConfig } from '../config/env.js';
import { corsOriginDelegate, parseAllowedOrigins } from '../config/cors.js';
import { setupOAuth } from '../auth/passportSetup.js';
import type { AuthGuard } from '../auth/AuthGuard.js';
import { createGuestLoginRateLimit } from '../http/middleware/guestLoginRateLimit.js';
import { createAuthRouter } from '../http/routes/AuthRoutes.js';
import { createAuthTokensRouter } from '../http/routes/AuthTokensRoutes.js';
import { createMeRouter } from '../http/routes/MeRoutes.js';
import { createMessagesRouter } from '../http/routes/MessagesRoutes.js';
import type { HttpControllers } from '../http/createHttpControllers.js';

export type HttpAppDeps = {
  config: AppConfig;
  controllers: HttpControllers;
  authGuard: AuthGuard;
};

export class HttpApp {
  readonly express: Express;

  constructor(deps: HttpAppDeps) {
    const { config, controllers, authGuard } = deps;
    const app = express();
    const allowedOrigins = parseAllowedOrigins(config.frontendUrl);

    app.set('trust proxy', config.trustProxy);

    app.use(
      cors({
        origin: corsOriginDelegate(allowedOrigins),
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 600,
      }),
    );
    app.use(cookieParser());
    app.use(express.json());
    app.use(passport.initialize());

    setupOAuth(app, config, controllers.auth);

    app.use('/auth', createAuthRouter(controllers.auth, createGuestLoginRateLimit(config)));
    app.use('/auth', createAuthTokensRouter(controllers.authTokens));
    app.use(createMeRouter(controllers.me, authGuard.requireAuth));
    app.use(createMessagesRouter(controllers.messages, authGuard.requireAuth));

    this.express = app;
  }
}
