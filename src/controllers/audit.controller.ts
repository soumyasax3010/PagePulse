import type { Request, Response } from 'express';

import { auditUrl, type AuditResult } from '../services/audit.service.js';
import { getRequestId, logAuditFailure, logAuditSuccess } from '../services/logger.service.js';
import { normalizeUrlForLogging } from '../utils/url.js';

interface AuditRequestBody {
  url?: unknown;
}

interface AuditSuccessResponse {
  success: true;
  data: AuditResult;
  cacheHit: boolean;
  cacheAgeSeconds: number;
}

interface AuditErrorResponse {
  success: false;
  error: {
    code: 'INVALID_URL' | 'FETCH_FAILED';
    message: string;
  };
}

type AuditResponse = AuditSuccessResponse | AuditErrorResponse;

function validateUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const url = value.trim();

  try {
    const parsedUrl = new URL(url);
    const isHttpProtocol = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';

    return isHttpProtocol && parsedUrl.hostname.length > 0 ? url : null;
  } catch {
    return null;
  }
}

export async function auditController(
  request: Request<Record<string, never>, AuditResponse, AuditRequestBody>,
  response: Response<AuditResponse>,
): Promise<void> {
  const url = validateUrl(request.body?.url);

  if (url === null) {
    response.status(400).json({
      success: false,
      error: {
        code: 'INVALID_URL',
        message: '"url" must be a valid absolute HTTP or HTTPS URL.',
      },
    });
    return;
  }

  const requestId = getRequestId(request);
  const normalizedUrl = normalizeUrlForLogging(url);
  const auditStartedAt = performance.now();

  try {
    const result = await auditUrl(url);
    const responseTime = Number((performance.now() - auditStartedAt).toFixed(2));

    logAuditSuccess({
      requestId,
      normalizedUrl,
      cacheHit: result.cacheHit,
      responseTime,
    });

    response.status(200).json({
      success: true,
      data: result.data,
      cacheHit: result.cacheHit,
      cacheAgeSeconds: result.cacheAgeSeconds,
    });
  } catch (error: unknown) {
    logAuditFailure(
      {
        requestId,
        normalizedUrl,
        cacheHit: false,
        responseTime: Number((performance.now() - auditStartedAt).toFixed(2)),
      },
      error,
    );

    response.status(502).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch the requested URL.',
      },
    });
  }
}
