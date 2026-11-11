# Browser access, CORS and backend entry points

The supported public entry point serves the frontend and `/api` on the same origin: nginx in Compose, Vite during native development, and CloudFront in the existing Terraform design. Keep the frontend's public build-time `VITE_API_BASE_URL` empty.

## Clarified requirement

The requested CORS protection concerns pages on other websites reading this site's API from a browser. The existing exact-origin policy already implements that boundary; it is not a promise that external servers or arbitrary HTTP clients cannot call public read endpoints. No authentication or frontend secret was added. A separate real-browser regression now verifies denied cross-origin reads and permitted same-origin reads; see [browser test commands](browser-tests.md).

## What is protected

- The API container no longer publishes a host port. Compose clients reach it through `http://localhost:5173/api/...`; `localhost:5080` is no longer a Compose API endpoint. Other trusted containers on the network can still reach `api:8080`. `expose` documents that internal port and is not a firewall. Docker-host administrators retain control over its network.
- Every API endpoint uses the same explicit CORS policy. A browser page from an unlisted origin receives no permission to read API responses. Allowed origins receive only read-method/header permissions, no credential grants, and access to Retry-After.
- Rate limiting remains active for actual API requests; allowed-origin 429 and sanitized 500 ProblemDetails remain readable by the intended frontend. CORS preflights are handled before the limiter as before.
- Existing Terraform source declares `AWS_IAM` for the Lambda Function URL, CloudFront OAC SigV4 signing and permissions scoped to the distribution ARN. No change to that source was needed. This describes the repository's intended configuration, **not a verified live deployment**. No Terraform plan/apply or production mutation was performed.

## What CORS cannot guarantee

CORS is enforced by browsers; it is not authentication or a way to recognize trusted React code. The server can execute a simple request from another origin but omit browser read permission. A missing Origin header is normal for many same-origin GET requests, diagnostics and server-to-server clients, so these requests remain supported. curl can read the public endpoint and can forge Origin or Referer. A visitor can also call `/api` on the public site directly. The existing rate limits apply to these calls.

It is not possible to prove that an anonymous request originated exclusively in a public frontend. Genuine identity-based authorization would require a separate authentication design; it is not part of this public statistics feature. Do not add a supposed secret to Vite variables, JavaScript, or a public request header. Restricting direct backend origin access and allowing public API traffic through the site are different controls.

Reference: [ASP.NET Core 10 CORS documentation](https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0).

## Configuration

Production `appsettings.json`:

```json
{ "Cors": { "AllowedOrigins": [] } }
```

An empty list grants no cross-origin browser permissions. The normal same-origin frontend still works and does not require an exception for its domain.

Development `appsettings.Development.json` explicitly includes:

```json
{ "Cors": { "AllowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"] } }
```

For an intentionally separate production frontend/API domain, configure only the exact trusted frontend origins, for example:

```text
Cors__AllowedOrigins__0=https://frontend.example.test
```

Replace that example with the real origin and restart the API. Each additional origin uses the next numeric index. Scheme, hostname and port matter; a subdomain, different port or HTTP origin is a different origin. Options fail startup validation for wildcards, opaque `null` origins, paths/trailing slashes, credentials, queries/fragments and HTTP outside Development. Development HTTP exceptions must be loopback origins. Empty/malformed configured array elements fail validation; use an empty array to permit no origins.

Allowed cross-origin methods: GET/HEAD. Allowed request headers: Accept/Content-Type. Exposed response header: Retry-After. No cookies/credential grant. Allowed preflights can be cached for ten minutes. This does not authorize unsupported HTTP methods; endpoint routing still defines what each endpoint executes.

## Local usage after this change

```bash
docker compose --profile app up --build -d
curl -i http://localhost:5173/api/health
curl -i http://localhost:5173/api/ready
```

Rebuilding recreates the API service with its port mapping removed. Preserve the existing database volume. Compose automatically runs pending versioned migrations before starting the API; this CORS/entry-point configuration requires no data reimport or cloud provisioning.

For hot reload, run the Compose migration service, then the .NET launch profile and Vite as in [local operations](operations.md#native-hot-reload). That explicitly started native API remains on localhost:5080; it is independent of the private Compose API container. Keeping the API privately hosted in a real deployment remains an ingress/network responsibility.

Automated tests cover exact/wrong origins, ports and schemes, opaque origins, allowlisted and denied preflights, methods and headers, invalid startup settings, same-origin/no-Origin access, safe 500 responses and existing rate-limit headers.
