#!/usr/bin/env bash
set -euo pipefail

MODE="github"
REPO="${GITHUB_REPOSITORY:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/check_titiler_deploy_prereqs.sh [--env] [--repo OWNER/REPO]

Checks whether the controlled TiTiler Cloud Run deployment has the required
configuration. Default mode reads GitHub Actions variable names, non-secret
variable values, and secret names via the gh CLI. --env mode checks the current
process environment, which is useful inside GitHub Actions before auth/deploy
steps run. Secret values are never inspected or printed.
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
invalid_vars=()

declare -A variable_values=()

has_line() {
  local needle="$1"
  local haystack="$2"
  grep -Fxq "$needle" <<<"$haystack"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

mark_invalid() {
  invalid_vars+=("$1: $2")
}

validate_no_outer_whitespace() {
  local name="$1"
  local value="$2"
  local trimmed
  trimmed="$(trim "$value")"

  if [[ "$value" != "$trimmed" ]]; then
    mark_invalid "$name" "must not contain leading or trailing whitespace"
  fi
}

validate_cors_origins() {
  local raw="$1"
  local origin
  local trimmed_origin
  local host_port
  local host

  if [[ "$raw" == *"*"* ]]; then
    mark_invalid TITILER_CORS_ORIGINS "must list exact HTTPS origins; wildcard origins are not allowed"
    return
  fi

  IFS=',' read -ra origins <<<"$raw"
  for origin in "${origins[@]}"; do
    trimmed_origin="$(trim "$origin")"
    if [[ -z "$trimmed_origin" ]]; then
      mark_invalid TITILER_CORS_ORIGINS "contains an empty origin"
      continue
    fi

    if ! [[ "$trimmed_origin" =~ ^https://[^/?#]+$ ]]; then
      mark_invalid TITILER_CORS_ORIGINS "origin must be an exact HTTPS origin without path/query: ${trimmed_origin}"
      continue
    fi

    host_port="${trimmed_origin#https://}"
    host="${host_port%%:*}"
    host="${host,,}"
    if [[ "$host" == "localhost" || "$host" == "127.0.0.1" || "$host" == *.local ]]; then
      mark_invalid TITILER_CORS_ORIGINS "production Cloud Run CORS cannot target localhost or .local origins"
    fi
  done
}

validate_variable_values() {
  local name
  local value

  for name in "${required_vars[@]}"; do
    value="${variable_values[$name]:-}"
    if [[ -z "$value" ]]; then
      continue
    fi

    validate_no_outer_whitespace "$name" "$value"

    case "$name" in
      GCP_PROJECT_ID)
        if ! [[ "$value" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
          mark_invalid "$name" "must look like a GCP project id: 6-30 lowercase letters, numbers, or hyphens; start with a letter and end with a letter/number"
        fi
        ;;
      GCP_REGION)
        if ! [[ "$value" =~ ^[a-z]+(-[a-z]+)+[0-9]$ ]]; then
          mark_invalid "$name" "must look like a GCP region, for example us-central1"
        fi
        ;;
      GCP_ARTIFACT_REPOSITORY)
        if ! [[ "$value" =~ ^[a-z][a-z0-9._-]{0,62}$ ]]; then
          mark_invalid "$name" "must be a lowercase Artifact Registry repository id"
        fi
        ;;
      GCP_CLOUD_RUN_SERVICE)
        if ! [[ "$value" =~ ^[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]]; then
          mark_invalid "$name" "must be a Cloud Run service id using lowercase letters, numbers, and hyphens"
        fi
        ;;
      TITILER_CORS_ORIGINS)
        validate_cors_origins "$value"
        ;;
    esac
  done
}

check_env() {
  local name
  for name in "${required_vars[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      missing_vars+=("$name")
    else
      variable_values["$name"]="${!name}"
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
  local variable_rows
  local secret_names
  variable_rows="$(gh variable list --repo "$REPO" --json name,value --jq '.[] | "\(.name)=\(.value)"')"
  variable_names="$(cut -d= -f1 <<<"$variable_rows")"
  secret_names="$(gh secret list --repo "$REPO" --json name --jq '.[].name')"

  local name
  local row
  local variable_name
  local variable_value
  for name in "${required_vars[@]}"; do
    if ! has_line "$name" "$variable_names"; then
      missing_vars+=("$name")
    fi
  done

  while IFS= read -r row; do
    if [[ -z "$row" ]]; then
      continue
    fi

    variable_name="${row%%=*}"
    variable_value="${row#*=}"
    variable_values["$variable_name"]="$variable_value"
  done <<<"$variable_rows"

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

validate_variable_values

if (( ${#missing_vars[@]} > 0 || ${#missing_secrets[@]} > 0 || ${#invalid_vars[@]} > 0 )); then
  echo "TiTiler Cloud Run deploy prerequisites are incomplete." >&2

  if (( ${#missing_vars[@]} > 0 )); then
    echo "Missing GitHub Actions variables:" >&2
    printf '  - %s\n' "${missing_vars[@]}" >&2
  fi

  if (( ${#missing_secrets[@]} > 0 )); then
    echo "Missing GitHub Actions secrets:" >&2
    printf '  - %s\n' "${missing_secrets[@]}" >&2
  fi

  if (( ${#invalid_vars[@]} > 0 )); then
    echo "Invalid GitHub Actions variable values:" >&2
    printf '  - %s\n' "${invalid_vars[@]}" >&2
  fi

  echo "No secret values were inspected or printed." >&2
  exit 1
fi

if [[ "$MODE" == "env" ]]; then
  echo "TiTiler Cloud Run deploy prerequisites ok in environment."
else
  echo "TiTiler Cloud Run deploy prerequisites ok for ${REPO}."
fi
