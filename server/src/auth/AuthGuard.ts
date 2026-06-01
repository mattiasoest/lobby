import type { RequestHandler } from 'express';
import { verifyAccessToken } from './tokens.js';

export type AuthUser = { sub: string; username: string };

export type AuthedRequest = import('express').Request & { user: AuthUser };

export { verifyAccessToken };

export class AuthGuard {
  constructor(private readonly jwtSecret: string) {}

  requireAuth: RequestHandler = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const payload = verifyAccessToken(header.slice(7), this.jwtSecret);
    if (!payload) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    (req as AuthedRequest).user = payload;
    next();
  };

  socketAuth = (
    socket: import('socket.io').Socket,
    next: (err?: Error) => void,
  ): void => {
    const authToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const header =
      typeof socket.handshake.headers.authorization === 'string'
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
        : undefined;
    const raw = authToken ?? header;
    if (!raw) {
      next(new Error('unauthorized'));
      return;
    }
    const payload = verifyAccessToken(raw, this.jwtSecret);
    if (!payload) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.user = payload;
    next();
  };
}
