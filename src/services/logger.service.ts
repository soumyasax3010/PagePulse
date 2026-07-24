import type { Request } from 'express';
import pino from 'pino';

interface HttpRequestLog {
  requestId: string;
  method: string;
  route: string;
  clientIp: string;
  responseStatus: number;
  responseTime: number;
  aborted: boolean;
}

interface AuditLog {
  requestId: string;
  normalizedUrl: string;
  cacheHit: boolean;
  responseTime: number;
}

interface ServerStartedLog {
  host: string;
  port: number;
  environment: string;
}

interface ServerShutdownLog {
  signal: NodeJS.Signals;
}

const requestIds = new WeakMap<Request, string>();

const logger = pino({
  level: 'info',
  base: {
    service: 'pagepulse',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
      'request.body',
      'response.body',
      'html',
    ],
    censor: '[REDACTED]',
  },
});

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('A non-Error value was thrown.');
}

export function setRequestId(request: Request, requestId: string): void {
  requestIds.set(request, requestId);
}

export function getRequestId(request: Request): string {
  return requestIds.get(request) ?? 'unknown';
}

export function logHttpRequest(fields: HttpRequestLog): void {
  logger.info(
    {
      event: 'http_request',
      ...fields,
    },
    fields.aborted ? 'HTTP request aborted' : 'HTTP request completed',
  );
}

export function logAuditSuccess(fields: AuditLog): void {
  logger.info(
    {
      event: 'audit',
      ...fields,
      auditSuccess: true,
    },
    'URL audit completed',
  );
}

export function logAuditFailure(fields: AuditLog, error: unknown): void {
  logger.error(
    {
      event: 'audit',
      ...fields,
      auditSuccess: false,
      err: asError(error),
    },
    'URL audit failed',
  );
}

export function logServerStarted(fields: ServerStartedLog): void {
  logger.info(
    {
      event: 'server_started',
      ...fields,
    },
    'PagePulse started',
  );
}

export function logServerStartFailure(error: unknown): void {
  logger.error(
    {
      event: 'server_start_failed',
      err: asError(error),
    },
    'PagePulse failed to start',
  );
}

export function logServerShutdownStarted(fields: ServerShutdownLog): void {
  logger.info(
    {
      event: 'server_shutdown_started',
      ...fields,
    },
    'PagePulse shutdown started',
  );
}

export function logServerStopped(fields: ServerShutdownLog): void {
  logger.info(
    {
      event: 'server_stopped',
      ...fields,
    },
    'PagePulse stopped',
  );
}

export function logServerShutdownFailure(fields: ServerShutdownLog, error: unknown): void {
  logger.error(
    {
      event: 'server_shutdown_failed',
      ...fields,
      err: asError(error),
    },
    'PagePulse failed to shut down gracefully',
  );
}
