#!/usr/bin/env bash
# Cross-package Linux x86_64 Python 3.13 wheels, independently of the API build.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
test -r certs/supabase-ca.crt || { echo 'Missing certs/supabase-ca.crt; restore the reviewed Supabase public CA before packaging.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Install Python 3 first'; exit 1; }
command -v zip >/dev/null || { echo 'Install zip first'; exit 1; }
mkdir -p dist
ETL_BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$ETL_BUILD_DIR"' EXIT
python3 -m venv "$ETL_BUILD_DIR/venv"
"$ETL_BUILD_DIR/venv/bin/python" -m pip install -r ingestion/requirements.txt \
  --target "$ETL_BUILD_DIR/package" --platform manylinux2014_x86_64 \
  --implementation cp --python-version 3.13 --only-binary=:all: --no-compile --ignore-installed
mkdir -p "$ETL_BUILD_DIR/package/ingestion"
cp ingestion/*.py "$ETL_BUILD_DIR/package/ingestion/"
cp -r db "$ETL_BUILD_DIR/package/db"
mkdir -p "$ETL_BUILD_DIR/package/certs"
cp certs/supabase-ca.crt "$ETL_BUILD_DIR/package/certs/"
# Rebuild from scratch: zip's update mode otherwise retains removed modules.
rm -f dist/ingestion.zip
(cd "$ETL_BUILD_DIR/package" && zip -qr "$TASK_ROOT/dist/ingestion.zip" .)
echo 'Built dist/ingestion.zip for Lambda python3.13 / x86_64'
