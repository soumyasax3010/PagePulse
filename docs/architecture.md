# PagePulse architecture

## System context

PagePulse is a stateless HTTP service from the caller's perspective. It accepts a URL, performs
an outbound page audit, and returns a synchronous JSON result. Cache and rate-limit state are
held in process memory and require no external infrastructure.

## Request flow

```text
                               +----------------------+
                               | Structured JSON logs |
                               | Pino + request ID    |
                               +----------^-----------+
                                          |
+--------+     +---------------------------+--------------------------+
| Client | --> | Express application                                 |
+--------+     | request logging -> JSON parsing -> route selection  |
               +-------------------+------------------+---------------+
                                   |                  |
                              GET /health        POST /audit
                                   |                  |
                             200 {status: ok}          v
                                              +-------+--------+
                                              | IP rate limit |
                                              +-------+--------+
                                                      |
                                                      v
                                              +-------+--------+
                                              | Controller     |
                                              | URL validation |
                                              +-------+--------+
                                                      |
                                                      v
             +-------------------+            +-------+--------+
             | In-memory cache   | <--------> | Audit service  |
             | + in-flight work  |            +-------+--------+
             +-------------------+                    |
                                              cache miss only
                                                      |
                           +--------------------------+------------------+
                           |                                             |
                           v                                             v
                 +---------+----------+                       +----------+---------+
                 | Fetch page         |                       | Probe final origin  |
                 | follow redirects   |                       | robots + sitemap    |
                 +---------+----------+                       | HEAD / ranged GET   |
                           |                                  +--------------------+
                           v
                 +---------+----------+
                 | Cheerio metadata   |
                 | title/description/ |
                 | canonical          |
                 +---------+----------+
                           |
                           +--------------------------+
                                                      v
                                              JSON response + logs
```

## Application boundaries

`src/app.ts` constructs the Express application without opening a socket. This separation makes
the complete HTTP stack testable through Supertest. `src/server.ts` owns process concerns:
configuration-driven binding, lifecycle logs, signal handling, and graceful connection draining.

In production, Express trusts one reverse-proxy hop so `request.ip` resolves the client address
forwarded by Render. Development and test environments retain Express's direct-connection
default.

## Validation

The controller accepts a JSON object with a `url` property. It requires:

- A string after trimming.
- An absolute URL accepted by the platform URL parser.
- The `http:` or `https:` protocol.
- A non-empty hostname.

Invalid input returns the stable `INVALID_URL` contract before any outbound request or cache
write occurs. URL normalization removes fragments and relies on the URL implementation to
normalize scheme, host, default ports, and serialization.

This validation is syntactic. Network-destination policy, including private-address and
cloud-metadata blocking, remains a documented security improvement.

## Audit service

The audit service orchestrates the outbound work:

1. Normalize the original URL for cache identity.
2. Return a fresh cache entry when one exists.
3. Reuse an identical audit already in progress.
4. Fetch the page while following redirects.
5. Start final-origin discovery-file probes.
6. Consume the HTML and record elapsed page-fetch time.
7. Extract metadata with Cheerio.
8. Cache and return the completed result.

The reported `status` belongs to the audited origin. A completed upstream `403`, for example,
is audit data rather than a PagePulse error. Network and response-consumption failures map to
`502 FETCH_FAILED`.

Resource probes target `/robots.txt` and `/sitemap.xml` on the final origin. They use `HEAD`
first and use a ranged `GET` only for servers returning `405` or `501`. Probe failures are
represented as `false` and do not fail the page audit.

## Caching

The cache is an isolated generic service backed by a `Map`. Entries record their creation and
expiration timestamps. Lookup performs lazy expiration, while an unreferenced interval removes
expired entries automatically without keeping the Node.js process alive.

Successful results use the normalized URL as the key. Failures never enter the cache. An
in-flight promise map closes the cache-stampede window: one request owns the fetch and later
requests for the same key await its result. The owner reports a miss; waiters report a hit with
age zero; subsequent reads report the elapsed whole-second age.

This is intentionally a single-process cache. Restarting or horizontally scaling creates
independent cache populations.

## Rate limiting

The audit route applies a fixed-window limiter before controller validation and cache lookup.
Each client IP receives:

- A request counter.
- A fixed expiration timestamp.
- The configured maximum request count.

Requests beyond the limit return `429 RATE_LIMIT_EXCEEDED`, a JSON `retryAfterSeconds`, and a
matching HTTP `Retry-After` header. Expired client windows are reset on access and cleaned by an
unreferenced interval.

Rate limiting intentionally does not bypass cache hits: every audit request consumes capacity,
protecting both compute and the public endpoint. Counters are local to one process.

## Logging

Request-logging middleware creates a UUID before route processing and stores it in a `WeakMap`
keyed by the Express request. Completion and aborted-connection listeners ensure a request is
logged once with method, route, client IP, status, and duration.

The controller emits a second audit-specific event containing a query-redacted normalized URL,
cache status, audit duration, and success state. Pino serializes exceptions, including stack
traces. Redaction rules cover credentials, authorization, cookies, bodies, and HTML. Lifecycle
events cover startup, shutdown initiation, clean termination, and failures.

Logs go to standard output for collection by Render or another platform.

## Graceful lifecycle

Configuration is parsed during startup, so malformed values fail before the server begins
accepting traffic. The server listens on the configured `HOST` and `PORT`.

On the first `SIGTERM` or `SIGINT`, PagePulse:

1. Records a structured shutdown event.
2. Stops accepting new connections.
3. Allows active HTTP requests to complete.
4. Logs a clean stop when draining succeeds.
5. Closes remaining connections and marks the process unsuccessful if draining exceeds 10
   seconds.

This aligns with Render's
[`SIGTERM` deployment lifecycle](https://render.com/docs/deploys#graceful-shutdown) and stays
within its default shutdown window.

## Testing

Vitest provides deterministic unit tests for URL normalization, cache expiration, fixed-window
rate limiting, and HTML metadata extraction. Supertest exercises the Express stack for:

- Successful audits.
- Concurrent cache reuse.
- Invalid URL responses.
- Rate-limit rejection.
- Fetch failures.

Global `fetch` is mocked, so the suite has no public-network dependency. Fake clocks cover
time-sensitive cache and rate-limit behavior.

## CI pipeline

```text
Push or pull request
        |
        v
Checkout -> Node setup -> npm ci -> lint -> test -> build
                                              |
                                   any failure stops CI
```

The workflow uses read-only repository permissions, exact action release tags, npm's lockfile,
a bounded job timeout, and cancellation of superseded runs. Deployment is intentionally outside
the CI workflow.

## Scaling boundary

Application instances are otherwise stateless, but cache and rate-limit state are per process.
Horizontal scaling therefore requires a shared atomic store for consistent cache and quota
behavior. Redis is the expected next step, paired with explicit outbound concurrency controls
and distributed observability.
