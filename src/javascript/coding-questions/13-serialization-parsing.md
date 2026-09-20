# Serialization & Parsing

Serialization questions test edge cases more than algorithms: `undefined` versus `null`, functions and symbols, cycles, dates, and escaping. This page implements a simplified `JSON.stringify`/`JSON.parse`, then the everyday parsing utilities — query strings, nested parameters, CSV, and URL handling via the standard APIs.

## Implement a Simplified `JSON.stringify`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `myStringify(value, replacer, space)` that produces the same text as
`JSON.stringify` for ordinary data: `null`, booleans, numbers, strings, arrays, and plain
objects, plus the `replacer` and `space` arguments.

The contract is mostly about **what is not serializable**, and getting the three
"missing value" rules right is the actual question:

- `undefined`, functions, and symbols are **omitted** from objects, become **`null`** inside
  arrays, and at the **top level** make the whole call return `undefined` (not a string).
- `null` serializes as `"null"`; `NaN`, `Infinity`, and `-Infinity` serialize as `"null"`.
- `toJSON` on a value is called first, which is how `Date` becomes an ISO string.
- Circular references throw `TypeError` — not `RangeError`.

Honest framing: this is a *teaching* implementation. It is ~70 lines, and a spec-complete
one is several hundred: full `Number::toString` (shortest round-trip decimal) is engine
territory, and we lean on `String(n)` for that.

### Examples

```text
myStringify({ a: 1, b: "x" })        // => '{"a":1,"b":"x"}'
myStringify([1, undefined, 2])       // => "[1,null,2]"
myStringify({ a: undefined, b: 1 })  // => '{"b":1}'
myStringify(undefined)               // => undefined   (not a string)
myStringify(function () {})          // => undefined
myStringify(NaN)                     // => "null"
myStringify(-0)                      // => "0"
myStringify(new Date(0))             // => '"1970-01-01T00:00:00.000Z"'
myStringify({ a: { b: 1 } }, null, 2)
// => '{\n  "a": {\n    "b": 1\n  }\n}'
myStringify('a"b\nc')                // => '"a\\"b\\nc"'
myStringify({ a: 1, b: 2 }, ["a"])   // => '{"a":1}'
myStringify({ a: 1 }, (k, v) => (k === "a" ? 2 : v)) // => '{"a":2}'
const c = {}; c.self = c;
myStringify(c)                       // => TypeError: Converting circular structure to JSON
```

### Approach

Recursive descent from a **holder** object, exactly like the spec. The root is wrapped as
`{ "": value }` so the top-level value has a parent, a key, and the same code path as every
nested value. `serialize(key, holder)` reads `holder[key]` and returns a JSON *fragment*
string, or `undefined` to mean "this value has no serialization."

Order of operations inside `serialize` is the contract and is easy to get wrong:

1. **`toJSON` first.** If the value is an object with a callable `toJSON`, replace it with
   `toJSON.call(value, key)`. `Date.prototype.toJSON` is the canonical case; this is also
   the extension point for custom types.
2. **`replacer` second.** A function replacer is called as `replacer.call(holder, key, value)`
   with the *post-`toJSON`* value. An array replacer is not a function at all — it is a
   **property allow-list** applied to objects only (arrays always iterate their full length).
3. **Unbox wrappers** (`new Number(3)` → `3`) using `Object.prototype.toString` tags.
4. **Dispatch on `typeof`** for primitives; anything `undefined`/function/symbol returns
   `undefined`.

Two rules that a naive `JSON.stringify` clone always misses:

- **Arrays never drop entries.** `[1, undefined, 2]` is `[1,null,2]`; a hole is also `null`.
  So the array branch maps `serialize(...) ?? "null"`.
- **Cycle detection is per path, not per document.** Track objects on the *current* stack and
  remove them on the way out, so `{ a: shared, b: shared }` is fine (it appears twice) while
  `a.self = a` throws. A `Set` that is never pruned wrongly rejects a DAG.

### Implementation

```javascript
function myStringify(value, replacer, space) {
  // `space`: a number means that many spaces (clamped to 10); a string is used verbatim,
  // truncated to 10 chars; anything else means compact output.
  let gap = "";
  if (typeof space === "number") {
    gap = " ".repeat(Math.min(10, Math.max(0, Math.trunc(space))));
  } else if (typeof space === "string") {
    gap = space.slice(0, 10);
  }

  const replacerFn = typeof replacer === "function" ? replacer : null;

  // Array replacer = allow-list of keys, stringified, de-duplicated, order preserved.
  const propertyList = Array.isArray(replacer)
    ? [...new Set(replacer
        .filter((k) => typeof k === "string" || typeof k === "number")
        .map(String))]
    : null;

  const stack = new Set(); // objects on the CURRENT path -> true cycles only

  // JSON string escaping: quote and backslash always; control chars as short escapes.
  function quote(str) {
    let out = '"';
    for (const ch of str) {
      const code = ch.codePointAt(0);
      if (ch === '"') out += '\\"';
      else if (ch === "\\") out += "\\\\";
      else if (ch === "\b") out += "\\b";
      else if (ch === "\f") out += "\\f";
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20) out += "\\u" + code.toString(16).padStart(4, "0");
      else out += ch; // code-point iteration keeps surrogate pairs intact
    }
    return out + '"';
  }

  function serialize(key, holder, indent) {
    let value = holder[key];

    // 1) toJSON is consulted before the replacer and before any type dispatch.
    if (value !== null && typeof value === "object") {
      const toJSON = value.toJSON;
      if (typeof toJSON === "function") value = toJSON.call(value, key);
    }

    // 2) Function replacer: `this` is the holder; the value is post-toJSON.
    if (replacerFn) value = replacerFn.call(holder, key, value);

    // 3) Unwrap boxed primitives so a `new Number(3)` behaves like `3`.
    if (value !== null && typeof value === "object") {
      const tag = Object.prototype.toString.call(value);
      if (tag === "[object Number]") value = Number(value);
      else if (tag === "[object String]") value = String(value);
      else if (tag === "[object Boolean]") value = value.valueOf();
    }

    // 4) Primitives. `undefined` is the "no value" signal, not a string.
    if (value === null) return "null";
    if (typeof value !== "object") {
      switch (typeof value) {
        case "string": return quote(value);
        case "number": return Number.isFinite(value) ? String(value) : "null";
        case "boolean": return String(value);
        case "bigint": throw new TypeError("Do not know how to serialize a BigInt");
        default: return undefined; // undefined, function, symbol
      }
    }

    // 5) Containers. Cycle check is scoped to this path and released in `finally`.
    if (stack.has(value)) throw new TypeError("Converting circular structure to JSON");
    stack.add(value);
    try {
      const childIndent = indent + gap;

      if (Array.isArray(value)) {
        const parts = [];
        for (let i = 0; i < value.length; i += 1) {
          // Holes, undefined, functions and symbols all become literal `null`.
          parts.push(serialize(String(i), value, childIndent) ?? "null");
        }
        if (parts.length === 0) return "[]";
        return gap
          ? "[\n" + childIndent + parts.join(",\n" + childIndent) + "\n" + indent + "]"
          : "[" + parts.join(",") + "]";
      }

      const keys = propertyList ?? Object.keys(value); // allow-list, else own string keys
      const parts = [];
      for (const k of keys) {
        const fragment = serialize(k, value, childIndent);
        if (fragment === undefined) continue; // drop undefined/function/symbol properties
        parts.push(quote(k) + ":" + (gap ? " " : "") + fragment);
      }
      if (parts.length === 0) return "{}";
      return gap
        ? "{\n" + childIndent + parts.join(",\n" + childIndent) + "\n" + indent + "}"
        : "{" + parts.join(",") + "}";
    } finally {
      stack.delete(value); // release: a sibling branch may reuse the same object
    }
  }

  return serialize("", { "": value }, ""); // root holder makes the top level uniform
}
```

### Walkthrough

Take `myStringify({ a: [1, undefined, new Date(0)], b: 2 }, null, 2)`.

1. Root call: `serialize("", { "": value }, "")` reads the owner object, which is a plain
   object with no `toJSON`, so it hits the container branch with `indent = ""`. With
   `space = 2`, `gap === "  "` and `childIndent === "  "`.
2. Key `"a"` → the array. Recurse with `indent = "  "`. Elements:
   - `0` → `"1"`.
   - `1` → `serialize` returns `undefined` (the value is `undefined`), so `?? "null"` yields
     `"null"` — arrays never drop entries.
   - `2` → the `Date` has a callable `toJSON`, so it becomes
     `"1970-01-01T00:00:00.000Z"`, which `quote` wraps in double quotes.
   Joined with the pretty separators, the array fragment is
   `[\n    "1",\n    "null",\n    "1970-01-01T00:00:00.000Z"\n  ]` — note the closing
   bracket uses the array's *own* `indent`, not `childIndent`.
3. Key `"b"` → the number `2` → `"2"`. Both fragments are non-`undefined`, so they are kept.
4. The object is joined as `{\n  "a": [...],\n  "b": 2\n}`.

