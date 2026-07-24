import { isIP } from 'node:net';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_HOSTNAME_LENGTH = 253;
const hostnamePattern =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

const supportedEnvironments = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof supportedEnvironments)[number];

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const environment = value ?? 'development';

  if (!supportedEnvironments.some((candidate) => candidate === environment)) {
    throw new Error(
      `NODE_ENV must be one of: ${supportedEnvironments.join(', ')}. Received: ${environment}`,
    );
  }

  return environment as NodeEnvironment;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535. Received: ${value}`);
  }

  return port;
}

function parseHost(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_HOST;
  }

  const host = value.trim();
  const isValidIpAddress = isIP(host) !== 0;
  const isValidHostname = host.length <= MAX_HOSTNAME_LENGTH && hostnamePattern.test(host);

  if (!isValidIpAddress && !isValidHostname) {
    throw new Error(`HOST must be a valid IP address or hostname. Received: ${value}`);
  }

  return host;
}

function parsePositiveInteger(
  name: string,
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }

  return parsedValue;
}

export const env = Object.freeze({
  nodeEnv: parseNodeEnvironment(process.env['NODE_ENV']),
  host: parseHost(process.env['HOST']),
  port: parsePort(process.env['PORT']),
  cacheTtlSeconds: parsePositiveInteger(
    'CACHE_TTL_SECONDS',
    process.env['CACHE_TTL_SECONDS'],
    DEFAULT_CACHE_TTL_SECONDS,
  ),
  rateLimitMaxRequests: parsePositiveInteger(
    'RATE_LIMIT_MAX_REQUESTS',
    process.env['RATE_LIMIT_MAX_REQUESTS'],
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  ),
  rateLimitWindowSeconds: parsePositiveInteger(
    'RATE_LIMIT_WINDOW_SECONDS',
    process.env['RATE_LIMIT_WINDOW_SECONDS'],
    DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
  ),
});
