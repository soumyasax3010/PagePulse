import { env } from '../config/env.js';
import { normalizeUrl } from '../utils/url.js';
import { InMemoryCache } from './cache.service.js';
import { extractHtmlMetadata } from './html-metadata.service.js';
import { checkSiteResources } from './site-resource.service.js';

export interface AuditResult {
  url: string;
  finalUrl: string;
  status: number;
  responseTime: number;
  title: string | null;
  isHttps: boolean;
  metaDescription: string | null;
  canonicalUrl: string | null;
  robotsTxtExists: boolean;
  sitemapExists: boolean;
}

export interface AuditServiceResult {
  data: AuditResult;
  cacheHit: boolean;
  cacheAgeSeconds: number;
}

const auditCache = new InMemoryCache<AuditResult>(env.cacheTtlSeconds);
const auditsInProgress = new Map<string, Promise<AuditResult>>();

async function performAudit(url: string): Promise<AuditResult> {
  const isHttps = new URL(url).protocol === 'https:';
  const startedAt = performance.now();
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'PagePulse/1.0',
    },
  });
  const siteResourcesPromise = checkSiteResources(response.url);
  const html = await response.text();
  const responseTime = Math.round(performance.now() - startedAt);
  const metadata = extractHtmlMetadata(html, response.url);
  const siteResources = await siteResourcesPromise;

  return {
    url,
    finalUrl: response.url,
    status: response.status,
    responseTime,
    title: metadata.title,
    isHttps,
    metaDescription: metadata.metaDescription,
    canonicalUrl: metadata.canonicalUrl,
    robotsTxtExists: siteResources.robotsTxtExists,
    sitemapExists: siteResources.sitemapExists,
  };
}

export async function auditUrl(url: string): Promise<AuditServiceResult> {
  const cacheKey = normalizeUrl(url);
  const cachedResult = auditCache.get(cacheKey);

  if (cachedResult !== null) {
    return {
      data: {
        ...cachedResult.value,
        url,
      },
      cacheHit: true,
      cacheAgeSeconds: cachedResult.ageSeconds,
    };
  }

  const auditInProgress = auditsInProgress.get(cacheKey);

  if (auditInProgress !== undefined) {
    const auditResult = await auditInProgress;

    return {
      data: {
        ...auditResult,
        url,
      },
      cacheHit: true,
      cacheAgeSeconds: 0,
    };
  }

  const auditPromise = performAudit(url);

  auditsInProgress.set(cacheKey, auditPromise);

  try {
    const auditResult = await auditPromise;

    auditCache.set(cacheKey, auditResult);

    return {
      data: auditResult,
      cacheHit: false,
      cacheAgeSeconds: 0,
    };
  } finally {
    auditsInProgress.delete(cacheKey);
  }
}
