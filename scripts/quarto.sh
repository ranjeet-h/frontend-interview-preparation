#!/usr/bin/env bash
# Run the project-local Quarto binary when installed, otherwise the system one.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$(bash "$ROOT/scripts/ensure-quarto.sh")" "$@"
