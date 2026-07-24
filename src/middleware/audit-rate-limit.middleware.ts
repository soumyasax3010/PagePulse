import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { RateLimitService } from '../services/rate-limit.service.js';

interface RateLimitErrorResponse {
  success: false;
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: string;
    retryAfterSeconds: number;
  };
}

const auditRateLimiter = new RateLimitService(env.rateLimitMaxRequests, env.rateLimitWindowSeconds);

export function auditRateLimitMiddleware(
  request: Request,
  response: Response<RateLimitErrorResponse>,
  next: NextFunction,
): void {
  const clientIp = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  const decision = auditRateLimiter.check(clientIp);

  if (decision.allowed) {
    next();
    return;
  }

  response.setHeader('Retry-After', decision.retryAfterSeconds.toString());
  response.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many audit requests. Please try again later.',
      retryAfterSeconds: decision.retryAfterSeconds,
    },
  });
}
