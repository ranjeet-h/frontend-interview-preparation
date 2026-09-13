#!/usr/bin/env bash
# Install the pinned project-local Quarto CLI used by CI when no system Quarto
# is available. The downloaded toolchain is ignored by Git.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${QUARTO_VERSION:-1.10.18}"
DEST="$ROOT/.quarto"

if [ -x "$DEST/bin/quarto" ] && "$DEST/bin/quarto" --version 2>/dev/null | grep -q "$VERSION"; then
  echo "Quarto $VERSION already installed at $DEST"
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform="linux-amd64" ;;
  Linux-aarch64|Linux-arm64) platform="linux-arm64" ;;
  Darwin-arm64|Darwin-x86_64) platform="macos" ;;
  *)
    echo "install-quarto: unsupported platform $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

url="https://github.com/quarto-dev/quarto-cli/releases/download/v${VERSION}/quarto-${VERSION}-${platform}.tar.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading Quarto ${VERSION} (${platform})..."
curl -fL --retry 3 --retry-delay 2 -o "$tmp/quarto.tar.gz" "$url"
rm -rf "$DEST"
mkdir -p "$DEST"
tar -xzf "$tmp/quarto.tar.gz" -C "$DEST"

if [ ! -x "$DEST/bin/quarto" ]; then
  nested="$(find "$DEST" -maxdepth 3 -type f -path '*/bin/quarto' | head -1 || true)"
  if [ -n "$nested" ]; then
    nested_root="$(dirname "$(dirname "$nested")")"
    cp -R "$nested_root"/. "$DEST"/
  fi
fi

"$DEST/bin/quarto" --version
echo "Quarto installed at $DEST"
