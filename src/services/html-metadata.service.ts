import { load } from 'cheerio';

export interface HtmlMetadata {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
}

function normalizeText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalizedValue = value.replace(/\s+/g, ' ').trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function resolveCanonicalUrl(href: string | null, pageUrl: string): string | null {
  if (href === null) {
    return null;
  }

  try {
    const canonicalUrl = new URL(href, pageUrl);
    const isHttpProtocol = canonicalUrl.protocol === 'http:' || canonicalUrl.protocol === 'https:';

    return isHttpProtocol ? canonicalUrl.toString() : null;
  } catch {
    return null;
  }
}

export function extractHtmlMetadata(html: string, pageUrl: string): HtmlMetadata {
  const $ = load(html);
  let descriptionContent: string | undefined;
  let canonicalHref: string | undefined;

  $('meta').each((_index, element) => {
    const name = $(element).attr('name')?.trim().toLowerCase();

    if (descriptionContent === undefined && name === 'description') {
      const content = normalizeText($(element).attr('content'));

      if (content !== null) {
        descriptionContent = content;
      }
    }
  });

  $('link').each((_index, element) => {
    const relationships = $(element).attr('rel')?.trim().toLowerCase().split(/\s+/) ?? [];

    if (canonicalHref === undefined && relationships.includes('canonical')) {
      const href = normalizeText($(element).attr('href'));

      if (href !== null) {
        canonicalHref = href;
      }
    }
  });

  return {
    title: normalizeText($('title').first().text()),
    metaDescription: normalizeText(descriptionContent),
    canonicalUrl: resolveCanonicalUrl(normalizeText(canonicalHref), pageUrl),
  };
}
