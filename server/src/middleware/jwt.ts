import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export type AuthUser = { sub: string; username: string };

export type AuthedRequest = import('express').Request & { user: AuthUser };

export function createRequireAuth(jwtSecret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), jwtSecret) as AuthUser;
      (req as AuthedRequest).user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}
