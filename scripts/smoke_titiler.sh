#!/usr/bin/env bash
set -euo pipefail

TITILER_URL="${AERIAL_TITILER_URL:-}"
COG_URL="${1:-https://raw.githubusercontent.com/cogeotiff/rio-tiler/master/tests/fixtures/cog.tif}"

if [[ -z "$TITILER_URL" ]]; then
  echo "AERIAL_TITILER_URL is required." >&2
  exit 2
fi

TITILER_URL="${TITILER_URL%/}"
ENCODED_COG_URL="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$COG_URL")"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TILEJSON_PATH="$TMP_DIR/tilejson.json"
TILE_PATH="$TMP_DIR/tile.png"

curl -fsS \
  "${TITILER_URL}/cog/WebMercatorQuad/tilejson.json?url=${ENCODED_COG_URL}" \
  -o "$TILEJSON_PATH"

node -e '
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(data.bounds) || data.bounds.length !== 4) {
  throw new Error("tilejson bounds missing");
}
if (!Array.isArray(data.tiles) || data.tiles.length === 0) {
  throw new Error("tilejson tiles missing");
}
console.log(`tilejson bounds=${data.bounds.join(",")}`);
' "$TILEJSON_PATH"

CONTENT_TYPE="$(curl -fsS \
  -w "%{content_type}" \
  "${TITILER_URL}/cog/tiles/WebMercatorQuad/2/1/1.png?url=${ENCODED_COG_URL}" \
  -o "$TILE_PATH")"

if [[ "$CONTENT_TYPE" != image/png* ]]; then
  echo "Expected image/png tile, got: ${CONTENT_TYPE}" >&2
  exit 1
fi

BYTES="$(wc -c < "$TILE_PATH" | tr -d ' ')"
if [[ "$BYTES" -le 0 ]]; then
  echo "Tile response was empty." >&2
  exit 1
fi

echo "titiler smoke ok: ${TITILER_URL} tile_bytes=${BYTES}"
