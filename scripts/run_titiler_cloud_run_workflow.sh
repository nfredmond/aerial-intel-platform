#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-}"
REF="${GITHUB_REF_NAME:-main}"
WORKFLOW="deploy-titiler-cloud-run.yml"
IMAGE_TAG=""
SMOKE_COG_URL=""
WATCH=1

usage() {
  cat <<'USAGE'
Usage: scripts/run_titiler_cloud_run_workflow.sh [--repo OWNER/REPO] [--ref BRANCH] [--image-tag TAG] [--smoke-cog-url URL] [--no-watch]

Checks the GitHub Actions variable and secret names required by the controlled
TiTiler Cloud Run deployment, dispatches the manual workflow, then watches the
run by default. No secret values are inspected or printed.
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
    --ref)
      REF="${2:-}"
      if [[ -z "$REF" ]]; then
        echo "--ref requires a branch or tag." >&2
        exit 2
      fi
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="${2:-}"
      if [[ -z "$IMAGE_TAG" ]]; then
        echo "--image-tag requires a non-empty tag." >&2
        exit 2
      fi
      shift 2
      ;;
    --smoke-cog-url)
      SMOKE_COG_URL="${2:-}"
      if [[ -z "$SMOKE_COG_URL" ]]; then
        echo "--smoke-cog-url requires a URL." >&2
        exit 2
      fi
      shift 2
      ;;
    --no-watch)
      WATCH=0
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
  echo "gh CLI is required to dispatch the TiTiler Cloud Run workflow." >&2
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI must be authenticated before dispatching the TiTiler Cloud Run workflow." >&2
  exit 2
fi

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

echo "Checking TiTiler Cloud Run deploy prerequisites for ${REPO}..."
scripts/check_titiler_deploy_prereqs.sh --repo "$REPO"

dispatch_args=(--repo "$REPO" --ref "$REF")
if [[ -n "$IMAGE_TAG" ]]; then
  dispatch_args+=(-f "image_tag=${IMAGE_TAG}")
fi
if [[ -n "$SMOKE_COG_URL" ]]; then
  dispatch_args+=(-f "smoke_cog_url=${SMOKE_COG_URL}")
fi

echo "Dispatching ${WORKFLOW} on ${REF}..."
dispatch_epoch="$(date -u +%s)"
gh workflow run "$WORKFLOW" "${dispatch_args[@]}"

echo "Waiting for the dispatched run to appear..."
sleep 5

run_json="$(gh run list \
  --workflow "$WORKFLOW" \
  --repo "$REPO" \
  --event workflow_dispatch \
  --limit 10 \
  --json createdAt,databaseId,url \
)"
run_fields="$(node -e '
const runs = JSON.parse(process.argv[1]);
const cutoff = Number(process.argv[2]) - 30;
const run = runs.find((candidate) => Date.parse(candidate.createdAt) / 1000 >= cutoff);
if (run) {
  console.log(run.databaseId);
  console.log(run.url);
}
' "$run_json" "$dispatch_epoch")"
run_id="$(printf '%s\n' "$run_fields" | sed -n '1p')"
run_url="$(printf '%s\n' "$run_fields" | sed -n '2p')"

if [[ -z "$run_id" ]]; then
  cat <<EOF
Workflow dispatch was accepted, but no workflow_dispatch run was found yet.
Open the workflow page to inspect it:
https://github.com/${REPO}/actions/workflows/${WORKFLOW}
EOF
  exit 0
fi

echo "TiTiler workflow run: ${run_url}"

if [[ "$WATCH" == "1" ]]; then
  gh run watch "$run_id" --repo "$REPO" --exit-status
else
  echo "Watch skipped. Re-run: gh run watch ${run_id} --repo ${REPO} --exit-status"
fi
