# Task B: engineering rationale

## Architecture decisions

PagePulse uses a deliberately small layered architecture:

```text
route -> middleware -> controller -> service
```

Routes express the HTTP surface. Middleware owns cross-cutting request concerns. The controller
owns input validation and transport-level response mapping. Services contain reusable domain
and infrastructure behavior. This keeps Express types out of cache, rate-limit, parsing, and
fetch orchestration code, making those units independently testable.

Application construction is separate from socket startup. Tests import the Express application
without starting a listener, while the server entry point remains responsible for operating
system signals and process lifecycle. Configuration is parsed once and frozen, producing
predictable behavior and failing fast on invalid deployment values.

No dependency-injection framework was introduced. Module-level services are sufficient for a
single-process assignment and avoid adding abstraction without a current consumer.

## Caching strategy

Successful audit results are cached under the normalized input URL for a configurable TTL. URL
normalization removes fragments because fragments are not sent in HTTP requests, while retaining
query-string identity because query values and ordering can affect the origin response.

The cache stores timestamps alongside results:

- `createdAt` supports `cacheAgeSeconds`.
- `expiresAt` supports constant-time freshness checks.
- Lazy deletion prevents stale reads.
- Periodic cleanup bounds retained expired state.
- The cleanup timer is unreferenced so it cannot prevent shutdown.

An in-flight promise map deduplicates concurrent audits for the same key. Without it, several
requests arriving before the first fetch completed would all miss and create a cache stampede.
The first request performs the work; followers await and reuse it. Rejected promises are removed
in a `finally` block and failures are not cached.

The main trade-off is process locality. The design is fast and operationally simple, but cache
contents disappear on restart and are not shared between replicas.

## Rate-limiting strategy

The rate limiter uses a fixed window per resolved client IP. A client window stores a count and
expiration. This provides constant-time decisions and an exact retry time with minimal memory
and no dependency on external infrastructure.

The limiter runs before validation and caching. Malformed requests and cache hits still consume
quota because both can be used to generate application load. Exceeded requests receive both a
standard `Retry-After` header and a structured JSON value.

In production, one reverse-proxy hop is trusted so Express resolves the address forwarded by
Render. The main trade-offs are fixed-window boundary bursts and per-process counters. A
multi-instance deployment requires an atomic shared counter, normally Redis with a sliding-window
or token-bucket algorithm.

## Logging approach

Pino was selected for low-overhead structured JSON output. Logs are event-oriented instead of
free-form:

- `http_request` describes the transport result.
- `audit` describes domain execution.
- Lifecycle events describe startup and shutdown.

Every request receives a UUID. A `WeakMap` associates it with the request without mutating
Express types or retaining completed requests. Response `finish` and `close` events capture both
normal completion and client aborts.

Audit logs include a normalized URL, but credentials are removed and query values are replaced
with redaction markers. Full HTML and request or response bodies are not logged. Pino error
serialization preserves stack traces for diagnosis without changing client-facing errors.

The request ID is currently an internal correlation value rather than part of the API response.
Propagating an accepted external trace header and returning a response ID would be a compatible
future observability enhancement.

## Testing strategy

The suite favors behavior at stable boundaries:

- URL tests establish cache-key and log-redaction semantics.
- Cache tests use fake time for age, expiration, replacement, and configuration validation.
- Rate-limit tests use fake time for isolation, retry calculation, and window reset.
- Metadata tests cover normalization, missing fields, and unsafe canonical schemes.
- Integration tests exercise the real middleware, routing, controller, and service composition.

Outbound HTTP is replaced with deterministic `fetch` mocks. This keeps CI fast, prevents flaky
dependencies on public websites, and makes exact request counts testable. The concurrent audit
test is a regression guard against cache stampedes.

Coverage is used as diagnostic feedback rather than a target that encourages low-value tests.
The production server entry point is excluded because its primary behavior is process signal and
socket lifecycle, which is verified with a production smoke test.

## Failure handling

Failure behavior is intentionally narrow and stable:

- Syntactically invalid input returns `400 INVALID_URL`.
- A completed upstream HTTP response, including non-2xx status, is returned as audit data.
- Page-fetch or response-consumption failures return `502 FETCH_FAILED`.
- Discovery-file probe failures degrade to `false` instead of failing the audit.
- Rate-limit exhaustion returns `429 RATE_LIMIT_EXCEEDED` with retry guidance.
- Invalid environment configuration fails at process startup.
- Server listen failures and forced shutdowns produce structured error logs and a non-zero exit
  status.

Clients receive concise, non-sensitive messages. Internal errors retain stack traces in logs.
Failed audits are neither cached nor left in the in-flight registry.

## Trade-offs

### Synchronous audit response

The synchronous API is simple for clients and appropriate for small pages, but one request owns
an outbound operation until completion. A queued asynchronous job model would be better for
large audits or deeper crawling.

### In-memory state

Maps minimize latency and setup for one instance. They do not provide cross-replica consistency,
durability, centralized invalidation, or globally enforced quotas.

### Metadata parsing

Cheerio provides deterministic server-side HTML parsing without executing JavaScript. Metadata
rendered only by client-side JavaScript is therefore absent, which is appropriate for an HTTP
audit but differs from browser rendering.

### Resource probing

`HEAD` minimizes transfer volume, with a ranged `GET` fallback for incompatible servers. Some
origins handle these methods differently from a normal `GET`, so results are best-effort.

### Error abstraction

All fetch failures share one public code. This avoids leaking network details and keeps the
contract stable, but provides less client-side diagnostic specificity.

## Future scalability

A larger deployment should introduce:

1. Redis-backed cache entries and rate-limit counters with atomic expiry.
2. Global and per-origin concurrency control to prevent outbound saturation.
3. Explicit outbound deadlines, retry policy, maximum redirect count, and response-size limits.
4. Background jobs for slow or multi-page audits.
5. Metrics for latency, cache hit ratio, origin status, limiter decisions, and error classes.
6. Distributed tracing and propagation of a trusted correlation header.
7. Capacity-based autoscaling and load testing against representative origins.

Cached response versioning should accompany future schema changes so old entries cannot violate
new contracts during rolling deployments.

## Security considerations

The service avoids logging raw bodies, HTML, credentials, cookies, and query values. It disables
the Express technology header, validates protocols, rate-limits expensive requests, uses
least-privilege CI permissions, and binds through environment configuration.

The most important hardening item before exposing unrestricted audits to untrusted internet
users is SSRF defense. Syntactic HTTP(S) validation alone does not block:

- Loopback or private network addresses.
- Link-local and cloud instance metadata endpoints.
- DNS rebinding between validation and connection.
- Redirects from a public host to a private destination.
- Excessive response bodies or intentionally slow origins.

A production hardening phase should resolve and classify every destination and redirect,
reject non-public address ranges for both IPv4 and IPv6, pin or revalidate connections, cap
redirects and response bytes, and enforce an outbound deadline. Egress firewall policy should
provide a second layer of defense.

If API consumers are not anonymous, authentication and per-principal quotas should augment IP
rate limiting. Distributed deployments must use shared limiter state. Dependency scanning,
secret scanning, branch protection, and reviewed lockfile updates should complement the current
CI checks.
