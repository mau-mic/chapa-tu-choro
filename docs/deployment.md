# Publishing the MVP to AWS

Start with the **[complete setup roadmap](setup-roadmap.md)**. It is the ordered
procedure for Supabase, IAM/SSM, ACM, HCP Cloud, GitHub Actions, Cloudflare proxy,
manual plan, initial apply, DNS and post-deployment checks.

The production path is GitHub → HCP Terraform Cloud → AWS, with Cloudflare proxy
in front of CloudFront. Do not use a separate local Terraform state or start a
second local apply against this environment. HCP owns the state and lock; the
application S3 buckets are not a Terraform state backend.

## Operator references

| Task | Procedure |
| --- | --- |
| Follow the full release sequence and troubleshoot setup | [Setup roadmap](setup-roadmap.md) |
| Check variables, job behavior and proxy/header contracts | [HCP deployment](hcp-deployment.md) |
| Provision PostgreSQL roles/schema/TLS and import sources | [Supabase setup](supabase-setup.md) |
| Run local development and migration operations | [Operations](operations.md) |
| Run regression and isolated database/browser checks | [Testing](testing.md) |
| Review prior architecture/cost observations | [Dated AWS review](aws-review.md) |
| Publish canonical URLs, sitemap and indexable pages | [SEO publishing](seo/publishing.md) |

## Release boundaries

- Keep repository variable `ENABLE_AUTO_DEPLOY=false` while reviewing. Manual
  dispatch is plan-only; a push to main with the variable true can auto-apply
  after the configured environment approval. Documentation-only merges count.
- Do not deploy until the plan, IAM permissions, existing certificate and proxy
  configuration have been reviewed. This guide does not authorize cloud writes.
- Data migrations/imports remain separate from application publication. Keep
  scheduled ingestion and optional Firehose archival disabled initially.
- Header/proxy configuration is implemented. Browser/live origin checks remain
  required after deployment. The detailed CSP remains Report-Only.
- Alerts and automated budgets are deferred outside the current MVP scope. This
  does not cap AWS charges; check real consumption/credits and provider quotas.
- Failed checks do not undo a completed apply. Inspect HCP state and actual
  resources before retrying or rolling back. Never destroy the stack as rollback.
