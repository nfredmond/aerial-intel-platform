#!/usr/bin/env bash
# Provision the shared bearer tokens for the natford-aerial-processing.v1
# contract between this platform (the processing worker) and OpenPlan (the
# consumer). Generates the two secrets and prints exactly where each one goes;
# it never writes to any environment itself.
#
# Token pairing (each secret lives in BOTH apps under different names):
#   request direction  (OpenPlan -> Aerial):
#     aerial:   AERIAL_EXTERNAL_PROCESSING_TOKEN
#     openplan: OPENPLAN_AERIAL_PROCESSING_WORKER_TOKEN
#   callback direction (Aerial -> OpenPlan):
#     aerial:   AERIAL_PROCESSING_CALLBACK_TOKEN
#     openplan: OPENPLAN_AERIAL_PROCESSING_CALLBACK_BEARER_TOKEN
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl is required to generate tokens" >&2
  exit 1
fi

REQUEST_TOKEN="$(openssl rand -hex 32)"
CALLBACK_TOKEN="$(openssl rand -hex 32)"

cat <<SUMMARY
Generated two fresh 256-bit tokens for the OpenPlan <-> Aerial integration.
Run the commands below once per environment (values are read from stdin so
they stay out of shell history beyond this session).

── Aerial Intel Platform (this repo, Vercel project aerial-intel-platform) ──
  printf '%s' '${REQUEST_TOKEN}' | vercel env add AERIAL_EXTERNAL_PROCESSING_TOKEN production
  printf '%s' '${CALLBACK_TOKEN}' | vercel env add AERIAL_PROCESSING_CALLBACK_TOKEN production
  # Also required (org that owns external missions/jobs; must match a drone_orgs.slug):
  vercel env add AERIAL_EXTERNAL_PROCESSING_ORG_SLUG production

── OpenPlan (repo ~/code/openplan, its own Vercel project) ──
  printf '%s' '${REQUEST_TOKEN}' | vercel env add OPENPLAN_AERIAL_PROCESSING_WORKER_TOKEN production
  printf '%s' '${CALLBACK_TOKEN}' | vercel env add OPENPLAN_AERIAL_PROCESSING_CALLBACK_BEARER_TOKEN production
  # Also required:
  #   OPENPLAN_AERIAL_PROCESSING_WORKER_URL   = base URL of the deployed Aerial Intel Platform
  #   OPENPLAN_AERIAL_PROCESSING_CALLBACK_URL = public base origin of the OpenPlan deployment

── Local development (.env.local on each side) ──
  aerial   web/.env.local:
    AERIAL_EXTERNAL_PROCESSING_TOKEN=${REQUEST_TOKEN}
    AERIAL_PROCESSING_CALLBACK_TOKEN=${CALLBACK_TOKEN}
  openplan openplan/.env.local:
    OPENPLAN_AERIAL_PROCESSING_WORKER_TOKEN=${REQUEST_TOKEN}
    OPENPLAN_AERIAL_PROCESSING_CALLBACK_BEARER_TOKEN=${CALLBACK_TOKEN}

Rotation: re-run this script and update all four names; the endpoint and the
callback route each compare a single configured value, so rotate one direction
at a time to avoid downtime.
SUMMARY
