#!/usr/bin/env bash
set -euo pipefail

TARGET="${AERIAL_RELEASE_TARGET:-preview}"
FAILURES=0
COPILOT_ENABLED=false

parse_bool() {
  local name="$1"
  local raw="${!name:-}"
  local lower
  if [[ -z "$raw" ]]; then
    return
  fi
  lower="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    1|true|yes)
      COPILOT_ENABLED=true
      ;;
    0|false|no)
      COPILOT_ENABLED=false
      ;;
    *)
      echo "invalid boolean for ${name}: ${raw:-<empty>}" >&2
      FAILURES=$((FAILURES + 1))
      COPILOT_ENABLED=false
      ;;
  esac
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing: ${name}" >&2
    FAILURES=$((FAILURES + 1))
  else
    echo "ok: ${name}"
  fi
}

require_non_negative_int() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "missing: ${name}" >&2
    FAILURES=$((FAILURES + 1))
  elif [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "invalid integer: ${name}=${value}" >&2
    FAILURES=$((FAILURES + 1))
  else
    echo "ok: ${name}"
  fi
}

if [[ "$TARGET" != "preview" && "$TARGET" != "production" && "$TARGET" != "development" ]]; then
  echo "invalid AERIAL_RELEASE_TARGET: ${TARGET}" >&2
  FAILURES=$((FAILURES + 1))
fi

require_env NEXT_PUBLIC_SUPABASE_URL
require_env NEXT_PUBLIC_SUPABASE_ANON_KEY
require_env SUPABASE_SERVICE_ROLE_KEY
require_env CRON_SECRET
require_env AERIAL_TITILER_URL
require_env AERIAL_COPILOT_ENABLED
require_non_negative_int AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS

parse_bool AERIAL_COPILOT_ENABLED

if [[ "$COPILOT_ENABLED" == "true" ]]; then
  if [[ -z "${AI_GATEWAY_API_KEY:-}" && -z "${VERCEL_OIDC_TOKEN:-}" ]]; then
    echo "missing: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN while AERIAL_COPILOT_ENABLED=true" >&2
    FAILURES=$((FAILURES + 1))
  else
    echo "ok: AI gateway credential present"
  fi
fi

if [[ "$TARGET" == "production" ]]; then
  if [[ "${NEXT_PUBLIC_SUPABASE_URL:-}" == *"example.supabase.co"* ]]; then
    echo "production cannot use example Supabase URL: ${NEXT_PUBLIC_SUPABASE_URL}" >&2
    FAILURES=$((FAILURES + 1))
  fi
  if [[ "${AERIAL_TITILER_URL:-}" == *"titiler.xyz"* ]]; then
    echo "production cannot use public demo TiTiler endpoint: ${AERIAL_TITILER_URL}" >&2
    FAILURES=$((FAILURES + 1))
  fi
  if [[ "${AERIAL_TITILER_URL:-}" == http://localhost* || "${AERIAL_TITILER_URL:-}" == http://127.0.0.1* ]]; then
    echo "production cannot use localhost TiTiler endpoint: ${AERIAL_TITILER_URL}" >&2
    FAILURES=$((FAILURES + 1))
  fi
  if [[ "${AERIAL_TITILER_URL:-}" == http://* ]]; then
    echo "production TiTiler endpoint must use https: ${AERIAL_TITILER_URL}" >&2
    FAILURES=$((FAILURES + 1))
  fi
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "release readiness failed: ${FAILURES} issue(s)" >&2
  exit 1
fi

echo "release readiness ok for target=${TARGET}"