For the cycle case, `c.self = c`: the first visit adds `c` to `stack`; the recursive read of
`"self"` finds `c` still in the set and throws `TypeError` *before* recursing. Because the
`throw` unwinds through the `finally`, the set is emptied — so a second, independent
`myStringify(c)` call would throw again rather than returning a stale state.

### Complexity

Time: `O(n)` over the total number of values visited; `propertyList` lookups are
`O(1)` per key. Space: `O(d)` recursion depth for the call stack plus `O(d)` for `stack`,
and `O(m)` for the output string of length `m`.

### Edge Cases

- **Top-level `undefined`/function/symbol** → returns `undefined`, not the string `"undefined"`.
  `JSON.stringify(undefined) === undefined`, and that is observable.
- **Arrays vs objects** → `[undefined]` is `"[null]"`; `{ a: undefined }` is `"{}"`.
- **`NaN`, `Infinity`, `-Infinity`** → `"null"`. `-0` → `"0"`, which loses the sign.
- **Escaping** → `"`, `\`, `\b \f \n \r \t` use short escapes; any other code unit below
  `0x20` uses `\u00XX`. `/` is *not* escaped, and characters above `0x7F` are emitted raw.
- **`toJSON`** → called with the property key, before the replacer. `Date` → ISO string;
  a custom `toJSON` returning `undefined` makes the property disappear.
- **Replacer** → function form is called on every value including the root (key `""`);
  array form is a key allow-list for objects only and never filters array elements.
- **Circular reference** → `TypeError`; a shared reference appearing twice is fine.
- **Boxed primitives** → `new Number(3)` → `"3"`; `Object(3)` behaves the same.
- **Own enumerable string keys only** → getters are invoked, symbol keys and
  non-enumerables are skipped, and a `Map`/`Set` serializes as `"{}"`.
- **Non-finite `space`** → `Math.trunc(NaN)` is `NaN` and `" ".repeat(NaN)` is `""`, matching
  "no indentation". `space` above 10 clamps to 10.

### Interview Follow-ups

- **Implement `toJSON`-aware cloning:** `JSON.parse(JSON.stringify(x))` is not a deep clone —
  it drops `undefined`/functions, turns `Date` into a string, and loses prototypes. `Map`,
  `Set`, `RegExp` and shared references need `structuredClone` or a hand-written clone.
- **Add BigInt and `Map`/`Set` support:** handle them in the `toJSON` hook or via a custom
  replacer; the spec deliberately leaves them out (`BigInt` throws, `Map`/`Set` become `"{}"`).
- **Streaming/large payloads:** building one giant string is memory-heavy; a generator that
  yields fragments avoids the `O(n)` output allocation and lets you pipe to a stream.
- **Why is `String(n)` not exactly correct?** The spec's `Number::toString` is the shortest
  round-tripping decimal, which JS engines implement natively; `String(n)` calls it, so this
  is fine in practice but is not something you would hand-roll.

### Common Mistakes

- Returning the string `"undefined"` at the top level instead of the value `undefined`.
- Emitting `undefined` inside arrays, producing `[1,,2]`-style invalid JSON.
- Using a single non-pruned `Set`/array for cycle detection, which falsely flags any object
  that is reachable twice through different paths.
- Applying `toJSON` after the replacer, or forgetting it entirely so `Date` falls through to
  `Object.keys` and serializes as `"{}"`.
- Forgetting to escape control characters, producing JSON that `JSON.parse` rejects.
- Treating the array-form replacer as a filter on array indices.

### Takeaway

`JSON.stringify` is a recursive walk whose real complexity is the *absence* rules: objects
drop `undefined`/function/symbol values, arrays coerce them to `null`, and the top level
returns `undefined` outright. `toJSON` runs first, the replacer second, and cycle detection
must be scoped to the current path rather than the whole document.

## Implement a Simplified `JSON.parse`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `myParse(text, reviver)` that turns JSON text into a JavaScript value, matching
`JSON.parse` for the standard grammar: objects, arrays, strings, numbers, `true`, `false`,
`null`. The contract:

- The input must be a **complete, valid** JSON document. Leading/trailing whitespace is
  allowed, but nothing else: `"1 2"`, `"{} {}"`, and `"undefined"` are all `SyntaxError`.
- Only four whitespace characters are legal: space, tab, `\n`, `\r`. A non-breaking space or
  a BOM is a `SyntaxError`, unlike JavaScript source.
- Numbers use JSON's grammar, not JavaScript's: no leading `+`, no leading zeros, no `.5`,
  no `1.`, no hex, no `Infinity`/`NaN`, and no `_` separators.
- Strings are double-quoted only, and raw control characters below `0x20` are rejected;
  `\uXXXX` escapes may produce lone surrogates, exactly like the host.
- The optional `reviver(key, value)` is applied **bottom-up**: children are revived before
  their parent, `this` is the holder, and returning `undefined` **deletes** the key.

The correct technique is a **tokenizer plus recursive descent**. `eval` and
`new Function` are not: they execute whatever they are handed
(`eval("(function(){ /* ... */ })()")` runs code), and they accept non-JSON JavaScript
(`eval("1+1")` is `2`; `eval("{a:1}")` is a block statement). This is a security bug, not a
style preference.

### Examples

```text
myParse("42")                     // => 42
myParse("  42  ")                 // => 42
myParse('"a\\nb"')                // => "a\nb"  (a real newline)
myParse('{"a":[1,true,null]}')    // => { a: [1, true, null] }
myParse('"\\uD83D\\uDE00"')       // => "😀"  (surrogate pair joined by the engine)

myParse("")                       // => SyntaxError: Unexpected end of JSON input
myParse("{'a':1}")                // => SyntaxError (single quotes)
myParse("{a:1}")                  // => SyntaxError (unquoted key)
myParse("01")                     // => SyntaxError (leading zero)
myParse("1 2")                    // => SyntaxError (trailing content)
myParse("[1,]")                   // => SyntaxError (trailing comma)
myParse("undefined")              // => SyntaxError
myParse("1e999")                  // => Infinity (valid number, overflows)

