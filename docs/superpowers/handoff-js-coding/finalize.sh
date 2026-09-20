#!/usr/bin/env bash
# Finalize Phase 1: assemble pages, rewire SUMMARY.md, create legacy redirect
# stubs, then build. Safe to re-run.
set -euo pipefail

ROOT="/Users/ranjeetharishchandre/Documents/Personal/frontend-interview-preparation"
BASE="$ROOT/docs/superpowers/handoff-js-coding"
cd "$ROOT"

echo "== 1/4 assemble pages =="
bash "$BASE/assemble.sh"

echo "== 2/4 legacy redirect stubs =="
# Top-level legacy coding pages only. Deep output-questions/part-* lesson URLs are
# retired (their content migrates into the Part 2 guess-the-output pages).
stub() {
  local file="$1" target="$2" label="$3"
  mkdir -p "$(dirname "$file")"
  cat > "$file" <<EOF
# Moved

This page has been reorganised. See [$label]($target).

<meta http-equiv="refresh" content="0; url=./$target">
EOF
  echo "stubbed $file"
}
stub src/javascript/coding-problems.md   "coding-questions.md"                            "JavaScript Coding Interview Guide"
stub src/javascript/polyfills.md        "coding-questions/03-array-polyfills.md"      "Array Method Polyfills"
stub src/javascript/output-questions.md   "coding-questions.md#part-2-guess-the-output" "Guess the Output"
stub src/javascript/output-questions-2.md "coding-questions.md#part-2-guess-the-output" "Guess the Output"
stub src/javascript/output-questions-3.md "coding-questions.md#part-2-guess-the-output" "Guess the Output"

echo "== 3/4 rewire SUMMARY.md =="
python3 - "$ROOT/src/SUMMARY.md" <<'PY'
import sys, pathlib

path = pathlib.Path(sys.argv[1])
lines = path.read_text().splitlines(keepends=True)

start = next(i for i, l in enumerate(lines)
             if "[Coding Problems](javascript/coding-problems.md)" in l)
# The JS section ends at the `---` separator before `# TypeScript`.
end = next(i for i in range(start, len(lines)) if lines[i].strip() == "---")

new_tree = """  - [JavaScript Coding Interview Guide](javascript/coding-questions.md)
    - [Strings](javascript/coding-questions/01-strings.md)
    - [Arrays](javascript/coding-questions/02-arrays.md)
    - [Array Method Polyfills](javascript/coding-questions/03-array-polyfills.md)
    - [Objects](javascript/coding-questions/04-objects.md)
    - [Functions & Closures](javascript/coding-questions/05-functions-closures.md)
    - [Debounce & Throttle](javascript/coding-questions/06-debounce-throttle.md)
    - [this, call, apply, bind & new](javascript/coding-questions/07-this-call-bind-new.md)
    - [Promises](javascript/coding-questions/08-promises.md)
    - [Async/Await Practical](javascript/coding-questions/09-async-await.md)
    - [Event Emitter & Pub-Sub](javascript/coding-questions/10-event-emitter-pubsub.md)
    - [Data Structures](javascript/coding-questions/11-data-structures.md)
    - [Iterators & Generators](javascript/coding-questions/12-iterators-generators.md)
    - [Serialization & Parsing](javascript/coding-questions/13-serialization-parsing.md)
    - [Browser JavaScript](javascript/coding-questions/14-browser-javascript.md)
    - [Utility / Library Questions](javascript/coding-questions/15-utility-library.md)
    - [Legacy: Coding Problems (moved)](javascript/coding-problems.md)
    - [Legacy: Polyfills (moved)](javascript/polyfills.md)
    - [Legacy: Output Questions 1 (moved)](javascript/output-questions.md)
    - [Legacy: Output Questions 2 (moved)](javascript/output-questions-2.md)
    - [Legacy: Output Questions 3 (moved)](javascript/output-questions-3.md)
""".splitlines(keepends=True)

lines = lines[:start] + new_tree + lines[end:]
path.write_text("".join(lines))
print(f"SUMMARY.md rewired: replaced lines {start+1}-{end} with {len(new_tree)} new lines")
PY

echo "== 4/4 build =="
mdbook build 2>&1 | tail -4

echo
echo "Phase 1 finalize complete. Next: review in the browser, then commit (see handoff sections 4.6-4.7)."
