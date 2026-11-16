#!/usr/bin/env bash
# Invoked only by the trusted production job, after all CI checks pass.
set -euo pipefail
: "${HCP_TOKEN:?Missing HCP_TOKEN}"
: "${HCP_ORGANIZATION:?Missing HCP_ORGANIZATION}"
: "${HCP_WORKSPACE:?Missing HCP_WORKSPACE}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
API=https://app.terraform.io/api/v2
api() {
  curl --silent --show-error --fail --connect-timeout 15 --max-time 60 \
    -H "Authorization: Bearer $HCP_TOKEN" -H 'Content-Type: application/vnd.api+json' "$@"
}
# No broad repository upload: excludes data, credentials, state and local tfvars.
mkdir -p "$BUILD/config/infra/terraform" "$BUILD/config/dist" "$BUILD/config/frontend/dist"
cp "$ROOT"/infra/terraform/*.tf "$BUILD/config/infra/terraform/"
if test -f "$ROOT/infra/terraform/.terraform.lock.hcl"; then
  cp "$ROOT/infra/terraform/.terraform.lock.hcl" "$BUILD/config/infra/terraform/"
fi
cp "$ROOT/dist/api.zip" "$ROOT/dist/ingestion.zip" "$BUILD/config/dist/"
cp "$ROOT/frontend/dist/cloudfront-router.js" "$BUILD/config/frontend/dist/"
tar -czf "$BUILD/config.tar.gz" -C "$BUILD/config" .
WORKSPACE=$(api "$API/organizations/$HCP_ORGANIZATION/workspaces/$HCP_WORKSPACE")
# Cloud execution is named 'remote' by the API. Fail instead of silently running elsewhere.
jq -e '.data.attributes | .["execution-mode"] == "remote" and .["working-directory"] == "infra/terraform"' <<< "$WORKSPACE" >/dev/null
WS_ID=$(jq -er '.data.id' <<< "$WORKSPACE")
CV=$(api -X POST "$API/workspaces/$WS_ID/configuration-versions" \
  --data '{"data":{"type":"configuration-versions","attributes":{"auto-queue-runs":false}}}')
CV_ID=$(jq -er '.data.id' <<< "$CV")
UPLOAD=$(jq -er '.data.attributes["upload-url"]' <<< "$CV")
# The signed upload URL receives no HCP bearer token; do not print it.
curl --silent --show-error --fail --connect-timeout 15 --max-time 300 \
  -X PUT -H 'Content-Type: application/octet-stream' --data-binary "@$BUILD/config.tar.gz" "$UPLOAD"
for ((attempt=0; attempt<60; attempt++)); do
  STATUS=$(api "$API/configuration-versions/$CV_ID" | jq -er '.data.attributes.status')
  if [[ "$STATUS" == uploaded ]]; then break; fi
  [[ "$STATUS" != errored ]] || { echo 'Configuration upload failed' >&2; exit 1; }
  sleep 2
done
[[ "$STATUS" == uploaded ]] || { echo 'Configuration upload timed out' >&2; exit 1; }
BODY=$(jq -n --arg ws "$WS_ID" --arg cv "$CV_ID" --arg sha "${GITHUB_SHA:-manual}" \
  '{data:{type:"runs",attributes:{message:("GitHub commit " + $sha),"auto-apply":true},relationships:{workspace:{data:{type:"workspaces",id:$ws}},"configuration-version":{data:{type:"configuration-versions",id:$cv}}}}}')
RUN=$(api -X POST "$API/runs" --data "$BODY")
RUN_ID=$(jq -er '.data.id' <<< "$RUN")
echo "HCP run: https://app.terraform.io/app/$HCP_ORGANIZATION/workspaces/$HCP_WORKSPACE/runs/$RUN_ID"
# Do not retry POSTs: an ambiguous network failure requires inspecting HCP first.
for ((attempt=0; attempt<240; attempt++)); do
  STATUS=$(api "$API/runs/$RUN_ID" | jq -er '.data.attributes.status')
  echo "HCP status: $STATUS"
  case "$STATUS" in
    applied|planned_and_finished) break ;;
    errored|canceled|force_canceled|discarded) echo 'Remote run failed; frontend was not published' >&2; exit 1 ;;
  esac
  sleep 15
done
[[ "$STATUS" == applied || "$STATUS" == planned_and_finished ]] || {
  echo "Timed out: inspect $RUN_ID before retrying; the remote run may still be active" >&2; exit 1;
}
STATE=$(api "$API/workspaces/$WS_ID/current-state-version" | jq -er '.data.id')
api "$API/state-versions/$STATE/outputs" > "$BUILD/outputs.json"
# Export only reviewed, non-sensitive deployment outputs; never dump full state.
for name in site_bucket cloudfront_distribution_id cloudfront_url; do
  value=$(jq -er --arg name "$name" '.data[] | select(.attributes.name == $name and .attributes.sensitive == false) | .attributes.value | strings' "$BUILD/outputs.json")
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || exit 1
  echo "$name=$value" >> "${GITHUB_OUTPUT:?Missing GITHUB_OUTPUT}"
done
