#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-}"
ASSUME_YES=0

usage() {
  cat <<'USAGE'
Usage: scripts/configure_titiler_github_actions_prereqs.sh [--repo OWNER/REPO] [--yes]

Prompts locally for the GitHub Actions variables and secrets required by the
controlled TiTiler Cloud Run workflow, validates the non-secret values with the
same prereq checker used by CI/deploy, then writes them to the repository with
the gh CLI.

Secret values are entered through hidden local prompts, are never accepted as
command-line flags, and are piped to gh through stdin rather than argv.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      if [[ -z "$REPO" ]]; then
        echo "--repo requires OWNER/REPO." >&2
        exit 2
      fi
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to configure TiTiler GitHub Actions prerequisites." >&2
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI must be authenticated before writing repository variables or secrets." >&2
  exit 2
fi

if [[ ! -r /dev/tty ]]; then
  echo "This setup helper requires an interactive terminal for local prompts." >&2
  exit 2
fi

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

required_vars=(
  GCP_PROJECT_ID
  GCP_REGION
  GCP_ARTIFACT_REPOSITORY
  GCP_CLOUD_RUN_SERVICE
  TITILER_CORS_ORIGINS
)

required_secrets=(
  GCP_WORKLOAD_IDENTITY_PROVIDER
  GCP_SERVICE_ACCOUNT
)

declare -A variable_values=()
declare -A secret_values=()

prompt_variable() {
  local name="$1"
  local guidance="$2"
  local value=""

  while [[ -z "$value" ]]; do
    printf '\n%s\n' "$guidance" > /dev/tty
    printf '%s: ' "$name" > /dev/tty
    IFS= read -r value < /dev/tty
    if [[ -z "$value" ]]; then
      printf '%s is required.\n' "$name" > /dev/tty
    fi
  done

  variable_values["$name"]="$value"
}

prompt_secret() {
  local name="$1"
  local guidance="$2"
  local value=""

  while [[ -z "$value" ]]; do
    printf '\n%s\n' "$guidance" > /dev/tty
    printf '%s (input hidden): ' "$name" > /dev/tty
    IFS= read -r -s value < /dev/tty
    printf '\n' > /dev/tty
    if [[ -z "$value" ]]; then
      printf '%s is required.\n' "$name" > /dev/tty
    fi
  done

  secret_values["$name"]="$value"
}

validate_inputs() {
  GCP_PROJECT_ID="${variable_values[GCP_PROJECT_ID]}" \
  GCP_REGION="${variable_values[GCP_REGION]}" \
  GCP_ARTIFACT_REPOSITORY="${variable_values[GCP_ARTIFACT_REPOSITORY]}" \
  GCP_CLOUD_RUN_SERVICE="${variable_values[GCP_CLOUD_RUN_SERVICE]}" \
  TITILER_CORS_ORIGINS="${variable_values[TITILER_CORS_ORIGINS]}" \
  GCP_WORKLOAD_IDENTITY_PROVIDER="configured" \
  GCP_SERVICE_ACCOUNT="configured" \
    scripts/check_titiler_deploy_prereqs.sh --env
}

write_variable() {
  local name="$1"
  printf 'Writing GitHub Actions variable %s...\n' "$name"
  printf '%s' "${variable_values[$name]}" | gh variable set "$name" --repo "$REPO" >/dev/null
}

write_secret() {
  local name="$1"
  printf 'Writing GitHub Actions secret %s...\n' "$name"
  printf '%s' "${secret_values[$name]}" | gh secret set "$name" --repo "$REPO" >/dev/null
}

printf 'Configuring controlled TiTiler Cloud Run prerequisites for %s.\n' "$REPO"
printf 'Do not paste these values into chat. Enter them only in this local terminal.\n'

prompt_variable "GCP_PROJECT_ID" \
  "GCP project id for the Nat Ford controlled TiTiler service; it must be the real lowercase project id."
prompt_variable "GCP_REGION" \
  "GCP region for Artifact Registry and Cloud Run, for example us-central1."
prompt_variable "GCP_ARTIFACT_REPOSITORY" \
  "Artifact Registry Docker repository id for the TiTiler image."
prompt_variable "GCP_CLOUD_RUN_SERVICE" \
  "Cloud Run service id for the TiTiler service."
prompt_variable "TITILER_CORS_ORIGINS" \
  "Comma-separated exact HTTPS app origins allowed to fetch tiles, with no wildcards, paths, queries, localhost, or spaces."

prompt_secret "GCP_WORKLOAD_IDENTITY_PROVIDER" \
  "GitHub Actions Workload Identity Provider resource name."
prompt_secret "GCP_SERVICE_ACCOUNT" \
  "GCP service account used by the deploy workflow."

printf '\nValidating non-secret values before writing to GitHub...\n'
validate_inputs

if [[ "$ASSUME_YES" != "1" ]]; then
  printf '\nThis will write %s variables and %s secrets to %s.\n' \
    "${#required_vars[@]}" "${#required_secrets[@]}" "$REPO" > /dev/tty
  printf 'Type yes to continue: ' > /dev/tty
  IFS= read -r confirmation < /dev/tty
  if [[ "$confirmation" != "yes" ]]; then
    echo "Aborted before writing GitHub Actions configuration." >&2
    exit 1
  fi
fi

for name in "${required_vars[@]}"; do
  write_variable "$name"
done

for name in "${required_secrets[@]}"; do
  write_secret "$name"
  secret_values["$name"]=""
done

printf '\nRechecking repository prerequisites by name...\n'
scripts/check_titiler_deploy_prereqs.sh --repo "$REPO"

cat <<EOF
TiTiler GitHub Actions prerequisites are configured for ${REPO}.
Next: scripts/run_titiler_cloud_run_workflow.sh --repo ${REPO}
EOF
