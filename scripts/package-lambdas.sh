#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test -r certs/supabase-ca.crt || { echo 'Missing certs/supabase-ca.crt; restore the reviewed Supabase public CA before packaging.' >&2; exit 1; }
mkdir -p dist

command -v dotnet >/dev/null || { echo 'Install .NET 10 SDK first'; exit 1; }
command -v zip >/dev/null || { echo 'Install zip first'; exit 1; }
dotnet tool list -g | grep -q 'amazon.lambda.tools' || dotnet tool install -g Amazon.Lambda.Tools
export PATH="$PATH:$HOME/.dotnet/tools"

dotnet lambda package --project-location backend/src/ChapaTuChoro.Api --configuration Release --framework net10.0 --output-package "$ROOT/dist/api.zip"
# Lambda extracts the ZIP under /var/task; retain this relative certificate path.
zip -q "$ROOT/dist/api.zip" certs/supabase-ca.crt

bash "$ROOT/scripts/package-ingestion.sh"

echo "Built dist/api.zip and dist/ingestion.zip"
