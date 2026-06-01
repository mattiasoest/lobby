import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 5;

function parsePositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createGuestLoginRateLimit(config: AppConfig): RequestHandler {
  return rateLimit({
    windowMs: parsePositiveInt(config.guestLoginRateLimitWindowMs, DEFAULT_WINDOW_MS),
    limit: parsePositiveInt(config.guestLoginRateLimitMax, DEFAULT_MAX),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  });
}
