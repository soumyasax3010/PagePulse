import { describe, expect, it } from 'vitest';

import { extractHtmlMetadata } from '../../src/services/html-metadata.service.js';

describe('extractHtmlMetadata', () => {
  it('extracts and normalizes page metadata', () => {
    const html = `
      <html>
        <head>
          <title> Page   Pulse </title>
          <meta name="DESCRIPTION" content=" A useful   description ">
          <link rel="alternate CANONICAL" href="/canonical-page">
        </head>
      </html>
    `;

    expect(extractHtmlMetadata(html, 'https://example.com/source')).toEqual({
      title: 'Page Pulse',
      metaDescription: 'A useful description',
      canonicalUrl: 'https://example.com/canonical-page',
    });
  });

  it('skips empty descriptions and uses the first populated value', () => {
    const html = `
      <meta name="description" content="   ">
      <meta name="description" content="Available">
    `;

    expect(extractHtmlMetadata(html, 'https://example.com')).toMatchObject({
      metaDescription: 'Available',
    });
  });

  it('returns null for missing metadata', () => {
    expect(extractHtmlMetadata('<html><head></head></html>', 'https://example.com')).toEqual({
      title: null,
      metaDescription: null,
      canonicalUrl: null,
    });
  });

  it('returns null for malformed or non-HTTP canonical URLs', () => {
    const html = '<link rel="canonical" href="javascript:alert(1)">';

    expect(extractHtmlMetadata(html, 'https://example.com').canonicalUrl).toBeNull();
  });
});
