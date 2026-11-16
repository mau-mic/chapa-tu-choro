# GitHub → HCP Terraform Cloud → AWS

The `deploy` job in `.github/workflows/ci.yml` runs only after all three CI jobs
succeed on a push to `main` with repository variable `ENABLE_AUTO_DEPLOY=true`.
Manual dispatch on `main` performs a plan-only review instead. GitHub builds both Lambda ZIPs and the production
frontend. `scripts/deploy-hcp.sh` sends an allowlisted archive to HCP, requests a
remote apply and waits for success. Terraform runs on HCP, never on a developer's
machine. GitHub then uploads static files, refreshes CloudFront and checks health.
No migrations or data imports run as part of deployment.

## One-time setup before merging

1. In HCP create/select the production workspace (organization `mm-dev` if that
   is the organization you created). Use CLI/API-driven workflow, **Cloud/remote**
   execution and **Terraform Working Directory: `infra/terraform`**. The archive
   preserves the repository-relative paths needed by Lambda and the router.
   Do not connect VCS auto-runs: GitHub must finish testing/building first.
2. Set the following **Terraform variables** in the HCP workspace:

   | Variable | Value |
   | --- | --- |
   | `environment` | `prod` |
   | `aws_region` | `us-east-1` |
   | `database_ssm_parameter_name` | `/chapa-tu-choro/prod/database-url` |
   | `ingestion_database_ssm_parameter_name` | `/chapa-tu-choro/prod/ingestion-database-url` |
   | `enable_ingestion_schedule` | `false` (HCL boolean) |

   Set `sidpol_source_url` only to the reviewed government release URL before
   enabling scheduled ingestion. Keep credentials in SSM, not Terraform variables.
