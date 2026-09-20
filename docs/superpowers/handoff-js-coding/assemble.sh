#!/usr/bin/env bash
# Assemble Phase 1 JavaScript coding pages from headers + fragments.
# Safe to re-run: it overwrites the final pages each time.
set -euo pipefail

ROOT="/Users/ranjeetharishchandre/Documents/Personal/frontend-interview-preparation"
BASE="$ROOT/docs/superpowers/handoff-js-coding"
OUT="$ROOT/src/javascript/coding-questions"
mkdir -p "$OUT"

fail=0

assemble() {
  local out="$1"; shift
  local header="$BASE/headers/$out"
  local target="$OUT/$out"

  if [[ ! -f "$header" ]]; then
    echo "MISSING HEADER: $header" >&2
    fail=1
    return
  fi

  for frag in "$@"; do
    if [[ ! -f "$BASE/parts/$frag" ]]; then
      echo "MISSING FRAGMENT: $BASE/parts/$frag" >&2
      fail=1
      return
    fi
  done

  : > "$target"
  cat "$header" >> "$target"
  printf '\n' >> "$target"
  for frag in "$@"; do
    cat "$BASE/parts/$frag" >> "$target"
    printf '\n' >> "$target"
  done

  local problems lines
  problems=$(grep -c '^## ' "$target" || true)
  lines=$(wc -l < "$target" | tr -d ' ')
  echo "built $out  ($problems problems, $lines lines)"
}

assemble 01-strings.md                 01-strings.a.md 01-strings.b.md
assemble 02-arrays.md                  02-arrays.a.md 02-arrays.b.md 02-arrays.c.md
assemble 03-array-polyfills.md         03-array-polyfills.a.md 03-array-polyfills.b.md
assemble 04-objects.md                 04-objects.a.md 04-objects.b.md
assemble 05-functions-closures.md      05-functions.a.md 05-functions.b.md
assemble 06-debounce-throttle.md       06-debounce-throttle.a.md 06-debounce-throttle.b.md
assemble 07-this-call-bind-new.md      07-this-call-bind-new.md
assemble 08-promises.md                08-promises.a.md 08-promises.b.md 08-promises.c.md
assemble 09-async-await.md             09-async-await.a.md 09-async-await.b.md
assemble 10-event-emitter-pubsub.md    10-event-emitter-pubsub.md
assemble 11-data-structures.md         11-data-structures.a.md 11-data-structures.b.md
assemble 12-iterators-generators.md    12-iterators-generators.md
assemble 13-serialization-parsing.md   13-serialization-parsing.md
assemble 14-browser-javascript.md      14-browser-javascript.a.md 14-browser-javascript.b.md
assemble 15-utility-library.md         15-utility-library.md
assemble 16-guess-scope-hoisting.md      16-guess-scope-hoisting.md
assemble 17-guess-closures.md            17-guess-closures.md
assemble 18-guess-this.md                18-guess-this.md
assemble 19-guess-coercion.md            19-guess-coercion.md
assemble 20-guess-types.md               20-guess-types.md
assemble 21a-guess-objects-arrays.md     21a-guess-objects-arrays.md
assemble 21b-guess-objects-arrays.md     21b-guess-objects-arrays.md
assemble 22-guess-prototypes-classes.md  22-guess-prototypes-classes.md
assemble 23-guess-promises.md            23-guess-promises.md
assemble 24-guess-event-loop.md          24-guess-event-loop.md
assemble 25a-guess-misc.md               25a-guess-misc.md
assemble 25b-guess-misc.md               25b-guess-misc.md
assemble 26-debugging.md                 26-debugging.md

if [[ "$fail" -ne 0 ]]; then
  echo "One or more fragments are missing. Re-dispatch them (see handoff §4.3) and re-run." >&2
  exit 1
fi

echo "All 15 pages assembled into $OUT"
