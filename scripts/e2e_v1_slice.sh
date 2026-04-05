#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/e2e_v1_slice.sh <images_zip_file> <project_slug> [options]

Example:
  ./scripts/e2e_v1_slice.sh corridor_images.zip gv-downtown \
    --mission-name "Grass Valley downtown curb inventory"

Options:
  --mission-name <name>        Human-readable mission label for review docs
  --workspace-root <dir>       Output root for extracted data and bundle (default: ./.data)
  --import-to-db               Import benchmark summary into Supabase after local run
  --org-slug <slug>            Required with --import-to-db
  --mission-id <uuid>          Required with --import-to-db
  --dataset-name <name>        Optional dataset name for import
  --job-name <name>            Optional job name override for import
  --external-ref <value>       Optional external job reference for import
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

PROJECT_SLUG_REGEX='^[A-Za-z0-9._-]+$'

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

ZIP_FILE="$1"
PROJECT_SLUG="$2"
shift 2

MISSION_NAME=""
WORKSPACE_ROOT="$(pwd)/.data"
IMPORT_TO_DB="false"
ORG_SLUG=""
MISSION_ID=""
DATASET_NAME=""
JOB_NAME=""
EXTERNAL_REF=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mission-name)
      MISSION_NAME="${2:-}"
      shift 2
      ;;
    --workspace-root)
      WORKSPACE_ROOT="${2:-}"
      shift 2
      ;;
    --import-to-db)
      IMPORT_TO_DB="true"
      shift
      ;;
    --org-slug)
      ORG_SLUG="${2:-}"
      shift 2
      ;;
    --mission-id)
      MISSION_ID="${2:-}"
      shift 2
      ;;
    --dataset-name)
      DATASET_NAME="${2:-}"
      shift 2
      ;;
    --job-name)
      JOB_NAME="${2:-}"
      shift 2
      ;;
    --external-ref)
      EXTERNAL_REF="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ZIP_FILE" ]]; then
  echo "Error: ZIP file not found: $ZIP_FILE" >&2
  exit 1
fi

if [[ ! "$PROJECT_SLUG" =~ $PROJECT_SLUG_REGEX ]]; then
  echo "Error: project_slug must match ${PROJECT_SLUG_REGEX} (letters, numbers, dot, underscore, hyphen only)." >&2
  exit 1
fi

require_command unzip
require_command zip
require_command node
require_command docker

if [[ "$IMPORT_TO_DB" == "true" ]]; then
  if [[ -z "$ORG_SLUG" || -z "$MISSION_ID" ]]; then
    echo "Error: --org-slug and --mission-id are required with --import-to-db." >&2
    exit 1
  fi
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKSPACE_DIR="$WORKSPACE_ROOT/v1_slice_${PROJECT_SLUG}_${TIMESTAMP}"
DATASET_ROOT="$WORKSPACE_DIR/dataset"
EXPORT_DIR="$WORKSPACE_DIR/export_bundle"
BENCHMARK_RUN_DIR="benchmark/${TIMESTAMP}_${PROJECT_SLUG}"
EXPORT_ZIP="$WORKSPACE_DIR/export_bundle_${PROJECT_SLUG}.zip"
MISSION_LABEL="${MISSION_NAME:-$PROJECT_SLUG}"

mkdir -p "$DATASET_ROOT/images" "$EXPORT_DIR"

cat > "$WORKSPACE_DIR/MISSION_CONTEXT.txt" <<EOF
project_slug=$PROJECT_SLUG
mission_name=$MISSION_LABEL
source_zip=$(cd "$(dirname "$ZIP_FILE")" && pwd)/$(basename "$ZIP_FILE")
workspace_dir=$WORKSPACE_DIR
benchmark_run_dir=$BENCHMARK_RUN_DIR
created_at_utc=$TIMESTAMP
EOF

echo "=== 1. ZIP ingest ==="
echo "Extracting $ZIP_FILE to $DATASET_ROOT/images ..."
unzip -q -j "$ZIP_FILE" -d "$DATASET_ROOT/images"
IMAGE_COUNT="$(find "$DATASET_ROOT/images" -type f | wc -l | tr -d ' ')"
if [[ "$IMAGE_COUNT" == "0" ]]; then
  echo "Error: ZIP extraction completed but no files were found in $DATASET_ROOT/images." >&2
  exit 1
fi

echo "Extracted $IMAGE_COUNT file(s)."

echo "=== 2. Single-host ODM run ==="
BENCHMARK_RUN_DIR="$BENCHMARK_RUN_DIR" bash scripts/run_odm_benchmark.sh "$DATASET_ROOT" "$PROJECT_SLUG"
SUMMARY_JSON="$BENCHMARK_RUN_DIR/summary.json"
if [[ ! -f "$SUMMARY_JSON" ]]; then
  echo "Error: ODM run completed without producing $SUMMARY_JSON." >&2
  exit 1
fi

echo "=== 3. Download-first review bundle ==="
node scripts/build_v1_review_bundle.mjs \
  --summary "$SUMMARY_JSON" \
  --export-dir "$EXPORT_DIR" \
  --project-name "$PROJECT_SLUG" \
  --mission-name "$MISSION_LABEL"

(
  cd "$EXPORT_DIR"
  zip -q -r "$EXPORT_ZIP" .
)

echo "Review bundle written to: $EXPORT_ZIP"

if [[ "$IMPORT_TO_DB" == "true" ]]; then
  echo "=== 4. Import benchmark summary into Supabase ==="
  IMPORT_ARGS=(
    --org-slug "$ORG_SLUG"
    --mission-id "$MISSION_ID"
    --summary "$SUMMARY_JSON"
  )

  if [[ -n "$DATASET_NAME" ]]; then
    IMPORT_ARGS+=(--dataset-name "$DATASET_NAME")
  fi

  if [[ -n "$JOB_NAME" ]]; then
    IMPORT_ARGS+=(--job-name "$JOB_NAME")
  fi

  if [[ -n "$EXTERNAL_REF" ]]; then
    IMPORT_ARGS+=(--external-ref "$EXTERNAL_REF")
  fi

  node scripts/import_odm_benchmark_run.mjs "${IMPORT_ARGS[@]}"
fi

BUNDLE_READY="$(node -e 'const fs=require("node:fs"); const p=process.argv[1]; const manifest=JSON.parse(fs.readFileSync(p,"utf8")); process.stdout.write(manifest.bundleReady ? "true" : "false");' "$EXPORT_DIR/EXPORT_MANIFEST.json")"

if [[ "$BUNDLE_READY" != "true" ]]; then
  echo
  echo "Review bundle was created, but the run did not clear the truthful v1 pass bar." >&2
  echo "Inspect $EXPORT_DIR/REVIEW.md and $EXPORT_DIR/EXPORT_MANIFEST.json for the exact missing outputs." >&2
  exit 2
fi

echo

echo "Truthful v1 slice completed successfully."
echo "- Workspace: $WORKSPACE_DIR"
echo "- Benchmark summary: $SUMMARY_JSON"
echo "- Review bundle: $EXPORT_ZIP"
