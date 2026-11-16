# Publishing the MVP to AWS

This is an operator procedure, not an instruction to deploy automatically. No AWS resources or production data were changed during the documentation review or scoped-map fix. Follow the [prelaunch review](aws-review.md); the old map-size issue was corrected locally on 2026-11-14, while Lambda artifact, headers and alert verification remain release prerequisites.

## 1. Confirm the target

- Start with one environment and `us-east-1`; keep the existing Supabase database provider.
- Check the AWS account's credit expiry, Free Tier eligibility and Lambda concurrency quota. Credits reduce an eligible bill temporarily; they do not make the underlying services free.
- Measure the target database's size, region, egress and connection limits. The local snapshot measured 356 MB; hosted size can differ.
- Decide which sources may be exposed publicly using the catalogue and [ADR 0002](adrs/0002-mvp-data-use-with-unresolved-authorization.md).
- Start without a custom domain. CloudFront supplies an HTTPS hostname; keep preview builds noindex.

## 2. Prepare database access and secrets

Using separately authorized production access, provision the schema through the existing [migration runner](operations.md#database-upgrades). Back up existing data first. Migration 004 installs role-specific grants and RLS policies; follow [Supabase setup](supabase-setup.md) to create separate login accounts and assign passwords outside migrations. Migrations need an owner, ingestion needs audited writes, and the API needs read-only access. Browser database roles should not access private location/tracking tables.

For serverless database reads, use the Supabase transaction pooler with a small client pool and no session prepared statements. Migration/backup sessions need a suitable direct or session connection. Copy actual endpoints from the provider dashboard, and require TLS. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

Follow [the AWS database handoff](supabase-setup.md#11-aws-handoff--pending-deployment-work) before setting live connection values. Both ZIP packaging scripts include the reviewed public CA from `certs/supabase-ca.crt` at `/var/task/certs/supabase-ca.crt`. Reference that path with certificate/hostname verification and rebuild both artifacts when the CA changes; see [certificate provenance](../certs/README.md). The local Docker certificate mount is unavailable in Lambda. Pin `sidpol_source_url` to the reviewed official release: automatic catalogue discovery returned nine CSV candidates during setup and deliberately failed. Live connection verification and source configuration remain release tasks, not claims of deployed functionality.

Create two existing SSM SecureString parameters outside Terraform:

| Terraform variable | Secret format |
| --- | --- |
| `database_ssm_parameter_name` | Npgsql connection string for the read-only API role |
| `ingestion_database_ssm_parameter_name` | PostgreSQL URI/libpq DSN for the ingestion writer role |

Use production-specific paths. Do not put secret values in tfvars, state, frontend variables or shell history. A customer-managed KMS key requires additional scoped decrypt permissions; the current template assumes standard SSM encryption configuration.

Import the reviewed official data through the existing CLI procedures. Do not assume deploying Lambda also migrates or copies local data. Population and concentration remain separate imports; the scheduled default ETL does not update every source automatically.

## 3. Build and verify artifacts

Run [the regression checks](testing.md). Then build the frontend with `VITE_API_BASE_URL` empty for same-origin `/api` and `VITE_SEO_NOINDEX=true` for preview. An empty `VITE_SITE_URL` also generates noindex pages and no canonical sitemap entries.

```bash
npm --prefix frontend ci
npm --prefix frontend run build
bash scripts/package-lambdas.sh
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform init -backend=false -input=false
terraform -chdir=infra/terraform validate
```

The packaging script needs .NET 10, Python, zip and Amazon.Lambda.Tools; it currently installs that .NET tool globally if missing. Build/review artifacts before running it on a shared workstation. Expected outputs are `dist/api.zip`, `dist/ingestion.zip` and the generated frontend router. Verify Linux/runtime architecture and ZIP limits; only the Python packaging path currently runs in CI.

## 4. Review and authorize the release

Before a real plan, choose protected Terraform state storage/locking and keep state outside source control. Use the locked AWS provider. Supply production paths and environment settings; leave the schedule and Firehose archive disabled initially.

A credentialed plan will read the actual AWS account and must be reviewed separately. It must include the release artifacts and generated router being published. Apply only after approval of its resources, IAM changes and expected costs. This review ran format/validate/static policy checks, not a credentialed plan or apply.

After approved provisioning, upload frontend assets with correct MIME/cache metadata: hashed assets can be immutable; HTML and metadata must revalidate. Do not remove assets required by currently cached HTML until that release has expired. Terraform creates infrastructure but does not upload `frontend/dist` automatically.

## 5. Verify the deployed path

Check through CloudFront:

- `/api/health` and `/api/ready`, including actual least-privilege database access.
- Map, filters, trends, population references, concentration/radius and Denunciar on desktop/mobile.
- The largest supported GeoJSON/history responses against Lambda's buffered limits. `/api/map` requires a department; use `/api/explorer` for the national overview. Repeat the [local payload checks](nationwide-map.md#scoped-district-geojson) against the target data and actual Lambda adapter before release.
- A direct Lambda Function URL request is denied; CloudFront requests reach it through OAC.
- Unknown site paths return 404, workers have JavaScript MIME type, preview pages remain noindex, and cache/security headers are correct.
- Cold/warm latency, concurrent filter changes, 429 behavior and database pool usage.
- One manually invoked ETL attempt succeeds and reports provenance before the schedule is enabled.

Set cost alerts and a basic failed-job/API-error notification before unattended ingestion. The current stack does not create these alerts. A budget notification is not a spending hard cap.

## 6. Operate and later add a domain

Keep a previous frontend/API artifact and its source snapshot for rollback. Roll back application artifacts without rewriting migration history or deleting imported records. A database restore is a separate operation with its own backup and approval.

When a domain is available, add DNS, CloudFront aliases and an ACM certificate in `us-east-1`; the optional CloudFront domain/certificate configuration now references an existing ACM certificate; see [HCP domain settings](hcp-deployment.md#existing-domain-certificate). Set the final `VITE_SITE_URL`, rebuild SEO output, configure redirects and then enable indexing. See [publishing](seo/publishing.md) and [AWS domain setup](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CreatingCNAME.html).

## Automated deployment with HCP Terraform

Production automation now uses [the HCP Cloud deployment procedure](hcp-deployment.md).
It supersedes the local Terraform deployment commands above for that environment.
Complete the one-time identities, workspace and GitHub settings before merging.
