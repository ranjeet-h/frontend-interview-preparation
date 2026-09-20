## Implement `Array.prototype.reduce`

`Difficulty: Medium` `Probability: Very High`

### Problem

Add `Array.prototype.myReduce(callback, initialValue)` matching `Array.prototype.reduce`.

- `callback(accumulator, currentValue, index, array)` runs once per **present** index; holes are skipped, never visited as `undefined`.
- **The seed decision is `arguments.length >= 2`, not a value check.** With two or more arguments the accumulator starts as `initialValue` — an explicit `undefined` is a legitimate seed. With one argument, the first present element becomes the accumulator and iteration continues *after* it.
- No seed and no present element (empty array, or every index a hole such as `new Array(3)`) → `TypeError`, not `undefined`.
- `callback` must be callable → `TypeError` before any iteration.
- `this` goes through `ToObject` (array-likes work; `null`/`undefined` throw) and `length` is snapshotted **once**.

### Examples

```text
[1, 2, 3].myReduce((a, b) => a + b)             // => 6
[1, 2, 3].myReduce((a, b) => a + b, 10)         // => 16

[].myReduce((a, b) => a + b, undefined)         // => undefined  (explicit undefined IS a seed)
[].myReduce((a, b) => a + b)                    // => TypeError
new Array(3).myReduce((a, b) => a + b)          // => TypeError  (length 3, all holes)

[5].myReduce((a, b) => a + b)                   // => 5   (no seed: callback never runs)
[1, , 3].myReduce((a, b) => a + b, 10)          // => 14  (hole at index 1 skipped)

const visited = [];
[1, , 3].myReduce((a, b, i) => (visited.push(i), a + b), 0);
visited                                         // => [0, 2]

Array.prototype.myReduce.call({ 0: "a", 1: "b", length: 2 }, (a, b) => a + b) // => "ab"
```

### Approach

Two decisions define `reduce`, and both are about **presence**, not values.

**Where the accumulator comes from.** `arguments.length >= 2` is the literal spec test. Comparing `initialValue === undefined` instead would merge `reduce(fn)` with `reduce(fn, undefined)`, and those are different calls: an explicit `undefined` is a perfectly good accumulator seed. The check has to be arity-based.

**Which indices are visited.** `reduce` performs `HasProperty` before `Get`: holes are skipped entirely. But once an index is known present, its value is re-read *live*, so a callback that writes to the array changes what later indices see. `length`, however, is snapshotted once, so elements appended during the run are never visited.

With no seed, the scan for the first present index doubles as the emptiness check: if the loop reaches `length` without finding one, throw `TypeError` — the spec's "Reduce of empty array with no initial value". A naive `length === 0` guard misses `new Array(3)`, which has `length === 3` and no elements at all. When a seed element *is* found, iteration resumes at `index + 1`; that element becomes the accumulator, its callback call is skipped, and the single-element case short-circuits for free.

### Implementation

```javascript
function toLength(value) {
  const n = +value; // ToNumber: throws for BigInt/Symbol, matching the spec
  if (Number.isNaN(n) || n <= 0) return 0;
  return n === Infinity ? Number.MAX_SAFE_INTEGER : Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

Array.prototype.myReduce = function (callback, initialValue) {
  if (typeof callback !== "function") throw new TypeError("callback must be callable");
  if (this === null || this === undefined) {
    throw new TypeError("Array.prototype.myReduce called on null or undefined");
  }

  const object = Object(this);
  const length = toLength(object.length); // snapshot once

  // Arity, not value: an explicit `undefined` seed still counts as a seed.
  const hasSeed = arguments.length >= 2;

  let accumulator;
  let index = 0;

  if (hasSeed) {
    accumulator = initialValue;
  } else {
    let found = false;
    while (index < length) {
      if (index in object) { // HasProperty: holes are skipped
        accumulator = object[index];
        found = true;
        break;
      }
      index += 1;
    }
    if (!found) throw new TypeError("Reduce of empty array with no initial value");
    index += 1; // the seed element is consumed, not visited by the callback
  }

  for (; index < length; index += 1) {
    if (index in object) { // re-read live: an earlier callback may have mutated
      accumulator = callback(accumulator, object[index], index, object);
    }
  }

  return accumulator;
};
```

### Walkthrough

`[1, , 3].myReduce((a, b, i) => a + b * (i + 1), 10)`:

1. `hasSeed` is `true` (two arguments), so `accumulator = 10`, `index = 0`, `length = 3`.
2. `index 0` is present → `accumulator = 10 + 1 * 1 = 11`.
3. `index 1`: `1 in [1, , 3]` is `false` (it is a hole), so nothing happens.
4. `index 2` is present → `accumulator = 11 + 3 * 3 = 20`. Return `20`.

