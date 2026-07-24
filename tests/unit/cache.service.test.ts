import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryCache } from '../../src/services/cache.service.js';

describe('InMemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('returns cached values with their age', () => {
    const cache = new InMemoryCache<string>(5);

    cache.set('page', 'result');

    expect(cache.get('page')).toEqual({
      value: 'result',
      ageSeconds: 0,
    });

    vi.advanceTimersByTime(2_200);

    expect(cache.get('page')).toEqual({
      value: 'result',
      ageSeconds: 2,
    });
  });

  it('removes values after their TTL expires', () => {
    const cache = new InMemoryCache<string>(5);

    cache.set('page', 'result');
    vi.advanceTimersByTime(5_000);

    expect(cache.get('page')).toBeNull();
  });

  it('replaces existing values and restarts their TTL', () => {
    const cache = new InMemoryCache<string>(5);

    cache.set('page', 'first');
    vi.advanceTimersByTime(4_000);
    cache.set('page', 'second');
    vi.advanceTimersByTime(2_000);

    expect(cache.get('page')).toEqual({
      value: 'second',
      ageSeconds: 2,
    });
  });

  it('rejects invalid TTL values', () => {
    expect(() => new InMemoryCache(0)).toThrow('Cache TTL must be a positive integer.');
    expect(() => new InMemoryCache(1.5)).toThrow('Cache TTL must be a positive integer.');
  });
});