3. Configure [HCP dynamic AWS credentials](https://developer.hashicorp.com/terraform/cloud-docs/dynamic-provider-credentials/aws-configuration):
   create the AWS OIDC provider for HCP and a deployment role with trust restricted
   to the exact organization/project/workspace and plan/apply run phases. Set HCP
   **environment variables** `TFC_AWS_PROVIDER_AUTH=true` and
   `TFC_AWS_RUN_ROLE_ARN` to that role ARN. Scope deployment permissions to the
   resources in this Terraform configuration; scope `iam:PassRole` to its runtime
   roles. This initial identity setup must exist before the first remote run.
   Do not store long-lived AWS keys in HCP or GitHub.
4. Create a GitHub **environment** named `production`, restrict deployments to
   `main`, and protect `main` with required CI checks. While enabling the first
   release, use a required reviewer if supported by your GitHub plan. For enabled push deployments, approval of
   this job authorizes its remote auto-apply; the script does not pause at plan.
5. Add these GitHub environment variables:

   | Name | Purpose |
   | --- | --- |
   | `HCP_ORGANIZATION` | Exact organization name |
   | `HCP_WORKSPACE` | Exact workspace name, e.g. `chapa-tu-choro-prod` |
   | `AWS_PUBLISH_ROLE_ARN` | Separate GitHub OIDC publishing role |
   | `SITE_URL` | Canonical public URL; leave empty for unindexed preview |
   | `SEO_NOINDEX` | `true` until domain and content validation are complete |

   Add secret `HCP_TOKEN`: a least-privilege HCP token permitted to upload
   configuration, create/apply runs and read workspace outputs. Use a scoped team
   token where your plan supports it; otherwise use a dedicated restricted user's
   token. Never commit tokens or paste them into issues/logs.
6. Configure [GitHub OIDC to AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).
   The publisher role needs S3 ListBucket/PutObject for the frontend bucket and
   CloudFront CreateInvalidation/GetInvalidation for its distribution. Bind trust
   to the exact repository and `production` environment, matching the actual GitHub
   subject format (new repositories may include immutable IDs). It does not need
   database access, SSM decryption or permission to provision infrastructure.
   After the first HCP apply creates the bucket/distribution, scope permissions
   to their output ARNs before allowing publication. Do not grant administrator
   access to the publishing job.

HCP is the remote state backend for API-driven runs; no S3 state bucket or
`cloud` block is required in the uploaded configuration. Local `terraform apply`
would use local state: **do not use it to deploy this environment**. Use this
pipeline and the existing HCP state. Import any already-created application
resources before applying; existing SSM parameters are only referenced.

## Operations and limits

GitHub serializes production deployments and does not cancel a running deployment
when a new commit lands. HCP also queues runs against its workspace. Do not launch
other writers against this workspace while publishing: output lookup uses its
current state after the successful run. A timeout or network error does not cancel
an already-started HCP apply. Inspect the run URL before retrying. Failed remote
runs never start frontend publication. Fix a partial publication and redeploy the
reviewed commit; do not run Terraform destroy as rollback. Reverting code does not
guarantee a safe infrastructure rollback: review the resulting plan.

Old hashed assets are retained for existing clients; periodically remove obsolete
release assets through a reviewed retention procedure. Upload assets first and
HTML last, but publication of multiple HTML files is not atomic. Existing static
routes removed in later releases require explicit cleanup. A failed health check
fails the job but does not automatically undo AWS changes.

Domain aliases/certificate, additional security headers, origin protection and
cost alerts are separate prelaunch work; this pipeline does not claim to add them.
Until configured, use the CloudFront URL and keep indexing disabled. No live HCP
run or AWS apply was performed while implementing this workflow.

### Deployment permissions JSON

The [reviewed inline policy](../infra/iam/hcp-deployment-policy.json) targets AWS
account `467173180594` and the current production resources with log archival off.
See its [scope and validation notes](../infra/iam/README.md) before attaching it.
It belongs on the HCP deployment role, not the GitHub publishing role.

### Existing domain certificate

The public ACM certificate for `chapatuchoro.com` and `www.chapatuchoro.com`
was checked as `ISSUED` in `us-east-1`. It is managed outside this Terraform
configuration; retain its Cloudflare validation CNAMEs for renewal.

Add these HCP **Terraform variables**, with HCL and Sensitive disabled:

| Name | Value |
| --- | --- |
| `site_domain` | `chapatuchoro.com` |
| `site_certificate_arn` | `arn:aws:acm:us-east-1:467173180594:certificate/9078a652-e611-4ba0-8c44-b0fb0596f9a9` |

Set both or neither. CloudFront accepts apex/www with TLS 1.2 minimum, and the
viewer-request function redirects www to the apex while preserving path and
query parameters, including API requests. The CloudFront hostname remains usable
for pre-DNS health checks. The existing certificate is referenced, not recreated.

Set GitHub `SITE_URL=https://chapatuchoro.com` before the production build and keep
`SEO_NOINDEX=true` until validation is complete. After the reviewed infrastructure
is deployed, replace web DNS records for `@` and `www` with CNAMEs targeting the
CloudFront distribution hostname (not a URL). Leave mail and ACM validation
records intact. Start DNS-only to verify CloudFront HTTPS directly; enabling the
Cloudflare proxy requires Full (strict) TLS and the separate origin-protection
review. Publishing this version on main is safe while repository variable ENABLE_AUTO_DEPLOY is absent or false; manual dispatch is plan-only.
The separate plan-only workflow, security headers and alerts remain prelaunch work.


## Manual plan-only review

1. Keep **repository** Actions variable `ENABLE_AUTO_DEPLOY` absent or `false`.
   It must be repository-level, not environment-level, because the job condition
   is evaluated before environment variables are available.
2. Publish the workflow to the default branch `main`; merging with that variable
   disabled runs tests but skips cloud execution. This documentation does not
   authorize a merge or push. Configure `main` as the GitHub default branch.
3. Open Actions → CI → Run workflow, select `main`, mode `plan`.
4. All CI checks and packaging run first. Approve the `production` environment
   if requested, then open the HCP run URL printed in the job log.
5. HCP receives `plan-only=true` and `auto-apply=false`. No state outputs, AWS
   publication credentials, S3 uploads or CloudFront invalidations are requested.
   HCP performs read/refresh operations; this does not create application resources.
   The API upload creates HCP configuration/run records, not AWS infrastructure.

Review the resources, errors and permissions in HCP. This review plan cannot be
promoted to an apply by this workflow. After separate deployment authorization
and completion of prelaunch work, set repository variable `ENABLE_AUTO_DEPLOY=true`.
The next reviewed push/merge to main will produce a fresh plan and auto-apply it.
Manual runs remain plan-only. Changing the variable alone does not deploy.

## Browser security headers

CloudFront now attaches one custom response-headers policy to the frontend and
API behaviors. It overrides upstream values for `nosniff`, `X-Frame-Options: DENY`,
`strict-origin-when-cross-origin`, and a one-day HSTS max-age without preload or
includeSubDomains. Permissions-Policy disables unused camera, microphone,
geolocation, payment and USB access. API CORS remains owned by the backend.

An enforced CSP blocks embedding, plugins and base-URL changes. A separate
**Content-Security-Policy-Report-Only** observes script/style/worker/image/font and
connection restrictions. It permits same-origin API/worker requests, MapLibre
inline positioning/blob workers and the reviewed OpenFreeMap and MININTER hosts.
This observational policy does not block resource loads and does not provide
complete XSS protection. No reporting collector is provisioned; inspect violations
in browser developer tools. Do not promote it to enforced resource restrictions
until map labels, comisarías, filters, charts, popups, reporting links and SEO pages
have been exercised on the deployed build. Review any violation before broadening
allowed sources. Do not use COEP/COOP isolation here without checking map providers.

Before the next HCP plan, replace the existing inline deployment policy with the
updated `infra/iam/hcp-deployment-policy.json`. It adds CloudFront response-policy
creation and scoped read/update/delete actions. The publishing role is unchanged.
CloudFront policy IDs are generated, so the policy ARN scope covers that resource
type in this account. A new plan should propose one additional resource relative
to the earlier 29-resource plan, plus policy associations in CloudFront.

After an authorized deployment, inspect actual response headers on `/`,
`/tendencias`, `/metodologia/`, `/favicon.svg`, and `/api/health` using `curl -I`.
Also check redirects and unknown paths: responses synthesized by edge functions
or CloudFront errors must be checked separately from origin responses. This
change does not claim those edge-generated responses receive the same headers.
Do not remove ACM validation DNS records. Cloudflare origin protection is covered in the proxy section below. Alerts and
budget configuration are deferred by the MVP scope decision.

## Cloudflare proxy and protected origin

Do this **before enabling automatic deployment**, and keep alerts deferred for MVP.
The same viewer-request function guards static and API traffic, overwrites the
verified client header, strips the private proof and rejects unknown hosts. Lambda
URL remains IAM-only behind OAC. ASP.NET only enables verified-IP handling when
Terraform enables the edge gate. Missing/malformed verified IPs return 400 before
rate limiting; local development ignores that header. Rate limits remain per
Lambda instance, not globally synchronized across all instances.

1. Generate a random base64url token locally (at least 32 random bytes, 43–128
   characters). Do not share it in chat, commits, screenshots or log output.
2. In HCP set **Terraform variable** `cloudflare_origin_token` as **Sensitive**,
   HCL off. Set `enable_cloudflare_proxy=true` with **HCL on** and keep the domain
   and issued certificate variables configured.
3. In Cloudflare create a Request Header Transform Rule for exactly
   `chapatuchoro.com` and `www.chapatuchoro.com`. **Set static**, not Add:
   `X-Ctc-Origin-Token` to the same token, overwriting incoming values. Restrict
   dashboard/rule visibility. Keep Pseudo IPv4 off (or Add Header, not Overwrite
   Headers), keep CF-Connecting-IP enabled and do not override it in Workers.
4. The token is necessarily present in the deployed edge function and Terraform
   state. Sensitive hides ordinary UI/plan output but does not encrypt it from
   authorized state/function readers. Restrict those permissions. Rotate both
   sides together during a maintenance window; never put it in GitHub build vars.
5. Set GitHub SITE_URL to `https://chapatuchoro.com`, keep SEO_NOINDEX=true, use
   Cloudflare **Full (strict)** and verify its edge certificate is active. When
   CloudFront exists, point apex/www CNAMEs to its hostname with **Proxied** on.
   Keep ACM validation CNAMEs DNS-only. Preserve mail records.
6. Add a cache bypass rule for `/api` and `/api/*`; avoid Cache Everything for
   HTML. Static hashed assets may cache. CloudFront invalidation does not purge
   Cloudflare: if unversioned icons change, purge their Cloudflare URLs separately.
7. The publishing job now checks SITE_URL, not the blocked CloudFront origin.
   On initial provisioning the domain cannot be connected until the distribution
   exists. The first health check may fail while DNS is being connected. Complete
   DNS, verify it, then rerun the reviewed deployment. Do not disable the gate.
8. Verify domain/API requests succeed through Cloudflare; requests directly to
   the CloudFront hostname (also with the public Host but without the private
   proof) must return 403. Check both desktop/mobile map interactions, 429 behavior
   and real viewer IP separation. Do not test by putting the token in curl logs.

Cloudflare proxied traffic receives its configured protections; this shared-proof
gate prevents routine origin bypass, not a leaked-token attack. A forged proof
must never be accepted from clients at Cloudflare: use Set to overwrite it.
API JSON remains public; this is neither end-user authentication nor a guarantee
that automated clients cannot use the public website. No alert resources or paid
AWS WAF are introduced by this change. No AWS/Cloudflare state was changed by the
implementation.