Now the no-seed path on `[, , 5, 6].myReduce((a, b) => a + b)`:

1. `hasSeed` is `false` because `arguments.length === 1`.
2. The scan tests `0 in object` → `false`, `1 in object` → `false`, `2 in object` → `true`. So `accumulator = 5` and `index` becomes `3`.
3. The loop runs once at `index 3` → `accumulator = 5 + 6 = 11`. The callback was called exactly once, with `(5, 6, 3, array)`.

For `new Array(3)`, the same scan finds no present index, `found` stays `false`, and the method throws — which is the whole reason the emptiness check must be a presence scan rather than a `length` check.

### Complexity

Time: `O(n)` over the snapshotted length, with one `HasProperty` probe per index. Space: `O(1)` — `reduce` allocates nothing; it only carries the accumulator.

### Edge Cases

- **Empty, no seed** → `TypeError` ("Reduce of empty array with no initial value").
- **All holes, no seed** (`new Array(3)`) → same `TypeError`; `length > 0` is not enough.
- **`[undefined]`, no seed** → `undefined` without throwing, because index `0` is present.
- **Explicit `undefined` seed** → the callback runs with `undefined` as the initial accumulator; `arguments.length` is what distinguishes this from no seed.
- **Single present element, no seed** → returned directly; the callback never runs.
- **Holes are skipped by `HasProperty`**, but a present `undefined` is visited.
- **Array-like receiver** (`{ 0: "a", 1: "b", length: 2 }`) and strings work; `null`/`undefined` receivers throw.
- **Mutation:** a callback that pushes during the run cannot extend the traversal (`length` snapshot), but a callback that overwrites a later index changes what that index yields.
- **Non-callable callback** → `TypeError` before iterating.

### Interview Follow-ups

- **`reduceRight`.** Same skeleton walking downward: start at `length - 1`, find the last present index when there is no seed, then decrement. The default seed is the *last* present element, and the callback's `index` argument is the real index, not a count.

```javascript
Array.prototype.myReduceRight = function (callback, initialValue) {
  if (typeof callback !== "function") throw new TypeError("callback must be callable");
  const object = Object(this);
  const length = toLength(object.length);
  const hasSeed = arguments.length >= 2;

  let accumulator;
  let index = length - 1;

  if (hasSeed) {
    accumulator = initialValue;
  } else {
    let found = false;
    while (index >= 0) {
      if (index in object) { accumulator = object[index]; found = true; break; }
      index -= 1;
    }
    if (!found) throw new TypeError("Reduce of empty array with no initial value");
    index -= 1;
  }

  for (; index >= 0; index -= 1) {
    if (index in object) accumulator = callback(accumulator, object[index], index, object);
  }
  return accumulator;
};
```

- **Build `map`/`filter` from `reduce`.** `arr.reduce((out, x) => (out.push(fn(x)), out), [])`; `filter` is the same with a conditional push. Useful to show that `reduce` is expressive, not faster.
- **Why does `[].reduce(fn)` throw but `[].reduce(fn, undefined)` return `undefined`?** Because the throw is about the absence of a seed, not about the absence of elements.
- **Accumulator grows quadratically:** `reduce((a, b) => a.concat(b))` is `O(n²)`; prefer `flat`/`flatMap` or `push` into one array.

### Common Mistakes

- Testing `initialValue === undefined` for the seed, so `reduce(fn, undefined)` is treated as "no seed" and a single-element array skips the callback it should have run.
- Guarding emptiness with `length === 0`, which lets `new Array(3)` fall through and silently return `undefined` instead of throwing.
- Seeding from `array[0]` and starting at index `1` without a presence check, so a leading hole becomes `undefined` and the array is summed wrong.
- Using `for...of` (every hole arrives as `undefined`) or `forEach` (no accumulator, and holes are skipped invisibly) — neither exposes the `HasProperty` and live-read contract.
- Snapshotting the *value* of `object[index]` before the call instead of reading live, which breaks reducers that fold in place.
- Reading `object.length` inside the loop so a callback can extend the traversal.
- Forgetting the callable check, so a bad callback throws only when the first present element is reached.

### Takeaway

`reduce` is "snapshot length, decide the seed by arity, then fold over present indices." The two things interviewers actually probe are the arity-based seed rule (an explicit `undefined` is a seed) and the fact that "no seed and nothing to fold" must throw.

## Implement `Array.prototype.flat`

`Difficulty: Medium` `Probability: High`

### Problem

