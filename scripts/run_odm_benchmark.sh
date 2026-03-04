#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_NAME="$(basename "$0")"
DEFAULT_ODM_IMAGE="opendronemap/odm:3.5.5"
DEFAULT_MIN_FREE_GB=40

json_escape() {
  echo "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

usage() {
  cat <<EOF
Usage:
  $SCRIPT_NAME [--preflight-only] <dataset_root> [benchmark_label]

Arguments:
  dataset_root      Path to dataset directory containing images/.
  benchmark_label   Optional label for benchmark artifact folder.

Options:
  --preflight-only  Run validation checks and write preflight artifacts only.
  -h, --help        Show this help message.

Environment:
  ODM_IMAGE         Docker image tag to run (default: ${DEFAULT_ODM_IMAGE})
  ODM_PROJECT_NAME  ODM project folder name under /datasets (default: basename(dataset_root))
  ODM_EXTRA_ARGS    Extra ODM CLI arguments appended in deterministic mode.
  ODM_ARGS          Full ODM argument override (advanced/legacy; bypasses deterministic defaults).
  MIN_FREE_GB       Minimum free disk space required on dataset volume (default: ${DEFAULT_MIN_FREE_GB})

Examples:
  $SCRIPT_NAME ./sample-datasets/site-a
  $SCRIPT_NAME --preflight-only ./sample-datasets/site-a site-a-baseline
  ODM_EXTRA_ARGS="--orthophoto-resolution 2 --dem-resolution 5" \\
    $SCRIPT_NAME ./sample-datasets/site-a site-a-tuned
EOF
}

print_dataset_contract() {
  local dataset_root="$1"
  cat <<EOF
Dataset contract:
  <dataset_root>/
    images/
      IMG_0001.JPG
      IMG_0002.JPG
      ...

Expected image extensions: jpg, jpeg, tif, tiff, png

If sample data has not arrived yet, prepare an empty folder now so preflight is deterministic later:
  mkdir -p "${dataset_root}/images"

Then add source imagery and rerun:
  $SCRIPT_NAME --preflight-only "${dataset_root}" <benchmark_label>
  $SCRIPT_NAME "${dataset_root}" <benchmark_label>
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command not found in PATH: $cmd" >&2
    exit 2
  fi
}

image_count_in_dir() {
  local images_dir="$1"
  find "$images_dir" -type f \( \
    -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.tif' -o -iname '*.tiff' -o -iname '*.png' \
  \) | wc -l | tr -d ' '
}

PRECHECK_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --preflight-only)
      PRECHECK_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Error: unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

DATASET_ROOT="$1"
BENCHMARK_LABEL="${2:-$(basename "$DATASET_ROOT")}"
ODM_IMAGE="${ODM_IMAGE:-$DEFAULT_ODM_IMAGE}"
MIN_FREE_GB="${MIN_FREE_GB:-$DEFAULT_MIN_FREE_GB}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_SLUG="$(slugify "$BENCHMARK_LABEL")"
if [[ -z "$RUN_SLUG" ]]; then
  RUN_SLUG="benchmark"
fi
RUN_DIR="benchmark/${TIMESTAMP}-${RUN_SLUG}"
RUN_LOG="$RUN_DIR/run.log"
SUMMARY_JSON="$RUN_DIR/summary.json"
PRECHECK_FILE="$RUN_DIR/preflight.txt"
OUTPUT_INVENTORY="$RUN_DIR/output_inventory.tsv"

if [[ ! -d "$DATASET_ROOT" ]]; then
  echo "Error: dataset_root does not exist: $DATASET_ROOT" >&2
  print_dataset_contract "$DATASET_ROOT" >&2
  exit 2
fi

ABS_DATASET_ROOT="$(cd "$DATASET_ROOT" && pwd)"
DATASET_NAME="$(basename "$ABS_DATASET_ROOT")"
DATASET_PARENT="$(dirname "$ABS_DATASET_ROOT")"
ODM_PROJECT_NAME="${ODM_PROJECT_NAME:-$DATASET_NAME}"
ODM_PROJECT_HOST_PATH="$DATASET_PARENT/$ODM_PROJECT_NAME"
IMAGES_PATH="$ODM_PROJECT_HOST_PATH/images"

if [[ -n "${ODM_ARGS:-}" ]]; then
  ODM_ARGS_MODE="override"
  # shellcheck disable=SC2206
  ODM_ARGS_ARRAY=( ${ODM_ARGS} )
else
  ODM_ARGS_MODE="deterministic"
  ODM_ARGS_ARRAY=(--project-path /datasets "$ODM_PROJECT_NAME")
  if [[ -n "${ODM_EXTRA_ARGS:-}" ]]; then
    # shellcheck disable=SC2206
    EXTRA_ARGS_ARRAY=( ${ODM_EXTRA_ARGS} )
    ODM_ARGS_ARRAY+=("${EXTRA_ARGS_ARRAY[@]}")
  fi
fi

if [[ ! -d "$IMAGES_PATH" ]]; then
  echo "Error: expected images folder at: $IMAGES_PATH" >&2
  echo "Hint: dataset_root should point at a directory where 'images/' exists, or set ODM_PROJECT_NAME to the dataset folder name." >&2
  print_dataset_contract "$ABS_DATASET_ROOT" >&2
  exit 2
fi

IMAGE_COUNT="$(image_count_in_dir "$IMAGES_PATH")"
if [[ "$IMAGE_COUNT" -eq 0 ]]; then
  echo "Error: no supported image files found in $IMAGES_PATH" >&2
  echo "Supported extensions: jpg, jpeg, tif, tiff, png" >&2
  print_dataset_contract "$ABS_DATASET_ROOT" >&2
  exit 2
fi

require_command docker
if ! docker info >/dev/null 2>&1; then
  echo "Error: docker daemon is not reachable." >&2
  exit 2
fi

FREE_KB="$(df -Pk "$DATASET_PARENT" | awk 'NR==2 {print $4}')"
FREE_GB="$((FREE_KB / 1024 / 1024))"
if [[ "$FREE_GB" -lt "$MIN_FREE_GB" ]]; then
  echo "Error: only ${FREE_GB}GB free on dataset volume; require at least ${MIN_FREE_GB}GB." >&2
  echo "Adjust MIN_FREE_GB if this threshold is too strict for your benchmark profile." >&2
  exit 2
fi

DOCKER_VERSION="$(docker --version)"
HOSTNAME_VALUE="$(hostname)"
START_EPOCH="$(date +%s)"
START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

ODMCMD=(docker run --rm -v "${DATASET_PARENT}:/datasets" "$ODM_IMAGE" "${ODM_ARGS_ARRAY[@]}")
COMMAND_STRING="$(printf '%q ' "${ODMCMD[@]}")"
ODM_ARGS_HUMAN="$(printf '%s ' "${ODM_ARGS_ARRAY[@]}")"
ODM_ARGS_HUMAN="${ODM_ARGS_HUMAN% }"

mkdir -p "$RUN_DIR"

{
  echo "timestamp_utc=$START_UTC"
  echo "dataset_root=$ABS_DATASET_ROOT"
  echo "dataset_parent=$DATASET_PARENT"
  echo "dataset_name=$DATASET_NAME"
  echo "benchmark_label=$BENCHMARK_LABEL"
  echo "odm_project_name=$ODM_PROJECT_NAME"
  echo "images_path=$IMAGES_PATH"
  echo "image_count=$IMAGE_COUNT"
  echo "odm_args_mode=$ODM_ARGS_MODE"
  echo "odm_image=$ODM_IMAGE"
  echo "odm_args=$ODM_ARGS_HUMAN"
  echo "docker_version=$DOCKER_VERSION"
  echo "host=$HOSTNAME_VALUE"
  echo "free_disk_gb=$FREE_GB"
  echo "min_free_gb=$MIN_FREE_GB"
  echo "preflight_status=passed"
  echo "command=$COMMAND_STRING"
} | tee "$PRECHECK_FILE" >/dev/null

if [[ "$PRECHECK_ONLY" -eq 1 ]]; then
  echo "Preflight passed. Artifacts:"
  echo "  $PRECHECK_FILE"
  exit 0
fi

{
  cat "$PRECHECK_FILE"
  echo
  echo "Running ODM benchmark..."
  echo
} | tee "$RUN_LOG" >/dev/null

set +e
"${ODMCMD[@]}" 2>&1 | tee -a "$RUN_LOG"
RUN_EXIT_CODE="${PIPESTATUS[0]}"
set -e

END_EPOCH="$(date +%s)"
END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DURATION_SECONDS="$((END_EPOCH - START_EPOCH))"

STATUS="success"
if [[ "$RUN_EXIT_CODE" -ne 0 ]]; then
  STATUS="failed"
fi

PROJECT_OUTPUT_ROOT="$ODM_PROJECT_HOST_PATH"
EXPECTED_OUTPUTS=(
  "odm_orthophoto/odm_orthophoto.tif"
  "odm_dem/dsm.tif"
  "odm_dem/dtm.tif"
  "odm_georeferencing/odm_georeferenced_model.laz"
  "odm_texturing/odm_textured_model.obj"
)

KEY_OUTPUTS_PRESENT=0
{
  echo -e "status\trelative_path\tbytes"
  for rel_path in "${EXPECTED_OUTPUTS[@]}"; do
    abs_path="$PROJECT_OUTPUT_ROOT/$rel_path"
    if [[ -s "$abs_path" ]]; then
      file_status="present"
      bytes="$(stat -c%s "$abs_path")"
      KEY_OUTPUTS_PRESENT="$((KEY_OUTPUTS_PRESENT + 1))"
    elif [[ -e "$abs_path" ]]; then
      file_status="empty"
      bytes="$(stat -c%s "$abs_path" 2>/dev/null || echo 0)"
    else
      file_status="missing"
      bytes=0
    fi
    echo -e "${file_status}\t${rel_path}\t${bytes}"
  done
} >"$OUTPUT_INVENTORY"

{
  echo
  echo "run_exit_code=$RUN_EXIT_CODE"
  echo "status=$STATUS"
  echo "end_timestamp_utc=$END_UTC"
  echo "duration_seconds=$DURATION_SECONDS"
  echo "key_outputs_present=$KEY_OUTPUTS_PRESENT"
  echo "key_outputs_expected=${#EXPECTED_OUTPUTS[@]}"
} | tee -a "$RUN_LOG" >/dev/null

ESC_START_UTC="$(json_escape "$START_UTC")"
ESC_END_UTC="$(json_escape "$END_UTC")"
ESC_DATASET_ROOT="$(json_escape "$ABS_DATASET_ROOT")"
ESC_DATASET_PARENT="$(json_escape "$DATASET_PARENT")"
ESC_DATASET_NAME="$(json_escape "$DATASET_NAME")"
ESC_BENCHMARK_LABEL="$(json_escape "$BENCHMARK_LABEL")"
ESC_ODM_PROJECT_NAME="$(json_escape "$ODM_PROJECT_NAME")"
ESC_ODM_IMAGE="$(json_escape "$ODM_IMAGE")"
ESC_ODM_ARGS_MODE="$(json_escape "$ODM_ARGS_MODE")"
ESC_ODM_ARGS="$(json_escape "$ODM_ARGS_HUMAN")"
ESC_DOCKER_VERSION="$(json_escape "$DOCKER_VERSION")"
ESC_HOSTNAME="$(json_escape "$HOSTNAME_VALUE")"
ESC_RUN_LOG="$(json_escape "$RUN_LOG")"
ESC_PRECHECK_FILE="$(json_escape "$PRECHECK_FILE")"
ESC_OUTPUT_INVENTORY="$(json_escape "$OUTPUT_INVENTORY")"

cat >"$SUMMARY_JSON" <<EOF
{
  "timestamp_utc": "$ESC_START_UTC",
  "end_timestamp_utc": "$ESC_END_UTC",
  "status": "$STATUS",
  "run_exit_code": $RUN_EXIT_CODE,
  "duration_seconds": $DURATION_SECONDS,
  "dataset_root": "$ESC_DATASET_ROOT",
  "dataset_parent": "$ESC_DATASET_PARENT",
  "dataset_name": "$ESC_DATASET_NAME",
  "benchmark_label": "$ESC_BENCHMARK_LABEL",
  "odm_project_name": "$ESC_ODM_PROJECT_NAME",
  "image_count": $IMAGE_COUNT,
  "odm_image": "$ESC_ODM_IMAGE",
  "odm_args_mode": "$ESC_ODM_ARGS_MODE",
  "odm_args": "$ESC_ODM_ARGS",
  "docker_version": "$ESC_DOCKER_VERSION",
  "host": "$ESC_HOSTNAME",
  "free_disk_gb": $FREE_GB,
  "min_free_gb": $MIN_FREE_GB,
  "key_outputs_present": $KEY_OUTPUTS_PRESENT,
  "key_outputs_expected": ${#EXPECTED_OUTPUTS[@]},
  "preflight_file": "$ESC_PRECHECK_FILE",
  "output_inventory": "$ESC_OUTPUT_INVENTORY",
  "run_log": "$ESC_RUN_LOG"
}
EOF

echo "Benchmark artifacts:"
echo "  $PRECHECK_FILE"
echo "  $RUN_LOG"
echo "  $OUTPUT_INVENTORY"
echo "  $SUMMARY_JSON"

exit "$RUN_EXIT_CODE"
