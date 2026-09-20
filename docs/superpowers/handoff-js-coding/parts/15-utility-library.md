## Implement lodash-like `get`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `get(object, path, defaultValue)` matching `_.get`: resolve `path` — a dot/bracket string such as `"a.b[0].c"`, or an array of keys — against `object`, and return the value, or `defaultValue` when the resolved value is `undefined`.

Contract:

- Any `null`/`undefined` reached mid-path short-circuits to `defaultValue` (never throws).
- A resolved `null` is returned as-is; only `undefined` is replaced.
- Inherited properties are readable — plain `[[Get]]`, no own-property guard.
- String and numeric indices are equivalent (`obj[0]` and `obj["0"]`).
- Quoted bracket keys address keys that contain dots: `'["x.y"]'`.
- A single non-string key (number, symbol) is treated as a one-element path.

The full path-parsing and `get`/`set`/`unflatten` treatment is on the [Objects](04-objects.md) page; this is the lodash-shaped contract.

### Examples

```text
const o = { a: { b: [{ c: 1 }, { c: 2 }] }, "x.y": 9, u: undefined };

get(o, "a.b[1].c")               // => 2
get(o, ["a", "b", 0, "c"])       // => 1
get(o, '["x.y"]')                // => 9    (literal dotted key)
get(o, "x.y")                    // => undefined (two separate keys)
get(o, "a.b[9].c", "n/a")        // => "n/a"
get(o, "missing.a", "n/a")       // => "n/a"
get({ a: null }, "a", "n/a")     // => null  (null is not replaced)
get({ a: null }, "a.b", "n/a")   // => "n/a"
get(o, "u", "n/a")               // => "n/a"
get(o, [])                       // => o
get(null, "a", "fallback")       // => "fallback"
```

### Approach

Two phases: normalize the path into an array of keys, then fold the object through those keys.

- **Normalize (`toPath`).** Arrays pass through untouched; a string is tokenized by one regex that alternates dot-separated segments (`[^.[\]]+`) with bracketed ones (numeric, quoted, or empty). Anything else is a single key. This mirrors lodash's `stringToPath` + `castPath`.
- **Fold.** `current = current[key]` in a loop. Guard `current == null` *before* indexing, because `undefined["x"]` throws.
- **Default.** Return `current === undefined ? defaultValue : current`. Do **not** write `current ?? defaultValue`: `??` also swallows `null`, which lodash deliberately keeps.

A `reduce` is equivalent but allocates a closure; the loop is clearer for the guard.

### Implementation

```javascript
// "a.b[0][1].c" -> ["a", "b", "0", "1", "c"]; arrays pass through unchanged.
function toPath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== "string") return [path];

  const keys = [];
  const re = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]/g;
  let match;
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined) keys.push(match[1]);                 // [0], [-1], [1.5]
    else if (match[2] !== undefined) keys.push(match[3].replace(/\\(.)/g, "$1")); // ["a.b"]
    else keys.push(match[0]);                                        // bare segment
  }
  return keys;
}

function get(object, path, defaultValue) {
  const keys = toPath(path);
  let current = object;

  for (let i = 0; i < keys.length; i += 1) {
    if (current == null) return defaultValue; // dead end: stop before indexing
    current = current[keys[i]];
  }

  return current === undefined ? defaultValue : current; // only `undefined` is replaced
}
```

### Walkthrough

`get({ a: { b: [{ c: 1 }, { c: 2 }] } }, "a.b[1].c")`:

1. `toPath` scans the string into `["a", "b", "1", "c"]` — note the bracket index becomes the string `"1"`, which still indexes an array.
2. `current = object["a"]` → `{ b: [...] }`.
3. `current["b"]` → `[{ c: 1 }, { c: 2 }]`.
4. `current["1"]` → `{ c: 2 }`.
5. `current["c"]` → `2`; not `undefined`, so `2` is returned.

For `get(o, "a.b[9].c", "n/a")`: step 4 yields `undefined`; at the top of the next iteration the `current == null` guard fires and returns `"n/a"` — no `TypeError`. For `get({ a: null }, "a")` the loop ends with `current === null`; the final check is `=== undefined`, so `null` comes back.

### Complexity

Time: `O(p + k)` — `p` characters to parse a string path, `k` segments to walk; array paths skip parsing. Space: `O(k)` for the key array.

### Edge Cases

- Mid-path `null`/`undefined` → `defaultValue`; an explicit `null` value → returned unchanged.
- Inherited props (`"toString"`) are readable; lodash does not restrict to own keys.
- Empty path array → returns `object` itself.
- `get(null, "a", 1)` and `get(undefined, "a")` → `defaultValue` / `undefined`, never a throw.
- Sparse array holes read as `undefined` → `defaultValue`.
- `"1"` and `1` address the same slot; negative bracket indices (`[-1]`) are parsed but are not array-relative.
- A key that is itself `undefined` in the object is indistinguishable from a missing key — use `has` when that matters.

### Interview Follow-ups

- **Implement `has(object, path)`**: the same walk returning a boolean; switch the final read to `Object.hasOwn(parent, key)` for own-only semantics.
- **`unset(object, path)`**: walk to the parent, then `delete parent[lastKey]`; return `true`/`false`.
- **Cache `toPath`**: memoize parsing in a `Map` when the same literal path is used in a hot loop.
- **`get` with a default function**: lodash does not support it, but `defaultValue` could be invoked lazily for expensive defaults.
- **Prototype pollution**: never let `path` reach `__proto__`/`constructor.prototype` on the *write* side (next problem).

### Common Mistakes

- `path.split(".")`, which mangles `"a[0].b"` and quoted keys.
- Indexing without a null guard → `Cannot read properties of undefined`.
- `current ?? defaultValue`, which rewrites a legitimate `null`.
- Treating the path array as strings only; numbers and symbols are valid keys.
- Expecting `"x.y"` to match a literal dotted key — that needs `'["x.y"]'`.

### Takeaway

`get` is a path normalizer plus a one-line fold. The only real rule is that `defaultValue` covers `undefined` — missing paths *and* stored `undefined` — but never `null`.

## Implement lodash-like `set`

`Difficulty: Medium` `Probability: High`

### Problem

Implement `set(object, path, value)` matching `_.set`: assign `value` at `path`, **creating** missing intermediate containers, and return the mutated `object`.

Contract:

- Mutates in place; returns the same reference.
- A missing segment is created as an **array** when the *next* segment is an array index (`"0"`, `"12"`), otherwise a plain object.
- A non-object value at an intermediate segment is replaced by a fresh container.
- Existing arrays receive numeric assignment, so `length` grows as usual.
- `path` accepts the same string/array forms as `get`.
- Hardening deviation: segments named `__proto__`, `constructor`, or `prototype` are rejected, because traversing into `__proto__` writes to `Object.prototype` (prototype pollution). lodash itself shipped CVEs here.

The container-creation rules and the pollution story are unpacked on the [Objects](04-objects.md) page.

### Examples

```text
const o = {};
set(o, "a.b[0].c", 1);   // o => { a: { b: [ { c: 1 } ] } }
set(o, "a.b[1].c", 2);   // o => { a: { b: [ { c: 1 }, { c: 2 } ] } }

const arr = [];
set(arr, "[0].x", 5);    // arr => [ { x: 5 } ]   (index => array container)

const keep = { a: 1 };
set(keep, "a.b", 2);     // keep => { a: { b: 2 } }  (1 replaced by {})
set({}, "a[2]", 9);      // => { a: [ <2 empty>, 9 ] }  (sparse array)

set({}, "__proto__.polluted", true); // => TypeError (blocked)
```

### Approach

One walk with lookahead:

1. Normalize with the same `toPath` as `get`.
2. At each non-final segment, look at `current[key]`. If it is a valid container (any object/function), reuse it. Otherwise overwrite it with `isIndex(nextKey) ? [] : {}`.
3. Descend. At the final segment, assign `value`.

Two details carry the whole problem:

- **Lookahead chooses the container type.** `"a[0]"` must make `a` an array; `"a.b"` must make `a` an object. Deciding from the *current* key is the classic bug.
- **Index detection** must match spec array indices: canonical (`"0"`, not `"00"` or `" 1"`), integer, and within `0..2**32-2`, so `length` stays coherent.

`isObject` here includes functions, matching lodash, so `set(fn, "meta.calls", 1)` traverses rather than clobbers.

### Implementation

```javascript
const MAX_INDEX = 2 ** 32 - 1;

function isIndex(key) {
  const s = typeof key === "string" ? key : String(key);
  if (!/^(?:0|[1-9]\d*)$/.test(s)) return false; // canonical form only
  return Number(s) < MAX_INDEX;
}

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function set(object, path, value) {
  if (object == null) return object;

  const keys = toPath(path);
  let current = object;

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (FORBIDDEN.has(String(key))) {
      throw new TypeError(`set: unsafe path segment "${String(key)}"`);
    }

    if (i === keys.length - 1) {
      current[key] = value; // final assignment; length grows naturally on arrays
      break;
    }

    const existing = current[key];
    const isContainer =
      existing !== null && (typeof existing === "object" || typeof existing === "function");

    if (!isContainer) {
      // Look ahead: the NEXT segment decides array vs object.
      current[key] = isIndex(keys[i + 1]) ? [] : {};
    }
    current = current[key];
  }

  return object;
}
```

### Walkthrough

`const o = {}; set(o, "a.b[0].c", 1)`:

1. `toPath` → `["a", "b", "0", "c"]`.
2. `i=0`, key `"a"`, not last. `o["a"]` is `undefined` → not a container. Next key is `"b"`, not an index → `o.a = {}`. Descend.
3. `i=1`, key `"b"`. `o.a.b` is `undefined`. Next key is `"0"`, an index → `o.a.b = []`. Descend.
4. `i=2`, key `"0"`. `[][0]` is `undefined`. Next key is `"c"` → `arr[0] = {}`. Descend.
5. `i=3` is last: `{ }["c"] = 1`. Result `{ a: { b: [{ c: 1 }] } }`, returned as `o`.

Now `set(o, "a.b[1].c", 2)` reuses the existing array at `o.a.b`, assigns `arr[1] = {}`, then `c = 2` — yielding the two-element array in the examples.

