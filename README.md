# PagePulse

PagePulse is a production-oriented HTTP API that audits a public web page and returns its
HTTP status, redirect destination, response time, HTML metadata, and common discovery-file
availability. It includes in-memory caching, per-IP rate limiting, structured JSON logs,
automated tests, and continuous integration.

## Features

- Validates absolute HTTP and HTTPS URLs.
- Follows redirects and reports the final URL and upstream HTTP status.
- Measures the page-fetch response time.
- Extracts the page title, meta description, and canonical URL with Cheerio.
- Probes `/robots.txt` and `/sitemap.xml` with lightweight `HEAD` requests, falling back to
  ranged `GET` requests when the origin does not support `HEAD`.
- Caches successful audits by normalized URL with a configurable TTL.
- Coalesces concurrent audits for the same normalized URL to prevent duplicate outbound work.
- Applies a configurable fixed-window rate limit per client IP.
- Emits structured Pino logs with request IDs and redaction of sensitive fields.
- Supports graceful `SIGTERM` and `SIGINT` shutdown.
- Includes unit and integration tests that do not use the public internet.
- Runs lint, test, and build checks in GitHub Actions.

## Architecture

The application follows a route → middleware → controller → service structure:

- Routes define the public endpoints.
- Middleware handles request logging and audit rate limiting.
- The audit controller validates input, maps errors to the API contract, and coordinates
  audit-level logs.
- Services own fetching, caching, metadata extraction, resource probing, rate limiting, and
  structured logging.

See [docs/architecture.md](docs/architecture.md) for the detailed request flow and design.

## Tech stack

- Node.js 22 LTS
- Express 5
- TypeScript with strict compiler settings
- Cheerio for HTML metadata extraction
- Pino for structured JSON logging
- Vitest and Supertest for unit and integration testing
- ESLint and Prettier for static analysis and formatting
- GitHub Actions for continuous integration

## Folder structure

```text
.
├── .github/workflows/ci.yml
├── docs/
│   ├── architecture.md
│   └── task-b.md
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── integration/
│   └── unit/
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Installation

Prerequisites:

- Node.js compatible with the `engines.node` range in `package.json`
- npm

```bash
git clone <repository-url>
cd DigitalHeroes-SDE
npm install
cp .env.example .env
```

No external database or cache service is required.

## Environment variables

All variables are optional. Invalid configured values fail fast during application startup.

| Variable                    |       Default | Validation and purpose                                            |
| --------------------------- | ------------: | ----------------------------------------------------------------- |
| `PORT`                      |        `3000` | Integer from 1 through 65535. Render supplies this automatically. |
| `HOST`                      |     `0.0.0.0` | Valid IP address or DNS hostname used for server binding.         |
| `NODE_ENV`                  | `development` | One of `development`, `test`, or `production`.                    |
| `CACHE_TTL_SECONDS`         |         `300` | Positive integer controlling successful-audit cache lifetime.     |
| `RATE_LIMIT_MAX_REQUESTS`   |          `30` | Positive integer allowed per client window.                       |
| `RATE_LIMIT_WINDOW_SECONDS` |          `60` | Positive integer fixed-window duration.                           |

Use [.env.example](.env.example) as the local template. Do not commit a real `.env` file.

## Running locally

Development mode reloads when imported source files change:

```bash
npm run dev
```

Check readiness:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Running tests

```bash
npm test
```

Additional modes:

```bash
npm run test:watch
npm run test:coverage
```

External HTTP requests are mocked in the test suite; tests do not depend on internet access.

## Running lint and formatting

```bash
npm run lint
npm run format:check
```

To apply formatting:

```bash
npm run format
```

## Build and production startup

Compile TypeScript:

```bash
npm run build
```

Start the compiled application:

```bash
NODE_ENV=production npm start
```

The server reads `PORT` and `HOST` from the environment. It defaults to `0.0.0.0:3000` and
does not contain a runtime dependency on `localhost`. On `SIGTERM` or `SIGINT`, it stops
accepting new connections, allows active requests to finish, and enforces a 10-second upper
bound before closing remaining connections.

## Deployment on Render

Create a Render [Web Service](https://render.com/docs/web-services) connected to the repository
and use:

- Runtime: `Node`
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check path: `/health`
- Environment variable: `NODE_ENV=production`

Render supplies `PORT`; do not hardcode it. `HOST` can be omitted because PagePulse defaults
to `0.0.0.0`, which allows Render's proxy to reach the service. Render's
[Node version resolution](https://render.com/docs/node-version) reads the `.nvmrc` file, which
selects Node.js 22.

The build command explicitly includes development dependencies because TypeScript is required
at build time. Runtime dependencies remain available to `npm start`. Configure cache and
rate-limit values in the Render dashboard only when values different from the documented
defaults are needed.

Production mode trusts the first reverse-proxy hop so Express can use the forwarded client IP
for rate limiting and request logs on Render.

## API documentation

### `GET /health`

Returns `200 OK` when the process is accepting requests.

### `POST /audit`

Audits an absolute HTTP or HTTPS URL.

#### Request body

```json
{
  "url": "https://example.com"
}
```

`url` must be a non-empty string containing an absolute URL with the `http:` or `https:`
protocol. Leading and trailing whitespace is removed before processing.

#### Success response

HTTP `200 OK`:

```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "finalUrl": "https://example.com/",
    "status": 200,
    "responseTime": 123,
    "title": "Example Domain",
    "isHttps": true,
    "metaDescription": null,
    "canonicalUrl": null,
    "robotsTxtExists": false,
    "sitemapExists": false
  },
  "cacheHit": false,
  "cacheAgeSeconds": 0
}
```

Field notes:

| Field                  | Meaning                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `data.url`             | Validated URL supplied by the caller after whitespace trimming.                                  |
| `data.finalUrl`        | URL after following redirects.                                                                   |
| `data.status`          | HTTP status returned by the audited origin, not the PagePulse response status.                   |
| `data.responseTime`    | Time in milliseconds to fetch and consume the page response.                                     |
| `data.title`           | Normalized HTML title, or `null` when absent.                                                    |
| `data.isHttps`         | Whether the original URL uses HTTPS.                                                             |
| `data.metaDescription` | Normalized meta description, or `null` when absent.                                              |
| `data.canonicalUrl`    | Absolute HTTP(S) canonical URL, or `null` when absent or invalid.                                |
| `data.robotsTxtExists` | Whether the final origin exposes `/robots.txt`.                                                  |
| `data.sitemapExists`   | Whether the final origin exposes `/sitemap.xml`.                                                 |
| `cacheHit`             | `true` when no new audit fetch was needed for this request.                                      |
| `cacheAgeSeconds`      | Whole seconds since the cached result was created; `0` for a new or just-completed shared audit. |

An upstream non-2xx response is still a successful audit when the HTTP exchange completes.
Its status is returned in `data.status`.

#### Invalid URL

HTTP `400 Bad Request`:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "\"url\" must be a valid absolute HTTP or HTTPS URL."
  }
}
```

