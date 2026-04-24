#!/usr/bin/env bash
set -euo pipefail

SCOPE="${VERCEL_SCOPE:-natford}"
ENVIRONMENT="${VERCEL_ENVIRONMENT:-production}"
COG_URL="https://raw.githubusercontent.com/cogeotiff/rio-tiler/master/tests/fixtures/cog.tif"
TITILER_URL="${AERIAL_TITILER_URL:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/configure_vercel_titiler_url.sh URL [--scope natford] [--environment production] [--cog-url URL]

Smokes a controlled TiTiler endpoint, then writes AERIAL_TITILER_URL to the
linked Vercel project. Production rejects localhost, titiler.xyz, and plain HTTP
URLs before any smoke test or Vercel write.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --cog-url)
      COG_URL="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "$TITILER_URL" ]]; then
        echo "TiTiler URL was provided more than once." >&2
        exit 2
      fi
      TITILER_URL="$1"
      shift
      ;;
  esac
done

if [[ -z "$TITILER_URL" ]]; then
  echo "TiTiler URL is required." >&2
  usage >&2
  exit 2
fi

if [[ -z "$SCOPE" || -z "$ENVIRONMENT" ]]; then
  echo "--scope and --environment must be non-empty." >&2
  exit 2
fi

if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "preview" && "$ENVIRONMENT" != "development" ]]; then
  echo "environment must be production, preview, or development: ${ENVIRONMENT}" >&2
  exit 2
fi

TITILER_URL="${TITILER_URL%/}"

node -e '
const [raw, environment] = process.argv.slice(1);
let url;
try {
  url = new URL(raw);
} catch {
  console.error(`AERIAL_TITILER_URL must be an absolute URL: ${raw}`);
  process.exit(2);
}

if (!["http:", "https:"].includes(url.protocol)) {
  console.error(`AERIAL_TITILER_URL must use http or https: ${raw}`);
  process.exit(2);
}

if (environment === "production") {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") {
    console.error(`production AERIAL_TITILER_URL must use https: ${raw}`);
    process.exit(1);
  }
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    console.error(`production AERIAL_TITILER_URL cannot be localhost: ${raw}`);
    process.exit(1);
  }
  if (host === "titiler.xyz" || host.endsWith(".titiler.xyz")) {
    console.error(`production AERIAL_TITILER_URL cannot use public demo TiTiler: ${raw}`);
    process.exit(1);
  }
}
' "$TITILER_URL" "$ENVIRONMENT"

echo "Smoking TiTiler endpoint before writing Vercel env..."
AERIAL_TITILER_URL="$TITILER_URL" scripts/smoke_titiler.sh "$COG_URL"

(
  cd web
  vercel env add AERIAL_TITILER_URL "$ENVIRONMENT" \
    --scope "$SCOPE" \
    --value "$TITILER_URL" \
    --force \
    --yes
)

if [[ "$ENVIRONMENT" == "production" ]]; then
  node scripts/check_vercel_production_env_names.mjs --scope "$SCOPE"
fi

cat <<EOF
AERIAL_TITILER_URL configured for Vercel ${ENVIRONMENT}.
Redeploy the target environment so the runtime receives the new value.
EOF
