export interface SiteResourceStatus {
  robotsTxtExists: boolean;
  sitemapExists: boolean;
}

const probeHeaders = {
  accept: '*/*',
  'user-agent': 'PagePulse/1.0',
};

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function resourceExists(url: string): Promise<boolean> {
  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: probeHeaders,
    });
    const shouldFallbackToGet = headResponse.status === 405 || headResponse.status === 501;
    const existsFromHead = headResponse.ok;

    await cancelResponseBody(headResponse);

    if (!shouldFallbackToGet) {
      return existsFromHead;
    }

    const getResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        ...probeHeaders,
        range: 'bytes=0-0',
      },
    });
    const existsFromGet = getResponse.ok;

    await cancelResponseBody(getResponse);

    return existsFromGet;
  } catch {
    return false;
  }
}

export async function checkSiteResources(pageUrl: string): Promise<SiteResourceStatus> {
  const robotsTxtUrl = new URL('/robots.txt', pageUrl).toString();
  const sitemapUrl = new URL('/sitemap.xml', pageUrl).toString();
  const [robotsTxtExists, sitemapExists] = await Promise.all([
    resourceExists(robotsTxtUrl),
    resourceExists(sitemapUrl),
  ]);

  return {
    robotsTxtExists,
    sitemapExists,
  };
}
