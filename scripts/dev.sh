#!/usr/bin/env bash
# Render and serve one page quickly. A full Quarto book preview attempts to
# render every chapter, which is too slow for a 1,139-page study book.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  cat <<'USAGE'
Usage: npm run dev [-- path/to/page.md]

Render one Markdown page into .quarto-preview and serve it locally.
The default page is index.md. This intentionally does not run the full book build.
USAGE
  exit 0
fi

if [ "$#" -gt 1 ]; then
  echo "dev: pass at most one Markdown page" >&2
  exit 2
fi

PAGE="${1:-index.md}"
PAGE="${PAGE#./}"

if [[ "$PAGE" = /* || "$PAGE" == *".."* || "$PAGE" != *.md || ! -f "$ROOT/$PAGE" ]]; then
  echo "dev: expected an existing repository-relative .md page, got '$PAGE'" >&2
  exit 1
fi

PREVIEW_DIR="$ROOT/.quarto-preview"
rm -rf "$PREVIEW_DIR"

QUARTO="$(bash "$ROOT/scripts/ensure-quarto.sh")"
"$QUARTO" render "$PAGE" --to html --output-dir "$PREVIEW_DIR" --no-clean

OUTPUT="$PREVIEW_DIR/${PAGE%.md}.html"
if [ ! -f "$OUTPUT" ]; then
  echo "dev: Quarto did not produce expected output '$OUTPUT'" >&2
  exit 1
fi

echo "dev: rendered $PAGE"
echo "dev: open the matching .html path shown below (for example /${PAGE%.md}.html)"
SITE_DIR="$PREVIEW_DIR" exec node "$ROOT/scripts/serve.mjs"
