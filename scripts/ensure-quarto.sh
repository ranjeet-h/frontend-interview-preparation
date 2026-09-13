#!/usr/bin/env bash
# Print the Quarto binary to use. This is the only install decision point.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -x "$ROOT/.quarto/bin/quarto" ]; then
  echo "$ROOT/.quarto/bin/quarto"
  exit 0
fi

if command -v quarto >/dev/null 2>&1; then
  command -v quarto
  exit 0
fi

bash "$ROOT/scripts/install-quarto.sh" >&2
echo "$ROOT/.quarto/bin/quarto"
