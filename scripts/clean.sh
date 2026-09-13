#!/usr/bin/env bash
# Remove generated artifacts without ever deleting Markdown source.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

rm -rf _site .quarto-preview site_libs
find . -path './.git' -prune -o -path './.quarto' -prune -o \
  -type d -name '*_files' -prune -exec rm -rf {} + 2>/dev/null || true
find . -path './.git' -prune -o -path './.quarto' -prune -o \
  -path './_site' -prune -o -path './book' -prune -o \
  -path './assets/js/page-tools.html' -prune -o \
  -type f -name '*.html' -delete
rm -rf .quarto/idx .quarto/xref .quarto/cites .quarto/preview .quarto/project-cache

if [ "${1:-}" = "--all" ]; then
  rm -rf .quarto
  echo "clean: removed _site, generated intermediates, and .quarto"
else
  echo "clean: removed _site, generated intermediates, and Quarto cache"
  echo "       use 'npm run clean -- --all' to remove the local Quarto install"
fi
