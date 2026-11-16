# AWS prelaunch review — 2026-11-13

**Recommendation:** retain the existing serverless architecture for the MVP. It avoids an always-on application bill and does not require new services. With few visitors, plan for roughly **USD 0–2/month in AWS**, subject to the assumptions below. The USD 100 credits are temporary bill coverage, not recurring free capacity. Supabase billing is separate.

**Release status:** Terraform validates locally, but the application is not yet verified for production. The response-size blocker below was corrected locally on 2026-11-14; artifact, headers, alerts and target-environment checks remain. No AWS plan/apply, production migration or Git-history change was performed in this review.

## Architecture assessed

Browser → CloudFront → private S3 frontend / private Lambda Function URL → Supabase PostgreSQL/PostGIS. A separate Python Lambda imports official data; EventBridge scheduling and Firehose log archival are disabled by default.

| Choice | Assessment |
| --- | --- |
| S3 + CloudFront | Appropriate static hosting; default HTTPS hostname works without buying a domain |
| .NET 10 Lambda, 512 MB, reserved concurrency 3 | Appropriate low-traffic starting point; measure cold/warm latency before tuning |
| Python Lambda, 1,536 MB, 15-minute timeout | Suitable only if a complete target import fits the timeout and scratch storage; package/import validation remains necessary |
| Supabase outside AWS | Retain existing PostGIS provider; avoid paying for another database. Use TLS, small pools and separate database roles |
| No VPC, NAT gateway, ALB, ECS or API Gateway | Appropriate for this public-read MVP; no demonstrated need for their added baseline cost/operations |
| Seven-day CloudWatch retention; optional Firehose off | Keep these defaults initially; add basic error/cost notifications before unattended operation |

CloudFront OAC signs requests to both private origins. The Lambda URL uses `AWS_IAM`, and invocation permissions are scoped to the distribution. This protects direct origin access; it does not stop clients from calling the public CloudFront API. CORS is not authentication. See [AWS Lambda origin access](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html).

The distribution uses pay-as-you-go pricing and `PriceClass_100`. This limits eligible edge locations and can trade latency for cost for Peruvian visitors. Measure it before expanding the price class; do not assume the lowest-latency South American edge is included. See [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/).

## Findings before publication

| Priority | Finding and required action |
| --- | --- |
| Corrected locally 2026-11-14 | The earlier unscoped `/api/map` returned **36,694,177 bytes**, above Lambda's 6 MB buffered limit. It now requires a department and simplifies display geometry without modifying counts/storage. Across 25 departments, 196 provinces and 25 representative districts, the largest scoped map was **609,614 bytes**; the largest explorer/rate-map response was **1,468,689 bytes**. Unscoped calls return 400. See [contract/evidence](nationwide-map.md#scoped-district-geojson). Actual Lambda-envelope testing and remeasurement after data changes remain necessary. |
| Release prerequisite | Build and smoke-test `dist/api.zip` with the real .NET Lambda adapter. CI packages Python but does not currently package the API Lambda artifact. The packaging script globally installs an unpinned Amazon.Lambda.Tools if missing; pin/isolate that build dependency for reproducible releases. |
| Release prerequisite | Configure CloudFront response security headers and API `X-Robots-Tag: noindex`. Terraform currently declares no response headers policy. The local nginx API noindex header does not automatically exist on AWS. Validate a CSP against MapLibre workers, tiles and station requests before enabling it. |
| Release prerequisite | Choose protected Terraform state storage/locking, review actual IAM/account quotas, and supply production SSM paths. A successful local validate is not an account-aware plan or permission test. |
| Release prerequisite | Verify target database size, role grants/RLS, TLS, pooler, egress, backups and latency. Local Compose runs as an owner and does not prove least-privilege production access. API reserved concurrency limits active calls, not a strict global count of idle database connections. |
| Release prerequisite | Validate one target ETL run before enabling scheduling. Test failure/retry/idempotence within Lambda's 15 minutes and 1 GB scratch allocation. The default schedule refreshes statistics, not every concentration archive/population workbook. |
| Release prerequisite | Establish API-error, ingestion-failure and cost notifications. Logs exist; alerts/DLQ are not declared. Budget alerts notify, they do not cap spend. Start with small USD 1/5 thresholds and review billing after release. |
| Public-data decision | Source access does not establish reuse permission. Review catalogue usage states and ADR 0002 before exposing datasets; restrict public scope where necessary. |
| Later tuning | Set a raw-archive retention policy, measure query/egress cost, review origin caching and distributed rate-limit needs if traffic grows. Do not introduce paid infrastructure for hypothetical scale. |

