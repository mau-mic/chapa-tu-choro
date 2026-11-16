#!/usr/bin/env bash
# Isolated mock test: synthetic artifacts never enter the deployment bundle.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$BUILD/infra/terraform/tests" "$BUILD/dist" "$BUILD/frontend/dist"
cp "$ROOT"/infra/terraform/*.tf "$BUILD/infra/terraform/"
cp "$ROOT"/infra/terraform/tests/security_headers.tftest.hcl "$BUILD/infra/terraform/tests/"
if test -f "$ROOT/infra/terraform/.terraform.lock.hcl"; then
  cp "$ROOT/infra/terraform/.terraform.lock.hcl" "$BUILD/infra/terraform/"
fi
# Reuse an initialized provider when present; init still verifies it below.
if test -d "$ROOT/infra/terraform/.terraform/providers"; then
  mkdir -p "$BUILD/infra/terraform/.terraform"
  ln -s "$ROOT/infra/terraform/.terraform/providers" "$BUILD/infra/terraform/.terraform/providers"
fi
printf 'synthetic mock-only artifact' > "$BUILD/dist/api.zip"
printf 'synthetic mock-only artifact' > "$BUILD/dist/ingestion.zip"
printf 'function handler(event) { return event.request; }' > "$BUILD/frontend/dist/cloudfront-router.js"
terraform -chdir="$BUILD/infra/terraform" init -backend=false -input=false
terraform -chdir="$BUILD/infra/terraform" test -filter=tests/security_headers.tftest.hcl
# This is a fixed public test fixture, never the HCP origin token.
printf 'nonsensitive(jsonencode(local.site_router_code))\n' | terraform -chdir="$BUILD/infra/terraform" console \
  -var=enable_cloudflare_proxy=true -var=site_domain=chapatuchoro.com \
  -var=cloudflare_origin_token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  > "$BUILD/router.json"
node "$ROOT/scripts/tests/cloudflare-edge.cjs" "$BUILD/router.json"
