import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitService } from '../../src/services/rate-limit.service.js';

describe('RateLimitService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('allows requests up to the per-IP limit', () => {
    const limiter = new RateLimitService(2, 60);

    expect(limiter.check('192.0.2.10')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(limiter.check('192.0.2.10')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(limiter.check('192.0.2.10')).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('tracks client IPs independently', () => {
    const limiter = new RateLimitService(1, 60);

    expect(limiter.check('192.0.2.10').allowed).toBe(true);
    expect(limiter.check('192.0.2.10').allowed).toBe(false);
    expect(limiter.check('192.0.2.11').allowed).toBe(true);
  });

  it('reports the remaining retry time and resets expired windows', () => {
    const limiter = new RateLimitService(1, 60);

    limiter.check('192.0.2.10');
    vi.advanceTimersByTime(30_100);

    expect(limiter.check('192.0.2.10')).toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });

    vi.advanceTimersByTime(29_900);

    expect(limiter.check('192.0.2.10')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('rejects invalid configuration', () => {
    expect(() => new RateLimitService(0, 60)).toThrow(
      'Rate-limit request limit must be a positive integer.',
    );
    expect(() => new RateLimitService(30, 0)).toThrow(
      'Rate-limit window must be a positive integer.',
    );
  });
});
