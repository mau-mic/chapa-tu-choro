# GitHub → HCP Terraform Cloud → AWS

The `deploy` job in `.github/workflows/ci.yml` runs only after all three CI jobs
succeed on a push to `main`. GitHub builds both Lambda ZIPs and the production
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
   release, use a required reviewer if supported by your GitHub plan. Approval of
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
review. Do not merge just to obtain a plan: the current deploy job auto-applies.
The separate plan-only workflow, security headers and alerts remain prelaunch work.
