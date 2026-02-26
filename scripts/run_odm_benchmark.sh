#!/usr/bin/env bash

set -euo pipefail

json_escape() {
  echo "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

usage() {
  echo "Usage: $0 <dataset_root> <project_name>"
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: docker daemon is not reachable." >&2
  exit 1
fi

DATASET_ROOT="$1"
PROJECT_NAME="$2"

if [[ ! -d "$DATASET_ROOT" ]]; then
  echo "Error: dataset_root does not exist: $DATASET_ROOT" >&2
  exit 1
fi

if [[ ! -d "$DATASET_ROOT/images" ]]; then
  echo "Error: expected images folder at $DATASET_ROOT/images" >&2
  exit 1
fi

if [[ -z "$(find "$DATASET_ROOT/images" -type f | head -n 1)" ]]; then
  echo "Error: no image files found in $DATASET_ROOT/images" >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="benchmark/$TIMESTAMP"
RUN_LOG="$RUN_DIR/run.log"
SUMMARY_JSON="$RUN_DIR/summary.json"
START_EPOCH="$(date +%s)"
START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$RUN_DIR"

ODM_IMAGE="${ODM_IMAGE:-opendronemap/odm:latest}"
ODM_ARGS="${ODM_ARGS:---project-path /datasets ${PROJECT_NAME}}"

ABS_DATASET_ROOT="$(cd "$DATASET_ROOT" && pwd)"
IMAGE_COUNT="$(find "$DATASET_ROOT/images" -type f | wc -l | tr -d ' ')"
DOCKER_VERSION="$(docker --version)"
HOSTNAME_VALUE="$(hostname)"
ESC_START_UTC="$(json_escape "$START_UTC")"
ESC_DATASET_ROOT="$(json_escape "$ABS_DATASET_ROOT")"
ESC_PROJECT_NAME="$(json_escape "$PROJECT_NAME")"
ESC_ODM_IMAGE="$(json_escape "$ODM_IMAGE")"
ESC_ODM_ARGS="$(json_escape "$ODM_ARGS")"
ESC_DOCKER_VERSION="$(json_escape "$DOCKER_VERSION")"
ESC_HOSTNAME="$(json_escape "$HOSTNAME_VALUE")"

{
  echo "timestamp_utc=$START_UTC"
  echo "dataset_root=$ABS_DATASET_ROOT"
  echo "project_name=$PROJECT_NAME"
  echo "odm_image=$ODM_IMAGE"
  echo "odm_args=$ODM_ARGS"
  echo "docker_version=$DOCKER_VERSION"
  echo "host=$HOSTNAME_VALUE"
  echo "image_count=$IMAGE_COUNT"
  echo
  echo "Running ODM benchmark..."
  echo "Command: docker run --rm -v $ABS_DATASET_ROOT:/datasets $ODM_IMAGE $ODM_ARGS"
  echo
} | tee "$RUN_LOG"

set +e
docker run --rm -v "$ABS_DATASET_ROOT:/datasets" "$ODM_IMAGE" $ODM_ARGS 2>&1 | tee -a "$RUN_LOG"
RUN_EXIT_CODE="${PIPESTATUS[0]}"
set -e

END_EPOCH="$(date +%s)"
END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DURATION_SECONDS="$((END_EPOCH - START_EPOCH))"

STATUS="success"
if [[ "$RUN_EXIT_CODE" -ne 0 ]]; then
  STATUS="failed"
fi

{
  echo
  echo "run_exit_code=$RUN_EXIT_CODE"
  echo "status=$STATUS"
  echo "end_timestamp_utc=$END_UTC"
  echo "duration_seconds=$DURATION_SECONDS"
} | tee -a "$RUN_LOG"

cat >"$SUMMARY_JSON" <<EOF
{
  "timestamp_utc": "$ESC_START_UTC",
  "dataset_root": "$ESC_DATASET_ROOT",
  "project_name": "$ESC_PROJECT_NAME",
  "odm_image": "$ESC_ODM_IMAGE",
  "odm_args": "$ESC_ODM_ARGS",
  "docker_version": "$ESC_DOCKER_VERSION",
  "host": "$ESC_HOSTNAME",
  "image_count": $IMAGE_COUNT,
  "run_exit_code": $RUN_EXIT_CODE,
  "status": "$STATUS",
  "end_timestamp_utc": "$END_UTC",
  "duration_seconds": $DURATION_SECONDS,
  "run_log": "$RUN_LOG"
}
EOF

echo "Benchmark artifacts:"
echo "  $RUN_LOG"
echo "  $SUMMARY_JSON"

exit "$RUN_EXIT_CODE"
