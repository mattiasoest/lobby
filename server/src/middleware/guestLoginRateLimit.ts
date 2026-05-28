import rateLimit from 'express-rate-limit';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 5;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const guestLoginRateLimit = rateLimit({
  windowMs: parsePositiveInt(process.env.GUEST_LOGIN_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
  limit: parsePositiveInt(process.env.GUEST_LOGIN_RATE_LIMIT_MAX, DEFAULT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});
