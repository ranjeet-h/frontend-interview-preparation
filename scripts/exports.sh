#!/usr/bin/env bash
# Local-only EPUB and Typst PDF export. These artifacts are intentionally not
# built by GitHub Pages because the PDF is too large for a static deployment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node scripts/sync-nav.mjs
node scripts/check.mjs
rm -rf "$ROOT/_site"

QUARTO="$(bash scripts/ensure-quarto.sh)"
"$QUARTO" render --profile release

find "$ROOT" -path "$ROOT/.git" -prune -o -path "$ROOT/_site" -prune -o \
  -type d -name '*_files' -prune -exec rm -rf {} + 2>/dev/null || true

echo "exports: inspect _site for the generated .epub and .pdf files"
