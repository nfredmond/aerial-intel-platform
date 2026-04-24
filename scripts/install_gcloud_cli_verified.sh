#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_URL="${GCLOUD_ARCHIVE_URL:-}"
ARCHIVE_SHA256="${GCLOUD_ARCHIVE_SHA256:-}"
INSTALL_DIR="${GCLOUD_INSTALL_DIR:-$HOME/.local/share/google-cloud-sdk}"
CACHE_DIR="${GCLOUD_DOWNLOAD_DIR:-$HOME/.cache/aerial-intel-platform/gcloud}"
ASSUME_YES=0
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: scripts/install_gcloud_cli_verified.sh --sha256 SHA256 [--url URL] [--install-dir DIR] [--cache-dir DIR] [--yes] [--dry-run]

Installs the Google Cloud CLI from the official Linux tar archive after a
mandatory SHA256 verification. This helper is intentionally local-only:
it does not run `gcloud init`, authenticate, choose a project, or perform any
GCP writes.

The expected SHA256 must come from Google's current install/downloads page for
the exact archive URL being installed. Do not bypass this check.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha256)
      ARCHIVE_SHA256="${2:-}"
      if [[ -z "$ARCHIVE_SHA256" ]]; then
        echo "--sha256 requires a value." >&2
        exit 2
      fi
      shift 2
      ;;
    --url)
      ARCHIVE_URL="${2:-}"
      if [[ -z "$ARCHIVE_URL" ]]; then
        echo "--url requires a value." >&2
        exit 2
      fi
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      if [[ -z "$INSTALL_DIR" ]]; then
        echo "--install-dir requires a value." >&2
        exit 2
      fi
      shift 2
      ;;
    --cache-dir)
      CACHE_DIR="${2:-}"
      if [[ -z "$CACHE_DIR" ]]; then
        echo "--cache-dir requires a value." >&2
        exit 2
      fi
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
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

case "$(uname -m)" in
  x86_64|amd64)
    DEFAULT_ARCHIVE="google-cloud-cli-linux-x86_64.tar.gz"
    ;;
  aarch64|arm64)
    DEFAULT_ARCHIVE="google-cloud-cli-linux-arm.tar.gz"
    ;;
  i386|i686)
    DEFAULT_ARCHIVE="google-cloud-cli-linux-x86.tar.gz"
    ;;
  *)
    echo "Unsupported architecture for automatic Google Cloud CLI archive selection: $(uname -m)" >&2
    echo "Pass --url for a supported archive if this host is expected to work." >&2
    exit 2
    ;;
esac

if [[ -z "$ARCHIVE_URL" ]]; then
  ARCHIVE_URL="https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/${DEFAULT_ARCHIVE}"
fi

if ! [[ "$ARCHIVE_SHA256" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "A 64-character SHA256 is required via --sha256 or GCLOUD_ARCHIVE_SHA256." >&2
  echo "Use the current official checksum for ${ARCHIVE_URL}; do not guess." >&2
  exit 2
fi

if ! [[ "$ARCHIVE_URL" =~ ^https://dl\.google\.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-(x86_64|arm|x86)\.tar\.gz$ ]]; then
  echo "Archive URL must be an official Google Cloud CLI Linux rapid-channel archive." >&2
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download the Google Cloud CLI archive." >&2
  exit 2
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum is required to verify the Google Cloud CLI archive." >&2
  exit 2
fi

archive_name="${ARCHIVE_URL##*/}"
archive_path="${CACHE_DIR}/${archive_name}"

cat <<EOF
Google Cloud CLI verified local install plan:
- archive: ${ARCHIVE_URL}
- expected SHA256: ${ARCHIVE_SHA256}
- cache: ${archive_path}
- install dir: ${INSTALL_DIR}
- writes: local filesystem only; no gcloud auth/init/project/write commands
EOF

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

if [[ "$ASSUME_YES" != "1" ]]; then
  if [[ ! -r /dev/tty ]]; then
    echo "Interactive confirmation is required unless --yes is passed." >&2
    exit 2
  fi
  printf 'Type yes to download, verify, and install locally: ' > /dev/tty
  IFS= read -r confirmation < /dev/tty
  if [[ "$confirmation" != "yes" ]]; then
    echo "Aborted before download." >&2
    exit 1
  fi
fi

mkdir -p "$CACHE_DIR"
curl -fL "$ARCHIVE_URL" -o "$archive_path"

printf '%s  %s\n' "$ARCHIVE_SHA256" "$archive_path" | sha256sum -c -

if [[ -e "$INSTALL_DIR" ]]; then
  echo "Install dir already exists: ${INSTALL_DIR}" >&2
  echo "Move or remove it first; this helper will not overwrite an existing SDK directory." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

tar -xf "$archive_path" -C "$tmp_dir"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$tmp_dir/google-cloud-sdk" "$INSTALL_DIR"

"$INSTALL_DIR/install.sh" \
  --quiet \
  --path-update=false \
  --command-completion=false \
  --usage-reporting=false

cat <<EOF
Google Cloud CLI installed at ${INSTALL_DIR}.
For this shell only, run:
  export PATH="${INSTALL_DIR}/bin:\$PATH"

Then authenticate intentionally:
  gcloud auth login
  gcloud config set project <nat-ford-gcp-project-id>
EOF
