#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-}"
WIF_POOL_ID="${TITILER_WIF_POOL_ID:-github-actions}"
WIF_PROVIDER_ID="${TITILER_WIF_PROVIDER_ID:-aerial-intel-platform}"
SERVICE_ACCOUNT_ID="${TITILER_DEPLOY_SERVICE_ACCOUNT_ID:-aerial-titiler-deployer}"
ASSUME_YES=0

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap_titiler_gcp_wif.sh [--repo OWNER/REPO] [--pool-id ID] [--provider-id ID] [--service-account-id ID] [--yes]

Bootstraps the controlled TiTiler Cloud Run deployment prerequisites in a real
GCP project, then writes the matching GitHub Actions variables and secrets.

This script performs GCP and GitHub writes. It requires an authenticated gcloud
session with permission to create Artifact Registry repositories, service
accounts, Workload Identity Federation resources, and IAM bindings.

Secret-designated GitHub values are piped to gh secret set through stdin and are
not accepted as command-line flags.
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
    --pool-id)
      WIF_POOL_ID="${2:-}"
      if [[ -z "$WIF_POOL_ID" ]]; then
        echo "--pool-id requires an id." >&2
        exit 2
      fi
      shift 2
      ;;
    --provider-id)
      WIF_PROVIDER_ID="${2:-}"
      if [[ -z "$WIF_PROVIDER_ID" ]]; then
        echo "--provider-id requires an id." >&2
        exit 2
      fi
      shift 2
      ;;
    --service-account-id)
      SERVICE_ACCOUNT_ID="${2:-}"
      if [[ -z "$SERVICE_ACCOUNT_ID" ]]; then
        echo "--service-account-id requires an id." >&2
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

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required to bootstrap TiTiler GCP prerequisites." >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to write GitHub Actions prerequisites." >&2
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI must be authenticated before writing repository variables or secrets." >&2
  exit 2
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  echo "gcloud must have an active authenticated account before bootstrapping." >&2
  exit 2
fi

if [[ ! -r /dev/tty ]]; then
  echo "This bootstrap helper requires an interactive terminal for local prompts." >&2
  exit 2
fi

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

declare -A variable_values=()