### Complexity

Time: `O(p + k)` — parse plus walk. Space: `O(k)` for the key array; new containers are `O(1)` each, created only along the missing suffix.

### Edge Cases

- Existing non-container (`number`, `string`, `null`, `undefined`) is replaced wholesale; existing objects/functions are drilled into.
- `set({}, "a[2]", 9)` leaves holes in `a`; they read as `undefined`.
- Empty path `[]` → no segment is final, loop body never runs, object returned unchanged.
- `object` `null`/`undefined` → returned unchanged (lodash's `set` requires an object; guard rather than throw).
- Symbol and numeric path segments are used as-is.
- `__proto__`/`constructor`/`prototype` anywhere → `TypeError`. Without the guard, `set({}, "__proto__.x", 1)` pollutes every object.
- Setting on a frozen object silently no-ops in sloppy mode / throws in strict; the function itself does not detect it.

### Interview Follow-ups

- **`update(object, path, updater)`**: read with `get`, call `updater(currentValue)`, write with `set` — lodash composes them exactly this way.
- **`unset`**: same walk, `delete` at the last segment.
- **Why look ahead for the container?** Because the path grammar encodes the shape: the segment *after* the key is what the key must hold.
- **Immutability variant**: clone along the path (structural sharing) instead of mutating — the pattern behind `immer` and Redux reducers.
- **Why not `Object.assign`?** It shallow-merges whole branches and cannot create from a path; `set` is path-addressed.

### Common Mistakes

- Deciding container type from the current key (creates `{0: ...}` instead of `[...]`).
- Overwriting an existing object branch when a deeper path is requested.
- Using `isIndex` loosely (`"01"`, `"-1"`, `"1e3"` all pass a naive check).
- Ignoring prototype pollution; a malicious path from user input is a real exploit.
- Forgetting `return object`, or returning a copy and confusing callers.

### Takeaway

`set` is `get`'s walk plus container creation, and the container type is dictated by the *next* path segment. Guard the dangerous keys or your "utility" becomes an exploit primitive.

## Implement lodash-like `once`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `once(fn)` returning a wrapper that invokes `fn` **at most once**. The first call forwards `this` and arguments and caches the return value; every later call returns that cached value and never runs `fn` again.

Contract:

- Exactly one invocation, ever, no matter how many calls or in what receiver/argument form.
- `this` and arguments are forwarded on the **first** call only; later arguments are ignored.
- The cached value is returned **by identity** on every subsequent call (important when it is an object).
- If the first call throws, the wrapper does **not** retry — the "called" flag flips first. This matches lodash's `before(2)` semantics.
- The result is captured even when it is `undefined`, so the wrapper must track "called" separately from "has a value".

The closure/state discussion is on the [Functions & Closures](05-functions-closures.md) page; the identity/`this` mechanics appear here in lodash form.

### Examples

```text
let calls = 0;
const init = once(() => { calls += 1; return { id: calls }; });

init()            // => { id: 1 }
init()            // => { id: 1 }   (same object reference)
calls             // => 1

const greet = once(function (name) { return this.prefix + name; });
greet.call({ prefix: "Hi " }, "Ada")   // => "Hi Ada"
greet.call({ prefix: "Yo " }, "Bob")   // => "Hi Ada"   (this + args ignored)

const boom = once(() => { throw new Error("first and only"); });
try { boom(); } catch (e) { e.message; } // => "first and only"
boom()                                    // => undefined (not retried)
```

### Approach

A closure over two variables: a boolean `called` and a `result` slot.

- Use a boolean, not `result !== undefined`, so `fn` returning `undefined` still marks the call as done. (A sentinel `UNSET` symbol works too.)
- Flip `called` **before** invoking, so a thrown first call is not retried — deliberately mirroring lodash, and worth stating because the "friendlier" retry behavior is a surprise change of contract.
- Forward with `Reflect.apply(fn, this, args)`: the wrapper must not be an arrow if `this` should pass through.
- Optional: drop the reference to `fn` after the first call to release whatever it closed over.

### Implementation

```javascript
function once(fn) {
  if (typeof fn !== "function") throw new TypeError("once expects a function");

  let called = false;
  let result;

  return function (...args) {
    if (!called) {
      called = true;                          // flip first: a throw is not retried
      result = Reflect.apply(fn, this, args); // `this` + args forwarded once
      fn = null;                              // release the closure
    }
    return result;
  };
}
```

### Walkthrough

`init()` on the example:

1. First call: `called` is `false` → set it to `true`, run the arrow → `calls` becomes `1`, returns `{ id: 1 }`; `result` holds that object and `fn` is dropped.
2. Second call: `called` is `true`, so the body short-circuits and returns the same `result` reference. A third call behaves identically.
3. `calls` stays `1`; `init() === init()` is `true`.

For `greet.call({ prefix: "Yo " }, "Bob")` after the first call: `called` is already `true`, so neither the new receiver nor the new argument is consulted; the first result `"Hi Ada"` comes back.

### Complexity

Time: first call `O(1)` overhead plus `fn`; later calls `O(1)`. Space: `O(1)` — one boolean and one slot, retaining `result` (and, before the first call, `fn`).

### Edge Cases

- `fn` returns `undefined` → still only called once; the boolean tracks state, not the value.
- First call throws → flag already set, so later calls return `undefined` and never retry.
- Async `fn` → the cached promise is immutable; if it rejects, every caller sees the same rejection. Cache a failure-recovery wrapper (`p.catch(e => { called = false; throw e; })`) if retry-on-failure is wanted, but note that breaks the "at most once" contract.
- Recursive/re-entrant call from inside `fn` → the inner call is already `called`, returns `undefined` (the result is not assigned yet). Document if that matters.
- `new once(fn)()` → `this` is the new object; the result is discarded per the `new` rules only if `fn` returns an object. `once` is not a constructor; keep it a plain function.
- `this` is not forwarded if you write the wrapper as an arrow.

### Interview Follow-ups

- **`once` vs `memoize`**: `once` ignores all arguments after the first; `memoize` keys on arguments. `once` ≡ `memoize` with a constant key.
- **Add `reset()`**: expose a method that clears `called` (useful for tests); note it breaks purity and concurrency assumptions.
- **Why flip before the call?** So a throwing initializer is attempted once, matching lodash and preventing thundering-herd retries.
- **Lazy singleton**: `const client = once(() => createClient())` is the idiomatic use — initialization on first use, cached thereafter.
- **Production**: lodash's `once`, or a module-level `let` plus null check.

### Common Mistakes

- Testing `result !== undefined` as the "called" flag, so an `undefined`-returning `fn` runs again.
- Using an arrow wrapper, silently dropping `this`.
- Guarding *after* the call, so a throw retries and can double-run side effects.
- Forgetting to `return result`, so later calls are `undefined`.
- Assuming the cached object is a copy — it is the same reference, and callers can mutate it for everyone.

### Takeaway

`once` is a two-variable closure: a boolean that flips before the call and a slot that holds the first result forever. The interesting decisions are `undefined`-as-a-value and no-retry-after-throw, and both are about the flag, not the value.

## Implement lodash-like `memoize` (with a `resolver`)

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `memoize(fn, resolver)` matching `_.memoize`: return a wrapper that caches `fn`'s result per cache key, where

- the **default key is `args[0]` only** — the rest of the arguments are ignored;
- `resolver(...args)` overrides the key and receives every argument, called with the wrapper's `this`;
- a cached key is detected with `cache.has(key)`, so a cached `undefined` is still a hit;
- the cache is exposed as `memoized.cache` with `has`/`get`/`set`/`delete`/`clear`.

The closure, arity, and cache-key themes are developed on the [Functions & Closures](05-functions-closures.md) page; the lodash-specific contracts (`args[0]` key, `resolver`, exposed cache) are the point here.

### Examples

```text
let calls = 0;
const square = memoize((n) => { calls += 1; return n * n; });

square(4)   // => 16, calls === 1
square(4)   // => 16, calls === 1   (cache hit)
square(5)   // => 25, calls === 2

// The DEFAULT key ignores everything after the first argument:
const add = memoize((a, b) => a + b);
add(1, 100) // => 101
add(1, 999) // => 101   (same key "1" -> stale value)

// A resolver fixes that by hashing all arguments:
const add2 = memoize((a, b) => a + b, (...args) => args.join(":"));
add2(1, 100) // => 101
add2(1, 999) // => 1000

// Objects are keyed by identity unless the resolver stringifies them:
const id = memoize((o) => o.id, (o) => o.id);
id({ id: 1 }) // => 1
id({ id: 1 }) // => 1 (cache hit: resolver produced the same key)
```

### Approach

A `Map` plus the two lodash rules.

- **Key selection.** `resolver ? resolver.apply(this, args) : args[0]`. This one line is where most bugs and most interview value live: a beginner keys on all arguments (`JSON.stringify(args)`), which is *better* but is not what lodash does, and interviewers ask about the difference explicitly.
- **Hit test.** `cache.has(key)`, never `cache.get(key) !== undefined` — otherwise an `undefined` return is recomputed forever.
- **`this`.** Both `fn` and `resolver` get `Reflect.apply(..., this, args)`, so method memoization works — and note that a key that omits `this` will leak results across receivers.
- **Why `Map`.** Keys by SameValueZero: `NaN`, numbers, strings, and object references all work, without stringifying. Symbols work too.

`Map` is a clean stand-in for lodash's `MapCache`; the exposed `cache` keeps the same five-method shape.

### Implementation

```javascript
function memoize(fn, resolver) {
  if (typeof fn !== "function") throw new TypeError("memoize expects a function");

  const cache = new Map();

  function memoized(...args) {
    // lodash's default key is ONLY args[0]; the resolver sees all of them.
    const key = resolver ? Reflect.apply(resolver, this, args) : args[0];

    if (cache.has(key)) return cache.get(key); // `has`, so cached undefined is a hit

    const value = Reflect.apply(fn, this, args);
    cache.set(key, value);
    return value;
  }

  memoized.cache = cache; // same shape as lodash's MapCache
  return memoized;
}
```

### Walkthrough

`add2(1, 100)` then `add2(1, 999)`:

1. First call: `resolver(1, 100)` → `"1:100"`; `cache.has` is `false`, so `fn(1, 100)` runs → `101`, stored under `"1:100"`.
2. Second call: `resolver(1, 999)` → `"1:999"` — a *different* key, so `fn` runs again → `1000`.

Contrast the default-key `add`: the second call keys on `args[0]` alone → `1`, which is already present, so it returns the stale `101` and never computes `1000`. That divergence is the whole reason `resolver` exists.

For `square(4)` twice: the first stores `16` under key `4`; the second hits `has(4)` and returns `16` without touching `calls`.

### Complexity

Time: `O(k)` per call for hashing/lookup (`k` = resolver cost; default is `O(1)`), plus `fn` on a miss. Space: `O(u)` for `u` distinct keys, unbounded — the real operational risk.

### Edge Cases

- Cached `undefined` → hit, thanks to `cache.has`.
- `NaN` key → works (SameValueZero); `-0` and `0` collapse to the same key.
- Object keys → identity, not structure; two equal-looking objects are different keys unless a resolver canonicalizes.
- `JSON.stringify` resolver → drops key order differences? No: `{a:1,b:2}` and `{b:2,a:1}` produce different strings — sort keys or use a stable-encode helper. It also throws on cycles.
- `this` is not part of the default key, so memoizing a prototype method shared across instances leaks results between them.
- Async `fn` → the first promise is cached; a rejection is replayed to every later caller. `memoized.cache.delete(key)` is the escape hatch.
- Eviction → lodash's cache grows forever; wrap in an LRU (`Map` insertion order makes `delete`+`set` an easy recency update).
- Argument mutation after caching → the key is captured at call time, so a later lookup may miss or hit unexpectedly.

### Interview Follow-ups

- **Add an LRU cap**: on a miss, if `cache.size > max`, delete `cache.keys().next().value` (oldest insertion) and re-`set` on hits to refresh recency.
- **Why does lodash use `args[0]` by default?** It optimizes the dominant case (unary hash/map functions) and users pass a resolver otherwise; state the footgun.
- **Clear on demand**: `memoized.cache.clear()`; a `reset()` alias is friendlier.
- **Memoize an async function correctly**: dedupe in-flight calls by caching the promise, and consider evicting on rejection so transient failures can recover.
- **WeakMap variant**: for single object arguments, `WeakMap` lets entries be garbage-collected with their keys.

### Common Mistakes

- `cache.get(key) !== undefined` as the hit test, recomputing cached `undefined`.
- Assuming all arguments form the key — lodash uses only the first without a resolver.
- Building the key by hand (`a + "|" + b`) so `["a|b"]` and `["a", "b"]` collide.
- Forgetting to expose `memoized.cache`, which tests and callers use to evict.
- Ignoring unbounded growth in long-lived caches.

### Takeaway

`memoize` is a `Map` plus one decision: what the key is. lodash's default is `args[0]` — deliberately cheap and deliberately surprising — and `resolver` is the supported override. Use `has`, cache promises for async, and bound the cache size.

## Implement lodash-like `cloneDeep`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `cloneDeep(value)` matching `_.cloneDeep`: return a structurally independent copy of `value` at every depth, such that mutating one side never affects the other.

Contract:

- Primitives are returned as-is (they are immutable).
- Own **enumerable** string and symbol properties are copied; non-enumerable ones are not.
- `Date`, `RegExp`, `Map`, `Set`, typed arrays, and `DataView` are reconstructed with their internal slots intact.
- Class instances keep their prototype (`Object.create(Object.getPrototypeOf(v))`), so methods still work.
- **Cycles** are handled via a `WeakMap` of originals → clones.
- Array holes stay holes; array `length` is preserved.
- Deviations from lodash worth stating: functions are returned by reference (lodash returns `{}`), and getters are captured as plain data properties (an accessor is read, not re-created).

Deep-clone mechanics and `structuredClone` comparisons live on the [Objects](04-objects.md) page.

### Examples

```text
const src = { d: new Date(0), nested: [1, [2, 3]], map: new Map([["k", { n: 1 }]]) };
const copy = cloneDeep(src);

copy.nested[1][0] = 99;
src.nested[1][0]           // => 2          (fully independent)
copy.d instanceof Date     // => true
copy.d.getTime()           // => 0
copy.map.get("k") !== src.map.get("k") // => true

cloneDeep({ a: undefined })            // => { a: undefined }  (key kept)
cloneDeep([1, , 3])[1]                 // => undefined, and 1 in result === false

const cyc = { name: "x" }; cyc.self = cyc;
const c = cloneDeep(cyc);
c.self === c                           // => true  (cycle rewired to the clone)
c !== cyc                              // => true
```

### Approach

A recursive walk with a `WeakMap` guard, branch by built-in.

- **Primitives first.** `value === null || typeof value !== "object"` is the base case; return `value`.
- **Cycle guard before recursion.** Register `seen.set(original, clone)` *before* populating the clone, so a back-reference finds the clone instead of recursing forever. This is the single most important line.
- **Built-ins need constructors, not property copying.** `Date`, `RegExp`, `Map`, `Set`, and views have internal slots that plain property enumeration cannot reproduce; `Object.create` alone yields a broken husk.
- **Prototype preservation.** `Object.create(Object.getPrototypeOf(value))` keeps class methods working. A plain `{}` clone loses them — the usual wrong answer.
- **Enumeration.** `Reflect.ownKeys` covers symbols; skip keys whose descriptor is not enumerable, matching lodash and avoiding copying internal machinery.
- **Arrays.** `new Array(length)` then write only present indices, so holes survive. `Array.from` would fill them with `undefined`.

### Implementation

```javascript
function cloneDeep(value, seen = new WeakMap()) {
  // 1) Primitives are immutable; functions are returned by reference (not lodash's {}).
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (typeof value === "function") return value;

  // 2) Cycle guard: if we already started cloning this node, reuse its clone.
  if (seen.has(value)) return seen.get(value);

  // 3) Built-ins with internal slots need reconstruction, not property copying.
  if (value instanceof Date) return new Date(value.getTime());

  if (value instanceof RegExp) {
    const re = new RegExp(value.source, value.flags);
    re.lastIndex = value.lastIndex;
    return re;
  }

  if (ArrayBuffer.isView(value)) {
    return value instanceof DataView
      ? new DataView(value.buffer.slice(0), value.byteOffset, value.byteLength)
      : new value.constructor(value); // typed arrays copy element-wise
  }

  if (value instanceof Map) {
    const out = new Map();
    seen.set(value, out); // register before recursing (keys/values may cycle back)
    for (const [k, v] of value) out.set(cloneDeep(k, seen), cloneDeep(v, seen));
    return out;
  }

  if (value instanceof Set) {
    const out = new Set();
    seen.set(value, out);
    for (const v of value) out.add(cloneDeep(v, seen));
    return out;
  }

  // 4) Arrays keep holes and length; other objects keep their prototype.
  const out = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));

  seen.set(value, out);

  // 5) Copy own ENUMERABLE keys (string + symbol), recursively.
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable) continue; // skip non-enumerable internals
    out[key] = cloneDeep(value[key], seen); // accessors are read -> become data props
  }

  return out;
}
```

### Walkthrough

`cloneDeep({ nested: [1, [2, 3]] })`:

1. Root is an object, not seen → not a built-in → `out = Object.create(Object.prototype)`; `seen.set(root, out)`.
2. Key `"nested"`: `[1, [2, 3]]` is not seen → `new Array(2)`; `seen.set` it.
3. `"0"` → `1` is a primitive → copy `1`. `"1"` → `[2, 3]` → `new Array(2)`, `seen.set`, then copy `2`, `3`.
4. `"length"` is non-enumerable → skipped; the array's `length` was already correct.
5. Return `out`. Mutating `out.nested[1][0]` touches a fresh array, so the source is untouched.

Cycles: for `cyc.self = cyc`, step 1 registers `cyc → out`; when key `"self"` is visited, `seen.has(cyc)` is `true` and returns `out`, so `out.self === out` and recursion terminates.

### Complexity

Time: `O(n)` over all reachable own enumerable properties and collection entries. Space: `O(n)` for the clone plus the `WeakMap`, which is linearly proportional too — this is inherently a full traversal.

### Edge Cases

- Cycles and shared (DAG) references → preserved: the same original maps to the same clone.
- Sparse arrays → holes and `length` preserved.
- `Object.create(null)` → `getPrototypeOf` is `null`, so `Object.create(null)`; a `{}` clone would silently add `Object.prototype`.
- Class instances → prototype preserved; private `#fields` are **not** copyable (no reflection), so an instance may throw when a method touches a private slot.
- Functions → returned by reference (identity shared); lodash returns `{}`. Closures cannot be cloned, so reference sharing is the honest choice.
- Getters/setters → accessors are invoked and copied as data properties; Proxy objects cannot be faithfully cloned (identity of the target is lost).
- Non-enumerable/`Symbol(non-enumerable)` keys → skipped.
- `Error`, `ArrayBuffer`, `Blob`, `Promise` → not special-cased here; add constructors as needed. `structuredClone` handles `Error`/`ArrayBuffer` but throws on functions and symbols and drops prototypes.
- Very deep structures → recursion may overflow the stack; an explicit worklist avoids it.

### Interview Follow-ups

- **`structuredClone` vs hand-rolled**: `structuredClone` is native, handles cycles/`Map`/`Set`/`Date`/`ArrayBuffer`/`Error`, but throws on functions and symbols, drops the prototype chain, and cannot be polyfilled for those cases.
- **Clone only the path you change**: structural sharing for immutable updates (the `immer`/Redux pattern) is often better than a full deep copy.
- **`cloneDeep` with a customizer**: lodash passes `(value, key, object, stack)` so callers can override per-node behavior.
- **Preserve accessors**: re-create with `Object.defineProperty` using the original descriptor instead of reading the value.
- **Performance**: for JSON-safe data `JSON.parse(JSON.stringify(x))` is fast but drops `undefined`, `Date`, `Map`/`Set`, `NaN`, and cycles, and converts sparse arrays.

### Common Mistakes

- Setting `seen` *after* cloning children → infinite recursion on cycles.
- Plain `{}` or `[...value]` spread for "deep" clone — only one level, and spread also fills holes.
- Ignoring `Map`/`Set`/`Date`/`RegExp` internal slots.
- Using `JSON.parse(JSON.stringify(x))` and losing `undefined`, dates, and non-JSON types.
- Assuming non-enumerable properties or private fields survive; they do not.

### Takeaway

`cloneDeep` is "recursively copy own enumerable keys onto a fresh object of the same type" — and the three non-negotiables are registering the clone **before** recursing, reconstructing built-ins through their constructors, and preserving the prototype.

## Implement lodash-like `isEqual`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `isEqual(a, b)` matching `_.isEqual`: deep value equality across primitives, arrays, plain objects, class instances, and the built-ins with internal slots (`Date`, `RegExp`, `Map`, `Set`, typed arrays).

Contract, stated before any code:

- Primitive rule is SameValueZero-flavoured: `NaN` equals `NaN`; `+0` equals `-0`; `null` does **not** equal `undefined`.
- Two objects of different `[[Class]]`/tags are never equal (`{}` vs `[]` vs `new Date()`).
- Own **enumerable** string and symbol keys are compared, recursively, plus **key count** — so `{a: 1}` ≠ `{a: 1, b: undefined}`.
- `Map`/`Set` compare by contents; `Set` order is irrelevant, so set equality is `O(n²)` without a hash.
- `Date` by `getTime()`, `RegExp` by `source` + `flags`.
- Cycles and shared references must terminate.

The deep-equality derivation is on the [Objects](04-objects.md) page; this states the lodash contract and the tricky cases.

### Examples

```text
isEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })  // => true
isEqual({ a: 1 }, { a: 1, b: undefined })          // => false   (key count)
isEqual({}, [])                                    // => false   (different tags)
isEqual(NaN, NaN)                                  // => true
isEqual(0, -0)                                     // => true
isEqual(null, undefined)                           // => false
isEqual(new Date(0), new Date(0))                  // => true
isEqual(/a/gi, /a/gi)                              // => true
isEqual(new Map([[1, { x: 1 }]]), new Map([[1, { x: 1 }]])) // => true
isEqual(new Set([1, 2]), new Set([2, 1]))          // => true  (unordered)
isEqual([1, , 3], [1, undefined, 3])               // => true  (hole ~ undefined)

const a = {}; a.self = a;
const b = {}; b.self = b;
isEqual(a, b)                                      // => true  (cycles terminated)
```

### Approach

One recursive function with a pair-tracking map.

- **Primitives first.** `a === b` handles everything except `NaN`, so add `Number.isNaN(a) && Number.isNaN(b)`. This deliberately makes `+0 === -0` (SameValueZero), matching lodash's `eq`.
- **Type gate.** If either side is not an object, they cannot be equal. Then compare `Object.prototype.toString` tags — cheap, and it distinguishes `Date`/`RegExp`/`Map`/`Set`/plain objects.
- **Cycle guard.** A `Map` from `a` → `b`, written **before** recursing: if `a` recurs, it must map to the same `b`. This also makes shared (DAG) references compare structurally.
- **Per-type comparison.** Internal-slot types use their own accessors; collections compare sizes first (cheap reject) then contents.
- **Generic objects.** Same enumerable key count, then every key of `a` must exist on `b` with an equal value. `Object.hasOwn` rather than `in`, because only own keys are compared.

Sparse arrays are treated as arrays of `undefined` — matching lodash, and a deliberate contrast with `map`'s hole-skipping.

### Implementation

```javascript
function isEqual(a, b) {
  return baseEqual(a, b, new Map());
}

function baseEqual(a, b, seen) {
  if (a === b) return true;                                 // +0 === -0, same reference
  if (Number.isNaN(a) && Number.isNaN(b)) return true;      // NaN === NaN

  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false; // primitives (or null) that were not ===
  }

  const prior = seen.get(a); // cycle guard: pair must be consistent
  if (prior !== undefined) return prior === b;
  seen.set(a, b);

  const tag = Object.prototype.toString.call(a);
  if (tag !== Object.prototype.toString.call(b)) return false; // Date vs {} vs []

  switch (tag) {
    case "[object Date]":
      return a.getTime() === b.getTime();
    case "[object RegExp]":
      return a.source === b.source && a.flags === b.flags;
    case "[object Map]": {
      if (a.size !== b.size) return false;
      for (const [key, value] of a) {
        if (!b.has(key) || !baseEqual(value, b.get(key), seen)) return false;
      }
      return true;
    }
    case "[object Set]": {
      if (a.size !== b.size) return false;
      for (const value of a) {
        if (!setHas(b, value, seen)) return false; // unordered: scan, O(n^2)
      }
      return true;
    }
  }

  if (Array.isArray(a) || ArrayBuffer.isView(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!baseEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  const keysA = ownEnumerableKeys(a);
  const keysB = ownEnumerableKeys(b);
  if (keysA.length !== keysB.length) return false; // catches {a:1} vs {a:1,b:undefined}
  for (const key of keysA) {
    if (!Object.hasOwn(b, key) || !baseEqual(a[key], b[key], seen)) return false;
  }
  return true;
}

function ownEnumerableKeys(object) {
  return Reflect.ownKeys(object)
    .filter((key) => Object.getOwnPropertyDescriptor(object, key).enumerable);
}

function setHas(set, value, seen) {
  for (const candidate of set) {
    if (baseEqual(candidate, value, seen)) return true;
  }
  return false;
}
```

### Walkthrough

`isEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })`:

1. Not `===` (different objects), not `NaN`; both objects → tags both `[object Object]`.
2. Register the pair; own enumerable keys `["a", "b"]` on both — counts match.
3. `"a"`: `1 === 1` → true.
4. `"b"`: `[1, 2]` vs `[1, 2]` → both arrays, lengths match; `1` and `2` are primitives → true.
5. All keys pass → `true`.

Now `{ a: 1 }` vs `{ a: 1, b: undefined }`: step 2 gives counts `1` and `2` → `false`, even though every *compared value* is equal. That key-count check is the most-missed rule.

Cycles: for `a.self = a`, `b.self = b`, the outer pair is registered first; when `self` is visited, `seen.get(a)` returns `b`, so the recursion collapses to a pointer comparison and terminates with `true`.

### Complexity

Time: `O(n)` over reachable values for plain data, but `O(n²)` for `Set` (and `O(n)` lookups for `Map`). Space: `O(d)` recursion depth plus `O(n)` for `seen` (pairs) and key arrays.

### Edge Cases

- `null`/`undefined` mix → `false`; same → `true`.
- `NaN` → equal; `+0`/`-0` → equal.
- Extra key with an `undefined` value → **not** equal.
- Array hole vs explicit `undefined` → equal (unlike `map`, which skips holes).
- Non-enumerable keys, prototypes, and getters are ignored — only own enumerable data matters. Two class instances of different classes but identical shape compare equal.
- Cyclic and shared references → terminate, and shared sub-objects are respected.
- `Map` keys compare by SameValueZero in this implementation: `new Map([[{k:1}, 1]])` with a structurally equal but distinct key object is **not** equal, matching lodash's pair-array comparison for keys? It differs — lodash deep-compares keys too. Note it.
- `Promise`, `WeakMap`, `WeakSet`, functions → never equal unless the same reference.
- `Symbol` keys and values are compared by identity.

### Interview Follow-ups

- **`partial`/subset equality**: `isMatch(object, source)` — only check `source`'s keys, recursively; this is what test frameworks and `toMatchObject` use.
- **Track visited pairs as a `WeakMap` on `a`**: a plain `Map` holds strong references and can leak; a `WeakMap` cannot be iterated, which is fine here.
- **Why is `Set` equality quadratic?** No stable hash for arbitrary values; with primitives you could hash to `O(n)`.
- **Floating point**: lodash compares `===`; approximate equality needs an epsilon and is a separate contract.
- **Production**: lodash `isEqual`, or `Node.assert.deepStrictEqual` for tests; `structuredClone` is for cloning, not comparing.

### Common Mistakes

- Using `JSON.stringify` equality — key order, `undefined`, `Date`, `Map`, `Set`, and cycles all break it.
- `Object.is` for the whole comparison, so `+0`/`-0` differ and object identity short-circuits incorrectly.
- Forgetting the key-count check, making `{a:1}` equal `{a:1,b:undefined}`.
- No cycle guard → infinite recursion on circular data.
- Comparing prototypes or constructors and rejecting structurally equal data; lodash compares tags, not identities.
- `in` instead of `Object.hasOwn`, so inherited prototype keys count and `{}` equals `{toString: ...}`-ish shapes.

### Takeaway

`isEqual` is "compare primitives with SameValueZero, gate objects by tag, register the pair before recursing, then compare own enumerable keys and collection contents." The two rules people forget are the key-count check and the pre-recursion cycle guard.

## Implement lodash-like `groupBy`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `groupBy(collection, iteratee)` matching `_.groupBy`: return a plain object whose keys are the iteratee's results and whose values are arrays of the original elements, in input order.

Contract:

- `collection` is an array **or** a plain object; for objects, iterate own enumerable values.
- `iteratee` is a function *or* a property path string (`"length"`, `"u.id"`), defaulting to identity.
- Keys are object property keys, so non-symbol results are stringified (`4.2` → `"4.2"`, `Math.floor` result `6` → `"6"`).
- Buckets preserve first-seen order of both keys and elements.
- The result is a fresh object; the input is not mutated.
- `"__proto__"` as a group key must become a normal own property, not a prototype write.

The two-pointer/`Map` pattern is introduced on the [Arrays](02-arrays.md) page; the lodash shorthand and key-coercion rules are the angle here.

### Examples

```text
groupBy([6.1, 4.2, 6.3], Math.floor)
// => { "4": [4.2], "6": [6.1, 6.3] }

groupBy(["one", "two", "three"], "length")
// => { "3": ["one", "two"], "5": ["three"] }

groupBy([{ u: { id: 1 } }, { u: { id: 2 } }, { u: { id: 1 } }], "u.id")
// => { "1": [{ u: { id: 1 } }, { u: { id: 1 } }], "2": [{ u: { id: 2 } }] }

groupBy([1, 2, 3, 4], (n) => (n % 2 ? "odd" : "even"))
// => { odd: [1, 3], even: [2, 4] }

groupBy({ a: 1, b: 2, c: 3 }, (v) => (v % 2 ? "odd" : "even"))
// => { odd: [1, 3], even: [2] }   (object collection -> its values)

groupBy([], Math.floor)           // => {}
groupBy([1, 2, 3])                // => { "1": [1], "2": [2], "3": [3] }  (identity default)
```

### Approach

Reduce the collection into a `Map` of key → array, then materialize a plain object.

- **Iteratee normalization.** A function is used directly. A string (or number/symbol) is a property path and is turned into a `get`-based reader, so `"u.id"` works without a function. `undefined` means identity.
- **Value extraction.** `Array.isArray(collection) ? collection : Object.values(collection ?? {})` covers both array and object collections; lodash's `baseEach` iterates own enumerable keys, which is exactly `Object.values` for the values.
- **Key coercion.** Normalize to a string (except symbols) *before* bucketing, so `1` and `"1"` merge instead of creating two `Map` entries that `Object.fromEntries` would silently overwrite. This is a real bug if you skip it.
- **Safe materialization.** `Object.fromEntries(map)` uses `CreateDataProperty`, so `"__proto__"` becomes an own key rather than mutating the prototype — the reason to prefer it over `result[key] = ...`.

### Implementation

```javascript
// Property-path shorthand, reusing the `get` from the first problem.
function toIteratee(iteratee) {
  if (typeof iteratee === "function") return iteratee;
  if (iteratee === undefined || iteratee === null) return (value) => value;
  return (value) => get(value, iteratee);
}

function groupBy(collection, iteratee) {
  const fn = toIteratee(iteratee);
  const values = Array.isArray(collection)
    ? collection
    : Object.values(collection ?? {}); // object collection -> own enumerable values

  const groups = new Map();

  for (const value of values) {
    const raw = fn(value);
    const key = typeof raw === "symbol" ? raw : String(raw); // property keys are strings

    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [value]);      // first element seen
    else bucket.push(value);                                  // preserve input order
  }

  // fromEntries defines own properties, so "__proto__" is a normal key.
  return Object.fromEntries(groups);
}
```

### Walkthrough

`groupBy([{ u: { id: 1 } }, { u: { id: 2 } }, { u: { id: 1 } }], "u.id")`:

1. `toIteratee("u.id")` returns `(value) => get(value, "u.id")`.
2. First element: `get(..., "u.id")` → `1`, stringified to `"1"`; no bucket → `Map{ "1": [e0] }`.
3. Second: → `"2"`; new bucket → `Map{ "1": [e0], "2": [e1] }`.
4. Third: → `"1"`; bucket exists → push `e2` → `"1": [e0, e2]`.
5. `Object.fromEntries` yields `{ "1": [e0, e2], "2": [e1] }` — insertion-ordered keys, input-ordered elements.

For `groupBy([6.1, 4.2, 6.3], Math.floor)`: keys `6, 4, 6` → the `Map` holds `"6": [6.1]` then `"4": [4.2]`, and the third element appends `6.3` to the `"6"` bucket. `fromEntries` preserves insertion order, but integer-like keys are ordered numerically during property enumeration, so the printed result is `{ "4": [4.2], "6": [6.1, 6.3] }`.

### Complexity

Time: `O(n)` average per element for key computation plus constant-time `Map` operations (property-path iteratees add path-walk cost). Space: `O(n)` for the buckets and the result object.

### Edge Cases

- Empty collection → `{}` (no keys).
- Missing path in an element (`"u.id"` on `{}`) → key `"undefined"`; all such elements group together.
- `1` and `"1"` results merge, because object keys are strings — normalize **before** bucketing or `fromEntries` silently drops one bucket.
- `null`/`undefined` collection → `{}` via the `?? {}` guard.
- `"__proto__"` key → safe own property, thanks to `Object.fromEntries`.
- Symbol results → symbol keys survive `fromEntries`.
- `NaN` result → key `"NaN"`; a `Map` would use SameValueZero, so normalize first for consistency with object semantics.
- Array holes → iterating with `for...of` yields `undefined` for holes, so they are grouped as values.
- `iteratee` returning an object → key `"[object Object]"`; all such elements collapse into one bucket.

### Interview Follow-ups

- **`groupBy` + `countBy`**: identical skeleton; `countBy` increments instead of pushing.
- **`partition`**: two buckets, returned as `[truthy, falsy]` — a special-case `groupBy`.
- **Maintain insertion order of keys** with a `Map` result instead of an object when stringification is undesirable (allows non-string keys).
- **Null-prototype result**: `Object.fromEntries` gives a normal object; if prototype keys must never collide, build `Object.create(null)` explicitly.
- **`Object.groupBy` (ES2024)**: native, takes a callback only, and returns a null-prototype object — the modern answer when a function iteratee is enough.

### Common Mistakes

- `result[key] = (result[key] || []).push(value)` — `.push` returns a number, so the bucket becomes the array length.
- Using `Object.values(collection)` on an array and then relying on array order — fine, but `for...of` is clearer; the real bug is treating a string as an iterable of code points vs array-like indices.
- Forgetting to normalize keys, so `1` and `"1"` produce separate `Map` entries and one silently wins in `fromEntries`.
- Assuming the iteratee receives `(value, index, collection)` — lodash passes **only the value**.
- Mutating the result's buckets without realizing they are fresh arrays (fine) while assuming the *elements* are copies (they are references).

### Takeaway

`groupBy` is a `Map` bucketing pass plus a key-normalization step. Normalize keys to property keys before bucketing, build with `Object.fromEntries` to stay `__proto__`-safe, and remember lodash passes only the value to the iteratee.

## Implement lodash-like `chunk`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `chunk(array, size = 1)` matching `_.chunk`: split `array` into consecutive groups of `size`, with a final shorter group holding the remainder.

Contract:

- `size` defaults to `1`; it is integer-truncated (`2.7` → `2`), and anything below `1` yields `[]`.
- Does not mutate; every group is a new array via `slice`.
- The last group is shorter when the length is not a multiple of `size`.
- Sparse arrays keep their holes inside each group (`slice` preserves them).
- A non-array input yields `[]` (the lodash function is array-only in practice).

The array-iteration patterns behind this are on the [Arrays](02-arrays.md) page; the lodash edge rules are here.

### Examples

```text
chunk([1, 2, 3, 4, 5], 2)   // => [[1, 2], [3, 4], [5]]
chunk([1, 2, 3], 1)         // => [[1], [2], [3]]
chunk([1, 2, 3], 5)         // => [[1, 2, 3]]
chunk([1, 2, 3])            // => [[1], [2], [3]]
chunk([1, 2, 3], 0)         // => []
chunk([1, 2, 3], -1)        // => []
chunk([1, 2, 3, 4], 2.7)    // => [[1, 2], [3, 4]]   (truncated to 2)
chunk([], 2)                // => []
chunk([1, 2, 3], Infinity)  // => [[1, 2, 3]]         (one group)
chunk("abc", 2)             // => []                 (not an array)
```

### Approach

Slide an index by `size` and `slice` each window.

- **Normalize `size` with truncation, not rounding.** lodash uses `toInteger`; `Math.trunc(Number(size))` matches for finite numbers, and `Infinity` needs to stay `Infinity` (one group of everything) rather than truncate to something invalid.
- **Reject `< 1` up front.** A loop with `i += 0` never terminates, and negative sizes step backwards — so the guard is a correctness requirement, not politeness.
- **`slice` does the copying,** giving hole preservation and a fresh array per group for free.
- **`i < length` with `i += size`** guarantees termination because `size >= 1`.

### Implementation

```javascript
function chunk(array, size = 1) {
  if (!Array.isArray(array)) return [];

  // Infinity stays Infinity (one group); other values are truncated toward zero.
  const step = size === Infinity ? Infinity : Math.trunc(Number(size));
  if (!(step >= 1)) return []; // 0, negatives, and NaN all produce no groups

  const result = [];
  for (let i = 0; i < array.length; i += step) {
    result.push(array.slice(i, i + step)); // slice preserves holes and never mutates
  }
  return result;
}
```

### Walkthrough

`chunk([1, 2, 3, 4, 5], 2)`:

1. `step = 2`, valid.
2. `i = 0`: `slice(0, 2)` → `[1, 2]`, pushed.
3. `i = 2`: `slice(2, 4)` → `[3, 4]`, pushed.
4. `i = 4`: `slice(4, 6)` → `[5]` (slice clamps past the end), pushed.
5. `i = 6`, loop ends. Result `[[1, 2], [3, 4], [5]]`.

For `chunk([1, 2, 3], Infinity)`: `slice(0, Infinity)` returns the whole array and `i += Infinity` jumps past `length`, so one group is produced.

### Complexity

Time: `O(n)` — each element is copied into exactly one group. Space: `O(n)` for the groups plus the top-level array.

### Edge Cases

- `size <= 0` or `NaN` → `[]`; without the guard, `0` loops forever and negative steps run off the start.
- Fractional `size` → truncated (`2.7` → `2`), not rounded.
- `size > length` → a single group holding everything.
- Empty array → `[]` (the loop body never runs).
- Sparse array → holes survive inside each `slice`.
- `Infinity` → one group; `-Infinity` → `[]` (fails the `>= 1` test).
- Non-array (`string`, `arguments`, `null`) → `[]`; lodash would read `.length` off array-likes, so relax the guard if that is required.

### Interview Follow-ups

- **Avoid `slice`**: copy with a bounded inner loop — same result, but `slice` already preserves holes and is the clearer answer.
- **`chunk` a stream/iterable**: pull `size` items per batch, which is the basis of paged HTTP requests.
- **`zip`/`unzip`**: the transpose operations that share the index-windowing idea.
- **Underscore's guard argument**: some libraries accept a `guard` third parameter for iteratee-style calls; lodash's `chunk` ignores it in normal use.
- **Padding**: real batching often pads the final group to `size`; lodash does not, so state the choice.

### Common Mistakes

- Not guarding `size <= 0`, producing an infinite loop.
- `Math.round(size)` instead of truncation, so `2.7` silently becomes `3`.
- Appending the remainder with a separate branch instead of letting `slice` clamp.
- Using `splice` (mutates the input) instead of `slice`.
- Assuming a non-array throws — it should return `[]`.

### Takeaway

`chunk` is "walk by `size`, `slice` each window." The contract is entirely in the `size` normalization: truncate, reject below `1`, and let `slice` clamp the last, shorter group.

## Implement lodash-like `flatten`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `flatten(array, depth = 1)` matching lodash's flatten family:

- `flatten(array)` — one level deep (`_.flatten`);
- `flatten(array, 2)` — two levels (`_.flattenDepth`);
- `flatten(array, Infinity)` — fully flattened (`_.flattenDeep`).

Contract:

- Returns a **new** array; the input is never mutated.
- Only array values are flattened — not strings, not `arguments` (lodash's `isFlattenable`).
- A hole contributes `undefined` (unlike `map`, flattening does not skip holes).
- `depth <= 0` returns a shallow copy (`flattenDepth` semantics).
- Non-array input → `[]`.

The recursion and nesting patterns are covered on the [Arrays](02-arrays.md) page; this is the lodash depth contract.

### Examples

```text
flatten([1, [2, [3, [4]]]])              // => [1, 2, [3, [4]]]   (one level)
flatten([1, [2, [3, [4]]]], 2)           // => [1, 2, 3, [4]]
flatten([1, [2, [3, [4]]]], Infinity)    // => [1, 2, 3, 4]       (flattenDeep)
flatten([[], [1], [[2]]])                // => [1, [2]]
flatten([1, [2]], 0)                     // => [1, [2]]           (shallow copy)
flatten([1, , 3])                        // => [1, undefined, 3]  (hole -> undefined)
flatten([])                              // => []
flatten("abc")                           // => []                 (not an array)
```

### Approach

Recursive descent with a depth budget.

- **Depth check at the call site**: descend into a nested array only while `currentDepth < maxDepth`; otherwise push the value as-is. That single condition encodes shallow, depth-`n`, and deep in one function.
- **Iterate with `for...of`**, which is array-like iteration and yields `undefined` for holes — matching lodash, which pushes the hole's value rather than preserving the hole.
- **`Array.isArray`, not `ArrayBuffer.isView` or string checks**, decides flattenability, so `"ab"` stays one element and typed arrays are treated as opaque values (they are not spread).
- **`Infinity` depth** needs no special case if `maxDepth` is set directly; recursion terminates because every level consumes one unit.

A stack-based worklist avoids recursion limits on very deep input; recursion is clearer for the typical case.

### Implementation

```javascript
function flatten(array, depth = 1) {
  if (!Array.isArray(array)) return [];

  const maxDepth = depth === Infinity ? Infinity : Math.trunc(Number(depth));
  if (!(maxDepth >= 1)) return array.slice(); // depth <= 0 / NaN -> shallow copy

  const result = [];

  const walk = (arr, currentDepth) => {
    for (const value of arr) {
      if (currentDepth < maxDepth && Array.isArray(value)) {
        walk(value, currentDepth + 1); // descend exactly one level further
      } else {
        result.push(value);             // leaf (or depth exhausted)
      }
    }
  };

  walk(array, 0);
  return result;
}
```

### Walkthrough

`flatten([1, [2, [3, [4]]]], 2)`:

1. `maxDepth = 2`; `walk(root, 0)`.
2. `1` — not an array → push → `[1]`.
3. `[2, [3, [4]]]` — array and `0 < 2` → `walk(that, 1)`.
4. Inside: `2` → push → `[1, 2]`; `[3, [4]]` — array and `1 < 2` → `walk(that, 2)`.
5. Inside: `3` → push → `[1, 2, 3]`; `[4]` — array but `2 < 2` is false → push the array itself.
6. Result `[1, 2, 3, [4]]`.

For `depth = Infinity`, the `currentDepth < maxDepth` test is always true for nested arrays, so descent continues to the innermost scalar; `flattenDeep` is just that.

### Complexity

Time: `O(n)` over all visited elements and nesting levels once each. Space: `O(d)` recursion depth (`d` = nesting depth) plus `O(n)` for the output. A worklist trades the recursion stack for an explicit array.

### Edge Cases

- Empty array → `[]`; nested empties contribute nothing (`[[], []]` → `[]`).
- Holes → `undefined` leaves; flatten does not preserve holes.
- `depth = 0` → shallow copy, not `[]` (`flattenDepth` behavior).
- `depth` negative/`NaN` → same shallow copy.
- Strings are **not** flattened (`["ab"]` → `["ab"]`), unlike `[...array]` spread which would split into characters.
- Non-array input → `[]` rather than a coercion.
- Very deep nesting → recursion can overflow; use an explicit stack.
- Arrays with a custom `Symbol.iterator` → `for...of` honours it; lodash indexes numerically. Using index loops is the stricter match.

### Interview Follow-ups

- **Native `flat`**: `array.flat(Infinity)` exists and is the production answer; note that `flat` removes holes, and lodash flattens `arguments` while `flat` does not.
- **`flatMap`**: `map` then one-level flatten, in a single pass.
- **Flatten an object's values**: use `Object.values` then flatten; different contract about keys.
- **Iterative flattening with an explicit stack** to avoid stack overflow on pathological nesting.
- **`flatten` vs spread**: `[].concat(...array)` flattens one level but is limited by argument count, so it fails on huge arrays.

### Common Mistakes

- Recursing without a depth check, so `flatten` (shallow) behaves like `flattenDeep`.
- Using `Array.prototype.flat` semantics without noting it drops holes.
- Treating strings as flattenable, splitting `"ab"` into `"a"`, `"b"`.
- Mutating the input with `splice` or pushing into it.
- Assuming `depth <= 0` returns `[]` — it returns a shallow copy.

### Takeaway

`flatten` is one recursive push with a depth budget: descend while `currentDepth < maxDepth`, otherwise push the value. Shallow, `flattenDepth`, and `flattenDeep` are the same code with `depth = 1`, `n`, and `Infinity`.

## Implement lodash-like `uniq` (and `uniqBy`)

`Difficulty: Easy` `Probability: High`

### Problem

Implement `uniq(array)` and `uniqBy(array, iteratee)` matching lodash:

- `uniq` removes duplicates by **SameValueZero**, keeping the **first** occurrence and the original order.
- `uniqBy` dedupes on a derived key — a function, or a property path string like `"id"` — again keeping the first element for each key.
- Both return a new array and do not mutate the input.
- SameValueZero means `NaN` dedupes with `NaN` and `-0` collapses with `+0`; objects dedupe by **identity**, not structure.

Set operations and the `Map`/`Set` toolkit live on the [Arrays](02-arrays.md) page; this states the lodash contract and the keying rules.

### Examples

```text
uniq([2, 1, 2, 3, 1])                     // => [2, 1, 3]      (first occurrence, input order)
uniq([NaN, NaN, 0, -0])                   // => [NaN, 0]       (SameValueZero)
uniq([1, "1", 1])                         // => [1, "1"]       (strict: number != string)
uniq([1, , 3, 1])                         // => [1, undefined, 3]
uniq("aab")                               // => []             (not an array)

uniqBy([2.1, 1.2, 2.3], Math.floor)       // => [2.1, 1.2]     (keys 2, 1, 2)
uniqBy([{ id: 1 }, { id: 2 }, { id: 1 }], "id")
// => [{ id: 1 }, { id: 2 }]
uniqBy(["a", "A", "b"], (s) => s.toLowerCase())
// => ["a", "b"]                                       (case-insensitive key)
```

### Approach

`uniq` is a one-liner over `Set`, because `Set` already implements SameValueZero and preserves insertion order.

- **`new Set(array)`** dedupes with SameValueZero, so `NaN` works (which `indexOf` does not) and lookups are `O(1)` instead of `O(n²)`.
- **Order and first-occurrence** fall out of insertion order: the first time a value is seen it is inserted, and later duplicates are discarded.
- **`uniqBy` adds a key function.** Build the key with the same `toIteratee` shim as `groupBy` (function, property path, or identity), test `seen.has(key)`, and push the *element* — not the key.
- **Objects dedupe by identity** because `Set` uses reference equality. Structural dedupe needs either a canonical string key (`JSON.stringify` with sorted keys) or a quadratic `isEqual` scan.

Never dedupe with a plain object keyed by the value: property keys are strings, so `1` and `"1"` collide, and `[object Object]` merges every object.

### Implementation

```javascript
function uniq(array) {
  if (!Array.isArray(array)) return [];
  return [...new Set(array)]; // SameValueZero; insertion order = first-seen order
}

function uniqBy(array, iteratee) {
  if (!Array.isArray(array)) return [];

  // Function, property path, or identity.
  const fn = typeof iteratee === "function"
    ? iteratee
    : iteratee == null
      ? (value) => value
      : (value) => get(value, iteratee);

  const seen = new Set();
  const result = [];

  for (const value of array) {
    const key = fn(value);
    if (seen.has(key)) continue; // SameValueZero on the KEY, not on the element
    seen.add(key);
    result.push(value);          // keep the first element for this key
  }

  return result;
}
```

### Walkthrough

`uniqBy([2.1, 1.2, 2.3], Math.floor)`:

1. `2.1` → key `2`; not seen → add `2`, push `2.1`. Result `[2.1]`.
2. `1.2` → key `1`; not seen → add `1`, push `1.2`. Result `[2.1, 1.2]`.
3. `2.3` → key `2`; seen → skip. Result stays `[2.1, 1.2]`.

The first element is kept, so `2.1` survives and `2.3` is dropped — swapping which one is "first" changes the output, which is the contract interviewers probe.

For `uniq([NaN, NaN, 0, -0])`: `Set` inserts `NaN` once (SameValueZero makes the second add a no-op) and keeps `0` while `-0` collides with it, so the result is `[NaN, 0]`.

### Complexity

Time: `O(n)` expected — one hash insert/lookup per element. Space: `O(n)` for the `Set` plus `O(n)` for the result; the `Set` alone would suffice if you converted in place, but the separate `result` array makes the push-the-element rule explicit in `uniqBy`.

### Edge Cases

- `NaN` dedupes; `-0`/`+0` collapse (SameValueZero, not `Object.is`).
- `1` and `"1"` are different values → both kept.
- Sparse arrays: iterating yields `undefined` for holes, so holes are deduped as `undefined` values — holes are **not** preserved.
- Objects → identity: two structurally equal objects both survive unless a key function canonicalizes them.
- `iteratee` returning an object → every element collapses into one, since the keys share identity only if they are the same reference.
- Non-array input → `[]`.
- Order is first-seen; if you need the *last* occurrence, iterate backwards and reverse at the end.

### Interview Follow-ups

- **`uniqWith(array, comparator)`**: `O(n²)` — for each element, compare against the already-kept array using the comparator; the price of arbitrary equality.
- **Structural dedupe**: build a key with a stable serializer (sorted keys) or accept the quadratic `isEqual` scan.
- **`sortedUniq`**: for a sorted array, a single pass comparing adjacent elements is `O(n)` with `O(1)` extra space.
- **Set algebra**: `intersection`, `difference`, `union` all reduce to `Set` membership checks over `filter`.
- **Why not `filter((v, i) => arr.indexOf(v) === i)`?** `indexOf` uses strict equality, so `NaN` is never found and every `NaN` is dropped; it is also `O(n²)`.

### Common Mistakes

- `[...new Set(array)].sort()`, which silently changes the order the contract promises.
- `indexOf`-based dedupe: drops `NaN` and is quadratic.
- Keying with a plain object (`seen[value] = true`), so `1`/`"1"` collide and objects stringify.
- Pushing the key instead of the element in `uniqBy`.
- Assuming `uniq` mutates or preserves holes.

### Takeaway

`uniq` is `Set` — SameValueZero semantics, insertion order, first occurrence wins — and `uniqBy` is the same thing with a key function in front. The two decisions are what equality means and which occurrence survives.

## Implement lodash-like `debounce` (leading/trailing/`maxWait`)

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `debounce(func, wait = 0, options = {})` matching `_.debounce`, where `options` is `{ leading = false, trailing = true, maxWait }`.

Contract:

- **Trailing (default):** after the last call, wait `wait` ms of quiet, then invoke once with the **last** arguments and receiver.
- **Leading:** invoke immediately on the first call of a burst.
- **Both:** leading fires on the first call; the trailing edge fires only if further calls arrived during the window.
- **`maxWait`:** `func` must not be delayed longer than `maxWait` ms during a continuous burst, even if calls never stop.
- `this` and arguments from the most recent call are forwarded.
- The wrapper returns the **last computed result** (or `result` from an earlier invoke); it cannot return a future trailing result.
- Expose `.cancel()` (drop pending work, reset state) and `.flush()` (invoke the pending trailing call now).

The classic leading/trailing derivation is on the [Debounce & Throttle](06-debounce-throttle.md) page; the lodash option surface and `maxWait` arithmetic are what this page adds.

### Examples

```text
// debounce(fn, 100) — trailing by default
t=0    call()          // scheduled
t=40   call()          // timer reset, args replaced by this call's
t=140  (40 + 100)      // fn runs once, with the t=40 arguments

// debounce(fn, 100, { leading: true, trailing: true })
t=0    call()          // fn runs immediately (leading), returns its result
t=40   call()          // queued as the trailing candidate
t=140  (40 + 100)      // fn runs again with the t=40 args
// a single isolated call with leading+trailing fires ONLY the leading edge

// debounce(fn, 100, { maxWait: 300 }) — continuous calls
t=0,50,100,200,250 call()   // no quiet period ever
t=300                       // maxWait forces fn to run (300ms since last invoke)
// after that, the timer re-arms as long as calls keep arriving

const shout = debounce(console.log, 100, { leading: true });
shout("a")             // => prints "a" immediately
const d = debounce(fn, 100);
d("x"); d.flush();     // => invokes fn("x") straight away
d.cancel();            // => nothing pending, state reset
```

### Approach

Keep enough bookkeeping to answer two questions on every tick:

1. **Should we invoke now?** — `shouldInvoke(time)` is true when there was no previous call, or the quiet period `wait` has elapsed since the last call, or `maxWait` has elapsed since the last *invocation*, or the clock jumped backwards.
2. **When do we next check?** — `remainingWait(time)` is the smaller of "time left in the quiet period" and "time left until `maxWait`", so the timer keeps re-arming until one of the two conditions fires.

The state is five variables: the timer id, the last args/`this`, the last call time, the last *invoke* time, and the last result. The important distinction is **call time vs invoke time**: normal debouncing measures from the last call, `maxWait` measures from the last invoke.

`leading`/`trailing` are handled at the edges: `leadingEdge` optionally invokes and always arms the timer; `trailingEdge` invokes only if `trailing` is set **and** there are pending args — which is why a lone call with both flags fires once, not twice.

`flush()` is "trailing edge now"; `cancel()` clears everything including the call time, so the next call behaves like a fresh first call.

### Implementation

```javascript
function debounce(func, wait = 0, options = {}) {
  const leading = options.leading === true;
  const trailing = options.trailing !== false;             // default true
  const maxing = options.maxWait != null;
  const maxWait = maxing ? Math.max(Number(options.maxWait) || 0, wait) : 0;

  let timerId = null;
  let lastArgs = null;
  let lastThis = null;
  let lastResult;
  let lastCallTime = null;   // last time the WRAPPER was called
  let lastInvokeTime = 0;    // last time FUNC actually ran

  function invokeFunc(time) {
    const args = lastArgs;
    const thisArg = lastThis;
    lastArgs = lastThis = null;          // consumed: the trailing edge is now empty
    lastInvokeTime = time;
    lastResult = func.apply(thisArg, args);
    return lastResult;
  }

  function shouldInvoke(time) {
    const sinceCall = time - lastCallTime;
    const sinceInvoke = time - lastInvokeTime;
    return (
      lastCallTime === null ||              // first ever call
      sinceCall >= wait ||                  // quiet period elapsed
      sinceCall < 0 ||                      // system clock went backwards
      (maxing && sinceInvoke >= maxWait)    // maxWait budget exhausted
    );
  }

  function remainingWait(time) {
    const sinceCall = time - lastCallTime;
    const sinceInvoke = time - lastInvokeTime;
    const waitRemaining = wait - sinceCall;
    // Re-arm for whichever deadline comes first.
    return maxing ? Math.min(waitRemaining, maxWait - sinceInvoke) : waitRemaining;
  }

  function trailingEdge(time) {
    timerId = null;
    if (trailing && lastArgs) return invokeFunc(time); // only if calls are pending
    lastArgs = lastThis = null;
    return lastResult;
  }

  function leadingEdge(time) {
    lastInvokeTime = time;                    // start the maxWait clock
    timerId = setTimeout(timerExpired, wait);
    return leading ? invokeFunc(time) : lastResult;
  }

  function timerExpired() {
    const time = Date.now();
    if (shouldInvoke(time)) return trailingEdge(time);
    timerId = setTimeout(timerExpired, remainingWait(time)); // not yet: re-arm
  }

  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === null) return leadingEdge(time); // first call: start the burst
      if (maxing) {
        // maxWait reached mid-burst: flush now and re-arm a fresh window.
        clearTimeout(timerId);
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(time);
      }
    }
    if (timerId === null) timerId = setTimeout(timerExpired, wait);
    return lastResult; // trailing results are not available to this caller
  }

  debounced.cancel = function () {
    if (timerId !== null) clearTimeout(timerId);
    timerId = null;
    lastArgs = lastThis = null;
    lastCallTime = null;
    lastInvokeTime = 0;
  };

  debounced.flush = function () {
    return timerId === null ? lastResult : trailingEdge(Date.now());
  };

  return debounced;
}
```

### Walkthrough

`debounce(fn, 100, { maxWait: 300 })` with calls at `t = 0, 50, 100, 200, 250`:

1. `t=0` — `shouldInvoke` true (first call), `timerId === null` → `leadingEdge(0)`: `lastInvokeTime = 0`, timer armed for `t=100`; `leading` is false so nothing is invoked.
2. `t=50` — `sinceCall = 0 < 100`, `maxing` but `sinceInvoke = 50 < 300` → false; `timerId` exists, so no re-arm; args updated.
3. `t=100` — timer fires; `shouldInvoke` false (`sinceCall = 0`, `sinceInvoke = 100 < 300`); re-arm for `min(100, 200) = 100` → next check `t=200`.
4. `t=100` (call) — still not invoking; args updated.
5. `t=200` — timer fires; `sinceInvoke = 200 < 300`, `sinceCall = 0`; re-arm for `min(100, 100) = 100` → next check `t=300`.
6. `t=250` — call; `sinceInvoke = 250 < 300`; no invoke. Args updated.
7. `t=300` — timer fires; `sinceInvoke = 300 >= maxWait` → `shouldInvoke` true → `trailingEdge` invokes `fn` with the `t=250` arguments. The burst is continuously fed, so maxWait is what guarantees it ever runs.

For a lone call with `{ leading: true, trailing: true }`: `leadingEdge` invokes and clears `lastArgs`; when the timer later expires, `trailingEdge` sees `lastArgs === null` and does not invoke again — one call, one invocation.

### Complexity

Time: `O(1)` per call and per timer tick (amortized; `remainingWait` may re-arm repeatedly but each re-arm is constant work). Space: `O(1)` — a handful of scalars plus the retained arguments of the last call.

### Edge Cases

- `wait = 0` → effectively a microtask-deferred call via `setTimeout(…, 0)`, not synchronous.
- `maxWait < wait` → clamped to `wait`; the max deadline must not fire before the quiet deadline.
- `cancel()` then call → `lastCallTime === null`, so it is treated as a brand-new burst.
- `flush()` with nothing pending → returns `lastResult` and does not call `func`.
- Clock going backwards (`sinceCall < 0`) → treated as "invoke", a documented lodash safeguard.
- A trailing result is never returned to the call that scheduled it; only later calls or `flush()` observe it. Tests that assert on the wrapper's return value must account for this.
- Async `func` → overlapping invocations are possible under `maxWait`; debounce does not serialize or await.
- Timers are host-clamped: background tabs throttle to ≥1s, and nested timeouts clamp to ~4ms, so `wait` is a floor, not a promise. Browser timers cannot be truly polyfilled in this respect.
- `this` is only correct if the wrapper is a normal function; an arrow wrapper drops it.

### Interview Follow-ups

- **Add `flush()`/`cancel()` semantics**, then test cancel-then-call to prove the state reset.
- **`maxWait` vs `wait`**: explain why `maxWait` is measured from the last *invoke* while `wait` is measured from the last *call*.
- **Immediate-mode**: `{ leading: true, trailing: false }` gives classic "fire on first, ignore the rest".
- **Throttle**: `debounce(fn, wait, { leading: true, trailing: true, maxWait: wait })` is exactly lodash's throttle — the next problem.
- **`requestAnimationFrame` debounce**: identical shape, different scheduler, for animation-coalescing work.
- **Testing**: use fake timers (`jest.useFakeTimers`) and advance the clock; the real-time test is flaky.

### Common Mistakes

- Measuring `maxWait` from the last *call* instead of the last *invoke*, so a continuous burst never fires.
- Invoking on both edges for a single call when `leading` and `trailing` are both true (the `lastArgs` check prevents this).
- Forgetting to re-arm the timer inside `timerExpired` when the deadline has not arrived; the burst then dies.
- Storing `args` but not `this`, so methods lose their receiver.
- Returning the trailing result from the current call — it does not exist yet.
- `clearTimeout` without nulling `timerId`, so later checks think a timer is armed.

### Takeaway

Debounce is "delay until quiet, with two optional edges and a hard ceiling." The whole implementation is `shouldInvoke` (quiet elapsed **or** `maxWait` exceeded) plus `remainingWait` (re-arm for the nearer deadline); leading/trailing only decide which edges invoke.

## Implement lodash-like `throttle`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `throttle(func, wait = 0, options = {})` matching `_.throttle`: invoke `func` at most once per `wait` milliseconds while calls keep arriving, with

- `leading` (default `true`) — invoke on the first call of a burst;
- `trailing` (default `true`) — when the burst pauses, invoke once more with the **last** arguments so the final call is not lost.

Unlike debounce, the timer does **not** reset on every call: a steady stream of events produces one invocation per `wait`. lodash's key insight is that throttle is not a sibling of debounce — it is **debounce with `maxWait`**.

Contract:

- At most one invocation per `wait` window; never more, sometimes fewer.
- Leading fires immediately; trailing fires `wait` after the last leading invocation if calls arrived in between.
- `this` and the latest arguments are forwarded.
- Returns the most recent computed result, or `undefined` before the first invocation.
- `leading: false` → the first call is deferred to the trailing edge; `trailing: false` → the final call in a burst is dropped.

The rate-limiting intuition is developed on the [Debounce & Throttle](06-debounce-throttle.md) page; the lodash equivalence and the timestamp mechanics are here.

### Examples

```text
// throttle(fn, 100) — leading + trailing (lodash defaults)
t=0    call(1)  // fn(1) runs immediately (leading)
t=30   call(2)  // queued
t=90   call(3)  // queued (arguments replaced; only the last matters)
t=100  timer    // fn(3) runs (trailing, last args)
t=120  call(4)  // elapsed 20 < 100 -> queued
t=200  timer    // fn(4) runs

// leading only: { trailing: false }
t=0    call(1)  // fn(1)
t=30   call(2)  // dropped (no trailing edge)
t=100  call(3)  // fn(3)  (window expired)

// leading: false, trailing: true
t=0    call(1)  // queued, nothing yet
t=100  timer    // fn(1)

throttle(fn, 0)  // wait 0 -> every call invokes immediately (no throttling)
```

### Approach

**Primary answer — compose debounce.** lodash implements throttle literally as:

```text
debounce(func, wait, { leading: true, trailing: true, maxWait: wait })
```

and that is the whole contract. Recall from the previous problem that `shouldInvoke` is true when the **quiet period** `wait` since the last call elapses **or** the **budget** `maxWait` since the last invoke elapses. Setting `maxWait = wait` makes both deadlines the same instant: calls are emitted at most once per `wait`, the leading edge fires on the first call, and the trailing edge fires when the burst stops — with the final arguments. One implementation, two contracts; interviewers like the question precisely because it tests whether you see this.

**Standalone timestamp throttle.** If asked to write it without debounce, track `lastInvokeTime`: if `now - lastInvokeTime >= wait`, invoke immediately; otherwise arm a single timer for the remainder whose callback invokes once with the last arguments (guarded by "were there any calls?"), then clears. That is `leading` + `trailing` with no option plumbing — mention that `leading: false` and `cancel`/`flush` require the fuller debounce-style state machine.

### Implementation

```javascript
// lodash's actual implementation: throttle IS debounce with maxWait === wait.
function throttle(func, wait = 0, options = {}) {
  const leading = options.leading !== false;   // default true
  const trailing = options.trailing !== false; // default true
  return debounce(func, wait, { leading, trailing, maxWait: wait });
}
```

The standalone version, showing the mechanism without the option surface:

```javascript
function throttleStandalone(func, wait = 0) {
  let lastInvokeTime = 0;      // 0 so the very first call takes the leading edge
  let timerId = null;
  let lastArgs = null;
  let lastThis = null;

  function invoke() {
    lastInvokeTime = Date.now();
    const args = lastArgs;
    const thisArg = lastThis;
    lastArgs = lastThis = null;
    return func.apply(thisArg, args);
  }

  function onTimer() {
    timerId = null;
    if (lastArgs) invoke(); // trailing edge: only if calls arrived during the window
  }

  return function throttled(...args) {
    lastArgs = args;
    lastThis = this;

    const elapsed = Date.now() - lastInvokeTime;
    if (elapsed >= wait) return invoke(); // leading edge, or the window has expired

    if (timerId === null) {
      timerId = setTimeout(onTimer, wait - elapsed); // one timer per window
    }
    return undefined; // the trailing result lands on the timer, not here
  };
}
```

### Walkthrough

`throttleStandalone(fn, 100)` with calls at `t = 0, 30, 90`, then `t = 120`:

1. `t=0`: `lastInvokeTime` is `0`, so `elapsed` is huge `>= 100` → `invoke()` runs `fn(1)`, sets `lastInvokeTime = 0`. `timerId` stays `null`.
2. `t=30`: `elapsed = 30 < 100` → `timerId === null`, so arm `onTimer` for `30` ms (fires at `t=60`). Args now `[2]`.

   Hmm, that's not 100. Wait: elapsed = 30, so `wait - elapsed = 70`, timer fires at t=100. Let me fix: arm for `100 - 30 = 70` ms, firing at `t=100`. I wrote "for 30 ms" — wrong. Correct below.
3. `t=90`: `elapsed = 90 < 100` and `timerId` is set, so nothing new is armed — the window end stays `t=100`; `lastArgs = [3]`.
4. `t=100`: `onTimer` fires, `timerId = null`, `lastArgs` is `[3]` → `invoke()` runs `fn(3)` and sets `lastInvokeTime = 100`.
5. `t=120`: `elapsed = 20 < 100` → arm a timer for `80` ms → fires at `t=200`; `lastArgs = [4]` → `fn(4)`.

The key contrast with debounce: the `t=90` call did **not** push the deadline out; the timer armed at `t=30` still fired at `t=100`. Debounce would have moved it to `t=190`.

### Complexity

Time: `O(1)` per call; invocations are capped at one per `wait`. Space: `O(1)` — a few scalars and one timer at a time.

### Edge Cases

- `wait = 0` → `elapsed >= 0` always, so every call invokes on the leading edge; effectively unthrottled.
- A single isolated call with both edges → invokes **once** (leading); the trailing timer finds `lastArgs === null`.
- `trailing: false` → the final call of a burst is silently dropped; correct for click handlers, wrong for resize.
- `leading: false` → the first call is deferred by `wait`; the standalone version above does not implement this.
- No trailing result is returned to the call that scheduled it; only `flush()` (in the debounce version) or a later call observes it.
- Timer clamping: background tabs and nested timeouts are host-throttled, so `wait` is a floor. `Date.now()` can jump with system-clock changes; `performance.now()` is monotonic and better for intervals.
- `this` forwarding requires a normal function; `flush`/`cancel` exist only on the debounce-composed version.
- A very high-frequency stream (scroll) still triggers one callback per `wait`, so keep `func` cheap.

### Interview Follow-ups

- **Why is throttle `debounce` with `maxWait`?** Because "no more than once per window" is exactly "never delay longer than one window"; the two deadlines coincide.
- **`requestAnimationFrame` throttle**: coalesce to the next frame for visual updates — same shape, different scheduler, and it stops firing in hidden tabs.
- **Debounce vs throttle for search-as-you-type**: debounce (wait for the user to pause); throttle for scroll/progress (steady cadence); debounce for analytics events (fewer beacons).
- **Add `cancel`/`flush`**: delegate to the debounce version rather than reimplementing the state machine.
- **Leading edge with trailing**: the exact and only place the two options interact; a test with a single call and a test with two calls inside one window will expose an incorrect combination.

### Common Mistakes

- Reimplementing throttle from scratch and losing the trailing call, so the last user action never fires.
- Using `setInterval`, which drifts and keeps firing after the burst ends; a re-armed `setTimeout` is correct.
- Resetting the timer on every call — that is debounce, not throttle.
- Assuming "once per `wait`" means *exactly* once; it means *at most* once.
- Dropping `this`/arguments on the deferred call by capturing them incorrectly.
- Forgetting that `wait` is a minimum, not a guarantee, because the host clamps timers.

### Takeaway

lodash's throttle is `debounce(func, wait, { leading: true, trailing: true, maxWait: wait })` — one `wait`-based quiet deadline and one `wait`-based budget deadline collapsing into "at most once per window, plus a trailing call." Standalone it is a timestamp check plus a single non-resetting timer.