AWS documents the [buffered response/package/time limits](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html), [supported .NET runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) and [CloudFront response headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html). Function-URL throttling and application rate limits complement each other; existing application limiters are per warm environment, not one distributed account-wide counter.

## Monthly cost model

Planning assumptions: one `us-east-1` environment, no provisioned concurrency, scheduler weekly, Firehose off, no custom domain or paid security service. These are estimates, not measured production usage. A visit can trigger many API/database requests.

| Monthly input | Few initial visits | Modest growth |
| --- | ---: | ---: |
| Visits / API requests | 1,000 / 10,000 | 10,000 / 100,000 |
| API average duration / memory | 1 second / 512 MB | 1 second / 512 MB |
| Weekly ETL | 4.35 × 300 seconds at 1,536 MB | Same |
| Average S3 storage / PUT / GET | 2 GB / 1,000 / 10,000 | 5 GB / 1,000 / 50,000 |
| Logs ingested | 0.5 GB | 2 GB |
| CloudFront delivery / requests | 10 GB / 100,000 | 50 GB / 1 million |

At published x86 Lambda rates, API compute plus requests is about **USD 0.085 / 0.853** for these scenarios *before* Lambda allowances. Weekly ETL compute adds about **USD 0.033**. S3 Standard storage/requests add about **USD 0.055 / 0.140**; CloudWatch ingestion plus seven-day stored volume is about **USD 0.254 / 1.014**, before its allowances. Extra Lambda scratch usage at this scale is below one cent. These small components total approximately **USD 0.43 / 2.04**, excluding CloudFront charges and before component allowances/credits.

CloudFront's documented pay-as-you-go monthly allowance is 1 TB transfer and 10 million HTTP/HTTPS requests; both scenarios are below it **if available to this account**. Lambda's published allowance is 1 million requests and 400,000 GB-seconds. Standard SSM parameters/throughput and the weekly Scheduler usage also fit their documented no-additional-charge allowances. Free usage can be shared with other account workloads and account-plan terms must be checked. This template does not enroll in CloudFront's separate flat-rate plans.

Allow planning envelopes of **USD 0–2/month initially** and **USD 0–5/month at modest growth**, rather than treating calculated fractions as a guaranteed bill. More traffic, long-running queries, repeated failed imports, archive growth, log queries, external tiles, database egress, taxes and other account workloads can change the result. Check credit expiry; do not estimate how many months USD 100 will last from these scenarios alone.

Rate references: [Lambda](https://aws.amazon.com/lambda/pricing/), [S3](https://aws.amazon.com/s3/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [CloudFront allowances](https://aws.amazon.com/cloudfront/faqs/), [SSM](https://aws.amazon.com/systems-manager/pricing/) and [Scheduler](https://aws.amazon.com/eventbridge/pricing/).

## Database is the tighter free-plan constraint

The local database measured **356 MB**: concentration locations 163 MB, monthly reports 71 MB, concentration cells 41 MB, district boundaries 29 MB, concentration areas 14 MB, plus other tables/indexes. Hosted measurements and system overhead may differ.

Supabase Free advertises 500 MB database space, 5 GB egress and pausing after one week of inactivity. The current local dataset may fit initially, but headroom is limited; retaining more data/versions increases it. API response compression does not eliminate database-to-Lambda traffic. Measure the target's storage and query egress, especially map geometry. Supabase Pro starts at USD 25/month and is not paid by AWS credits. See [Supabase pricing](https://supabase.com/pricing).

Production decision updated 2026-11-16: the API uses Supabase Session pooler on port 5432 following the timeout investigation; Python ingestion retains transaction pooler on port 6543. Migration sessions need a suitable direct/session connection. Monitor session backend capacity as API concurrency grows. The API disables auto-prepare and Python disables server-side preparation already. See [connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Evidence and limits

Executed: Terraform format check; `terraform validate` with zero errors/warnings using the cached AWS provider; static Terraform policy gate (`POLICY_OK`); read-only local database-size and API-payload measurements. These validate syntax/configuration and identify local runtime limits, not actual account permissions or cloud behavior.

See [machine-readable evidence](evidence/prelaunch-review-2026-11-13.json). Application tests were not rerun for these documentation-only edits; their dated results remain in [testing evidence](testing.md#ci-and-evidence). Next use the [deployment procedure](deployment.md), after fixing the blocker and separately authorizing release actions.