#### Rate limit exceeded

HTTP `429 Too Many Requests`, including a matching `Retry-After` response header:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many audit requests. Please try again later.",
    "retryAfterSeconds": 60
  }
}
```

#### Fetch failure

HTTP `502 Bad Gateway`:

```json
{
  "success": false,
  "error": {
    "code": "FETCH_FAILED",
    "message": "Failed to fetch the requested URL."
  }
}
```

Failures from DNS resolution, connection establishment, redirects, or response consumption are
mapped to this response. Failed audits are not cached.

## Sample requests

Audit a page:

```bash
curl --request POST http://localhost:3000/audit \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://example.com"}'
```

Send an invalid URL:

```bash
curl --request POST http://localhost:3000/audit \
  --header 'Content-Type: application/json' \
  --data '{"url":"not-a-url"}'
```

Inspect response headers, including `Retry-After`:

```bash
curl --include --request POST http://localhost:3000/audit \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://example.com"}'
```

## Rate limiting

`POST /audit` uses an in-memory fixed window keyed by Express's resolved client IP. The default
allows 30 requests in 60 seconds. Each IP is isolated, rejected requests return the remaining
window time, and expired windows are cleaned automatically.

The limiter is process-local. Multiple service instances do not share counters; a distributed
store is a future scaling requirement.

## Caching

Only successful audits are cached. The key is the normalized URL: URL parsing normalizes the
scheme and host, removes default ports and fragments, and preserves the path and query string.
The default TTL is five minutes.

The first request performs the audit. Concurrent requests for the same key await that work and
report `cacheHit: true`; later requests read the stored result and report its age. Validation
errors and fetch failures are never cached. Entries are process-local, removed after expiration,
and lost during restarts or deployments.

## Logging

Pino emits one-line JSON logs to standard output. Every request log contains:

- Request ID
- HTTP method and route
- Client IP
- Response status
- Response time
- Whether the connection was aborted

Audit logs additionally contain the normalized URL, cache status, audit duration, and success
state. Error logs serialize stack traces. Full HTML, authorization headers, cookies, request
bodies, and known sensitive fields are redacted or never logged. Startup and shutdown lifecycle
events are also structured.

## CI/CD

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and pull request. It:

1. Checks out the repository with read-only permissions.
2. Configures Node from `.nvmrc`.
3. Installs the lockfile exactly with `npm ci`.
4. Runs `npm run lint`.
5. Runs `npm test`.
6. Runs `npm run build`.

The job stops on the first failed command. Deployment is intentionally not automated by this
repository.

## Future improvements

- Block private, loopback, link-local, and cloud-metadata destinations to mitigate SSRF and DNS
  rebinding before exposing the service to untrusted users.
- Add outbound request deadlines, response-size limits, and global/per-origin concurrency limits.
- Move cache entries and rate-limit counters to Redis for multi-instance consistency.
- Add metrics, tracing, readiness detail, and alerting.
- Add an OpenAPI document and generated contract tests.
- Add authentication or API keys if the service becomes non-public or quota-backed.

## Submission notes

See [docs/task-b.md](docs/task-b.md) for architecture decisions, trade-offs, failure handling,
scalability, and security considerations.