Add `Array.prototype.myFlat(depth)` matching `Array.prototype.flat`.

- `depth` defaults to `1` **only when the argument is absent or `undefined`**. Any other value goes through `ToIntegerOrInfinity`: `1.5 → 1`, `-1 → 0`, `NaN → 0`, `"2" → 2`, `null → 0`, `Infinity` stays `Infinity` (fully flatten).
- A position is flattened only if `Array.isArray(element)` — a real array, including array subclasses and `Proxy`-wrapped arrays. Array-likes (`arguments`, `NodeList`, typed arrays) and other iterables (`Set`, `Map`, strings) are copied as-is.
- **Holes are never copied, at any depth, including `flat(0)`.** The algorithm does `HasProperty` before `Get`, so `[1, , 3].flat(0)` is `[1, 3]` with `length 2`, not a sparse array.
- Returns a **new plain array**; `this` is not mutated, and `Symbol.species` is ignored.
- `this` goes through `ToObject`; `null`/`undefined` throw. `length` is snapshotted once.

### Examples

```text
[1, [2, [3, [4]]]].myFlat()          // => [1, 2, [3, [4]]]   (default depth is 1)
[1, [2, [3, [4]]]].myFlat(2)         // => [1, 2, 3, [4]]
[1, [2, [3, [4]]]].myFlat(Infinity)  // => [1, 2, 3, 4]

[1, [2, [3]]].myFlat(0)              // => [1, [2, [3]]]      (nothing is opened at depth 0...)
[1, , 3].myFlat(0)                   // => [1, 3]             (...yet holes are still dropped)

[1, [2]].myFlat(1.5)                 // => [1, 2]   (truncates to 1)
[1, [2]].myFlat(-1)                  // => [1, [2]]
[1, [2]].myFlat(null)                // => [1, [2]] (ToIntegerOrInfinity(null) is 0)
[1, [2]].myFlat(undefined)           // => [1, 2]   (undefined means "use the default")

const node = new Uint8Array([1, 2]);
[node].myFlat()                      // => [Uint8Array(2)]  (not a real array: not flattened)
```

### Approach

`flat` is a recursive copy, not a transformation. The spec names the workhorse `FlattenIntoArray(target, source, sourceLen, start, depth)`, and it is worth reproducing faithfully because three contracts live inside it.

1. **Presence, not value.** For each `sourceIndex`, `HasProperty` decides whether to copy. This is why holes vanish even at `depth 0`: the copy only ever writes present elements, so the target is dense by construction.
2. **Depth decrements, not persists.** A nested array is recursed into with `depth - 1`, so `depth` counts how many *layers* may be opened. `Array.isArray` gates the recursion, which is why only real arrays flatten — a `Set` or a typed array is one opaque element.
3. **A running target index.** The recursion returns the next free slot in the target, which is what concatenates the pieces into one flat array without intermediate arrays or `concat` (which would consult `Symbol.isConcatSpreadable` and behave differently).

Depth normalization is where naive versions break. The default is applied *before* conversion, and only for `undefined`: `flat()` and `flat(undefined)` both flatten one level, while `flat(null)`, `flat(NaN)`, and `flat(-1)` flatten none. `Number()` cannot be used to coerce because `ToNumber(BigInt)` must throw (`[1].flat(1n)` is a `TypeError`), so use unary `+` or an explicit BigInt check.

One honest limitation: true `Infinity` recursion is bounded by the call stack. A cyclic array (`a.push(a)`) makes native `flat(Infinity)` throw `RangeError: Maximum call stack size exceeded`, and so does this version — faithful, but the reason to consider an explicit stack in Follow-ups.

### Implementation

```javascript
function toLength(value) {
  const n = +value; // ToNumber: throws for BigInt/Symbol, matching the spec
  if (Number.isNaN(n) || n <= 0) return 0;
  return n === Infinity ? Number.MAX_SAFE_INTEGER : Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

function toIntegerOrInfinity(value) {
  const n = +value; // ToNumber: BigInt and Symbol throw, as they do natively
  if (Number.isNaN(n) || n === 0) return 0; // NaN and -0 both normalize to +0
  if (n === Infinity || n === -Infinity) return n;
  return Math.trunc(n); // truncates toward zero: 1.5 -> 1, -1.9 -> -1
}

// Copies `source` into `target` starting at `start`, opening at most `depth` layers.
// Returns the next free index in `target`.
function flattenIntoArray(target, source, sourceLength, start, depth) {
  let targetIndex = start;

  for (let sourceIndex = 0; sourceIndex < sourceLength; sourceIndex += 1) {
    if (sourceIndex in source) {            // HasProperty: holes are never copied
      const element = source[sourceIndex];

      if (depth > 0 && Array.isArray(element)) { // only real arrays, one layer opened
        targetIndex = flattenIntoArray(target, element, toLength(element.length), targetIndex, depth - 1);
      } else {
        target[targetIndex] = element;      // dense write: no holes can appear
        targetIndex += 1;
      }
    }
  }

  return targetIndex;
}

Array.prototype.myFlat = function (depth) {
  if (this === null || this === undefined) {
    throw new TypeError("Array.prototype.myFlat called on null or undefined");
  }

  let depthNum = 1;                          // default applies only when absent/undefined
  if (depth !== undefined) depthNum = toIntegerOrInfinity(depth);

  const object = Object(this);
  const length = toLength(object.length);    // snapshot once

  const result = [];                         // always a plain array: no species lookup
  flattenIntoArray(result, object, length, 0, depthNum);
  return result;
};
```

