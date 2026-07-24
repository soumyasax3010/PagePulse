import { describe, expect, it } from 'vitest';

import { normalizeUrl, normalizeUrlForLogging } from '../../src/utils/url.js';

describe('URL normalization', () => {
  it('normalizes protocol, host, default port, path, and fragment', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/audit?mode=full#section')).toBe(
      'https://example.com/audit?mode=full',
    );
    expect(normalizeUrl('http://Example.COM:80')).toBe('http://example.com/');
  });

  it('preserves query ordering for cache identity', () => {
    expect(normalizeUrl('https://example.com/?second=2&first=1')).toBe(
      'https://example.com/?second=2&first=1',
    );
  });

  it('removes credentials and redacts query values for logs', () => {
    expect(
      normalizeUrlForLogging(
        'https://user:password@Example.COM/path?token=secret&mode=full#fragment',
      ),
    ).toBe('https://example.com/path?token=%5BREDACTED%5D&mode=%5BREDACTED%5D');
  });
});