myParse('{"a":1,"b":2}', (k, v) => (k === "b" ? undefined : v)) // => { a: 1 }
```

### Approach

Two layers, kept separate so errors can carry a position:

1. **Scanner** — `skipWs()` advances past the four legal whitespace characters; the parser
   then peeks one character to decide which production to enter. A stream-of-tokens design
   is equally valid; the single-index version avoids allocating token objects.
2. **Recursive descent** — `parseValue()` dispatches on the current character:
   `{` → `parseObject`, `[` → `parseArray`, `"` → `parseString`, `-` or a digit →
   `parseNumber`, otherwise one of the three literals. The dispatch is total: anything else
   is a `SyntaxError`, which is why `undefined`, `NaN`, and `'x'` fail.

The three things a hand-written parser usually gets wrong:

- **Trailing garbage.** After the top-level `parseValue()`, skip whitespace and require
  `i === text.length`. Without this check `myParse("1abc")` silently returns `1`.
- **Number grammar.** Anchoring a regex at `i` (`/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/`)
  and requiring a match is the compact way to reject `01`, `+1`, `.5`, and `1.`. Note
  `1e999` is *grammatically* valid and `Number("1e999")` is `Infinity` — the real
  `JSON.parse` returns `Infinity` too, so do not "fix" it.
- **`__proto__`.** Real `JSON.parse` creates `__proto__` as an ordinary own data property
  using `CreateDataProperty`, which does **not** run the `Object.prototype.__proto__`
  setter. Plain `obj[key] = value` does run it, so
  `myParse('{"__proto__":{"polluted":1}}')` would poison every object's prototype. Use
  `Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true })`.

The `reviver` is `InternalizeJSONProperty`: recurse into values first, then call
`reviver.call(holder, key, value)` and use its result. Returning `undefined` means
`delete holder[key]`.

### Implementation

```javascript
function myParse(text, reviver) {
  if (typeof text !== "string") text = String(text); // the spec stringifies first
  let i = 0;

  const fail = (message) => {
    throw new SyntaxError(`${message} in JSON at position ${i}`);
  };

  // CreateDataProperty: assignment would trigger the Object.prototype.__proto__ setter.
  const define = (target, key, value) =>
    Object.defineProperty(target, key, {
      value, writable: true, enumerable: true, configurable: true,
    });

  function skipWs() {
    // JSON allows exactly these four; NBSP and BOM are NOT whitespace here.
    while (i < text.length) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") i += 1;
      else break;
    }
  }

  function parseValue() {
    skipWs();
    if (i >= text.length) fail("Unexpected end of input");
    const c = text[i];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    if (text.startsWith("true", i)) { i += 4; return true; }
    if (text.startsWith("false", i)) { i += 5; return false; }
    if (text.startsWith("null", i)) { i += 4; return null; }
    return fail(`Unexpected token '${c}'`);
  }

  function parseString() {
    i += 1; // opening quote
    let out = "";
    for (;;) {
      if (i >= text.length) fail("Unterminated string");
      const c = text[i];
      if (c === '"') { i += 1; return out; }
      if (c === "\\") {
        i += 1;
        const esc = text[i];
        if (esc === '"') out += '"';
        else if (esc === "\\") out += "\\";
        else if (esc === "/") out += "/";
        else if (esc === "b") out += "\b";
        else if (esc === "f") out += "\f";
        else if (esc === "n") out += "\n";
        else if (esc === "r") out += "\r";
        else if (esc === "t") out += "\t";
        else if (esc === "u") {
          // Four hex digits are a code UNIT: "\uD83D\uDE00" pairs up naturally.
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Invalid \\u escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else fail(`Invalid escape '\\${esc}'`);
        i += 1;
        continue;
      }
      if (c.codePointAt(0) < 0x20) fail("Unescaped control character in string");
      out += c; // code-point-safe: astral characters append whole
      i += 1;
    }
  }

  // Sticky regex anchored at `i`: JSON number grammar, not JavaScript's.
  const NUMBER_RE = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
  function parseNumber() {
    NUMBER_RE.lastIndex = i;
    const match = NUMBER_RE.exec(text);
    if (!match) fail("Invalid number");
    i = NUMBER_RE.lastIndex;
    return Number(match[0]); // "1e999" -> Infinity, exactly like the host
  }

  function parseArray() {
    i += 1; // '['
    const out = [];
    skipWs();
    if (text[i] === "]") { i += 1; return out; }
    for (;;) {
      out.push(parseValue());
      skipWs();
      const c = text[i];
      if (c === ",") { i += 1; continue; } // "[1,]" fails on the next parseValue
      if (c === "]") { i += 1; return out; }
      return fail(`Expected ',' or ']' but found '${c ?? "end of input"}'`);
    }
  }

  function parseObject() {
    i += 1; // '{'
    const out = {};
    skipWs();
    if (text[i] === "}") { i += 1; return out; }
    for (;;) {
      skipWs();
      if (text[i] !== '"') fail("Expected a double-quoted property name");
      const key = parseString();
      skipWs();
      if (text[i] !== ":") fail("Expected ':'");
      i += 1;
      const value = parseValue();
      define(out, key, value); // duplicate keys: last one wins, like the spec
      skipWs();
      const c = text[i];
      if (c === ",") { i += 1; continue; }
      if (c === "}") { i += 1; return out; }
      return fail(`Expected ',' or '}' but found '${c ?? "end of input"}'`);
    }
  }

  // InternalizeJSONProperty: children first, then the reviver; `this` is the holder.
  function internalize(holder, key) {
    const value = holder[key];
    if (value !== null && typeof value === "object") {
      const isArray = Array.isArray(value);
      const keys = isArray
        ? Array.from({ length: value.length }, (_, index) => String(index))
        : Object.keys(value);
      for (const name of keys) {
        const revived = internalize(value, name);
        if (revived === undefined) delete value[name]; // returning undefined deletes
        else define(value, name, revived);
      }
    }
    return reviver.call(holder, key, value);
  }

  const result = parseValue();
  skipWs();
  if (i !== text.length) fail("Unexpected non-whitespace character after JSON");

  if (typeof reviver !== "function") return result;
  return internalize({ "": result }, ""); // wrap so the root has a holder and key
}
```

### Walkthrough

Parse `{"a":[1],"b":"x\ny"}`.

1. `parseValue` skips nothing, sees `{`, so `parseObject` consumes it. `text[i]` is `"`, not
   `}`, so we enter the loop.
2. `parseString` consumes `"a"` and returns `"a"`; `skipWs` then sees `:`; `i` advances.
3. `parseValue` sees `[` → `parseArray` consumes it, `text[i]` is `1` (not `]`), so
   `parseValue` → `parseNumber` runs the sticky regex at that index, matching `"1"`,
   returning `1`. `skipWs` finds `]`, so the array closes. The object's `"a"` is defined
   with `[1]`.
4. `skipWs` finds `,`, so the loop continues. Key `"b"`, colon, then `parseValue` sees `"` →
   `parseString`: `x` appends, then `\` + `n` becomes a **real** newline (`"\n"`), then `y`,
   then the closing quote. That is the point of the escape branch: the JSON text had two
   characters `\` and `n`, and the result has one `\n`.
5. `skipWs` finds `}`, `i` is now `text.length`, so the trailing check passes.
6. With a reviver, `internalize({"": result}, "")` walks depth-first: `internalize(arr, "0")`
   runs before `internalize(obj, "a")`, and the root call is last with `key === ""`.

Index arithmetic is worth checking on `myParse("42 ")`: `parseNumber` matches `"42"` and sets
`i = 2`; `skipWs` moves `i` to `3`; `i === text.length`, so it succeeds. On `myParse("1 2")`,
`skipWs` stops at `i === 1` where the character is `2`, the length check fails, and
`SyntaxError` is thrown — the case a naive parser misses.

### Complexity

Time: `O(n)` — every character is visited a constant number of times, and the sticky regex
never rescans more than one token. Space: `O(d)` call depth in the nesting depth plus the
`O(n)` output value; `internalize` adds another `O(d)` pass only when a reviver is supplied.

Honest framing: a spec-complete parser is a few hundred lines. Here is what this one omits
or simplifies:

- **Position-precise errors.** Native V8 messages include a line/column excerpt
  (`Unexpected token } in JSON at position 7`); we carry an index only.
- **Deep nesting.** Real parsers guard depth; ~10k nested arrays here will overflow the
  stack (`RangeError`), whereas V8's native parser is iterative-ish and also throws
  `RangeError` at its own limit.
- **Performance.** Native `JSON.parse` is C++ and several times faster; this is for
  understanding, not for production.
- **`length`/`charCodeAt` micro-optimizations** that matter for very large payloads.

### Edge Cases

- **Empty or whitespace-only input** → `SyntaxError`; `parseValue` finds no token.
- **Trailing content** (`"1 2"`, `"{} {}"`) → `SyntaxError` thanks to the final length check.
- **Trailing comma** (`"[1,]"`, `'{"a":1,}'`) → `SyntaxError`; the next `parseValue` sees `]`
  or `}` and fails.
- **Single quotes and unquoted keys** → `SyntaxError`; only `"` starts a string.
- **Number grammar** → `01`, `+1`, `.5`, `1.`, `0x10`, `1_000`, `NaN`, `Infinity` all fail.
  `1e999` succeeds and yields `Infinity`; `-0` is preserved as `-0`.
- **Strings** → unterminated string, bad escape (`\x`), short `\u` (`\u12`), and raw control
  characters all throw. `\uD83D\uDE00` yields the astral character; a lone `\uD800` is
  accepted, matching the host.
- **`__proto__` key** → becomes an own property instead of polluting the prototype, because
  the write goes through `Object.defineProperty`.
- **Duplicate keys** → last occurrence wins (both in parsing and in the object literal).
- **Non-string input** → `JSON.parse(null)` is `"null"`, since the spec stringifies first.
- **`reviver` returning `undefined`** → the key is deleted from its holder; returning a
  value replaces it, and the root key `""` can be replaced too.
- **Non-whitespace Unicode** → `\u00A0` and a leading BOM are `SyntaxError`s.

### Interview Follow-ups

- **Write it as an explicit tokenizer first:** produce `{ type, value }` tokens, then parse
  the token stream. Cleaner error recovery (you can look ahead), and it is the shape you want
  for a streaming parser that receives chunks.
- **Add depth limiting:** thread a `depth` counter and throw a custom error past a threshold,
  which is the mitigation for untrusted deeply-nested payloads (a stack-overflow DoS).
- **Add a `reviver` only** (no parser): use native `JSON.parse` and then walk the result
  applying the reviver bottom-up — the two problems are separable.
- **Handle multiple documents / NDJSON:** parse one value, skip one newline, repeat; this is
  where the "must consume all input" rule has to become a `parseOne` API instead.
- **Why not `eval`?** It executes code, accepts non-JSON syntax, has no position information,
  and will happily construct arbitrary objects — a concrete injection vector.
- **Why not a giant regex?** JSON is a context-free grammar; regexes cannot track nesting,
  and catastrophic backtracking on malformed input is a real DoS.

### Common Mistakes

- **Using `eval` or `new Function`.** `eval("1+1")` is `2` and `eval("alert(1)")` runs code;
  neither enforces the JSON grammar.
- **Not validating trailing input**, so `myParse("1abc")` returns `1` instead of throwing.
- **Using `obj[key] = value`**, which lets `{"__proto__": {...}}` pollute `Object.prototype`.
- **Letting JavaScript's number grammar leak in** by using `parseFloat`, which accepts `"1.2abc"`,
  or `Number()`, which accepts `"0x10"` and `"1_000"` in some forms.
- **Forgetting that `\uXXXX` is a code unit**, then "fixing" surrogate pairs by hand and
  breaking astral characters.