### Walkthrough

`[1, [2, [3, [4]]]].myFlat(2)`:

1. `depth = 2`, `result = []`, `targetIndex = 0`.
2. `sourceIndex 0`: `1` is not an array → `result[0] = 1`, `targetIndex = 1`.
3. `sourceIndex 1`: `[2, [3, [4]]]` is an array and `depth > 0` → recurse with `depth 1`.
   - `2` → `result[1] = 2`, `targetIndex = 2`.
   - `[3, [4]]` is an array and `1 > 0` → recurse with `depth 0`, `start = 2`.
     - `3` → `result[2] = 3`, `targetIndex = 3`.
     - `[4]` is an array but `depth === 0`, so it is copied whole: `result[3] = [4]`,
       `targetIndex = 4`.
   - inner call returns `4`.
4. Outer call returns `4`; the result is `[1, 2, 3, [4]]`.

Now `[1, , 3].myFlat(0)`: `depthNum = 0`, `length = 3`. Index `0` is present → `result[0] = 1`. Index `1` fails `1 in array`, so it is skipped — `targetIndex` does not advance. Index `2` is present → `result[1] = 3`. Result `[1, 3]`, `length 2`: the source's hole is gone even though no array was opened.

### Complexity

Time: `O(n)` where `n` is the number of present positions visited across all opened layers — each element is read once. Space: `O(n)` for the result, plus `O(d)` call stack where `d` is the effective depth (up to `O(n)` for `flat(Infinity)`).

### Edge Cases

- **`flat(0)` still drops holes** — the presence filter runs regardless of depth.
- **Holes in nested arrays** are dropped too: `[1, [2, , 3]].myFlat()` is `[1, 2, 3]`.
- **`undefined` as the argument means default `1`**, but `null`/`NaN`/`""`/`-1` mean `0`.
- **Array subclasses and arrays behind a `Proxy`** flatten, because `Array.isArray` is true for both.
- **Typed arrays, `arguments`, `NodeList`, strings, `Set`** are not arrays and are copied whole.
- **`Infinity`** flattens fully; a **cyclic array** overflows the stack with `RangeError` (native does the same).
- **`null`/`undefined` receiver** → `TypeError`; an array-like receiver (`{0: 1, 1: [2], length: 2}`) flattens.
- **`Symbol.species`** is ignored: the result is always a plain `Array`, even when called on a subclass.
- **Getters are invoked** (`Get` per present index), and a getter that throws propagates.

### Interview Follow-ups

- **Write `flat` iteratively** with an explicit stack so `Infinity` cannot overflow the call stack; push `[element, depth]` frames and pop the deepest first.
- **`flat(Infinity)` vs recursion:** both are DFS; the iterative form turns stack depth into heap, and lets you detect cycles with a `WeakSet`.
- **Why is `flat` not `concat`-based?** `[].concat(...arr)` consults `Symbol.isConcatSpreadable` and flattens only one level; `flat` uses `IsArray` and a depth counter.
- **Does `flat` use `Symbol.species`?** No — `ArrayCreate` gives a plain array, unlike `map`/`filter`, which respect species and can return a subclass instance.

### Common Mistakes

- Writing `depth = depth || 1`, which turns `flat(0)` into `flat(1)` — the single most common bug.
- Using `Array.from(element)` or testing `typeof element === "object"` instead of `Array.isArray`, so typed arrays, `arguments`, or `Set`s get flattened and plain objects get copied as arrays.
- Implementing `flat(0)` by returning a slice, which preserves holes and gives `[1, , 3]` instead of `[1, 3]`.
- Coercing depth with `Number(depth)`, which silently accepts `1n` where the spec throws `TypeError`.
- Recursing with the same `depth` instead of `depth - 1`, so any positive depth flattens completely.
- Building intermediate arrays per level (or using `concat`), which loses the running `targetIndex` and can turn `O(n)` into `O(n·d)`.