prompt_variable() {
  local name="$1"
  local guidance="$2"
  local value="${3:-}"

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

validate_id() {
  local name="$1"
  local value="$2"
  local pattern="$3"
  local message="$4"

  if ! [[ "$value" =~ $pattern ]]; then
    echo "${name} is invalid: ${message}" >&2
    exit 2
  fi
}

validate_static_ids() {
  validate_id "WIF pool id" "$WIF_POOL_ID" '^[a-z][a-z0-9-]{3,31}$' \
    "use 4-32 lowercase letters, numbers, or hyphens, starting with a letter"
  validate_id "WIF provider id" "$WIF_PROVIDER_ID" '^[a-z][a-z0-9-]{3,31}$' \
    "use 4-32 lowercase letters, numbers, or hyphens, starting with a letter"
  validate_id "service account id" "$SERVICE_ACCOUNT_ID" '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' \
    "use 6-30 lowercase letters, numbers, or hyphens, starting with a letter and ending with a letter or number"
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
  validate_static_ids
}

ensure_apis() {
  echo "Enabling required GCP APIs..."
  gcloud services enable \
    artifactregistry.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    run.googleapis.com \
    sts.googleapis.com \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --quiet >/dev/null
}

ensure_artifact_repository() {
  if gcloud artifacts repositories describe "${variable_values[GCP_ARTIFACT_REPOSITORY]}" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location "${variable_values[GCP_REGION]}" >/dev/null 2>&1; then
    echo "Artifact Registry repository already exists."
    return
  fi

  echo "Creating Artifact Registry Docker repository..."
  gcloud artifacts repositories create "${variable_values[GCP_ARTIFACT_REPOSITORY]}" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location "${variable_values[GCP_REGION]}" \
    --repository-format docker \
    --description "Aerial Intel TiTiler images" \
    --quiet >/dev/null
}

ensure_service_account() {
  local email="$1"

  if gcloud iam service-accounts describe "$email" \
    --project "${variable_values[GCP_PROJECT_ID]}" >/dev/null 2>&1; then
    echo "Deploy service account already exists."
    return
  fi

  echo "Creating deploy service account..."
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --display-name "Aerial TiTiler deployer" \
    --quiet >/dev/null
}

ensure_project_iam_binding() {
  local member="$1"
  local role="$2"

  echo "Ensuring project IAM role ${role}..."
  gcloud projects add-iam-policy-binding "${variable_values[GCP_PROJECT_ID]}" \
    --member "$member" \
    --role "$role" \
    --condition=None \
    --quiet >/dev/null
}

ensure_artifact_iam_binding() {
  local member="$1"

  echo "Ensuring Artifact Registry writer role..."
  gcloud artifacts repositories add-iam-policy-binding "${variable_values[GCP_ARTIFACT_REPOSITORY]}" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location "${variable_values[GCP_REGION]}" \
    --member "$member" \
    --role roles/artifactregistry.writer \
    --quiet >/dev/null
}

ensure_wif_pool() {
  if gcloud iam workload-identity-pools describe "$WIF_POOL_ID" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location global >/dev/null 2>&1; then
    echo "Workload Identity pool already exists."
    return
  fi

  echo "Creating Workload Identity pool..."
  gcloud iam workload-identity-pools create "$WIF_POOL_ID" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location global \
    --display-name "GitHub Actions" \
    --quiet >/dev/null
}

ensure_wif_provider() {
  if gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_ID" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location global \
    --workload-identity-pool "$WIF_POOL_ID" >/dev/null 2>&1; then
    echo "Workload Identity provider already exists."
    return
  fi

  echo "Creating GitHub OIDC Workload Identity provider..."
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER_ID" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --location global \
    --workload-identity-pool "$WIF_POOL_ID" \
    --display-name "Aerial Intel Platform GitHub" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '${REPO}'" \
    --quiet >/dev/null
}

ensure_wif_binding() {
  local service_account_email="$1"
  local project_number="$2"
  local member="principalSet://iam.googleapis.com/projects/${project_number}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${REPO}"

  echo "Ensuring Workload Identity service-account binding..."
  gcloud iam service-accounts add-iam-policy-binding "$service_account_email" \
    --project "${variable_values[GCP_PROJECT_ID]}" \
    --member "$member" \
    --role roles/iam.workloadIdentityUser \
    --quiet >/dev/null
}

write_github_variable() {
  local name="$1"
  echo "Writing GitHub Actions variable ${name}..."
  printf '%s' "${variable_values[$name]}" | gh variable set "$name" --repo "$REPO" >/dev/null
}

write_github_secret_value() {
  local name="$1"
  local value="$2"
  echo "Writing GitHub Actions secret ${name}..."
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" >/dev/null
}

printf 'Bootstrapping controlled TiTiler Cloud Run prerequisites for %s.\n' "$REPO"
printf 'Do not paste secret-designated values into chat. This script writes them directly through gh.\n'

prompt_variable "GCP_PROJECT_ID" \
  "GCP project id for the Nat Ford controlled TiTiler service."
prompt_variable "GCP_REGION" \
  "GCP region for Artifact Registry and Cloud Run, for example us-central1."
prompt_variable "GCP_ARTIFACT_REPOSITORY" \
  "Artifact Registry Docker repository id to create or reuse for the TiTiler image."
prompt_variable "GCP_CLOUD_RUN_SERVICE" \
  "Cloud Run service id for the TiTiler service."
prompt_variable "TITILER_CORS_ORIGINS" \
  "Comma-separated exact HTTPS app origins allowed to fetch tiles, with no wildcards, paths, queries, localhost, or spaces."

printf '\nValidating inputs before any GCP or GitHub writes...\n'
validate_inputs

PROJECT_NUMBER="$(gcloud projects describe "${variable_values[GCP_PROJECT_ID]}" --format='value(projectNumber)')"
if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "Unable to resolve GCP project number." >&2
  exit 2
fi

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${variable_values[GCP_PROJECT_ID]}.iam.gserviceaccount.com"
WIF_PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/providers/${WIF_PROVIDER_ID}"

if [[ "$ASSUME_YES" != "1" ]]; then
  cat > /dev/tty <<EOF

This will modify GCP project ${variable_values[GCP_PROJECT_ID]} and GitHub repo ${REPO}:
- enable required Cloud Run, Artifact Registry, IAM, IAM Credentials, and STS APIs
- create or reuse the Artifact Registry Docker repository
- create or reuse the deploy service account
- create or reuse the GitHub OIDC Workload Identity pool/provider
- grant deploy roles needed by the TiTiler workflow
- write required GitHub Actions variables and secret-designated values

Type yes to continue: 
EOF
  IFS= read -r confirmation < /dev/tty
  if [[ "$confirmation" != "yes" ]]; then
    echo "Aborted before GCP or GitHub writes." >&2
    exit 1
  fi
fi

gcloud config set project "${variable_values[GCP_PROJECT_ID]}" >/dev/null
ensure_apis
ensure_artifact_repository
ensure_service_account "$SERVICE_ACCOUNT_EMAIL"
ensure_artifact_iam_binding "serviceAccount:${SERVICE_ACCOUNT_EMAIL}"
ensure_project_iam_binding "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" roles/run.admin
ensure_project_iam_binding "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" roles/iam.serviceAccountUser
ensure_wif_pool
ensure_wif_provider
ensure_wif_binding "$SERVICE_ACCOUNT_EMAIL" "$PROJECT_NUMBER"

for name in \
  GCP_PROJECT_ID \
  GCP_REGION \
  GCP_ARTIFACT_REPOSITORY \
  GCP_CLOUD_RUN_SERVICE \
  TITILER_CORS_ORIGINS; do
  write_github_variable "$name"
done

write_github_secret_value GCP_WORKLOAD_IDENTITY_PROVIDER "$WIF_PROVIDER_RESOURCE"
write_github_secret_value GCP_SERVICE_ACCOUNT "$SERVICE_ACCOUNT_EMAIL"

printf '\nRechecking repository prerequisites by name...\n'
scripts/check_titiler_deploy_prereqs.sh --repo "$REPO"

cat <<EOF
TiTiler GCP and GitHub Actions prerequisites are bootstrapped for ${REPO}.
Next: scripts/run_titiler_cloud_run_workflow.sh --repo ${REPO}
EOF