- **Applying the reviver top-down**, so parents are transformed before their children.
- **`JSON.parse` losing precision** — `{"id":9007199254740993}` silently becomes
  `9007199254740992`; JSON numbers are IEEE-754 doubles, so IDs need strings or `BigInt`.

### Takeaway

`JSON.parse` is a tokenizer plus recursive descent over a strict grammar — never `eval`.
Three details carry most of the correctness: enforce that the whole input is consumed,
reject anything outside JSON's number and string grammars, and create object properties with
`Object.defineProperty` so `__proto__` stays a plain key. The reviver is a separate,
bottom-up pass with the holder as `this`.

## Serialize Nested Query Parameters

`Difficulty: Medium` `Probability: High`

### Problem

Write `serializeQuery(params, options)` that turns a nested object into a `&`-joined query
string, with an explicit convention for how depth is expressed. The contract:

- A scalar at path `a.b` becomes `a[b]=value` — bracket notation, depth-first.
- An array at path `a` becomes `a[]=x&a[]=y` (brackets) or `a[0]=x&a[1]=y` (indices) or
  `a=x&a=y` (repeat) depending on `arrayFormat`.
- An array element that is itself an object keeps an index (`items[0][sku]=X`) — otherwise
  the element is not addressable when you parse it back.
- `null` and `undefined` are **omitted**, not rendered as `"null"`. `false`, `0`, and `""`
  are kept, because they are values.
- Every key and value is percent-encoded with `encodeURIComponent`.

There is no single standard here: `qs`, `jQuery.param`, PHP, and `URLSearchParams` all differ
on arrays and on whether brackets are encoded. The interview answer is to **state the
convention up front** and then implement it consistently.

### Examples

```text
serializeQuery({ page: 2, ok: false, q: null })
// => "page=2&ok=false"                        (null dropped, false kept)

serializeQuery({ tags: ["a", "b c"] })
// => "tags%5B%5D=a&tags%5B%5D=b%20c"          (brackets encoded by encodeURIComponent)

serializeQuery({ tags: ["a", "b"] }, { arrayFormat: "indices" })
// => "tags%5B0%5D=a&tags%5B1%5D=b"

serializeQuery({ tags: ["a", "b"] }, { arrayFormat: "repeat" })
// => "tags=a&tags=b"

serializeQuery({ filter: { status: "active", ids: [1, 2] } })
// => "filter%5Bstatus%5D=active&filter%5Bids%5D%5B%5D=1&filter%5Bids%5D%5B%5D=2"

serializeQuery({ items: [{ sku: "A", qty: 1 }] })
// => "items%5B0%5D%5Bsku%5D=A&items%5B0%5D%5Bqty%5D=1"

serializeQuery({})                                 // => ""
serializeQuery({ a: {}, b: [] })                   // => ""   (nothing to address)
serializeQuery({ since: new Date(0) })             // => "since=1970-01-01T00%3A00%3A00.000Z"
```

### Approach

One recursive walk over the value tree carrying the **path so far**, plus a `push(key, value)`
sink that encodes and appends a pair. Recursion is the natural fit because the output is a
depth-first flattening of the input.

The decisions that matter:

- **Path building.** At the root the key is bare (`page`). One level down it is bracketed
  (`filter[status]`). So the child path is `path ? `${path}[${key}]` : key`; getting the
  root case wrong produces a leading `[`.
- **Array format is a per-call policy.** `brackets` is the friendliest for most frameworks,
  `indices` is unambiguous and round-trips arrays of objects, `repeat` is what
  `URLSearchParams` and form encoding produce. Supporting all three is ten lines.
- **Objects in arrays need indices regardless of format**, otherwise `items[][sku]=A` loses
  which element each field belongs to.
- **Drop only `null`/`undefined`.** A falsy check (`if (!value) return`) is the classic bug:
  it silently drops `0`, `false`, and `""`, which are exactly the values a filter endpoint
  needs.

Encoding note: `encodeURIComponent` escapes `[` and `]` as `%5B`/`%5D`. Many APIs expect raw
brackets, so expose the encoder as an option (or post-process). It also leaves `!`, `'`, `(`,
`)`, `*`, and `~` unescaped — RFC 3986 says only `~` and the unreserved set are safe — which
is acceptable in a query string.

Ordering: `Object.entries` preserves insertion order **except** that integer-like keys are
visited first in ascending order (`{ b: 1, 2: 2 }` yields key `2` then `b`). Add a `sort`
option if you need cache-key stability.

### Implementation

```javascript
function serializeQuery(params, options = {}) {
  const {
    arrayFormat = "brackets",     // "brackets" | "indices" | "repeat"
    encoder = encodeURIComponent, // override to keep [ ] raw for picky servers
    sort = false,
  } = options;

  if (params === null || typeof params !== "object") {
    throw new TypeError("serializeQuery expects an object");
  }

  const pairs = [];

  const isContainer = (value) =>
    value !== null && typeof value === "object" && !(value instanceof Date);

  const scalar = (value) => {
    if (value instanceof Date) return value.toISOString(); // same choice JSON makes
    return String(value); // numbers, booleans ("true"/"false"), strings, bigint
  };

  const add = (key, value) => pairs.push(`${encoder(key)}=${encoder(scalar(value))}`);

  function walk(value, path) {
    if (value === null || value === undefined) return; // omitted, not "null"

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (item === null || item === undefined) continue; // holes and nulls skipped
        if (isContainer(item)) {
          walk(item, `${path}[${index}]`); // objects in arrays always keep the index
        } else if (arrayFormat === "repeat") {
          add(path, item);                 // ?tag=a&tag=b
        } else if (arrayFormat === "indices") {
          add(`${path}[${index}]`, item);  // ?tag[0]=a&tag[1]=b
        } else {
          add(`${path}[]`, item);          // ?tag[]=a&tag[]=b
        }
      }
      return;
    }

    if (isContainer(value)) {
      for (const [key, child] of Object.entries(value)) {
        walk(child, path ? `${path}[${key}]` : key); // bare key only at the root
      }
      return;
    }

    add(path, value);
  }

  for (const [key, value] of Object.entries(params)) walk(value, key);
  if (sort) pairs.sort();
  return pairs.join("&");
}
```

### Walkthrough

`serializeQuery({ filter: { status: "active", ids: [1, 2] }, page: 2, q: null })`.

1. `Object.entries` yields `["filter", {...}]`, `["page", 2]`, `["q", null]`.
2. `walk({ status, ids }, "filter")` — a container, so it recurses:
   - `walk("active", "filter[status]")` is a scalar → `add` →
     `filter%5Bstatus%5D=active`.
   - `walk([1, 2], "filter[ids]")` — an array with `arrayFormat = "brackets"`, so `1` and `2`
     push `filter[ids][]` twice, with the brackets encoded in the key.
3. `walk(2, "page")` → `page=2`; note the root key is bare, with no brackets.
4. `walk(null, "q")` returns immediately, so `q` contributes nothing.
5. `pairs.join("&")` gives
   `filter%5Bstatus%5D=active&filter%5Bids%5D%5B%5D=1&filter%5Bids%5D%5B%5D=2&page=2`.

With `arrayFormat: "indices"` the array entries become `filter%5Bids%5D%5B0%5D=1` and
`filter%5Bids%5D%5B1%5D=2`, which is exactly what a parser needs to rebuild the array in
order. With a value of `0` instead of `null`, the falsy bug would have dropped it; the
explicit `=== null || === undefined` check keeps it.

### Complexity

Time: `O(n)` over the nodes reachable from `params`, plus the encoder per key/value pair.
Space: `O(d)` recursion depth and `O(k)` for the `k` output pairs before the join.

### Edge Cases

- **`null`/`undefined`** → omitted; **`false`/`0`/`""`** → kept. This is the single most
  common difference between a correct implementation and a broken one.
- **Empty array or empty object** → contributes zero pairs, so the whole result can be `""`.
- **Arrays inside arrays** → each nesting level adds `[index]`; deep JSON is representable
  but not readable, which is why APIs usually cap nesting.
- **Sparse arrays** → skipped slots change the indices in `indices` mode, so the round-trip
  is lossy; `repeat`/`brackets` lose them too.
- **`Date`** → ISO 8601, with the colons percent-encoded (`%3A`). Pass a custom `encoder` if
  your backend wants raw colons.
- **Symbol keys** → never visited by `Object.entries`; they are silently dropped.
- **Integer-like keys** → hoisted ahead of string keys by property-order rules, so
  `{ b: 1, 2: 2 }` serializes as `2=2&b=1`. Use `sort` for a deterministic cache key.
- **Nesting depth** → recursive `walk` overflows the stack on pathological input; guard with a
  depth limit if the object comes from user input.
- **Non-object input** (`null`, a string) → `TypeError` rather than a confusing `Object.entries`
  crash.
- **Very long values** → `encodeURIComponent` expands non-ASCII by up to 9×, and browsers
  impose practical URL length limits around 2,000–8,000 characters.

### Interview Follow-ups

- **Round-trip it.** Write the matching parser: split on `&`, decode, then interpret `[...]`
  segments, using arrays when the segment is empty or numeric. Note that `a[]=1&a[]=2` is only
  recoverable as an array by convention, and test the pair together.
