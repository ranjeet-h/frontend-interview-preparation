#!/usr/bin/env bash
# Full HTML-only build used locally and by GitHub Pages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node scripts/sync-nav.mjs
node scripts/check.mjs
rm -rf "$ROOT/_site"

QUARTO="$(bash scripts/ensure-quarto.sh)"
"$QUARTO" render --to html

if [ -f "$ROOT/_site/search.json" ]; then
  node scripts/compact-search.mjs
fi

touch "$ROOT/_site/.nojekyll"

# Quarto/Pandoc can leave intermediates beside a source page after an
# interrupted render. Remove only generated HTML/resource directories.
find "$ROOT" -path "$ROOT/.git" -prune -o -path "$ROOT/_site" -prune -o \
  -type d -name '*_files' -prune -exec rm -rf {} + 2>/dev/null || true