### Takeaway

`flat` is a recursive `HasProperty`-then-`Get` copy with a depth counter and a running target index. The two details that separate a pass from a fail are `flat(0) !== flat()` and "holes disappear even when nothing is flattened."

## Implement `Array.prototype.flatMap`

`Difficulty: Medium` `Probability: High`

### Problem

Add `Array.prototype.myFlatMap(callback, thisArg)` matching `Array.prototype.flatMap`: map each present element, then flatten the **mapped** result by exactly one level.

- `callback(value, index, array)` is called like `map`, with `thisArg` forwarded via `.call`; holes are skipped, so `mapped` keeps them.
- Flattening is **not configurable and not `Infinity`** — the spec runs `FlattenIntoArray(target, mapped, len, 0, 1)`. A callback returning `[[1]]` yields `[[1]]`.
- Only **real arrays** returned by the callback are flattened. A `Set`, generator, string, or array-like is a single element.
- Holes *inside* a returned array are dropped by the same presence filter that `flat` uses, and source holes are dropped because the element is copied only when it exists.
- `callback` must be callable; `this` goes through `ToObject`; `length` is snapshotted before mapping.

### Examples

```text
[1, 2].myFlatMap((x) => [x, x * 10])       // => [1, 10, 2, 20]
[1, 2].myFlatMap((x) => x * 2)             // => [2, 4]      (non-array results just concatenate)

[1].myFlatMap((x) => [[x]])                // => [[1]]       (exactly one level, always)
[1].myFlatMap((x) => [x, , x])             // => [1, 1]      (hole inside the returned array)

[1, , 3].myFlatMap((x) => [x, x])          // => [1, 1, 3, 3]  (source hole never mapped)
[1].myFlatMap((x) => new Set([x]))         // => [Set(1)]    (only real arrays flatten)
[1].myFlatMap((x) => "ab")                 // => ["ab"]      (strings are not spread)

[1, 2].myFlatMap(function (x) { return [x + this.k]; }, { k: 3 })  // => [4, 5]
[].myFlatMap((x) => [x])                   // => []
```

### Approach

`flatMap` looks like `map` followed by `flat()`, and that mental model is right — but only if you are precise about *which* `flat`.