- **Compare with `URLSearchParams`.** `new URLSearchParams({ tags: ["a", "b"] })` throws or
  stringifies the array as `"a,b"` — it does not understand arrays at all, and it encodes
  spaces as `+`. Good to mention before you hand-roll.
- **Dot notation.** `{ filter: { sort: "x" } }` → `filter.sort=x` is one branch change
  (`useDots ? `${path}.${key}` : ...`); swagger-style backends often prefer it.
- **Stable order for cache keys.** Sort pairs, or sort keys per level, before hashing the
  string; otherwise `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce different cache keys.
- **Prototype pollution on the way back.** A parser that does `target[key] = value` on
  `a[__proto__][x]=1` can poison `Object.prototype`; guard with `Object.hasOwn` and reject
  `__proto__`/`constructor`/`prototype` keys.

### Common Mistakes

- Using `if (!value) return`, which drops `0`, `false`, and `""`.
- Forgetting to encode, so a value containing `&` or `=` silently splits into extra pairs.
- Encoding with `JSON.stringify` (`"a"` becomes `%22a%22`) or `encodeURI` (which leaves `&`
  and `=` alone).
- Bracketing the root key (`[page]=2`) by applying the child rule at depth zero.
- Using `for...in`, which walks inherited enumerable properties.
- Giving array elements the empty-bracket key (`items[][sku]=A`) and then wondering why the
  parse step merges two elements.
- Assuming brackets come out raw; `encodeURIComponent` escapes them to `%5B`/`%5D` unless you
  pass a custom `encoder`.

### Takeaway

The algorithm is a depth-first walk that carries a path string; the difficulty is purely in
the conventions. Decide the array format, drop only `null`/`undefined`, encode exactly once,
and keep the index whenever an array element still has structure underneath.

## Parse Query Parameters

`Difficulty: Easy` `Probability: Very High`

### Problem

Write `parseQuery(search)` that turns `?name=ranjeet&page=2` into an object. The contract:

- Accept either a full query string or a bare one: `"?a=1"` and `"a=1"` both work.
- Strip everything from `#` onward (the fragment is not part of the query).
- Split on `&`; each pair splits on the **first** `=`. A pair with no `=` has the value `""`.
- Decode each key and value **separately**: `+` means a space, and percent escapes are
  decoded with `decodeURIComponent` — but only after splitting, never before.
- Values are **strings**. `page=2` gives `"2"`, not `2`; `id=007` keeps its leading zeros.
- Repeated keys: return an array (`tag=a&tag=b` → `["a", "b"]`), with `"first"`/`"last"`
  strategies available as options.
- `__proto__` must not be able to poison `Object.prototype`.

The most important line in the whole answer is "decode each component after splitting." If
you decode first, `a%3Db` becomes `a=b` and the pair is split on the wrong `=`.

### Examples

```text
parseQuery("?name=ranjeet&page=2")
// => { name: "ranjeet", page: "2" }          (page is a string)

parseQuery("name=ranjeet&page=2")            // identical, leading "?" optional
parseQuery("")                               // => {} (empty object)
parseQuery("?")                              // => {}

parseQuery("?a=1&a=2")                       // => { a: ["1", "2"] }
parseQuery("?a=1&a=2", { duplicates: "last" }) // => { a: "2" }
parseQuery("?a=1&a=2", { duplicates: "first" }) // => { a: "1" }

parseQuery("?tag=a+b")                       // => { tag: "a b" }   ("+" is a space)
parseQuery("?expr=a%2Bb")                    // => { expr: "a+b" }  ("%2B" is a literal +)
parseQuery("?q=100%25")                      // => { q: "100%" }

parseQuery("?empty=&flag")                   // => { empty: "", flag: "" }
parseQuery("?=1&ok=2")                       // => { ok: "2" }      (empty key skipped)
parseQuery("?a=1&&b=2&")                     // => { a: "1", b: "2" }
parseQuery("?return=https://x.test/?q=1")    // => { return: "https://x.test/?q=1" }

parseQuery("?name=1#section")                // => { name: "1" }    (fragment stripped)
parseQuery("?a=%E0%A4")                      // => { a: "%E0%A4" }  (malformed, kept raw)
parseQuery("?id=007")                        // => { id: "007" }
```

### Approach

1. **Normalize the input**: stringify it, drop a leading `?` or `#`, then cut at the first `#`.
   `String(input ?? "")` also means a `URLSearchParams` or a `Location.search` value works.
2. **Split**, don't regex the whole thing. `query.split("&")` gives the pairs; skipping empty
   segments tolerates `a=1&&b=2&`.
3. **Split each pair at the first `=`**: `part.indexOf("=")`, then `slice(0, eq)` and
   `slice(eq + 1)`. With `split("=")` and destructuring you lose everything after a second
   `=`, so a base64 value or a nested URL breaks.
4. **Decode per component**, never per pair: replace `+` with a space, then call
   `decodeURIComponent` inside a `try`/`catch`. A raw `%` or a truncated sequence like `%E0%A4`
   makes `decodeURIComponent` throw `URIError`; real `URLSearchParams` substitutes U+FFFD,
   while most hand-rolled parsers keep the raw text. Either is defensible — state the choice.
5. **Collect**: first occurrence stores a string; the second upgrades to an array via
   `Array.isArray(result[key])`. Push, don't spread, on subsequent duplicates.

Use `Object.create(null)` for the accumulator. It has no prototype, so
`?__proto__[x]=1` becomes an ordinary property instead of reaching the `Object.prototype`
setter. If the caller needs a normal object, return `{ ...result }` at the boundary.

### Implementation

```javascript
function parseQuery(input, { duplicates = "array", plusAsSpace = true } = {}) {
  // Drop the leading "?"/"#", then everything from the fragment onward.
  const query = String(input ?? "")
    .replace(/^[?#]/, "")
    .split("#", 1)[0];

  const result = Object.create(null); // no prototype: "__proto__" cannot pollute

  // Decode ONE component: "+" is a space, then percent escapes.
  const decode = (component) => {
    const withSpaces = plusAsSpace ? component.replace(/\+/g, " ") : component;
    try {
      return decodeURIComponent(withSpaces);
    } catch {
      return withSpaces; // malformed escape ("%E0%A4", "%") -> keep the raw text
    }
  };

  if (query === "") return result;

  for (const part of query.split("&")) {
    if (part === "") continue; // tolerate "a=1&&b=2" and a trailing "&"

    const eq = part.indexOf("="); // FIRST "=" only
    const key = decode(eq === -1 ? part : part.slice(0, eq));
    const value = decode(eq === -1 ? "" : part.slice(eq + 1));
    if (key === "") continue; // "=1" has no addressable key

    if (!Object.hasOwn(result, key)) {
      result[key] = value; // first occurrence stays a plain string
    } else if (duplicates === "last") {
      result[key] = value;
    } else if (duplicates === "first") {
      // keep what we already have
    } else if (Array.isArray(result[key])) {
      result[key].push(value); // push, do not spread: keeps it O(1) per duplicate
    } else {
      result[key] = [result[key], value];
    }
  }

  return result;
}
```

### Walkthrough

`parseQuery("?name=ranjeet&page=2&tag=a+b&tag=c%2Bd&empty=&flag&id=007#top")`.

1. Normalize: strip the leading `?` and the `#top` fragment → the query is
   `name=ranjeet&page=2&tag=a+b&tag=c%2Bd&empty=&flag&id=007`.
2. Split on `&` → seven parts. For each:
   - `name=ranjeet` → first `=` at index 4 → `name` / `ranjeet`.
   - `page=2` → `page` / `"2"` — a **string**, no numeric coercion.
   - `tag=a+b` → `"a b"`, because `+` is replaced before decoding.
   - `tag=c%2Bd` → the literal `+` is not touched by the replace (it is written as `%2B`),
     so it decodes to `"c+d"`. `Object.hasOwn` is now true, so the value upgrades to
     `["a b", "c+d"]`.
   - `empty=` → key `empty`, value `""`.
   - `flag` → `indexOf("=")` is `-1`, so the key is `flag` and the value is `""`.
   - `id=007` → `"007"`; leading zeros survive because nothing parses it as a number.
3. The result is `{ name, page: "2", tag: ["a b", "c+d"], empty: "", flag: "", id: "007" }`,
   with a null prototype.

Note the two decode cases that a single `decodeURIComponent(query)` call would break:
`%3D` in a value would become a real `=` *before* the split, and `%26` would become a real
`&`, creating a phantom pair. Decoding after splitting is what makes those values safe.

### Complexity

Time: `O(n)` in the length of the query string; `indexOf`, `slice`, and `decode` are all
linear in the part they touch, and each character is processed a constant number of times.
Space: `O(k)` for the result plus `O(n)` transient strings from the split.

### Edge Cases

