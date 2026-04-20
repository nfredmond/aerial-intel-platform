#!/usr/bin/env bash
set -euo pipefail

TARGET="${AERIAL_RELEASE_TARGET:-preview}"
FAILURES=0

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing: ${name}" >&2
    FAILURES=$((FAILURES + 1))
  else
    echo "ok: ${name}"
  fi
}

require_env NEXT_PUBLIC_SUPABASE_URL
require_env NEXT_PUBLIC_SUPABASE_ANON_KEY
require_env SUPABASE_SERVICE_ROLE_KEY
require_env AERIAL_TITILER_URL

if [[ "${AERIAL_COPILOT_ENABLED:-false}" == "true" ]]; then
  if [[ -z "${AI_GATEWAY_API_KEY:-}" && -z "${VERCEL_OIDC_TOKEN:-}" ]]; then
    echo "missing: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN while AERIAL_COPILOT_ENABLED=true" >&2
    FAILURES=$((FAILURES + 1))
  else
    echo "ok: AI gateway credential present"
  fi
fi

if [[ "$TARGET" == "production" ]]; then
  if [[ "${AERIAL_TITILER_URL:-}" == *"titiler.xyz"* ]]; then
    echo "production cannot use public demo TiTiler endpoint: ${AERIAL_TITILER_URL}" >&2
    FAILURES=$((FAILURES + 1))
  fi
  if [[ "${AERIAL_TITILER_URL:-}" == http://localhost* ]]; then
    echo "production cannot use localhost TiTiler endpoint: ${AERIAL_TITILER_URL}" >&2
    FAILURES=$((FAILURES + 1))
  fi
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "release readiness failed: ${FAILURES} issue(s)" >&2
  exit 1
fi

echo "release readiness ok for target=${TARGET}"
