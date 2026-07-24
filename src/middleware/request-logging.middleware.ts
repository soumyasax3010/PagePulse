import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { logHttpRequest, setRequestId } from '../services/logger.service.js';

function elapsedMilliseconds(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const method = request.method;
  const route = request.path;
  const clientIp = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  let requestLogged = false;

  setRequestId(request, requestId);

  const logRequest = (aborted: boolean): void => {
    if (requestLogged) {
      return;
    }

    requestLogged = true;
    logHttpRequest({
      requestId,
      method,
      route,
      clientIp,
      responseStatus: response.statusCode,
      responseTime: elapsedMilliseconds(startedAt),
      aborted,
    });
  };

  response.once('finish', () => {
    logRequest(false);
  });
  response.once('close', () => {
    if (!response.writableFinished) {
      logRequest(true);
    }
  });

  next();
}
