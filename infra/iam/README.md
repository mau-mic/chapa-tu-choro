# HCP deployment role permissions

`hcp-deployment-policy.json` is an inline identity policy for
`chapa-tu-choro-prod-terraform` in AWS account `467173180594`, region
`us-east-1`, environment `prod`. It is separate from the OIDC trust policy.

In IAM, open the role → Permissions → Add permissions → Create inline policy →
JSON. Paste the complete JSON file and name it `ChapaTuChoroProdDeployment`.
Do not attach this policy to the GitHub static-site publisher role.

The policy covers the current application configuration with
`enable_log_archive=false`. It does not authorize the optional Firehose archive,
future ACM certificates, alarms, budgets or WAF. Extend and validate permissions
when those resources are added. Scheduler permissions are included even while the
schedule is disabled, because Terraform still creates the disabled schedule.

IAM role lifecycle and inline-policy permissions are restricted to the three
runtime roles. PassRole is restricted by role and destination service. Only the
AWS basic Lambda logging managed policy can be attached. The HCP role itself is
outside the permitted role resources. The deployment identity can change runtime
role inline policies and therefore remains privileged: restrict its HCP OIDC
trust and who can modify/release this repository.

S3 permissions target the three named buckets, not their data objects. SSM secret
values are not readable by this role. CloudFront generated distribution/OAC IDs
are not known before creation; permissions cover those resource types in this
account. Tighten the IDs after initial provisioning if this account hosts other
applications. Some creation and discovery operations require Resource `*`.

Review evidence, 2026-11-16: generated a read-only production Terraform plan and
used IAM Policy Autopilot 0.4.0 as a baseline. Its output contained overbroad IAM
resources/PassRole and unrelated services, omitted update operations and had an
incorrect Scheduler ARN. The reviewed policy removes these issues. AWS IAM
Access Analyzer `validate-policy` returned `findings: []`. The baseline minified size was 5,789
characters, below the 10,240 aggregate inline-policy character limit for a role
(allow for any other inline policies already on the role). No policy was attached
and no apply ran. Syntax validation does not establish that every provider call
will succeed; validate the first HCP plan and apply with this role and review any
AccessDenied against the exact required action and resource.


The response-security-headers update adds CloudFront response-policy creation
and scoped read/update/delete permissions. Replace the existing inline policy
before running the new plan; no publisher permissions change. Access Analyzer
validation of the updated policy returned no findings; no attachment or apply
was performed by the agent.