- **Not `Infinity`.** The spec passes a literal `1` to `FlattenIntoArray`. So `x => [[x]]` gives `[[x]]`, and a callback that wants two levels must return an already-flattened array itself. This is the single most common misunderstanding.
- **Not `concat`/spread.** `map(...).flat()` would be `O(2n)` with an intermediate array and would respect `Symbol.isConcatSpreadable`; the spec maps into a fresh array and flattens it in one pass with a running target index.
- **Not "flatten iterables."** Only `Array.isArray(element)` triggers recursion. A callback returning a `Set`, a `Map`, a generator, a string, or an `arguments` object contributes that object as one element. (This trips people up because `flatMap` *sounds* like it spreads whatever you return.)
- **Holes are skipped on both sides.** The map phase checks `index in source` (source holes are never passed to the callback) and the flatten phase checks `index in mapped` (holes in the callback's array are dropped).

Implementation is therefore the `map` loop plus the same `flattenIntoArray` workhorse from `flat`, with the depth hard-coded to `1`. Reusing the helper (rather than calling `myFlat` on the mapped array) keeps the contract visible: depth is a literal, not a parameter, and `thisArg` is threaded through `callback.call` in the map phase only.

### Implementation

```javascript
function toLength(value) {
  const n = +value; // ToNumber: throws for BigInt/Symbol, matching the spec
  if (Number.isNaN(n) || n <= 0) return 0;
  return n === Infinity ? Number.MAX_SAFE_INTEGER : Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

// Same workhorse as `flat`: copies present positions, opening at most `depth` layers.
function flattenIntoArray(target, source, sourceLength, start, depth) {
  let targetIndex = start;
  for (let sourceIndex = 0; sourceIndex < sourceLength; sourceIndex += 1) {
    if (sourceIndex in source) {
      const element = source[sourceIndex];
      if (depth > 0 && Array.isArray(element)) {
        targetIndex = flattenIntoArray(target, element, toLength(element.length), targetIndex, depth - 1);
      } else {
        target[targetIndex] = element;
        targetIndex += 1;
      }
    }
  }
  return targetIndex;
}

Array.prototype.myFlatMap = function (callback, thisArg) {
  if (typeof callback !== "function") throw new TypeError("callback must be callable");
  if (this === null || this === undefined) {
    throw new TypeError("Array.prototype.myFlatMap called on null or undefined");
  }

  const object = Object(this);
  const length = toLength(object.length);      // snapshot before mapping

  const mapped = new Array(length);            // holes preserved; same length as source
  for (let index = 0; index < length; index += 1) {
    if (index in object) {                     // source holes are never passed to the callback
      mapped[index] = callback.call(thisArg, object[index], index, object);
    }
  }

  const result = [];
  flattenIntoArray(result, mapped, length, 0, 1); // depth is a literal 1, never a parameter
  return result;
};
```

### Walkthrough

`["a", "bb"].myFlatMap((s, i) => i === 0 ? [s] : [s, s.length])`:

1. Map phase, length `2`. Index `0` present → `mapped[0] = ["a"]`. Index `1` present →
   `mapped[1] = ["bb", 2]`. So `mapped = [["a"], ["bb", 2]]`.
2. Flatten phase with `depth = 1`:
   - Index `0` is an array → recurse with `depth 0`, copying `"a"` → `result[0] = "a"`.
   - Index `1` is an array → recurse with `depth 0`, copying `"bb"` then `2` →
     `result[1] = "bb"`, `result[2] = 2`.
3. Result: `["a", "bb", 2]`.

Compare the depth limit: `[[1, 2]].myFlatMap((a) => a)` — the callback's identity returns the
element, so `mapped = [[1, 2]]`; the flatten phase opens the outer array (`depth 1`), finds `[1, 2]`
at `depth 0`, and copies it whole → `[[1, 2]]`. A callback result one level deeper is **not**
reached. For `[1].myFlatMap((x) => [x, , x])`: `mapped = [[1, , 1]]`; the recursion copies `1`,
skips the hole because `1 in [1, , 1]` is false, copies `1` → `[1, 1]`.

### Complexity

Time: `O(n + m)` — one pass over the snapshot to map, one pass over the mapped array to flatten, where `m` is the flattened element count. Space: `O(n + m)` for `mapped` plus `result`; the flatten phase adds no intermediate arrays.

### Edge Cases

- **Exactly one level:** `[[x]]` stays nested; use an explicit `flat` when two levels are needed.
- **Non-array callback results** (`undefined`, `null`, numbers, strings, `Set`, generators,
  `arguments`) are single elements — nothing is spread except real arrays.
- **Source holes** are skipped by the map phase and never reach the callback.
- **Holes inside a returned array** are dropped by the flatten phase, so the result is always dense.
- **`thisArg`** is forwarded via `.call`; arrows ignore it.
- **Empty array** → `[]` with no callback calls; **array-like receiver** works and returns a real `Array`.
- **A callback that mutates the source** changes later reads, since values are read live per index.
- **`callback` not callable** → `TypeError` before any mapping; `null`/`undefined` receiver → `TypeError`.

### Interview Follow-ups

- **`flatMap` as filter.** `arr.flatMap((x) => (predicate(x) ? [x] : []))` filters and maps in one pass — the standard replacement for the old `map().filter()` and the reason it is not just `map`.
- **`Array.from(iterable, fn)` vs `flatMap`:** `Array.from` consumes an iterable and never flattens; `flatMap` consumes an array and flattens real-array results one level.
- **Why is `flatMap` not `flat(Infinity)`?** Deep flattening is `O(depth)` stack and surprising for callbacks that return nested data; one level keeps it a "map plus spread" with predictable cost.
- **Streaming/lazy variant:** generators give one-element-at-a-time output, so a huge input does not need `mapped` in memory — but then it is no longer a drop-in `Array` method.

### Common Mistakes

- Assuming the callback's result is flattened recursively, so `[[x]]` is expected to yield `[x]`.
- Assuming iterables are flattened: `flatMap((x) => new Set([x]))` does **not** spread the `Set`.
- Reimplementing as `map(...).flat(Infinity)`, which flattens too deeply and allocates twice.
- Using spread (`[].concat(...mapped)`) instead of `FlattenIntoArray`, which breaks on holes and on `Symbol.isConcatSpreadable`.
- Forgetting the `index in object` guard, so a sparse source passes `undefined` to the callback.
- Forgetting `thisArg`, or passing it to the flatten phase (it belongs to the callback only).

### Takeaway

`flatMap` is `map` plus `FlattenIntoArray(..., 1)`: a literal depth of one, real arrays only, holes skipped on both sides. If you remember one thing, remember that the depth is not configurable.

## Implement `Array.prototype.includes`

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `Array.prototype.myIncludes(searchElement, fromIndex)` matching `Array.prototype.includes`.

- Comparison uses **SameValueZero**: `NaN` equals `NaN` (unlike `indexOf`), and `+0` equals `-0` (like `===`).
- Holes are **read as `undefined`**: `new Array(3).includes(undefined)` is `true`. This is the key difference from `indexOf`, which uses `HasProperty` and skips holes.
- `fromIndex` is normalized with `ToIntegerOrInfinity`: `NaN`/absent → `0`, `1.9 → 1`, `-1` → `length - 1`, `-Infinity` → `0`, `+Infinity` → return `false`. A negative index that still lands below `0` is **clamped to `0`** (it does not wrap again).
- A **BigInt `fromIndex` throws `TypeError`** (`ToNumber(BigInt)`), and so does a `Symbol`. A BigInt *search element* is fine: `[1n].includes(1n)` is `true`.
- Returns a boolean; `this` goes through `ToObject`; `length` is snapshotted once.

### Examples

```text
[1, 2, 3].myIncludes(2)            // => true
[1, 2, 3].myIncludes(5)            // => false
[1, 2, 3].myIncludes("2")          // => false  (=== is not coercion)

[1, 2, NaN].myIncludes(NaN)        // => true
[1, 2, NaN].indexOf(NaN)           // => -1     (contrast: indexOf uses strict equality and skips holes)

new Array(3).myIncludes(undefined) // => true   (holes read as undefined)
new Array(3).indexOf(undefined)    // => -1     (indexOf skips holes)

[1, 2, 3].myIncludes(3, -1)        // => true   (fromIndex -1 -> 2)
[1, 2, 3].myIncludes(1, -1)        // => false
[1, 2, 3].myIncludes(2, -100)      // => true   (clamped to 0)
[1, 2, 3].myIncludes(1, Infinity)  // => false

[0].myIncludes(-0)                 // => true   (SameValueZero)
[1n].myIncludes(1n)                // => true
[].myIncludes(1, 1n)               // => false  (length 0 short-circuits before fromIndex is read)
[1].myIncludes(1, 1n)              // => TypeError: Cannot convert a BigInt value to a number
```

### Approach

`includes` is a linear scan, but four details in the spec order are what interviewers ask about.

1. **`ToObject(this)` first**, then snapshot `LengthOfArrayLike`. `null`/`undefined` receivers throw; array-likes work.
2. **`if (length === 0) return false` before touching `fromIndex`.** This ordering is observable: `[].includes(1, 1n)` returns `false` while `[1].includes(1, 1n)` throws, because the BigInt coercion never happens for an empty array.
3. **`fromIndex` is converted with `ToNumber` semantics** (`ToIntegerOrInfinity`), which is why `Symbol` and `BigInt` throw. Then: `+Infinity` returns `false` immediately; a non-negative `n` is the start; a negative `n` becomes `length + n`, clamped up to `0`; `NaN` and `-0` both become `0`.
4. **SameValueZero, and no presence check.** The loop reads `object[k]` directly — holes yield `undefined` and therefore match a search for `undefined`. The comparison is `a === b || (a !== a && b !== b)`, the standard SameValueZero idiom: it treats `NaN` as equal to itself and leaves `+0`/`-0` equal.

Contrast `indexOf`: it uses strict equality (so `NaN` never matches) and `HasProperty` (so holes are skipped). `includes` is the "did this value appear" question; `indexOf` is the "at what index" question, and the two differ exactly on `NaN` and holes. Also do not confuse this with `String.prototype.includes`, which is a substring search over a stringified receiver.

### Implementation

```javascript
function toLength(value) {
  const n = +value; // ToNumber: throws for BigInt/Symbol, matching the spec
  if (Number.isNaN(n) || n <= 0) return 0;
  return n === Infinity ? Number.MAX_SAFE_INTEGER : Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

function toIntegerOrInfinity(value) {
  const n = +value; // BigInt and Symbol throw here, exactly as they do natively
  if (Number.isNaN(n) || n === 0) return 0; // NaN and -0 normalize to +0
  if (n === Infinity || n === -Infinity) return n;
  return Math.trunc(n);
}

function isSameValueZero(a, b) {
  return a === b || (a !== a && b !== b); // the second clause is the NaN case
}

Array.prototype.myIncludes = function (searchElement, fromIndex) {
  if (this === null || this === undefined) {
    throw new TypeError("Array.prototype.myIncludes called on null or undefined");
  }

  const object = Object(this);
  const length = toLength(object.length); // snapshot once

  if (length === 0) return false; // BEFORE fromIndex is read: [].includes(1, 1n) is false

  const n = toIntegerOrInfinity(fromIndex); // absent -> Number(undefined) -> NaN -> 0
  if (n === Infinity) return false;

  let k = n >= 0 ? n : length + n;
  if (k < 0) k = 0; // a negative index below zero is clamped, not wrapped

  while (k < length) {
    // No `k in object` guard: holes read as undefined and DO match a search for undefined.
    if (isSameValueZero(object[k], searchElement)) return true;
    k += 1;
  }

  return false;
};
```

### Walkthrough

`[10, 20, NaN].myIncludes(NaN, -2)`:

1. `length = 3` (not zero), `n = toIntegerOrInfinity(-2) = -2`.
2. `n` is negative, so `k = 3 + (-2) = 1`; it is not below `0`, so no clamping.
3. `k = 1`: `isSameValueZero(20, NaN)` → `20 === NaN` is false, and `20 !== 20` is false → `false`.
4. `k = 2`: `isSameValueZero(NaN, NaN)` → `NaN === NaN` is false, but `NaN !== NaN` and `NaN !== NaN` are both true → `true`. Return `true`.

Now the hole case, `new Array(2).myIncludes(undefined)`: `length = 2`, `n = 0`, `k = 0`.
`object[0]` does not exist, so `Get` yields `undefined`; `isSameValueZero(undefined, undefined)` is
true → return `true` on the first probe. Native `indexOf` returns `-1` here because it checks
`0 in object` first.

Finally, `[1].myIncludes(1, 1n)`: `length` is `1`, so the empty short-circuit does not fire;
`toIntegerOrInfinity(1n)` evaluates `+1n`, which throws `TypeError: Cannot convert a BigInt value
to a number`. With `[]` instead, `length === 0` returns `false` before that coercion — the ordering
is the answer to the trick question.

### Complexity

Time: `O(n)` worst case (search found last or absent), `O(1)` when the element is first or the range is empty. Space: `O(1)` — no allocation beyond `Object(this)` for primitives.

### Edge Cases

- **`NaN` matches `NaN`** (SameValueZero); `indexOf(NaN)` is always `-1`.
- **`+0`/`-0`** compare equal, so `[0].includes(-0)` is `true`.
- **Holes** are read as `undefined`, so `new Array(3).includes(undefined)` is `true`.
- **`fromIndex` normalization:** absent → `0`; `NaN` → `0`; `-0` → `0`; `1.9 → 1`; `-1` → `length - 1`; `-100` → `0` (clamped); `Infinity` → `false`.
- **BigInt/Symbol `fromIndex`** → `TypeError`, *unless* `length === 0`, which short-circuits first.
- **BigInt search element** is fine: `[1n].includes(1n)` is `true`; `[1].includes(1n)` is `false` (no coercion).
- **Empty array** → `false` without reading `fromIndex`.
- **Array-like/string receiver** works (strings have indexed properties and a `length`); an object with a bogus `length` is clamped by `toLength`.
- **`get` accessors** are invoked per probe, so a throwing getter propagates.

### Interview Follow-ups

- **`includes` vs `indexOf` in one line:** SameValueZero vs strict equality, `Get` every index vs `HasProperty`. Everything else (fromIndex math) is identical.
- **Implement `findIndex` next to it:** same scan, but it calls a predicate and returns `k` or `-1`; unlike `includes` it uses `HasProperty`, so holes are skipped.
- **`includes` on the result of `flat`/`flatMap`:** the result is dense, so the hole difference disappears — a good way to show why hole semantics matter only for the source array.
- **`Set.prototype.has` comparison:** also SameValueZero, so `new Set([NaN]).has(NaN)` is `true`, but `Set` is `O(1)` while `includes` is `O(n)`.

### Common Mistakes

- Implementing with `indexOf(...) !== -1`, which returns `false` for `NaN`.
- Adding an `if (k in object)` guard, copying the `indexOf` contract and breaking `includes(undefined)` on holes.
- Applying `fromIndex` before checking `length === 0`, so `[].includes(1, 1n)` throws where native returns `false`.
- Clamping by wrapping twice: `k = -1` on a length-3 array is `2`, but `k = -4` must clamp to `0`, not to `-1` or `2`.
- Coercing `fromIndex` with `Number(n)`, which quietly converts BigInts instead of throwing.
- Forgetting that `includes` does no coercion: `[1, 2, 3].includes("2")` is `false`, and `String.prototype.includes` is a completely different method.

### Takeaway

`includes` is a SameValueZero scan that reads every index (holes are `undefined`), after a `length === 0` short-circuit and a `ToIntegerOrInfinity`-normalized `fromIndex`. The `NaN` and hole behaviors are exactly what separate it from `indexOf`.
