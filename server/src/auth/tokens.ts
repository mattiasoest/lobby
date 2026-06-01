import crypto from 'node:crypto';
import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import type { AppConfig } from '../config/env.js';
import { primaryFrontendUrl } from '../config/cors.js';

export const REFRESH_COOKIE_NAME = 'lobby_rt';

const AUTH_COOKIE_PATH = '/auth';

function cookieSecure(config: AppConfig): boolean {
  if (config.refreshCookieSecure === '1') return true;
  if (config.refreshCookieSecure === '0') return false;
  for (const candidate of [config.serverPublicUrl, primaryFrontendUrl(config.frontendUrl)]) {
    try {
      if (new URL(candidate).protocol === 'https:') return true;
    } catch {
      // ignore malformed URL, try next
    }
  }
  return false;
}

function refreshCookieSameSite(config: AppConfig): NonNullable<CookieOptions['sameSite']> {
  if (config.refreshCookieSameSite) return config.refreshCookieSameSite;
  return 'strict';
}

function cookieBase(
  config: AppConfig,
  sameSite: NonNullable<CookieOptions['sameSite']>,
): Omit<CookieOptions, 'maxAge'> {
  const secure = cookieSecure(config);
  return {
    httpOnly: true,
    secure: secure || sameSite === 'none',
    sameSite,
    path: AUTH_COOKIE_PATH,
  };
}

export function refreshTtlMs(config: AppConfig): number {
  const days = config.jwtRefreshDays;
  if (!Number.isFinite(days) || days < 1) return 14 * 24 * 60 * 60 * 1000;
  return days * 24 * 60 * 60 * 1000;
}

export function refreshCookieOptions(config: AppConfig): CookieOptions {
  return { ...cookieBase(config, refreshCookieSameSite(config)), maxAge: refreshTtlMs(config) };
}

export function clearRefreshCookieOptions(config: AppConfig): CookieOptions {
  return cookieBase(config, refreshCookieSameSite(config));
}

export function oauthStateCookieOptions(config: AppConfig, maxAgeMs: number): CookieOptions {
  return { ...cookieBase(config, 'lax'), maxAge: maxAgeMs };
}

export function clearOauthStateCookieOptions(config: AppConfig): CookieOptions {
  return cookieBase(config, 'lax');
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function generateRefreshSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function issueAccessToken(
  user: { id: string; username: string },
  jwtSecret: string,
  config: AppConfig,
): string {
  return jwt.sign({ sub: user.id, username: user.username }, jwtSecret, {
    expiresIn: config.jwtAccessExpires as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(
  raw: string,
  jwtSecret: string,
): { sub: string; username: string } | null {
  try {
    const payload = jwt.verify(raw, jwtSecret) as { sub?: string; username?: string };
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') return null;
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
