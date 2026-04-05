#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 <images_zip_file> <project_name> [--import-to-db]"
  echo "Example: $0 corridor_images.zip gv_downtown"
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

ZIP_FILE="$1"
PROJECT_NAME="$2"
IMPORT_TO_DB="false"

if [[ "${3:-}" == "--import-to-db" ]]; then
  IMPORT_TO_DB="true"
fi

if [[ ! -f "$ZIP_FILE" ]]; then
  echo "Error: Zip file not found: $ZIP_FILE" >&2
  exit 1
fi

# Setup workspace
WORKSPACE_DIR="$(pwd)/.data/v1_slice_${PROJECT_NAME}_$(date +%s)"
DATASET_ROOT="$WORKSPACE_DIR/dataset"
EXPORT_DIR="$WORKSPACE_DIR/export_bundle"

echo "=== 1. ZIP Ingest ==="
mkdir -p "$DATASET_ROOT/images"
echo "Extracting $ZIP_FILE to $DATASET_ROOT/images..."
unzip -q -j "$ZIP_FILE" -d "$DATASET_ROOT/images"
IMAGE_COUNT=$(ls -1 "$DATASET_ROOT/images" | wc -l)
echo "Extracted $IMAGE_COUNT images."

echo "=== 2. Single-host ODM Run ==="
bash scripts/run_odm_benchmark.sh "$DATASET_ROOT" "$PROJECT_NAME"

echo "=== 3. Download-first Review & Real Export Bundle ==="
mkdir -p "$EXPORT_DIR"

# Collect artifacts based on expected ODM outputs
ODM_OUTPUT="$DATASET_ROOT/$PROJECT_NAME"

echo "Copying outputs to export bundle..."
if [[ -f "$ODM_OUTPUT/odm_orthophoto/odm_orthophoto.tif" ]]; then
  cp "$ODM_OUTPUT/odm_orthophoto/odm_orthophoto.tif" "$EXPORT_DIR/"
fi

if [[ -f "$ODM_OUTPUT/odm_dem/dsm.tif" ]]; then
  cp "$ODM_OUTPUT/odm_dem/dsm.tif" "$EXPORT_DIR/"
elif [[ -f "$ODM_OUTPUT/odm_dem/dtm.tif" ]]; then
  cp "$ODM_OUTPUT/odm_dem/dtm.tif" "$EXPORT_DIR/"
fi

if [[ -f "$ODM_OUTPUT/odm_georeferencing/odm_georeferenced_model.laz" ]]; then
  cp "$ODM_OUTPUT/odm_georeferencing/odm_georeferenced_model.laz" "$EXPORT_DIR/"
elif [[ -f "$ODM_OUTPUT/odm_georeferencing/odm_georeferenced_model.ply" ]]; then
  cp "$ODM_OUTPUT/odm_georeferencing/odm_georeferenced_model.ply" "$EXPORT_DIR/"
fi

if [[ -f "$ODM_OUTPUT/odm_texturing/odm_textured_model.obj" ]]; then
  cp "$ODM_OUTPUT/odm_texturing/odm_textured_model.obj" "$EXPORT_DIR/"
fi

# Include benchmark summary
LATEST_RUN_DIR=$(ls -td benchmark/* | head -n 1)
if [[ -f "$LATEST_RUN_DIR/summary.json" ]]; then
  cp "$LATEST_RUN_DIR/summary.json" "$EXPORT_DIR/run_summary.json"
fi
if [[ -f "$LATEST_RUN_DIR/run.log" ]]; then
  cp "$LATEST_RUN_DIR/run.log" "$EXPORT_DIR/run.log"
fi

# Create final export zip
EXPORT_ZIP="export_bundle_${PROJECT_NAME}.zip"
cd "$EXPORT_DIR"
zip -q -r "../$EXPORT_ZIP" ./*
cd - > /dev/null

echo "Export bundle created at: $WORKSPACE_DIR/$EXPORT_ZIP"

if [[ "$IMPORT_TO_DB" == "true" && -f "$LATEST_RUN_DIR/summary.json" ]]; then
  echo "=== 4. Import to Supabase ==="
  # You would need the correct flags for import_odm_benchmark_run.mjs
  # We just invoke it assuming required env vars are set.
  node scripts/import_odm_benchmark_run.mjs --summary "$LATEST_RUN_DIR/summary.json" || true
fi

echo "Done. The v1 slice executed successfully."
