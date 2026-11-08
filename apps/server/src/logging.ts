import { LogController } from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** pino levels `LOG_LEVEL` accepts (spec logging R1). */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Paths pino masks whatever a call site passes (spec logging R4): credentials travel in
 * these headers and bodies only, so a stray `log.info({ req })` cannot print them.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  '*.password',
  '*.token',
  '*.current',
  '*.next',
  'password',
  'token',
];

/** The Fastify `logger` option: level from `LOG_LEVEL`, redaction always on. */
export interface LoggerOptions {
  level: LogLevel;
  redact: { paths: string[]; censor: string };
  /** A destination stream; tests pass one to read the lines back. */
  stream?: { write(line: string): void };
}

export function loggerOptions(level: LogLevel, stream?: LoggerOptions['stream']): LoggerOptions {
  return { level, redact: { paths: [...REDACT_PATHS], censor: '[redacted]' }, stream };
}

/**
 * The level of the one `http.request` line per answer (spec logging R3): 5xx at error,
 * refusals stay visible, and the media bucket (segments, heartbeats,
 * streams) drops to debug so a film does not write a line every few seconds.
 */
export function requestLevel(status: number, media: boolean): 'debug' | 'info' | 'warn' | 'error' {
  // A status sent by a route (502 transcode_failed, 503 transcode_busy) skips the error handler.
  if (status >= 500) return 'error';
  if (status === 403 || status === 429) return 'warn';
  // A player polls a segment not written yet: each retry is a 404.
  if (status === 404 && media) return 'debug';
  if (status >= 400) return 'info';
  return media ? 'debug' : 'info';
}

/**
 * Silences only Fastify's request lines (spec logging R3): `incoming request`, `request
 * completed` and `Route … not found`, whose text carries the query string. Its error lines
 * (a stream failing mid-film, a serializer or `writeHead` error) stay.
 */
export class OneLinePerRequest extends LogController {
  override incomingRequest(): void {
    // Replaced by the `http.request` line of `registerRequestLog`.
  }

  override requestCompleted(...args: Parameters<LogController['requestCompleted']>): void {
    if (args[0]) super.requestCompleted(...args);
  }

  override routeNotFound(): void {
    // Its text carries the query string; the `http.request` line logs the 404 instead.
  }
}

/** Replaces Fastify's two request lines by one, with the path but never the query string. */
export function registerRequestLog(app: FastifyInstance): void {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const media = request.routeOptions.config?.rateBucket === 'media';
    request.log[requestLevel(reply.statusCode, media)](
      {
        event: 'http.request',
        method: request.method,
        path: request.url.split('?', 1)[0],
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
        userId: request.caller?.userId,
      },
      'request done',
    );
  });
}
