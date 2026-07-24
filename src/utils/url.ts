export function normalizeUrl(url: string): string {
  const normalizedUrl = new URL(url);

  normalizedUrl.hash = '';

  return normalizedUrl.toString();
}

export function normalizeUrlForLogging(url: string): string {
  const normalizedUrl = new URL(normalizeUrl(url));
  const queryParameterNames = [...new Set(normalizedUrl.searchParams.keys())];

  normalizedUrl.username = '';
  normalizedUrl.password = '';
  normalizedUrl.search = '';

  for (const parameterName of queryParameterNames) {
    normalizedUrl.searchParams.append(parameterName, '[REDACTED]');
  }

  return normalizedUrl.toString();
}
