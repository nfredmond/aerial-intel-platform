#!/usr/bin/env bash
set -euo pipefail

MODE="github"
REPO="${GITHUB_REPOSITORY:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/check_titiler_deploy_prereqs.sh [--env] [--repo OWNER/REPO]

Checks whether the controlled TiTiler Cloud Run deployment has the required
configuration. Default mode reads GitHub Actions variable and secret names via
the gh CLI. --env mode checks the current process environment, which is useful
inside GitHub Actions before auth/deploy steps run.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      MODE="env"
      shift
      ;;
    --repo)
      REPO="${2:-}"
      if [[ -z "$REPO" ]]; then
        echo "--repo requires OWNER/REPO." >&2
        exit 2
      fi
      shift 2
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

missing_vars=()
missing_secrets=()

has_line() {
  local needle="$1"
  local haystack="$2"
  grep -Fxq "$needle" <<<"$haystack"
}

check_env() {
  local name
  for name in "${required_vars[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      missing_vars+=("$name")
    fi
  done

  for name in "${required_secrets[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      missing_secrets+=("$name")
    fi
  done
}

check_github_repo() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required for GitHub repository prereq checks." >&2
    exit 2
  fi

  if [[ -z "$REPO" ]]; then
    REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  fi

  local variable_names
  local secret_names
  variable_names="$(gh variable list --repo "$REPO" --json name --jq '.[].name')"
  secret_names="$(gh secret list --repo "$REPO" --json name --jq '.[].name')"

  local name
  for name in "${required_vars[@]}"; do
    if ! has_line "$name" "$variable_names"; then
      missing_vars+=("$name")
    fi
  done

  for name in "${required_secrets[@]}"; do
    if ! has_line "$name" "$secret_names"; then
      missing_secrets+=("$name")
    fi
  done
}

if [[ "$MODE" == "env" ]]; then
  check_env
else
  check_github_repo
fi

if (( ${#missing_vars[@]} > 0 || ${#missing_secrets[@]} > 0 )); then
  echo "TiTiler Cloud Run deploy prerequisites are incomplete." >&2

  if (( ${#missing_vars[@]} > 0 )); then
    echo "Missing GitHub Actions variables:" >&2
    printf '  - %s\n' "${missing_vars[@]}" >&2
  fi

  if (( ${#missing_secrets[@]} > 0 )); then
    echo "Missing GitHub Actions secrets:" >&2
    printf '  - %s\n' "${missing_secrets[@]}" >&2
  fi

  echo "No secret values were inspected or printed." >&2
  exit 1
fi

if [[ "$MODE" == "env" ]]; then
  echo "TiTiler Cloud Run deploy prerequisites ok in environment."
else
  echo "TiTiler Cloud Run deploy prerequisites ok for ${REPO}."
fi
