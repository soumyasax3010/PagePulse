import { beforeEach, describe, expect, it, vi } from 'vitest';

const environmentVariables = [
  'PORT',
  'HOST',
  'NODE_ENV',
  'CACHE_TTL_SECONDS',
  'RATE_LIMIT_MAX_REQUESTS',
  'RATE_LIMIT_WINDOW_SECONDS',
] as const;

async function loadEnvironment() {
  const { env } = await import('../../src/config/env.js');

  return env;
}

describe('environment configuration', () => {
  beforeEach(() => {
    vi.resetModules();

    for (const variable of environmentVariables) {
      vi.stubEnv(variable, undefined);
    }
  });

  it('provides production-compatible defaults', async () => {
    await expect(loadEnvironment()).resolves.toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3000,
      cacheTtlSeconds: 300,
      rateLimitMaxRequests: 30,
      rateLimitWindowSeconds: 60,
    });
  });

  it('parses valid configured values', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HOST', '::1');
    vi.stubEnv('PORT', '10000');
    vi.stubEnv('CACHE_TTL_SECONDS', '600');
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '50');
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '120');

    await expect(loadEnvironment()).resolves.toEqual({
      nodeEnv: 'production',
      host: '::1',
      port: 10000,
      cacheTtlSeconds: 600,
      rateLimitMaxRequests: 50,
      rateLimitWindowSeconds: 120,
    });
  });

  it.each([
    ['NODE_ENV', 'staging', 'NODE_ENV must be one of'],
    ['HOST', 'not a host', 'HOST must be a valid IP address or hostname'],
    ['PORT', '0', 'PORT must be an integer between 1 and 65535'],
    ['CACHE_TTL_SECONDS', '0', 'CACHE_TTL_SECONDS must be a positive integer'],
    ['RATE_LIMIT_MAX_REQUESTS', '-1', 'RATE_LIMIT_MAX_REQUESTS must be a positive integer'],
    ['RATE_LIMIT_WINDOW_SECONDS', '1.5', 'RATE_LIMIT_WINDOW_SECONDS must be a positive integer'],
  ])('rejects invalid %s values', async (name, value, message) => {
    vi.stubEnv(name, value);

    await expect(loadEnvironment()).rejects.toThrow(message);
  });
});
