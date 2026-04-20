#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "${name} is required." >&2
    exit 2
  fi
}

require_env GCP_PROJECT_ID
require_env GCP_REGION
require_env GCP_ARTIFACT_REPOSITORY
require_env GCP_CLOUD_RUN_SERVICE
require_env TITILER_CORS_ORIGINS

TITILER_IMAGE_TAG="${TITILER_IMAGE_TAG:-$(git rev-parse --short HEAD)}"
TITILER_BASE_IMAGE="${TITILER_BASE_IMAGE:-ghcr.io/developmentseed/titiler:latest}"
REGISTRY_HOST="${GCP_REGION}-docker.pkg.dev"
IMAGE_URI="${REGISTRY_HOST}/${GCP_PROJECT_ID}/${GCP_ARTIFACT_REPOSITORY}/aerial-titiler:${TITILER_IMAGE_TAG}"

gcloud config set project "$GCP_PROJECT_ID" >/dev/null
gcloud auth configure-docker "$REGISTRY_HOST" --quiet

docker build \
  --build-arg "TITILER_IMAGE=${TITILER_BASE_IMAGE}" \
  -t "$IMAGE_URI" \
  infra/titiler
docker push "$IMAGE_URI"

gcloud run deploy "$GCP_CLOUD_RUN_SERVICE" \
  --image "$IMAGE_URI" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 2 \
  --memory 2Gi \
  --concurrency 40 \
  --timeout 60s \
  --set-env-vars "^|^PORT=8080|HOST=0.0.0.0|MOSAIC_ENDPOINT_ENABLED=FALSE|CORS_ORIGINS=${TITILER_CORS_ORIGINS}"

SERVICE_URL="$(gcloud run services describe "$GCP_CLOUD_RUN_SERVICE" \
  --region "$GCP_REGION" \
  --format 'value(status.url)')"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "image_uri=${IMAGE_URI}"
    echo "service_url=${SERVICE_URL}"
  } >> "$GITHUB_OUTPUT"
fi

echo "deployed image=${IMAGE_URI}"
echo "service_url=${SERVICE_URL}"
