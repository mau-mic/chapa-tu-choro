# API rate limiting

The ASP.NET Core built-in rate limiter protects every mapped endpoint: statistics, explorer, trends, metadata/categories, health/readiness, development catalog status and development OpenAPI. Unmatched requests also have a shared bucket. CORS preflight is processed before limiting; actual API requests are limited, including validation failures.

No extra package, external store or cloud resource is required. Centralized exception handling, Serilog and ProblemDetails remain active. Middleware order is exception/status handling, structured request logging, trusted forwarded headers, routing, explicit frontend CORS in every environment, then rate limiting and endpoint execution.

## Defaults

All fixed windows default to 60 seconds, with no waiting queue:

| Scope | Permit limit |
| --- | ---: |
| All requests to one process/instance | 600 per window |
| All endpoints combined for one client IP | 120 per window |
| One endpoint for one client IP | 60 per window |
| Trends endpoint for one client IP | 20 per window |
| Requests concurrently executing in one instance | 4 |

Every request must acquire all four applicable limits. The global instance limit bounds incoming load; the concurrency limit bounds simultaneous database/dependency work. Earlier counters can be consumed when a later limit rejects. Health and readiness also count, so monitoring must honor 429 responses and the configured budgets.

Partitions use the normalized connection IP and the **matched route template**, never a category, query string or arbitrary path. Changing filters cannot reset an endpoint bucket. Unknown paths use a single shared template. Anonymous visitors sharing one public IP share client limits.

Configure the `RateLimiting` section in API appsettings or environment variables:

```text
RateLimiting__WindowSeconds=60
RateLimiting__InstancePermitLimit=600
RateLimiting__ClientPermitLimit=120
RateLimiting__EndpointPermitLimit=60
RateLimiting__TrendsPermitLimit=20
RateLimiting__ConcurrentRequests=4
```

Limits must be positive, and the window 1–3600 seconds. Options are validated on startup. Changes require restarting the application. Avoid raising concurrency beyond the database connection and workload budget without measurement.

## Rejected requests

A rejected request returns HTTP **429**, `application/problem+json`, title `api.rate_limited`, a safe explanation and `traceId`. `Retry-After` contains seconds: the limiter's estimate when available, or one second for a concurrency rejection. This is advisory, not a reservation. Serilog records endpoint and delay, without logging client IPs or query/filter values in the rejection event.

The explicit frontend CORS policy exposes `Retry-After` to configured allowed origins, including on rejected responses. Production defaults to no cross-origin exceptions; same-origin `/api` access requires none. Development permits the two documented local frontend origins. The frontend shows a readable delay and manual retry instead of issuing automatic repeated requests.

## Proxies and Lambda

Compose places nginx at `CTC_WEB_ADDRESS` (default `172.29.84.10`) on the dedicated `CTC_PROXY_SUBNET` (default `172.29.84.0/24`) and configures that exact address as the API's trusted peer. nginx overwrites `X-Forwarded-For` with its observed client address, so a visitor cannot supply a different rate-limit identity through that header. Override both Compose network settings together if the subnet conflicts locally. Native hosting and other ingress topologies require their own reviewed trusted-proxy configuration.


The application does **not** trust arbitrary `X-Forwarded-For`. Forwarded IP processing is disabled unless `ReverseProxy:KnownProxies` explicitly lists the immediate trusted peer IPs; processing then accepts at most one forwarded hop from those peers. Example configuration for a controlled proxy with a fixed private IP:

```json
{ "ReverseProxy": { "KnownProxies": ["10.0.0.10"] } }
```

Equivalent environment variable: `ReverseProxy__KnownProxies__0=10.0.0.10`. This example IP is configuration guidance, not a deployed resource. Do not use visitor-supplied addresses or enable trust for the whole internet. Docker's nginx address can change; do not assume a fixed address without configuring that network deliberately. With no explicit proxy trust, all visitors through a proxy may share its IP budget. The shipped Compose setup uses that conservative behavior. Verify the effective connection IP at the actual ingress before adjusting limits or proxy trust.

**Counters are in memory per application instance**, including each warm Lambda execution environment. Cold starts/reset and scale-out create independent counters. This implementation limits requests inside each instance; it does not enforce a single quota across Lambda or multiple replicas and is not a complete DDoS/cost control. A deployment needing a shared quota must enforce it at a trusted common ingress (for example an API gateway/edge limiter), with the application limiter retained as defense in depth. No gateway, WAF, Redis, AWS resource or production configuration was provisioned or changed by this feature.

Reference: [ASP.NET Core 10 rate limiting middleware](https://learn.microsoft.com/aspnet/core/performance/rate-limit?view=aspnetcore-10.0).

Concentration and metric-radius queries (`/api/concentration`, `/api/concentration/cells`, `/api/concentration/radius`, `/api/concentration/trends`) use the existing stricter `TrendsPermitLimit` budget (20/minute by default), with the same global, client and concurrency limits. `/api/concentration/metadata` uses the ordinary endpoint budget. These routes are covered by rate-limit/ProblemDetails/CORS tests.

Population comparison/history and rate explorer (`/api/population/comparison`, `/api/population/history`, `/api/explorer/rates`) all use the stricter analytics policy, in addition to global/client/concurrency protection. Invalid requests consume their endpoint budget too. Tests exercise 200 then 429 for both new routes.

`/api/population/insights` uses the same analytics limit as population history and trends. Local smoothing/reference switches do not issue HTTP requests; year/month/category/geography changes do. The endpoint returns 429 ProblemDetails with Retry-After under the existing policy.
