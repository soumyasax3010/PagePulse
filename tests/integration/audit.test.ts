import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/logger.service.js', () => {
  const requestIds = new WeakMap<object, string>();

  return {
    setRequestId: (requestObject: object, requestId: string) => {
      requestIds.set(requestObject, requestId);
    },
    getRequestId: (requestObject: object) => requestIds.get(requestObject) ?? 'unknown',
    logHttpRequest: vi.fn(),
    logAuditSuccess: vi.fn(),
    logAuditFailure: vi.fn(),
    logServerStarted: vi.fn(),
    logServerStartFailure: vi.fn(),
  };
});

function createResponse(body: string | null, status: number, url: string): Response {
  const response = new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });

  Object.defineProperty(response, 'url', {
    value: url,
  });

  return response;
}

function createSuccessfulFetchMock() {
  return vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (init?.method === 'HEAD') {
      const status = url.endsWith('/robots.txt') ? 200 : 404;

      return createResponse(null, status, url);
    }

    return createResponse(
      `
          <html>
            <head>
              <title>Example Page</title>
              <meta name="description" content="Example description">
              <link rel="canonical" href="/canonical">
            </head>
          </html>
        `,
      200,
      'https://example.com/final',
    );
  });
}

async function loadApp() {
  const { app } = await import('../../src/app.js');

  return app;
}

describe('POST /audit', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CACHE_TTL_SECONDS', '300');
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '30');
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns a successful audit without public network access', async () => {
    const fetchMock = createSuccessfulFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const app = await loadApp();
    const response = await request(app).post('/audit').send({
      url: 'https://example.com',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      cacheHit: false,
      cacheAgeSeconds: 0,
      data: {
        url: 'https://example.com',
        finalUrl: 'https://example.com/final',
        status: 200,
        title: 'Example Page',
        isHttps: true,
        metaDescription: 'Example description',
        canonicalUrl: 'https://example.com/canonical',
        robotsTxtExists: true,
        sitemapExists: false,
      },
    });
    expect(response.body.data.responseTime).toEqual(expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reuses an in-progress audit for concurrent requests to the same URL', async () => {
    const fetchMock = createSuccessfulFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const app = await loadApp();
    const firstRequest = request(app).post('/audit').send({
      url: 'https://example.com/concurrent',
    });
    const secondRequest = request(app).post('/audit').send({
      url: 'https://example.com/concurrent',
    });
    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.cacheHit).toBe(false);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.cacheHit).toBe(true);
    expect(secondResponse.body.data).toEqual(firstResponse.body.data);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns 400 for an invalid URL without fetching', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const app = await loadApp();
    const response = await request(app).post('/audit').send({
      url: 'not-an-absolute-url',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_URL',
        message: '"url" must be a valid absolute HTTP or HTTPS URL.',
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the client IP exceeds its configured limit', async () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '2');

    const fetchMock = createSuccessfulFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const app = await loadApp();
    const firstResponse = await request(app).post('/audit').send({
      url: 'https://example.com',
    });
    const secondResponse = await request(app).post('/audit').send({
      url: 'https://example.com',
    });
    const limitedResponse = await request(app).post('/audit').send({
      url: 'https://example.com',
    });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.cacheHit).toBe(false);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.cacheHit).toBe(true);
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many audit requests. Please try again later.',
        retryAfterSeconds: 60,
      },
    });
    expect(limitedResponse.headers['retry-after']).toBe('60');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns 502 when the page fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network unavailable'));

    vi.stubGlobal('fetch', fetchMock);

    const app = await loadApp();
    const response = await request(app).post('/audit').send({
      url: 'https://unavailable.example',
    });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch the requested URL.',
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
