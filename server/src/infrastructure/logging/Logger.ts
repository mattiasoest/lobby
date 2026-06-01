import pino, { type Logger as PinoLogger } from 'pino';
import type { AppConfig } from '../../config/env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LoggerOptions = {
  level?: LogLevel;
  pretty?: boolean;
  name?: string;
};

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'authorization',
  'cookie',
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.apiKey',
];

function createPino(options: LoggerOptions): PinoLogger {
  const base: pino.LoggerOptions = {
    level: options.level ?? 'info',
    name: options.name,
    redact: REDACT_PATHS,
    serializers: {
      err: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (options.pretty) {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(base);
}

function errField(error: unknown): Record<string, unknown> {
  if (error === undefined) return {};
  if (error instanceof Error) return { err: error };
  return { err: { type: 'Unknown', detail: error } };
}

/** Structured server logger — JSON in production, pretty output in development. */
export class Logger {
  private readonly pino: PinoLogger;

  private constructor(pinoLogger: PinoLogger) {
    this.pino = pinoLogger;
  }

  static create(options: LoggerOptions = {}): Logger {
    return new Logger(createPino(options));
  }

  static fromConfig(config: AppConfig): Logger {
    return Logger.create({
      level: config.logLevel,
      pretty: config.nodeEnv === 'development',
      name: 'lobby-server',
    });
  }

  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.pino.child(bindings));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pino.debug(context, message);
      return;
    }
    this.pino.debug(message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pino.info(context, message);
      return;
    }
    this.pino.info(message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.pino.warn(context, message);
      return;
    }
    this.pino.warn(message);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const payload = { ...context, ...errField(error) };
    if (Object.keys(payload).length > 0) {
      this.pino.error(payload, message);
      return;
    }
    this.pino.error(message);
  }
}
