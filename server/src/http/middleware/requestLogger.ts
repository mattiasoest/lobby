import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../../config/env.js';
import { Logger } from '../../infrastructure/logging/Logger.js';

function requestPath(req: Request): string {
  return req.originalUrl.split('?')[0] ?? req.originalUrl;
}

function shouldSkipRequest(req: Request): boolean {
  const path = requestPath(req);
  if (path.startsWith('/socket.io')) return true;
  if (req.method === 'OPTIONS') return true;
  return false;
}

function readJsonError(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || !('error' in body)) return undefined;
  const error = (body as { error: unknown }).error;
  return typeof error === 'string' && error.length > 0 ? error : undefined;
}

function requestDurationMs(start: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - start) / 1_000_000 * 100) / 100;
}

/** Remembers the last `error` field from `res.json` for access logging. */
function captureResponseError(res: Response): () => string | undefined {
  let responseError: string | undefined;
  const json = res.json.bind(res);
  res.json = function jsonWithErrorCapture(body?: unknown) {
    responseError = readJsonError(body) ?? responseError;
    return json(body);
  };
  return () => responseError;
}

/** Logs handled HTTP errors (4xx/5xx) when the response finishes. */
export function createRequestLogger(config: AppConfig): RequestHandler {
  const accessLogger = Logger.fromConfig(config).child({ component: 'http' });

  return (req, res, next) => {
    if (shouldSkipRequest(req)) {
      next();
      return;
    }

    const start = process.hrtime.bigint();
    res.locals.requestStart = start;
    const getResponseError = captureResponseError(res);

    res.on('finish', () => {
      if (res.locals.httpErrorLogged || res.statusCode < 400) {
        return;
      }

      const responseError = getResponseError();
      const context = {
        method: req.method,
        path: requestPath(req),
        statusCode: res.statusCode,
        durationMs: requestDurationMs(start),
        ip: req.ip,
        ...(responseError ? { error: responseError } : {}),
      };

      if (res.statusCode >= 500) {
        accessLogger.error('server error', context);
        return;
      }
      accessLogger.warn('client error', context);
    });

    next();
  };
}

/** Logs unexpected errors with stack, then returns a generic 500 JSON body. */
export function createErrorHandler(config: AppConfig): ErrorRequestHandler {
  const httpLogger = Logger.fromConfig(config).child({ component: 'http' });

  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const start = res.locals.requestStart;
    const durationMs = typeof start === 'bigint' ? requestDurationMs(start) : undefined;

    httpLogger.error('unhandled request error', err, {
      method: req.method,
      path: requestPath(req),
      statusCode: 500,
      ip: req.ip,
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
    res.locals.httpErrorLogged = true;
    res.status(500).json({ error: 'internal_error' });
  };
}