- **Empty input**, `"?"`, or `"#frag"` → an empty object, no throw.
- **Pairs without `=`** → value `""`, matching `URLSearchParams.get("flag")`.
- **Empty key** (`"=1"`) → skipped; there is nothing to address.
- **Values containing `=`** (`"a=b=c"`, base64 padding, nested URLs) → preserved, because the
  split is on the first `=` only.
- **Value containing `&` or `=` encoded** → safe only because decoding happens after splitting.
- **`+` vs `%20`** → both become a space; `%2B` stays a literal `+`. Set `plusAsSpace: false`
  for non-form-encoded input, e.g. some OAuth and OData libraries.
- **Malformed percent escapes** → kept raw instead of throwing; real `URLSearchParams`
  substitutes U+FFFD, so note the divergence.
- **Duplicate keys** → arrays by default; nested bracket syntax (`a[b]=1`) is **not** parsed —
  that needs the recursive parser from the previous problem.
- **Semicolon separators** → `;` was a legal separator in the old `application/x-www-form-urlencoded`
  spec and is still emitted by some Java servers; `URLSearchParams` does not split on it, and
  neither does this function.
- **`__proto__`** → an ordinary own property, because the accumulator has a null prototype.
- **Everything is a string** → `?n=1&m=0` gives `"1"` and `"0"`; call `Number()` yourself when
  you need numbers, and beware `?n=` giving `NaN` on a naive `Number()` conversion.

### Interview Follow-ups

- **Compare with `URLSearchParams`.** Three lines —
  `Object.fromEntries(new URLSearchParams(search))` — but it is lossy (last duplicate wins,
  no arrays) and it decodes `+` as a space. Say that, then hand-roll if arrays matter.
- **Add typed values.** A `coerce` callback that runs per value, with `Number` only when the
  string round-trips (`String(Number(v)) === v`) so `"007"` and `"1e5"` stay strings.
- **Nested brackets.** Extend the parser to interpret `a[b][c]`/`a[0]` segments; the tricky
  parts are deciding `[]` means "append to an array," rejecting `__proto__`, and mixed
  `a=1&a[b]=2` conflicts.
- **Parse a full URL** with `new URL(input)` instead of string surgery, and read
  `.searchParams`; the browser has already handled the fragment and the encoding rules.
- **Streaming/`application/x-www-form-urlencoded` bodies** use the same grammar; the same
  function works on a request body, which is why the `+` rule exists.

### Common Mistakes

- Calling `decodeURIComponent` on the **whole query** before splitting, which turns `%26` into
  a real `&` and silently invents pairs.
- Using `split("=")` and destructuring, which truncates values containing `=`.
- Forgetting the `+` → space rule (`?q=hello+world` stays `"hello+world"`).
- Not stripping the `#fragment`, so the last value carries the fragment.
- Letting `decodeURIComponent` throw on malformed input and crashing the whole parse.
- Returning `{}` and assigning untrusted keys into it, allowing `__proto__` pollution.
- Assuming numbers, then emitting `NaN` for `?page=` when converting.
- Dropping pairs with an empty value by testing truthiness instead of presence.

### Takeaway

Splitting first and decoding second is the whole contract. Everything else — duplicates,
`+` handling, fragments, malformed escapes, `__proto__` — is a small, explicit choice you
should name out loud: values are strings, the first `=` splits, and `+` means a space.

## Convert an Object to a Query String

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `toQueryString(params)` that turns a flat object into a `&`-joined query string.
The contract:

- Scalars (`string`, `number`, `boolean`, `bigint`, `Date`) become `key=value` with both
  sides encoded by `encodeURIComponent` — separately, after stringifying.
- An array value becomes **repeated keys**: `{ tag: ["a", "b"] }` → `tag=a&tag=b`.
- `undefined` (plus functions and symbols) is **skipped**; `null` is kept as an
  **empty value** (`key=` with nothing after `=`).
- `false`, `0`, and `""` are kept; an object with nothing to emit yields `""`.

### Examples

```text
toQueryString({ page: 2, ok: false })          // => "page=2&ok=false"
toQueryString({ tag: ["a", "b"] })             // => "tag=a&tag=b"
toQueryString({ q: "hello world" })            // => "q=hello%20world"
toQueryString({ q: "a&b=c" })                  // => "q=a%26b%3Dc"
toQueryString({ a: 1, b: undefined, c: null }) // => "a=1&c="
toQueryString({})                              // => ""   (likewise { tag: [] })
toQueryString({ n: 0, s: "", f: false })       // => "n=0&s=&f=false"
```

### Approach

Collect `key=value` strings in a `pairs` array, then `join("&")`. Three decisions carry
the whole implementation:

1. **Encode last, encode separately.** `String(value)` first, then `encodeURIComponent`
   on the key and on the value — encoding the joined string would mangle `=` and `&`.
2. **Branch on shape, not truthiness.** Check `=== undefined`/`=== null` explicitly —
   `if (!value) continue` drops `0`, `false`, and `""`, which are real filter values.
3. **Expand arrays inline.** Each element gets its own pair under the same key: `null`
   becomes `key=`, `undefined`/function/symbol is skipped, and an empty array vanishes.

`Object.entries` ignores inherited properties for free. `Date` uses `toISOString`,
the same choice `JSON.stringify` makes.

### Implementation

```javascript
function toQueryString(params) {
  if (params === null || typeof params !== "object") {
    throw new TypeError("toQueryString expects an object");
  }

  const pairs = [];
  const push = (encodedKey, value) => {
    if (value instanceof Date) value = value.toISOString(); // same choice JSON makes
    else if (typeof value === "object") value = JSON.stringify(value); // flat: no a[b]
    pairs.push(`${encodedKey}=${encodeURIComponent(String(value))}`);
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue; // missing, not empty
    if (typeof value === "function" || typeof value === "symbol") continue;
    const encodedKey = encodeURIComponent(key);

    if (value === null) {
      pairs.push(`${encodedKey}=`); // present-but-empty
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined) continue;
        if (typeof item === "function" || typeof item === "symbol") continue;
        if (item === null) pairs.push(`${encodedKey}=`); // empty element
        else push(encodedKey, item);
      }
      continue;
    }

    push(encodedKey, value);
  }

  return pairs.join("&");
}
```

### Walkthrough

For `toQueryString({ q: "hello world", tag: ["a", "b c"], page: 2, c: null, b: undefined })`:

1. `Object.entries` yields five entries in order. `q` → `q=hello%20world` (space is
   `%20`, not `+` — that is `encodeURIComponent`'s rule; forms use `+`).
2. `tag` is an array → two pairs under the same key: `tag=a`, then `tag=b%20c`.
3. `page` → `page=2`. `c` is `null` → `c=`. `b` is `undefined` → skipped entirely.
4. `join("&")` gives `q=hello%20world&tag=a&tag=b%20c&page=2&c=`.

### Complexity

Time: `O(n)` over the entries plus encoding. Space: `O(k)` for the `k` pair strings.

### Edge Cases

- **`null` vs `undefined`:** `null` → `key=`; `undefined` → pair omitted. Functions and
  symbols are omitted like `undefined`.
- **Falsy values kept:** `0` → `"0"`, `false` → `"false"`, `""` → `key=`.
- **Empty array / empty object** → zero pairs. `{ tag: [] }` yields `""`, not `tag=`.
- **Special characters:** `&`, `=`, `?`, `#` inside a value are encoded (`%26`, `%3D`),
  so they never split into phantom pairs — the mirror of the parse rule.
- **Spaces:** `encodeURIComponent("a b")` is `"a%20b"`. `URLSearchParams` and HTML forms
  emit `"a+b"` instead; servers usually accept both, but state which one you produce.
- **Non-object input** (`null`, a string) → `TypeError`.
- **Nested objects** are `JSON.stringify`'d, not expanded; use the bracket serializer
  earlier in this chapter when the backend expects `a[b]=1`.

### Interview Follow-ups

- **Round-trip it:** feed the output into the `parseQuery` parser from the previous
  problem and check `tag=a&tag=b` comes back as `{ tag: ["a", "b"] }`; note `key=` and a
  missing key are distinguishable only if the parser preserves empty strings.
- **Compare with `URLSearchParams`:** `new URLSearchParams({ tag: ["a","b"] })` gives
  `tag=a%2Cb` (array coerced to `"a,b"`), not repeat-keys — the reason hand-rolling (or a
  library like `qs`) still exists.
- **Stable key order for caching:** sort `pairs` (or sort entries) before joining so
  `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` hash identically.

### Common Mistakes

- Dropping `0`/`false`/`""` with a truthiness guard instead of an explicit
  `=== undefined` check.
- Rendering `null` as the string `"null"` instead of an empty value.
- Encoding the joined string once at the end, which mangles the `&`/`=` separators.
- Using `encodeURI` (leaves `&`, `=`, `?`, `#` intact) or `JSON.stringify` on every value
  (`"a"` becomes `%22a%22`).
- Joining arrays with commas (`tag=a,b`) instead of repeat-keys, or forgetting that
  `encodeURIComponent` emits `%20` while forms emit `+`.

### Takeaway

Stringify each scalar, encode the key and the value separately, expand arrays into
repeated keys, and drop only `undefined` — `null` means empty, `false`/`0`/`""` are data.

## Parse CSV Text

`Difficulty: Medium` `Probability: High`

### Problem

Implement `parseCSV(text, options)` that parses comma-separated-values text into rows.
The contract:

- Signature: `parseCSV(text, { headers = false } = {})`; without `headers` return rows
  of field strings, with `headers: true` return objects keyed by the first row (short
  rows pad with `""`, extra fields are ignored).
- A `"`-wrapped field may hold commas, newlines, and `""` (one literal `"`).
- Line breaks are `\n` or `\r\n`; a trailing newline adds no row. Fields stay strings.

Split-lines-then-split-commas fails on any quoted comma or newline — use one pass with
an `inQuotes` flag instead.

### Examples

```text
parseCSV("a,b,c")                    // => [["a","b","c"]]
parseCSV("a,b\nc,d")                 // => [["a","b"],["c","d"]]
parseCSV('"b,c",d')                  // => [["b,c","d"]]
parseCSV('"d""e",f')                 // => [['d"e',"f"]]
parseCSV("a,,c")                     // => [["a","","c"]]
parseCSV("")                         // => []
parseCSV('"line1\nline2",b')         // => [["line1\nline2","b"]]  (newline inside quotes)
parseCSV("name,age\nAda,36", { headers: true }) // => [{ name: "Ada", age: "36" }]
```

### Approach

One pass with `rows`/`row`/`field` accumulators and `inQuotes`. For each character:

1. **Inside quotes** only `"` is special: `""` appends one `"` and skips two chars; a lone
   `"` closes the section. Commas and newlines append literally — why lines-first fails.
2. **Outside quotes** a comma ends the field, `\n` or `\r\n` ends the row, and `"` on an
   empty field opens a quoted section. A `"` elsewhere (`ab"cd`) is kept literally.
3. **Flush at the end:** pending field and row are pushed unless the input was empty or
   ended with a newline (no phantom `[""]`). An unterminated quote throws `SyntaxError`.

With `headers: true`, map data rows to objects off the first row (`""` for missing).

### Implementation

```javascript
function parseCSV(text, { headers = false } = {}) {
  if (typeof text !== "string") throw new TypeError("parseCSV expects a string");

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; } // "" -> one "
        else { inQuotes = false; i += 1; }
      } else { field += c; i += 1; } // commas and newlines are literal here
    } else if (c === '"' && field === "") {
      inQuotes = true;
      i += 1;
    } else if (c === ",") {
      row.push(field); field = ""; i += 1;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1; // consume the pair once
      row.push(field); rows.push(row); row = []; field = ""; i += 1;
    } else {
      field += c; i += 1;
    }
  }

  if (inQuotes) throw new SyntaxError("Unterminated quoted field in CSV input");
  if (field !== "" || row.length > 0) { // unless empty input or trailing newline
    row.push(field);
    rows.push(row);
  }

  if (!headers) return rows;
  const [headerRow, ...dataRows] = rows;
  return dataRows.map((data) =>
    Object.fromEntries(headerRow.map((name, index) => [name, data[index] ?? ""]))
  );
}
```

### Walkthrough

Parse `'"a,b","c""d",e\nf,g'`:

1. `"` on an empty field sets `inQuotes`; `a,b` appends literally (no split inside
   quotes). Closing `"`, then `,` ends the field → `row = ["a,b"]`.
2. `"` opens again; `c`, `""` (one `"`), `d`, closing `"`, `,` → `["a,b", 'c"d']`;
   then `e` and `\n` push the row.
3. `f,`, then `g` stays pending until the end-of-input flush →
   `[["a,b", 'c"d', "e"], ["f", "g"]]`.

### Complexity

Time: `O(n)` — one visit per character. Space: `O(n)` for the output; `O(1)` scan state.

### Edge Cases

- **`""` input** → `[]`, not `[[""]]` — that is what the flush guard is for.
- **Line breaks:** `\r\n` is one break (a lone `\r` too); a trailing newline adds no row,
  but a blank middle line is preserved as `[""]`.
- **Empty fields** (`"a,,c"`, `",b"`, `"a,"`) → `""` entries, never skipped.
- **Doubled quotes** (`'"a""b"'` → `a"b`); an unterminated quote throws `SyntaxError`.
- **Header mismatch:** short rows pad with `""`, long rows truncate; duplicate names mean
  last wins. (Untrusted headers need `Object.create(null)` — `__proto__` would pollute.)

### Interview Follow-ups

- **Other delimiters:** parameterize the comma so TSV works with `"\t"`; only the split
  character moves, the state machine is unchanged.
- **Type coercion pass:** map fields with a schema (`Number` only when
  `String(Number(v)) === v` so `"007"` stays a string); never coerce mid-parse.
- **Stringify back:** quote fields holding commas, quotes, or newlines and double the
  inner quotes; test that `parse(stringify(rows))` round-trips.

### Common Mistakes

- `line.split(",")` — breaks on quoted commas, quoted newlines, and `""` escapes alike.
- Emitting a phantom `[[""]]` for empty input or a phantom row for a trailing newline.
- Trimming fields (corrupts `"  padded  "`) or coercing `"007"` mid-parse.

### Takeaway

CSV is a tiny state machine, not two `split` calls: one pass with `inQuotes` lets commas,
newlines, and `""` live inside quotes while splitting fields outside them.

## Serialize Cyclic Objects Safely

`Difficulty: Medium` `Probability: High`

### Problem

Implement `safeStringify(value, options)` that acts like `JSON.stringify` but survives
circular references, replacing each cycle with `"[Circular]"` (or throwing, on request).
The contract:

- Signature: `safeStringify(value, { replacer = null, space, onCircular = "replace",
  circularValue = "[Circular]" } = {})`.
- `onCircular: "throw"` throws `TypeError` on the first cycle, like native stringify.
- A non-circular **shared reference** is serialized twice, not flagged — detection is
  scoped to the current ancestor path, not the whole document.
- Everything else (`toJSON`, user `replacer`, `Date`, `space`, `NaN` → `null`) behaves
  exactly as in `JSON.stringify`, because the work is delegated to it.

### Examples

```text
const self = { name: "root" }; self.me = self;
safeStringify(self)                              // => '{"name":"root","me":"[Circular]"}'
safeStringify(self, { onCircular: "throw" })     // => TypeError: Converting circular structure to JSON
const shared = { x: 1 };
safeStringify({ a: shared, b: shared })          // => '{"a":{"x":1},"b":{"x":1}}'  (no false positive)
const loop = []; loop.push(loop);
safeStringify(loop)                              // => '["[Circular]"]'
safeStringify({ a: 1, b: 2 }, { replacer: (k, v) => (k === "b" ? undefined : v) })
 // => '{"a":1}'
```

### Approach

Clone first with `decycle`, then hand the acyclic clone to native `JSON.stringify`.
`decycle` carries a `WeakMap` of objects on the current ancestor path:

1. Primitives pass through; `toJSON` (if present) applies first, exactly like native
   stringify — this is how `Date` is handled, with no special-casing.
2. An object already in the map is an ancestor — return `circularValue` or throw.
3. Otherwise recurse into a fresh clone, then **delete the object on the way out** so a
   sibling may reuse it — the line that separates cycles from shared (DAG) references.

`replacer`, `space`, and every `undefined`/function/symbol rule ride along unchanged,
because the final `JSON.stringify` enforces them. `WeakMap` keeps tracking collectable.

### Implementation

```javascript
function safeStringify(value, options = {}) {
  const { replacer = null, space, onCircular = "replace", circularValue = "[Circular]" } = options;

  const ancestors = new WeakMap(); // object -> path, for the CURRENT path only

  function decycle(node, path) {
    if (node === null || typeof node !== "object") return node;
    if (ancestors.has(node)) {
      if (onCircular === "throw") throw new TypeError("Converting circular structure to JSON");
      return circularValue;
    }
    ancestors.set(node, path);
    try {
      const converted = typeof node.toJSON === "function" ? node.toJSON() : node;
      if (converted === null || typeof converted !== "object") return converted;
      if (converted !== node) return decycle(converted, path); // node stays an ancestor
      if (Array.isArray(node)) {
        return node.map((item, index) => decycle(item, `${path}/${index}`));
      }
      const clone = {};
      for (const [key, child] of Object.entries(node)) {
        clone[key] = decycle(child, `${path}/${key}`);
      }
      return clone;
    } finally {
      ancestors.delete(node); // siblings may reuse the object (a DAG, not a cycle)
    }
  }

  return JSON.stringify(decycle(value, "#"), replacer, space);
}
```

### Walkthrough

For `self = { name: "root" }; self.me = self`:

1. `decycle(self, "#")`: an object, not in the map → stored. No `toJSON`, so clone each
   entry: `"name"` is a primitive → `"root"`.
2. `"me"` holds `self`, already in the map → `"[Circular]"`; `self` leaves the map on
   exit. `JSON.stringify` then emits `{"name":"root","me":"[Circular]"}`.

For `{ a: shared, b: shared }`, step 2 never fires: `shared` is deleted after the `a`
subtree finishes, so the `b` subtree clones it fresh — serialized twice, no false hit.

### Complexity

Time: `O(n)` to clone plus native stringify. Space: `O(d)` for the ancestor map, plus an
`O(n)` intermediate clone — the price of precision over a replacer-only wrapper.

### Edge Cases

- **Shared references (DAG)** serialize twice — `ancestors.delete` on exit is the line
  that makes it work; an add-only set would false-positive here.
- **`onCircular: "throw"`** → `TypeError`, matching native stringify (not `RangeError`).
- **`toJSON` runs first**, on the original: a `Date` in a cycle arrives already stringified.
- **The user `replacer` sees the clone**, not the original — same keys and values, but
  `this` is a decycled holder and class instances are already plain objects.
- **`circularValue` collisions:** if `"[Circular]"` is legitimate data, pass a sentinel
  object (e.g. `{ $ref: "#" }`) or `null` instead.
- **Non-JSON values** (`undefined`/functions/symbols, `NaN` → `null`, `BigInt` throws)
  are inherited from the final `JSON.stringify`, unchanged.
- **`WeakMap`** entries vanish with their keys; a cross-call `Set` would leak every object.

### Interview Follow-ups

- **Reference-preserving round-trip:** emit `{ $ref: path }` (JSON Pointer, like
  `flatted`) plus a `JSON.parse` reviver resolving refs back into references.
- **Replacer-only variant:** wrap `JSON.stringify`'s replacer with an add-only `WeakSet`.
  Shorter, but DAGs false-positive — name the trade-off before shipping it.
- **`structuredClone`** already preserves cycles natively (including `Map`/`Set`/`Date`);
  `JSON` cannot, because the format has no reference type.
- **Depth limiting:** thread a `depth` counter and throw past a threshold — the mitigation
  for untrusted deeply-nested payloads (stack-overflow DoS).

### Common Mistakes

- One global add-only `Set`: every repeated reference becomes a false cycle.
- `try { JSON.stringify(x) } catch { ... }` replaces the *whole document*, not the node.
- Stamping `obj.__circular = true` onto the input (mutates data, breaks frozen objects).
- Holding tracked objects in a cross-call `Set`, pinning them in memory.
- Throwing `RangeError` instead of native's `TypeError`.

### Takeaway

Cycle safety is an ancestor set, not a visited set: track the current path, delete on
exit, and replace-or-throw on a hit. Only add-and-delete distinguishes a true cycle
from a shared reference — which is what `decycle`/`$ref` exists for.

## Parse URLs with the `URL` API

`Difficulty: Easy` `Probability: High`

### Problem

Implement `parseURL(input, base)` that parses a URL **without hand-rolling the grammar**,
using the platform `URL` and `URLSearchParams` APIs. Say it out loud: don't hand-roll
this — URL parsing looks like string splitting until the first IPv6 literal or encoded
delimiter. The contract:

- Signature: `parseURL(input, base)` → `{ protocol, host, hostname, port, pathname,
  search, searchParams, hash, origin }`; `searchParams` is a plain object with
  repeat-keys collected into arrays.
- Absolute URLs need no base; relative ones resolve against `base` (`.`/`..` included).
- Invalid input throws the native `TypeError` — never partial garbage. No regexes, no
  `split("?")`, no manual decoding: the API handles IPv6, IDN, default ports, and auth.

### Examples

```text
parseURL("https://example.com:8080/a/b?x=1&x=2#top")
// => { protocol: "https:", host: "example.com:8080", pathname: "/a/b",
//      searchParams: { x: ["1", "2"] }, hash: "#top", origin: "https://example.com:8080" }

parseURL("/users?page=2#list", "https://api.test.com/v1/")
// => pathname "/users", search "?page=2", hash "#list"

parseURL("https://example.com/caf%C3%A9?q=a+b")
// => pathname "/caf%C3%A9", searchParams { q: "a b" }  ("+" decodes to space)

parseURL("/only-path")              // => TypeError (relative URL needs a base)
parseURL("::://")                   // => TypeError (invalid URL)
```

### Approach

Construct `new URL(input, base)` and project its fields into a plain object. That one
line buys the WHATWG URL Standard: `protocol` (with `:`), `host` (default port omitted),
`hostname` (IPv6 brackets stripped, IDN decoded), `port` (`""` when default), `pathname`
(encoded, dot segments resolved), `search`/`hash` (raw, `""` when absent), `origin`.

Collect `searchParams` repeats into arrays so `?x=1&x=2` survives (`Object.fromEntries`
keeps only the last). Decoding, `+`-as-space, and malformed-escape rules come free —
the same behaviour `parseQuery` hand-rolls for bare query strings.

A splitter breaks on `?`/`#` inside encoded values, trips on `[::1]:8080` colons, and
cannot resolve `../` or protocol-relative `//h/p` references.

### Implementation

```javascript
function parseURL(input, base) {
  // `new URL` throws TypeError on invalid input and on a relative input with no base.
  const url = base === undefined ? new URL(input) : new URL(input, base);

  // First occurrence stays a string; the second upgrades to an array.
  const searchParams = {};
  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(searchParams, key)) searchParams[key] = value;
    else if (Array.isArray(searchParams[key])) searchParams[key].push(value);
    else searchParams[key] = [searchParams[key], value];
  }

  return {
    protocol: url.protocol,   // "https:" (colon included)
    host: url.host,           // "example.com:8080" (default port omitted)
    hostname: url.hostname,   // "example.com" ("[::1]" brackets stripped)
    port: url.port,           // "8080" or "" when default/implicit
    pathname: url.pathname,   // encoded path, dot segments resolved
    search: url.search,       // "?x=1" or "" (leading "?" included)
    searchParams,             // plain object; repeats are arrays
    hash: url.hash,           // "#top" or "" (leading "#" included)
    origin: url.origin,       // scheme + host + port ("null" for non-http(s))
  };
}
```

For the reverse direction: `const url = new URL("/users", base); url.searchParams.set(
"page", "2"); url.hash = "list"; return url.href;` — `searchParams` re-encodes for you.

### Walkthrough

For `parseURL("/users?page=2&page=3#list", "https://api.test.com/v1/")`:

1. `new URL(...)` takes scheme and host from the base and replaces the path with the
   root-absolute `/users`. `url.origin` is `"https://api.test.com"`.
2. `pathname` → `"/users"`, `search` → `"?page=2&page=3"`, `hash` → `"#list"`.
3. `searchParams` yields `["page","2"]`, `["page","3"]` → `{ page: ["2","3"] }`.
4. Result: `{ protocol: "https:", host: "api.test.com", port: "", pathname: "/users",
   search: "?page=2&page=3", searchParams: { page: ["2","3"] }, hash: "#list" }`.

### Complexity

Time: `O(n)` in the URL length, inside the native parser. Space: `O(k)` for the params.

### Edge Cases

- **Relative input without a base, or invalid input** → native `TypeError`; never catch
  it and return partial data.
- **Default ports normalized:** `new URL("https://h:443/").port === ""` and `.host`
  drops `:443` — compare via the API, not raw strings.
- **Fragments never reach the server:** `hash` is client-only; `search` excludes it.
- **`+`** is a space in queries but literal in the path — an easy hand-rolled bug.
- **Mutability:** `url.searchParams` is a live view — keep the projected plain object,
  not the view, if the caller might mutate the `URL` afterwards.

### Interview Follow-ups

- **Build URLs, don't concat them:** `new URL(path, base)` plus
  `searchParams.set/append` and `hash = ...`; setting `.search` raw skips encoding.
- **Same-origin checks:** compare `url.origin` strings (or `protocol` + `host`), never
  `href.startsWith(...)` — the prefix test is fooled by `https://safe.com.evil.com/`.
- **Canonicalize for cache keys:** `searchParams.sort()` then `href` gives a stable order;
  note it still emits `+` for spaces.
- **Validate user-supplied URLs:** allow-list `protocol` (`https:`) after parsing rather
  than regexing the raw string — `javascript:` with leading whitespace/control characters
  defeats naive prefix checks.

### Common Mistakes

- `input.split("?")` / `split("#")` — breaks on encoded `%3F`/`%23` and on `@`/`:` inside
  auth or IPv6 (`http://[::1]:8080/`).
- Comparing origins or hosts with string prefixes instead of `url.origin`.
- Building query strings by concatenation (`url + "?page=" + page`) and double-encoding
  or forgetting to encode entirely.
- Reading `Object.fromEntries(url.searchParams)` and silently keeping only the last of
  repeated keys.
- Forgetting `base` for relative links, or treating `pathname` as decoded (it is
  encoded — use as-is for `fetch`, decode only for display).

### Takeaway

URL parsing is a standard, not a string split: one `new URL(input, base)` call yields
protocol, host, path, params, and fragment — rules no hand-rolled splitter gets right.


