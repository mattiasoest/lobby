import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(3001),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  SERVER_PUBLIC_URL: z.string().default('http://localhost:3001'),
  GROQ_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  ALLOW_GUEST_LOGIN: z.string().default('1'),
  ALLOW_DEV_LOGIN: z.string().default('0'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_DAYS: z.coerce.number().int().positive().default(14),
  REFRESH_COOKIE_SECURE: z.string().optional(),
  REFRESH_COOKIE_SAMESITE: z.enum(['none', 'lax', 'strict']).optional(),
  GUEST_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().optional(),
  GUEST_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  port: number;
  jwtSecret: string;
  databaseUrl: string;
  frontendUrl: string;
  trustProxy: number;
  serverPublicUrl: string;
  groqApiKey: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  githubClientId: string | undefined;
  githubClientSecret: string | undefined;
  allowGuestLogin: boolean;
  allowDevLogin: boolean;
  jwtAccessExpires: string;
  jwtRefreshDays: number;
  refreshCookieSecure: string | undefined;
  refreshCookieSameSite: 'none' | 'lax' | 'strict' | undefined;
  guestLoginRateLimitWindowMs: number | undefined;
  guestLoginRateLimitMax: number | undefined;
};

export function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join('; ');
    console.error('Invalid environment configuration:', messages);
    process.exit(1);
  }
  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
    jwtSecret: env.JWT_SECRET,
    databaseUrl: env.DATABASE_URL,
    frontendUrl: env.FRONTEND_URL,
    trustProxy: env.TRUST_PROXY,
    serverPublicUrl: env.SERVER_PUBLIC_URL,
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    allowGuestLogin: env.ALLOW_GUEST_LOGIN !== '0',
    allowDevLogin: env.ALLOW_DEV_LOGIN === '1',
    jwtAccessExpires: env.JWT_ACCESS_EXPIRES,
    jwtRefreshDays: env.JWT_REFRESH_DAYS,
    refreshCookieSecure: env.REFRESH_COOKIE_SECURE,
    refreshCookieSameSite: env.REFRESH_COOKIE_SAMESITE,
    guestLoginRateLimitWindowMs: env.GUEST_LOGIN_RATE_LIMIT_WINDOW_MS,
    guestLoginRateLimitMax: env.GUEST_LOGIN_RATE_LIMIT_MAX,
  };
}
