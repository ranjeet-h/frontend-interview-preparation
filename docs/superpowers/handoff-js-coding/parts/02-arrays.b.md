## Rotate an Array Right by `k`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `rotateRight(array, k)` returning a new array shifted right by `k` positions:
every element moves `k` indices forward and wraps around the end. The contract:

- **Pure.** It returns a new array and never mutates the input.
- `k` is normalized modulo `array.length`, so `k` may exceed the length, and a negative
  `k` rotates **left**.
- The empty array returns an empty array (guard the modulo).

### Examples

```text
rotateRight([1, 2, 3, 4, 5], 2)   // => [4, 5, 1, 2, 3]
rotateRight([1, 2, 3, 4, 5], 0)   // => [1, 2, 3, 4, 5]
rotateRight([1, 2, 3, 4, 5], 5)   // => [1, 2, 3, 4, 5]
rotateRight([1, 2, 3, 4, 5], 12)  // => [4, 5, 1, 2, 3]  (12 % 5 === 2)
rotateRight([1, 2, 3, 4, 5], -1)  // => [2, 3, 4, 5, 1]  (negative k rotates left)
rotateRight([1], 100)             // => [1]
rotateRight([], 3)                // => []
rotateRight([1, 2], 1)            // => [2, 1]
```

### Approach

The whole problem is index arithmetic; the algorithm is a cut-and-paste.

1. Normalize the shift: `shift = ((k % n) + n) % n`. The extra `+ n` is what makes a
   negative `k` land in `[0, n)`. In JavaScript `-1 % 5` is `-1`, and any use of that raw
   value as a length silently produces the wrong answer — this step is the bug it prevents.
2. Split the array at `n - shift`: the **tail** (`slice(n - shift)`) becomes the new front
   and the **head** (`slice(0, n - shift)`) follows it.
3. Both halves are copies, so the result is `O(n)` time and space — unavoidable when the
   contract says "return a new array." If the interviewer wants `O(1)` extra space, that is
   the three-reversal trick in the Implementation section.

Two traps a naive solution hits:

- `array.slice(array.length - k)` looks right, but `slice` treats a negative start as
  "from the end," so `k > n` accidentally works for some values and fails for others
  (`k = 12, n = 5`). Normalize first and the special case disappears.
- Spreading (`[...a, ...b]`) iterates, so holes become explicit `undefined`; `concat`
  preserves holes. Pick one and say which.

### Implementation

```javascript
function rotateRight(array, k) {
  if (!Array.isArray(array)) throw new TypeError("rotateRight expects an array");
  if (!Number.isInteger(k)) throw new TypeError("k must be an integer");

  const n = array.length;
  if (n === 0) return [];                  // guard: n is a divisor, 0 would give NaN

  const shift = ((k % n) + n) % n;         // normalize: handles k > n and k < 0
  if (shift === 0) return array.slice();   // slice() is a copy, and keeps holes

  const cut = n - shift;
  return array.slice(cut).concat(array.slice(0, cut)); // concat preserves holes
}
```

The in-place variant, when extra space must be `O(1)` — reverse the whole array, then
reverse each part:

```javascript
function rotateRightInPlace(array, k) {
  const n = array.length;
  if (n === 0) return array;
  const shift = ((k % n) + n) % n;

  const reverse = (lo, hi) => {
    while (lo < hi) {
      [array[lo], array[hi]] = [array[hi], array[lo]];
      lo += 1;
      hi -= 1;
    }
  };

  reverse(0, n - 1);          // [1,2,3,4,5] -> [5,4,3,2,1]
  reverse(0, shift - 1);      //              -> [4,5,3,2,1]
  reverse(shift, n - 1);      //              -> [4,5,1,2,3]
  return array;
}
```

### Walkthrough

`rotateRight([1, 2, 3, 4, 5], 2)`:

1. `n = 5`, `k = 2` is an integer, so no throw.
2. `shift = ((2 % 5) + 5) % 5 = 2`.
3. `shift !== 0`, so `cut = 5 - 2 = 3`.
4. `array.slice(3)` → `[4, 5]`; `array.slice(0, 3)` → `[1, 2, 3]`.
5. `[4, 5].concat([1, 2, 3])` → `[4, 5, 1, 2, 3]`.

For `rotateRight([1, 2, 3, 4, 5], -1)`: `((-1 % 5) + 5) % 5 = 4`, so `cut = 1` and the
result is `slice(1)` + `slice(0, 1)` = `[2, 3, 4, 5, 1]` — a one-step left rotation,
exactly as promised.

### Complexity

Time: `O(n)` — the two slices touch every element once. Space: `O(n)` for the result. The
in-place variant is `O(n)` time and `O(1)` extra space, at the cost of mutating the array.

### Edge Cases

- `k = 0` or a multiple of `n`: `shift === 0`, and the shortcut returns a clean copy.
- `k > n`: modulo keeps it correct; an unnormalized `slice(length - k)` breaks once `k > 2n`.
- Negative `k`: the double-modulo converts it to the equivalent right rotation.
- Empty array: return before the modulo, avoiding `NaN`.
- Holes: `slice`/`concat` preserve them; spread would turn them into explicit `undefined`.
- `k` non-integer (`2.5`, `NaN`, `Infinity`): a fractional split index corrupts the result,
  so reject it up front.
- Large arrays: the copy doubles peak memory; the in-place version avoids that.

### Interview Follow-ups

- **Rotate left by `k`:** it is `rotateRight(array, -k)`, or `rotateRight(array, n - k % n)`.
- **Rotate in place, `O(1)` space:** the three-reversal algorithm; explain why reversing the
  halves after the full reversal restores internal order.
- **Rotate a linked list:** compute the new tail at `n - k % n`, cut, and reconnect the old
  tail to the old head.
- **Rotate repeatedly:** `k` single rotations cost `O(nk)`; prefer the split.
- **Why `slice(-k)` is a trap:** negative indices wrap, so the unnormalized form works for
  small `k` and fails for large `k` — it passes the first test and fails in production.

### Common Mistakes

- Forgetting to normalize `k`, producing slices in the wrong order for `k > n` or `k < 0`.
- Using `splice` and mutating the caller's array, violating the purity contract.
- Dividing by `array.length` before handling the empty array, yielding `NaN`.
- Using spread on a sparse array, silently converting holes to `undefined`.
- Assuming `k` is always within bounds because the example used `k = 2`.

### Takeaway

Rotation is `shift = ((k % n) + n) % n`, then `slice(n - shift).concat(slice(0, n - shift))`.
Normalizing `k` is the entire trick; the rest is a cut-and-paste.

## Chunk an Array

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `chunk(array, size = 1)` that splits an array into consecutive subarrays of
length `size`. The last chunk holds the remainder and may be shorter. The contract:

- Returns a **new** outer array of **new** subarrays; the input is neither mutated nor
  aliased by the output.
- Order is preserved and no element is dropped.
- `size` must be a positive integer; anything else (`0`, negative, fractional, `NaN`,
  `Infinity`, `"2"`) throws rather than looping forever or guessing.

### Examples

```text
chunk([1, 2, 3, 4, 5], 2)    // => [[1, 2], [3, 4], [5]]
chunk([1, 2, 3, 4, 5, 6], 3) // => [[1, 2, 3], [4, 5, 6]]
chunk([1, 2, 3], 5)          // => [[1, 2, 3]]   (size larger than the array)
chunk([1, 2, 3], 1)          // => [[1], [2], [3]]
chunk([], 2)                 // => []
chunk([1, 2, 3], 3)          // => [[1, 2, 3]]
chunk([1, 2, 3], 2)          // => [[1, 2], [3]]
chunk([1, 2, 3], 0)          // => RangeError
```

### Approach

Walk the array in strides of `size` and take `slice(i, i + size)` each time.

- The loop is `for (let i = 0; i < array.length; i += size)`. A `while` bounded by
  `i <= length - size` needs a second "leftover" chunk after the loop and is the usual
  source of off-by-one bugs; the stride form has no leftover case because `slice` clamps
  its end index.
- `slice` returns a fresh subarray, so the output does not alias the input. That matters:
  if you returned slices of shared storage, later mutation of the input would leak into the
  "chunked" result.
- Validate `size` **before** the loop. `size = 0` or `NaN` makes `i` never advance, so the
  loop never terminates; `Infinity` would silently produce one chunk.

`Number.isInteger(size)` rejects `2.5`, `NaN`, `Infinity`, `"2"`, and `null` in one call.

### Implementation

```javascript
function chunk(array, size = 1) {
  if (!Array.isArray(array)) throw new TypeError("chunk expects an array");
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("size must be a positive integer");
  }

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size)); // slice clamps at the end and copies
  }
  return chunks;
}
```

A lazy version for very large or infinite sequences, when the caller may stop early:

```javascript
function* chunkLazy(iterable, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("size must be a positive integer");
  }
  let bucket = [];
  for (const value of iterable) {
    bucket.push(value);
    if (bucket.length === size) {
      yield bucket;        // hand over a full chunk...
      bucket = [];         // ...then start a fresh one (never reuse the yielded array)
    }
  }
  if (bucket.length > 0) yield bucket; // the shorter tail chunk
}
```

### Walkthrough

`chunk([1, 2, 3, 4, 5], 2)`:

1. `size = 2` passes validation.
2. `i = 0`: `slice(0, 2)` → `[1, 2]`; `chunks = [[1, 2]]`; `i` becomes `2`.
3. `i = 2`: `slice(2, 4)` → `[3, 4]`; `chunks = [[1, 2], [3, 4]]`; `i` becomes `4`.
4. `i = 4`: `slice(4, 6)` → `[5]` (the end index is clamped); `chunks` becomes
   `[[1, 2], [3, 4], [5]]`; `i` becomes `6`.
5. `6 < 5` is false, so the loop stops.

The lazy version on the same input yields `[1, 2]`, then `[3, 4]`, then `[5]` only when the
consumer asks for the third value.

### Complexity

Time: `O(n)` — one visit per element. Space: `O(n)` for the chunks, since the subarrays
collectively hold every element. The lazy version uses `O(size)` at a time.

### Edge Cases

- `size >= length` → a single chunk holding the whole array; never an empty chunk.
- `size = 1` → one chunk per element.
- Empty input → `[]`, not `[[]]`; the loop body never runs.
- Sparse input: `slice` preserves holes, so `chunk([1, , 3], 2)` is `[[1, <hole>], [3]]`.
- `size` of `0`, `NaN`, `Infinity`, `2.5`, `"2"`, `null` → rejected before any work.
- Iterables (strings, `Set`, generators) have no `length` or indexed access; use the lazy
  generator, or convert with `Array.from` first.
- Huge `size` near `2^53` is technically an integer; `size >= n` means one chunk, so it is
  fine, but a huge `size` with a huge array would still be one allocation.

### Interview Follow-ups

- **Chunk a string:** `[...str]` (code points, not code units) then join each chunk.
- **Pad the last chunk** to `size`: after the loop, `last.push(...Array(size - last.length).fill(filler))`.
- **Lazy chunking** (generator above) is the answer for streams and infinite input.
- **Sliding windows** overlap and are a different problem; plain chunking partitions, so
  every element appears exactly once.
- **Mutation during iteration:** the loop reads the live `array`, so an element pushed
  mid-loop gets chunked; copy the input first if that is undesirable.

### Common Mistakes

- `array.slice(i, size)` — using `size` as an absolute end index; it works only for the
  first chunk. The end must be `i + size`.
- `array.splice(0, size)` in a loop, which empties the caller's array.
- Looping with `i <= array.length` and pushing a trailing empty chunk.
- Skipping validation, so `size = 0` or `NaN` hangs the loop.
- Returning aliased views instead of `slice` copies, then wondering why editing a chunk
  changes the original.

### Takeaway

`for (let i = 0; i < n; i += size) push(array.slice(i, i + size))`. The stride loop plus
`slice`'s clamped end index removes the "leftover" case entirely; validate `size` first and
the rest is mechanical.

## Flatten a Nested Array Recursively

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `flattenDeep(array)` that returns a new, fully flattened array: every nested
array at any depth is replaced by its elements, in order, and only actual arrays are
recursed into. The contract:

- Returns a new array; the input is not mutated.
- `Array.isArray` is the recursion test, so strings, plain objects, typed arrays,
  `arguments`, and other array-likes are **leaf values**, not containers.
- Holes behave like the native `Array.prototype.flat`: they are **removed** rather than
  kept as `undefined`.

### Examples

```text
flattenDeep([1, [2, [3, [4]], 5]])        // => [1, 2, 3, 4, 5]
flattenDeep([[1, 2], [3, 4]])             // => [1, 2, 3, 4]
flattenDeep([1, [2, [3, [4, [5]]]]])      // => [1, 2, 3, 4, 5]
flattenDeep([])                           // => []
flattenDeep([[], [[]]])                   // => []
flattenDeep([1, "ab", { a: 1 }])          // => [1, "ab", { a: 1 }]
flattenDeep([1, , 3])                     // => [1, 3]  (holes dropped, like flat)
```

### Approach

Depth-first traversal with a single shared accumulator:

- Walk each array with an index loop. For each **present** index, if the value is an array,
  recurse; otherwise push it. The accumulator is created once, so the result is built in one
  pass instead of allocating a new array per level.
- Use `Array.isArray`, not `typeof value === "object"` (also true for `null` and plain
  objects) and not duck-typing on `.length`.
- Skip holes with `!(i in source)` to match `flat`, which removes empty slots. A `for...of`
  loop would instead yield `undefined` for each hole.

Why not `reduce((acc, value) => acc.concat(flattenDeep(value)))`? `concat` allocates a new
array on every merge, so the total work becomes quadratic in the number of nested arrays.
The single accumulator stays linear.

Why not `flat(Infinity)`? If the interview allows it, that is the one-liner — but the
exercise is to build it, and the native version also drops holes, which the hand-written
version must match.

Recursion depth is the one real weakness: JavaScript has no tail-call optimization, so
input nested tens of thousands deep overflows the stack. The iterative form keeps an
explicit stack (see Follow-ups and the second implementation).

### Implementation

```javascript
function flattenDeep(array) {
  if (!Array.isArray(array)) throw new TypeError("flattenDeep expects an array");

  const result = [];
  (function walk(source) {
    for (let i = 0; i < source.length; i += 1) {
      if (!(i in source)) continue;          // skip holes, matching Array.prototype.flat
      const value = source[i];
      if (Array.isArray(value)) walk(value); // only real arrays are containers
      else result.push(value);
    }
  })(array);

  return result;
}
```

Iterative version with an explicit stack, for pathologically deep input:

```javascript
function flattenDeepIterative(array) {
  if (!Array.isArray(array)) throw new TypeError("flattenDeep expects an array");

  const result = [];
  const stack = [{ source: array, index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.source.length) {
      stack.pop();                            // this level is finished
      continue;
    }
    const i = frame.index++;
    if (!(i in frame.source)) continue;
    const value = frame.source[i];
    if (Array.isArray(value)) stack.push({ source: value, index: 0 });
    else result.push(value);
  }
  return result;
}
```

### Walkthrough

`flattenDeep([1, [2, [3, [4]], 5]])`:

1. `walk([1, [2, [3, [4]], 5]])`: `i = 0`, `1` is not an array → push `1`.
2. `i = 1`, `[2, [3, [4]], 5]` is an array → `walk` it.
   1. `i = 0` → push `2`.
   2. `i = 1`, `[3, [4]]` is an array → `walk` it.
      1. `i = 0` → push `3`.
      2. `i = 1`, `[4]` is an array → `walk` it → push `4`.
   3. `i = 2` → push `5`.
3. The recursion unwinds; `result` is `[1, 2, 3, 4, 5]`.

The order is pre-order and left-to-right, exactly what `flat(Infinity)` produces.

### Complexity

Time: `O(N)` where `N` counts every element and every nested array — each is visited once.
Space: `O(n)` for the output plus `O(d)` recursion depth. The iterative version swaps the
`O(d)` call stack for an `O(d)` heap stack, so it survives depths the recursive one cannot.

### Edge Cases

- `[]` and `[[], [[]]]` → `[]`; emptiness is "contains no leaves."
- Holes are dropped: `[1, , 3]` → `[1, 3]`, matching `flat` and unlike `for...of`.
- `null` is a leaf: `[1, [null]]` → `[1, null]`, because `Array.isArray(null)` is false.
- Array-likes (`{0: 1, length: 1}`, `arguments`, typed arrays) are leaves, not containers.
- Cyclic input (`a.push(a)`) recurses forever and throws `RangeError: Maximum call stack
  size exceeded`; guard with a `WeakSet` of ancestors if cycles are possible.
- Deep nesting (~10⁴ levels) overflows the recursive version; the iterative one survives
  until heap memory runs out.
- Non-array input throws rather than silently being wrapped in an array.

### Interview Follow-ups

- **Flatten to a depth limit** — the next problem; carry a `remaining` counter down.
- **`flatMap`:** map, then flatten one level; or transform and flatten in a single pass.
- **Lazy flatten with a generator:** `yield` leaves as reached, so a deeply nested (or
  infinite) structure works when the consumer stops early.
- **Cycle handling:** keep a `WeakSet` of arrays on the current path; add on entry and
  delete on exit so a shared (DAG) subarray can still be flattened twice.
- **`structuredClone` on nested data** shares the same recursion-depth hazard, which is why
  the platform implementation is iterative.

### Common Mistakes

- `reduce` + `concat`, which is quadratic in nested-array count and allocates per level.
- `typeof value === "object"` as the recursion test — recurses into `null`, or treats plain
  objects as containers.
- Using `for...of`, which visits holes as `undefined` and breaks `flat` parity.
- Returning a fresh array from each recursive call and spreading/concatenating at every
  level instead of pushing into one accumulator.
- Ignoring cycles, then blaming the engine when the stack overflows.

### Takeaway

Flattening is a depth-first walk with one accumulator and `Array.isArray` as the only
recursion test. Push into the accumulator rather than concatenating sub-results, and be
explicit about holes (dropped, like `flat`) and depth (the recursion stack is your limit).

## Flatten an Array to a Specified Depth

`Difficulty: Medium` `Probability: High`

### Problem

Implement `flattenDepth(array, depth = 1)` matching `Array.prototype.flat`: flatten nested
arrays up to `depth` levels, and leave anything deeper intact. The contract:

- Returns a new array; the input is not mutated.
- `depth` follows `ToIntegerOrInfinity`: `undefined` defaults to `1`, `NaN` and negatives
  become `0` (a shallow copy), fractions truncate toward zero, and `Infinity` fully flattens.
- Holes are removed, as `flat` does.

### Examples

```text
flattenDepth([1, [2, [3, [4]]]], 1)        // => [1, 2, [3, [4]]]
flattenDepth([1, [2, [3, [4]]]], 2)        // => [1, 2, 3, [4]]
flattenDepth([1, [2, [3, [4]]]], 0)        // => [1, [2, [3, [4]]]]
flattenDepth([1, [2, [3, [4]]]])           // => [1, 2, [3, [4]]]      (default 1)
flattenDepth([1, [2, [3, [4]]]], Infinity) // => [1, 2, 3, 4]
flattenDepth([1, [2, [3, [4]]]], -3)       // => [1, [2, [3, [4]]]]    (no flattening)
flattenDepth([1, [2, [3, [4]]]], 1.9)      // => [1, 2, [3, [4]]]      (truncates to 1)
flattenDepth([1, , [2]], 1)                // => [1, 2]
```

### Approach

The same depth-first walk as full flattening, plus a budget.

- Each recursive call receives `remaining`. A value is flattened only when it is an array
  **and** `remaining > 0`; otherwise it is pushed as a leaf. Passing `remaining - 1` down by
  value gives each element its own budget, so siblings are independent.
- Normalize `depth` once, before the walk, with `ToIntegerOrInfinity` semantics:
  `Number(depth)` → `NaN` becomes `0` → truncate toward zero → clamp negatives to `0`.
  `Infinity` survives `Math.trunc` as `Infinity`, so `remaining - 1` stays `Infinity` and
  everything flattens.
- The subtle bug is a **shared** counter (`remaining--` on a closure variable or an outer
  `let`): the first deep branch exhausts the budget and later siblings stop flattening. Pass
  the depth by value.

The previous problem is this one with `depth = Infinity`, which is exactly why `flat` takes
an argument and why `flatMap` is equivalent to `flat(1)` after a map.

### Implementation

```javascript
function flattenDepth(array, depth = 1) {
  if (!Array.isArray(array)) throw new TypeError("flattenDepth expects an array");

  // ToIntegerOrInfinity: NaN -> 0, negatives -> 0, fractions truncate, Infinity stays.
  const numeric = Number(depth);
  const limit = Number.isNaN(numeric) ? 0 : Math.max(0, Math.trunc(numeric));

  const walk = (source, remaining) => {
    const output = [];
    for (let i = 0; i < source.length; i += 1) {
      if (!(i in source)) continue;                  // holes dropped, as in flat
      const value = source[i];
      if (Array.isArray(value) && remaining > 0) {
        output.push(...walk(value, remaining - 1));  // remaining is passed by value
      } else {
        output.push(value);                          // at the limit, or not an array
      }
    }
    return output;
  };

  return walk(array, limit);
}
```

A variant that pushes into one accumulator instead of spreading sub-results:

```javascript
function flattenDepthInto(array, depth = 1) {
  const numeric = Number(depth);
  const limit = Number.isNaN(numeric) ? 0 : Math.max(0, Math.trunc(numeric));

  const result = [];
  const walk = (source, remaining) => {
    for (let i = 0; i < source.length; i += 1) {
      if (!(i in source)) continue;
      const value = source[i];
      if (Array.isArray(value) && remaining > 0) walk(value, remaining - 1);
      else result.push(value);
    }
  };

  walk(array, limit);
  return result;
}
```

### Walkthrough

`flattenDepth([1, [2, [3, [4]]]], 2)`: `limit = 2`.

1. `walk(outer, 2)`: `i = 0`, `1` is not an array → push `1`.
2. `i = 1`: `[2, [3, [4]]]` is an array and `2 > 0` → `walk(inner, 1)`.
   1. `i = 0` → `2` is not an array → push `2`.
   2. `i = 1`: `[3, [4]]` is an array and `1 > 0` → `walk(deeper, 0)`.
      1. `i = 0` → `3` is not an array → push `3`.
      2. `i = 1`: `[4]` is an array but `0 > 0` is false → push `[4]` **as a leaf**.
3. Result: `[1, 2, 3, [4]]`.

With `depth = Infinity`, `remaining` never reaches `0`, so the inner branch also recurses and
the result is `[1, 2, 3, 4]`.

### Complexity

Time: `O(N)` over visited values and arrays, bounded by the depth limit. Space: `O(n)` output
plus `O(d)` recursion depth. The spread version allocates one array per nested level; the
accumulator version does not.

### Edge Cases

- `depth = 0` or negative → a shallow copy that still drops holes.
- `depth = undefined` → `1`, the native default (not `0`; a common mistake).
- Fractional `1.9` → `1`; `NaN` → `0`; `Infinity` → full flatten.
- Holes dropped at every level: `[1, , [2]]` with depth `1` → `[1, 2]`.
- A hole-only array `[, ,]` with depth `0` → `[]`.
- Deeply nested input with a large `depth` can overflow the stack; the limit bounds how
  much is flattened, not how deep the structure is.
- Non-array input throws; `depth` as a numeric string (`"2"`) works because of `Number`.

### Interview Follow-ups

- **Implement `flat` as a prototype method** with `Symbol.species`, so a subclass instance
  flattens to the subclass; that detail separates a full polyfill from a helper.
- **`flatMap`:** implement it as map-then-flatten-one-level and compare with a native
  single-pass version; note that `flatMap` also receives `thisArg`.
- **Iterative depth-limited flatten:** push `{ value, remaining }` frames on an explicit
  stack instead of using the call stack.
- **Preserve holes** (a deliberately different contract): test `i in source` to choose
  between pushing a hole and pushing `undefined`.
- **Coercion:** the native `flat` accepts `"2"` and `1.9`; an implementation that insists on
  integers diverges from the spec.

### Common Mistakes

- Decrementing a shared counter instead of passing `remaining - 1` by value, so siblings
  flatten inconsistently.
- Treating a missing `depth` as `0`; the native default is `1`.
- Forgetting to clamp negatives, leaving `remaining < 0` and muddying the condition.
- Using `for...of`, which turns holes into `undefined` instead of dropping them.
- Spreading sub-results at every level, turning a linear walk into repeated allocations.

### Takeaway

Depth-limited flatten is full flatten with a per-element budget: flatten when the value is an
array **and** budget remains, and pass `remaining - 1` by value so siblings cannot steal each
other's depth. Normalize `depth` once with `ToIntegerOrInfinity` semantics.

## Find Missing Number(s) From a Sequence

`Difficulty: Medium` `Probability: High`

### Problem

Two related tasks:

- `findMissing(nums)` — given `nums`, a permutation of `1..n` with exactly one value
  removed, return the missing value.
- `findMissingMany(nums, lower, upper)` — given integers and an inclusive range, return every
  value in `[lower, upper]` that is absent, ascending.

Contract for both: `nums` is unsorted. The single-missing version assumes **distinct**
values and the range `1..nums.length + 1` (so the sequence length is `nums.length + 1`, and
the missing value may be an endpoint). Empty `nums` under that assumption means the range is
`1..1` and the answer is `1`. State the precondition out loud: without "distinct and within
range," the problem has no well-defined answer.

### Examples

```text
findMissing([1, 2, 4, 5])          // => 3   (range 1..5)
findMissing([1, 2, 3])             // => 4   (missing at the top end)
findMissing([2, 3, 4])             // => 1   (missing at the bottom end)
findMissing([1])                   // => 2
findMissing([])                    // => 1
findMissing([5, 3, 1, 2])          // => 4   (unsorted is fine)

findMissingMany([1, 2, 4, 6], 1, 6) // => [3, 5]
findMissingMany([1, 2, 3], 1, 3)    // => []
findMissingMany([], 4, 6)           // => [4, 5, 6]
findMissingMany([7, 7, 8], 6, 9)    // => [6, 9]  (duplicates ignored)
```

### Approach

**Single missing value — XOR.** XOR is associative and commutative, and `x ^ x = 0`, so XOR
everything in `1..n` together with everything in `nums`: every present value cancels, leaving
the missing one. This sidesteps the precision worry of the arithmetic-sum trick
(`n * (n + 1) / 2 - sum`), which loses integer accuracy once `n` exceeds
`Number.MAX_SAFE_INTEGER`.

The catch with XOR in JavaScript: `^` coerces both operands to **int32**, so it is correct
only for values inside `[-2^31, 2^31)`. For larger inputs, use the sum method with `BigInt`,
or state the bound. Say this out loud — it is the kind of platform detail that scores points.

**Many missing values — a `Set`.** Build a set of the present values, then scan
`lower..upper` and collect the gaps. `Set.has` is average `O(1)`, so the scan is linear in
the range size; without the set you would run a linear `includes` inside a loop.

Sorting is the alternative: sort `nums` and walk both sequences. It is `O(n log n)` but avoids
allocating a set proportional to the range — useful when the range is enormous and the gaps
are few (a "missing from the logs" query).

### Implementation

```javascript
function findMissing(nums) {
  if (!Array.isArray(nums)) throw new TypeError("findMissing expects an array");

  const n = nums.length + 1;          // the full sequence is 1..n
  let xor = 0;

  for (let value = 1; value <= n; value += 1) xor ^= value;

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) throw new RangeError("holes are not valid input");
    xor ^= nums[i];                   // present values cancel out
  }

  return xor;                          // only the missing value survives
}

function findMissingMany(nums, lower, upper) {
  if (!Array.isArray(nums)) throw new TypeError("findMissingMany expects an array");

  const present = new Set(nums);
  const missing = [];
  for (let value = lower; value <= upper; value += 1) {
    if (!present.has(value)) missing.push(value);
  }
  return missing;
}
```

The sum alternative, with its limit made explicit:

```javascript
// Exact only while n(n+1)/2 stays a safe integer (n up to about 1.34e8).
function findMissingBySum(nums) {
  const n = nums.length + 1;
  const expected = (n * (n + 1)) / 2;
  const actual = nums.reduce((total, value) => total + value, 0);
  return expected - actual;
}
```

### Walkthrough

`findMissing([1, 2, 4, 5])`:

1. `n = 4 + 1 = 5`, so the full sequence is `1, 2, 3, 4, 5`.
2. XOR of `1..5`: `1 ^ 2 = 3`, `3 ^ 3 = 0`, `0 ^ 4 = 4`, `4 ^ 5 = 1` → `xor = 1`.
3. XOR in `nums`: `1 ^ 1 = 0`; `0 ^ 2 = 2`; `2 ^ 4 = 6`; `6 ^ 5 = 3` → `xor = 3`.
4. Return `3`.

Every value except `3` appeared twice (once from the range, once from `nums`) and cancelled;
`3` appeared once and survived.

For `findMissingMany([1, 2, 4, 6], 1, 6)`: `present = {1, 2, 4, 6}`; scanning `1..6` gives
`1 ✓, 2 ✓, 3 ✗, 4 ✓, 5 ✗, 6 ✓` → `[3, 5]`.

### Complexity

Single value: time `O(n)`, space `O(1)`. Many values: time `O(range + n)`, space `O(n)` for
the set. The sorted alternative is time `O(n log n)`, space `O(n)` for the copy.

### Edge Cases

- A missing endpoint (`1` or `n`) is found; the range is `1..length + 1`, so the top of the
  range is the "extra" value.
- Empty input → `1` under the stated assumption; if the range is unknown, the function is
  undefined and the contract must say so explicitly.
- Duplicates violate the single-missing invariant and produce garbage rather than an
  exception; validate with a set, or document the precondition.
- Holes in `nums` are not allowed; `for...of` would turn a hole into `undefined` and poison
  the XOR, so the index loop throws instead.
- An out-of-range value (say `8` in a `1..5` range) XORs a bit back into the result and
  returns a plausible-looking wrong answer — another reason to state preconditions.
- Above `2^31`, `^` truncates to int32; switch to the sum method with `BigInt`.
- `findMissingMany` with `lower > upper` → `[]`; a huge range makes the scan dominate.

### Interview Follow-ups

- **Two missing values:** XOR everything to get `a ^ b`, pick a set bit, partition both the
  range and the array by that bit, then XOR each partition to recover `a` and `b`.
- **Read-only array of size `n - 1`, no extra space:** the XOR method is already `O(1)`
  space.
- **Find the duplicate instead:** `arraySum - n(n + 1)/2` gives the repeated value; XOR
  does too.
- **Arithmetic progression with step `d`:** use the series formula for `[a, a + d, ...]` or
  fall back to the set scan.
- **Streaming input:** a set buffers everything; XOR cannot detect *multiple* gaps. Choose
  based on whether the number of missing values is known.

### Common Mistakes

- Using `n = nums.length` instead of `nums.length + 1`, getting the top of the range wrong.
- Assuming the input is sorted and binary-searching an invariant that does not exist.
- `includes` inside a loop for the multi-value case, giving `O(n · range)`.
- Believing the sum method is exact for huge `n`; floating point loses integer precision past
  `2^53`.
- Forgetting that `^` is int32 and silently truncating large values.

### Takeaway

The single missing value is the XOR of `1..n` with the array — everything cancels but the gap.
For many gaps, hold the present values in a `Set` and scan the range. Always state the
precondition (`1..n`, distinct, no holes) and the int32 limit of `^`.

## Find a Pair Whose Sum Equals a Target

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `findPair(nums, target)` returning one pair `[a, b]` whose values sum to `target`,
or `null` when no such pair exists. The contract:

- The two elements must be at **distinct indices**; one element cannot be used twice.
- "First" means the pair whose **second** element has the smallest index — the result of a
  single left-to-right scan, returned as `[earlier value, later value]`.
- Duplicate values are allowed: `[3, 3]` with target `6` returns `[3, 3]`.

### Examples

```text
findPair([2, 7, 11, 15], 9)   // => [2, 7]
findPair([3, 2, 4], 6)        // => [2, 4]   (not [3, 3]; one element serves once)
findPair([3, 3], 6)           // => [3, 3]   (two distinct indices)
findPair([1, 2, 3], 100)      // => null
findPair([], 5)               // => null
findPair([-3, 4, 3, 90], 0)   // => [-3, 3]
findPair([5], 10)             // => null
findPair([2, 2, 3], 5)        // => [2, 3]
```

### Approach

One forward pass with a `Map` from value to its earliest index.

- For each value, compute `complement = target - value`. If the complement has been seen, we
  have a pair and can stop; otherwise record the value.
- Because the complement check happens **before** the insert, the current element can never
  pair with itself — that single ordering is what makes `[3]` with target `6` return `null`
  while `[3, 3]` returns `[3, 3]`.
- This finds the pair whose **second** element has the smallest index, a deterministic
  reading of "first." A nested double loop would find the pair with the smallest **first**
  index instead — the same pairs, different tie-break. Say which one you are returning.
- `O(n)` time instead of the `O(n²)` double loop, at the cost of `O(n)` space.

Alternative: if the input may be sorted (or already is), two pointers from both ends is
`O(1)` extra space after an `O(n log n)` sort. The trade is explicit: a hash map when you
want `O(n)` and indices, two pointers when space matters and sorting is acceptable.

`Map.has`/`get` use SameValueZero, so `NaN` matches `NaN` and `-0` matches `0` — useful
behavior that `===` and `indexOf` do not share. Storing only the first occurrence of each
value keeps the reported index correct; later occurrences would change nothing else.

### Implementation

```javascript
function findPair(nums, target) {
  if (!Array.isArray(nums)) throw new TypeError("findPair expects an array");

  const firstIndex = new Map();        // value -> earliest index seen

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) continue;        // holes are not values
    const value = nums[i];
    const complement = target - value;

    if (firstIndex.has(complement)) {
      return [complement, value];      // [earlier, later] in index order
    }
    if (!firstIndex.has(value)) firstIndex.set(value, i);
  }

  return null;                          // no pair sums to target
}
```

The sorted two-pointer version, when `O(1)` extra space matters:

```javascript
function findPairSorted(nums, target) {
  const sorted = nums.slice().sort((a, b) => a - b); // copy: mutate nothing
  let lo = 0;
  let hi = sorted.length - 1;

  while (lo < hi) {
    const sum = sorted[lo] + sorted[hi];
    if (sum === target) return [sorted[lo], sorted[hi]];
    if (sum < target) lo += 1;          // too small: raise the floor
    else hi -= 1;                       // too big: lower the ceiling
  }
  return null;
}
```

### Walkthrough

`findPair([2, 7, 11, 15], 9)`:

1. `i = 0`, `value = 2`, `complement = 7`. The map is empty, so record `2 -> 0`.
2. `i = 1`, `value = 7`, `complement = 2`. `firstIndex.has(2)` is `true` → return `[2, 7]`.

`findPair([3, 2, 4], 6)`:

1. `i = 0`, `value = 3`, `complement = 3`. Not seen → record `3 -> 0`. The element cannot
   pair with itself because the check ran before the insert.
2. `i = 1`, `value = 2`, `complement = 4`. Not seen → record `2 -> 1`.
3. `i = 2`, `value = 4`, `complement = 2`. Seen at index `1` → return `[2, 4]`.

`findPair([3, 3], 6)`: `i = 0` records `3 -> 0`; `i = 1` sees complement `3` → `[3, 3]`, two
distinct indices.

### Complexity

Time: `O(n)` — one pass with average `O(1)` map operations. Space: `O(n)` for the map. The
sorted version is `O(n log n)` time and `O(n)` for the copy (or `O(1)` extra if the caller
allows sorting in place).

### Edge Cases

- Empty or single-element input → `null`; there are no two distinct indices.
- Duplicate values: `[3, 3]` works because the check precedes the insert.
- Negatives and zero need no special handling — only subtraction and equality are used.
- The same element cannot be reused: `[3]` with target `6` → `null`.
- `-0` and `0`: SameValueZero makes a stored `0` match a `-0` complement.
- `NaN` with a `NaN` target: `Map` stores and matches `NaN`, unlike `indexOf` or `===`.
- Holes are skipped, not stored as `undefined`.
- Mixed types are a contract decision: `"1"` and `1` are different keys, yet `target - "1"`
  coerces to a number and can match a stored number.

### Interview Follow-ups

- **Return indices instead of values:** the map already holds them — `[firstIndex.get(complement), i]`.
- **Count all pairs:** accumulate combinations from a frequency map, handling the `a === b`
  case specially; the next problem does unique pairs.
- **Three-sum:** sort, then reduce to two-sum per element — `O(n²)` overall, or `O(n²)` with
  duplicate skipping for unique triplets.
- **Already-sorted input:** two pointers, `O(n)` time and `O(1)` space — which is why sorting
  first is a real option, not just trivia.
- **Memory-constrained huge input:** external sort plus two pointers, because the map will not
  fit.
- **Pair in a row/column-sorted matrix:** start at the top-right corner and move based on the
  comparison, `O(rows + cols)`.

### Common Mistakes

- Reusing one index in a nested loop (`i !== j` forgotten), so `[3]` pairs with itself.
- `includes`/`indexOf` inside a loop, making it `O(n²)` while claiming `O(n)`.
- Testing `firstIndex.has(value)` instead of `has(complement)`, which never finds anything.
- Inserting before checking, which breaks single-element pairs and duplicates.
- Sorting in place without telling the caller, mutating their array as a side effect.

### Takeaway

One pass with `complement = target - value` and a `Map` of seen values gives `O(n)`: check
before you insert, so an element cannot pair with itself and duplicates still work. Sorting
plus two pointers is the `O(1)`-extra-space alternative when `n log n` and mutation are
acceptable.

## Find All Unique Pairs Whose Sum Equals a Target

`Difficulty: Medium` `Probability: High`

### Problem

Implement `findAllPairs(nums, target)` returning **every distinct value pair** `[a, b]` with
`a + b === target`, each pair once, ascending within the pair and across the list. The
contract:

- Pairs are values, not indices: `[1, 1, 2]` with target `3` yields `[1, 2]` once.
- A pair may use two **equal** values only if the input actually holds two copies: `[2, 2]`
  with target `4` → `[[2, 2]]`, but `[2]` with target `4` → `[]`.
- No pair is repeated and no reversed duplicate (`[a, b]` and `[b, a]`) appears.
- The input is not mutated.

### Examples

```text
findAllPairs([1, 1, 2, 3, 4, 5, 5], 6) // => [[1, 5], [2, 4]]
findAllPairs([1, 2, 3, 4, 5], 7)       // => [[2, 5], [3, 4]]
findAllPairs([2, 2], 4)                // => [[2, 2]]
findAllPairs([2], 4)                   // => []
findAllPairs([1, 2, 3], 100)           // => []
findAllPairs([], 0)                    // => []
findAllPairs([-1, 0, 1, 2], 1)         // => [[-1, 2], [0, 1]]
findAllPairs([0, 0, 0], 0)             // => [[0, 0]]
```

### Approach

Sort a copy, walk two pointers inward, and skip duplicate values.

- Sorting puts equal values adjacent, so `[a, b]` can be discovered once and both pointers can
  then jump past every copy of `a` and every copy of `b`. That skip is what makes the output
  unique.
- The two-pointer invariant: if `sorted[lo] + sorted[hi]` is too small, every pair for `lo`
  is too small (`hi` is the largest partner available), so advance `lo`. If it is too big,
  every pair for `hi` is too big, so retreat `hi`. That is why the walk is linear after the
  sort.
- `a === b` needs two distinct elements, and `lo < hi` enforces exactly that: `[2, 2]`
  matches, `[2]` does not.

Two details decide correctness:

1. **Sort with a numeric comparator.** The default `sort` is lexicographic — `[10, 2, 1]`
   becomes `[1, 10, 2]` — and the walk then returns nonsense. This is the most common failure.
2. **Skip duplicates on both sides after recording a pair.** Advancing `lo` without skipping
   re-finds `[a, b]` for every duplicate `a`; the `hi` side has the same problem.

The frequency-map alternative preserves the order of first appearance instead of sorting, at
the cost of a hash map and a canonical-key guard to avoid emitting both `[a, b]` and `[b, a]`.
Both are `O(n log n)` or better; sorting is usually simpler.

### Implementation

```javascript
function findAllPairs(nums, target) {
  if (!Array.isArray(nums)) throw new TypeError("findAllPairs expects an array");

  // Copy values (dropping holes) and sort numerically, not lexicographically.
  const values = [];
  for (let i = 0; i < nums.length; i += 1) {
    if (i in nums) values.push(nums[i]);
  }
  values.sort((a, b) => a - b);

  const pairs = [];
  let lo = 0;
  let hi = values.length - 1;

  while (lo < hi) {
    const sum = values[lo] + values[hi];

    if (sum === target) {
      pairs.push([values[lo], values[hi]]);
      const left = values[lo];
      const right = values[hi];
      while (lo < hi && values[lo] === left) lo += 1;   // skip duplicate a's
      while (lo < hi && values[hi] === right) hi -= 1;  // skip duplicate b's
    } else if (sum < target) {
      lo += 1;                                          // too small: raise the floor
    } else {
      hi -= 1;                                          // too big: lower the ceiling
    }
  }

  return pairs;
}
```

The `Map`-based version, which keeps the order of first appearance:

```javascript
function findAllPairsByFrequency(nums, target) {
  const counts = new Map();
  for (let i = 0; i < nums.length; i += 1) {
    if (i in nums) counts.set(nums[i], (counts.get(nums[i]) ?? 0) + 1);
  }

  const pairs = [];
  const used = new Set();                 // canonical keys already emitted
  for (const [value, count] of counts) {
    const complement = target - value;
    if (!counts.has(complement)) continue;

    if (value === complement) {
      if (count >= 2) pairs.push([value, complement]); // needs two copies
      continue;
    }

    const key = value < complement ? `${value}|${complement}` : `${complement}|${value}`;
    if (!used.has(key)) {
      used.add(key);
      pairs.push(value < complement ? [value, complement] : [complement, value]);
    }
  }
  return pairs;
}
```

### Walkthrough

`findAllPairs([1, 1, 2, 3, 4, 5, 5], 6)`:

1. Sorted copy: `[1, 1, 2, 3, 4, 5, 5]` (indices `0..6`).
2. `lo = 0` (`1`), `hi = 6` (`5`): sum `6 === target` → push `[1, 5]`. Skip `1`s: `lo` moves
   `0 → 1 → 2`, stopping at `2`. Skip `5`s: `hi` moves `6 → 5 → 4`, stopping at `4`.
3. `lo = 2` (`2`), `hi = 4` (`4`): sum `6` → push `[2, 4]`. Skip `2`s: `lo` moves to `3`.
   Skip `4`s: `hi` moves to `3`.
4. `lo = 3`, `hi = 3`, so `lo < hi` is false → done. Result `[[1, 5], [2, 4]]`.

For `[2, 2]` with target `4`: `lo = 0`, `hi = 1`, sum `4` → push `[2, 2]`; the skip loops stop
immediately because `lo < hi` becomes false. For `[2]`, the loop never runs and the result is
`[]`.

### Complexity

Time: `O(n log n)`, dominated by the sort; the walk is `O(n)`. Space: `O(n)` for the sorted
copy and the output. The map version is `O(n)` expected time and `O(n)` space.

### Edge Cases

- Equal-value pairs need two copies (`[2, 2]` yes, `[2]` no), enforced by `lo < hi`.
- Duplicates collapse: `[1, 1, 2]` yields `[1, 2]` once.
- No pairs or empty input → `[]`.
- Negatives and zero work because of the numeric comparator; the default lexicographic sort
  would place `-1` after `10`.
- `NaN` never satisfies `sum === target`, so `NaN` values are ineligible — document it.
- `-0` and `0` compare equal and sum to `0`, so they can form a pair; which one is reported
  depends on the comparator and input order.
- Holes are dropped before sorting. Sorting a sparse array natively moves holes to the end,
  where they compare as `undefined`, corrupting the walk — hence the manual copy.
- The caller's array is untouched because we sort a copy.

### Interview Follow-ups

- **Return all index pairs:** decide whether uniqueness is over values or over index pairs;
  the latter can be much larger and needs a different guard.
- **Count unique pairs without listing them:** the same two-pointer skipping, incrementing a
  counter.
- **Unique triplets (three-sum):** fix each first element, skip duplicates, then two-pointer
  the remainder — the same skipping discipline one level deeper.
- **k-sum:** reduce recursively to two-sum; `O(n^(k-1))`.
- **Preserve original order:** use the frequency-map version or a hash set of canonical pair
  keys rather than sorting.
- **Very large input with many duplicates:** sort-and-skip is often faster in practice than a
  map because it avoids hashing every element.

### Common Mistakes

- Sorting with the default comparator, so `10` sorts before `2` and the walk is wrong.
- Forgetting to skip duplicates, so `[1, 1, 2, 3]` with target `3` emits `[1, 2]` twice.
- Using `lo <= hi`, which emits `[k, k]` for a single `k` (self-pairing).
- Emitting both `[a, b]` and `[b, a]` in the map version by not tracking a canonical key.
- Mutating the caller's array with `sort`, violating the purity contract.
- Sorting a sparse array directly and leaving holes at the end.

### Takeaway

Unique pairs are "sort numerically, converge two pointers, skip every duplicate value on both
sides." The skipping — not the walk — makes the output unique, and the numeric comparator is
what makes the walk correct in the first place.

## Find the Maximum Subarray Sum (Kadane's Algorithm)

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `maxSubarraySum(nums)` returning the largest sum of any **non-empty** contiguous
subarray. The contract:

- The subarray must be non-empty, so an all-negative array returns its largest (least
  negative) element, **not** `0`.
- Empty input has no subarray: return `-Infinity`, the identity for a maximum, and say so out
  loud — some interviewers expect `0` or `null`, so agree on the behavior before coding.
- Negatives, zeros, and single elements are all valid inputs.

### Examples

```text
maxSubarraySum([-2, 1, -3, 4, -1, 2, 1, -5, 4]) // => 6   (subarray [4, -1, 2, 1])
maxSubarraySum([1, 2, 3, 4])                     // => 10
maxSubarraySum([-1, -2, -3])                     // => -1  (largest single element)
maxSubarraySum([5])                              // => 5
maxSubarraySum([0])                              // => 0
maxSubarraySum([-3, 0, -2])                      // => 0
maxSubarraySum([])                               // => -Infinity
```

### Approach

Kadane's algorithm carries two values:

- `current`: the best sum of a subarray that **ends at the current element**. Either extend
  the previous subarray (`current + value`) or start fresh at this element (`value`).
  `Math.max(value, current + value)` is that choice.
- `best`: the largest `current` ever seen — the global answer.

The non-empty requirement lives in that `Math.max(value, ...)`: "start fresh" is always
available, so a negative value never forces `current` below the value itself. Writing
`Math.max(0, current + value)` is the classic bug — it silently permits an **empty** subarray,
so an all-negative array returns `0` instead of the largest element.

The invariant to state in an interview: **`current` is optimal for subarrays ending at `i`,
and `best` is optimal overall.** Because every non-empty subarray ends somewhere, one pass
suffices. A negative prefix never helps: if `current + value < value`, the prefix was negative
and dropping it is strictly better.

Tracking the subarray itself is a small extension: when the `value` branch wins, reset
`start = i`; whenever `current` beats `best`, record `bestStart = start` and `bestEnd = i`.

### Implementation

```javascript
function maxSubarraySum(nums) {
  if (!Array.isArray(nums)) throw new TypeError("maxSubarraySum expects an array");
  if (nums.length === 0) return -Infinity;    // no non-empty subarray exists

  let current = 0;        // best sum of a subarray ending at the previous index
  let best = -Infinity;   // best sum over all subarrays seen so far

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) continue;               // treat holes as absent
    const value = Number(nums[i]);
    current = Math.max(value, current + value); // extend, or restart here
    best = Math.max(best, current);             // non-empty by construction
  }

  return best;
}
```

The version that also returns the winning range, which is what an interviewer usually asks
for next:

```javascript
function maxSubarrayRange(nums) {
  let current = 0;
  let best = -Infinity;
  let start = 0;
  let bestStart = 0;
  let bestEnd = 0;

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) continue;
    const value = Number(nums[i]);

    if (value > current + value) {
      current = value;          // restarting here beats extending
      start = i;
    } else {
      current += value;
    }

    if (current > best) {
      best = current;
      bestStart = start;        // record the range that produced this best
      bestEnd = i;
    }
  }

  return { sum: best, start: bestStart, end: bestEnd }; // nums.slice(start, end + 1)
}
```

### Walkthrough

`maxSubarraySum([-2, 1, -3, 4, -1, 2, 1, -5, 4])`:

```text
i=0 value=-2  current=max(-2, -2)=-2   best=-2
i=1 value= 1  current=max( 1, -1)= 1   best= 1
i=2 value=-3  current=max(-3, -2)=-2   best= 1
i=3 value= 4  current=max( 4,  2)= 4   best= 4
i=4 value=-1  current=max(-1,  3)= 3   best= 4
i=5 value= 2  current=max( 2,  5)= 5   best= 5
i=6 value= 1  current=max( 1,  6)= 6   best= 6   <-- answer
i=7 value=-5  current=max(-5,  1)= 1   best= 6
i=8 value= 4  current=max( 4,  5)= 5   best= 6
```

The best is `6`, from the subarray `[4, -1, 2, 1]` at indices `3..6`. At `i = 3`, extending
the negative prefix would give `2`, so the algorithm restarts at `4`. At `i = 4`, extending is
better (`3 > -1`), so `-1` stays in the subarray — a negative can belong to the best answer if
the surrounding positives outweigh it.

For `[-1, -2, -3]`: `current` becomes `-1`, then `max(-2, -3) = -1`, then `max(-3, -2) = -1`,
and `best` stays `-1` — the largest single element.

### Complexity

Time: `O(n)` — one pass. Space: `O(1)` — two scalars, plus three more for the range version.
The divide-and-conquer alternative is `O(n log n)` time and `O(log n)` stack.

### Edge Cases

- All negatives → the maximum single element, the correct non-empty answer.
- Single element → that element, even when negative.
- Empty input → `-Infinity`; document the choice because "no subarray" has no numeric answer.
- Zeros → `best` may be `0` when a zero beats the surrounding negatives.
- `NaN` poisons the running sum: `Math.max(-Infinity, NaN)` is `NaN`. Validate or document.
- Numeric strings are coerced with `Number`; other mixed types otherwise surprise.
- Holes are skipped, so they do not break a run of values — a deliberate choice.
- Floating point: sums may drift, so comparing against an expected value with `===` is risky.
- Very large arrays: the running sum can pass `Number.MAX_SAFE_INTEGER` and lose precision
  before it loses magnitude.

### Interview Follow-ups

- **Return the subarray, not just the sum:** the range version above; the extra work is
  resetting `start` on restart and recording the bounds when `best` improves.
- **Maximum circular subarray:** the answer is either the ordinary max or
  `total - minSubarray`; handle the all-negative case explicitly, or the "wrap" becomes the
  whole array.
- **Maximum product subarray:** track both the running max and the running min, because
  multiplying by a negative flips which is which.
- **Maximum sum of a fixed window of size `k`:** a sliding window in `O(n)`; Kadane is not
  the right tool when the length is fixed.
- **Maximum-sum submatrix:** fix pairs of rows and run Kadane on the column sums,
  `O(rows² · cols)`.
- **Divide and conquer:** best of left, right, and crossing the midpoint — good practice in
  invariants, though `O(n log n)`.

### Common Mistakes

- `current = Math.max(0, current + value)`, which permits an empty subarray and returns `0`
  for all-negative input.
- Initializing `best = 0`, with the same all-negative bug.
- Resetting `current` to `0` on a negative value instead of to the value itself.
- Forgetting the non-empty requirement entirely and claiming `0` is correct.
- Range tracking that records `bestStart`/`bestEnd` without resetting `start` when the restart
  branch wins, so the reported indices point at the wrong elements.

### Takeaway

Kadane is `current = max(value, current + value); best = max(best, current)`. The
`max(value, ...)` — not `max(0, ...)` — is what makes the subarray non-empty, and that single
character difference is the difference between the correct all-negative answer and the classic
`0` bug.

## Merge Two Sorted Arrays

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `mergeSorted(a, b)` returning a new array with every element of both inputs in
ascending order. The contract:

- Both inputs are already sorted ascending.
- The merge is **stable**: when elements compare equal, the one from `a` comes first.
- Returns a new array; neither input is mutated.
- Linear time `O(m + n)`. Concatenating and calling `.sort()` is `O((m+n) log(m+n))` and throws
  away the fact that both halves are already ordered.

### Examples

```text
mergeSorted([1, 3, 5, 7], [2, 4, 6]) // => [1, 2, 3, 4, 5, 6, 7]
mergeSorted([1, 2], [3, 4])          // => [1, 2, 3, 4]
mergeSorted([3, 4], [1, 2])          // => [1, 2, 3, 4]
mergeSorted([], [1, 2])              // => [1, 2]
mergeSorted([1, 2], [])              // => [1, 2]
mergeSorted([], [])                  // => []
mergeSorted([1, 2, 2], [2, 3])       // => [1, 2, 2, 2, 3]
```

### Approach

Two read pointers and one write pointer — the merge step from merge sort.

- `i` walks `a`, `j` walks `b`, and `k` writes into `merged`, preallocated to `m + n`.
- Take `a[i]` when `a[i] <= b[j]`, otherwise `b[j]`. The `<=` (not `<`) is what makes the merge
  **stable**: on a tie, `a`'s element is written first, preserving the relative order of equal
  values. With `<` and non-numeric records, ties would be reordered.
- After the main loop one side still has elements. Only one cleanup loop runs, and it needs no
  comparisons — the remainder is already sorted and is at least as large as everything
  written.
- Preallocating `new Array(m + n)` and writing by index is faster than `push` in hot code and
  guarantees the final length; the fill is complete because the cleanup loops cover the
  leftovers.

Do not `shift()` the inputs inside the loop: `shift` is `O(n)`, which makes the merge
quadratic. Index pointers keep it linear.

This function is exactly merge sort's merge. Getting the stability (`<=`) and the cleanup
loops right here is the prerequisite for the sort problem later in this chapter.

### Implementation

```javascript
function mergeSorted(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError("mergeSorted expects two arrays");
  }

  const merged = new Array(a.length + b.length);
  let i = 0; // read pointer into a
  let j = 0; // read pointer into b
  let k = 0; // write pointer into merged

  while (i < a.length && j < b.length) {
    // `<=` keeps the merge stable: on ties, a's element is written first.
    merged[k++] = a[i] <= b[j] ? a[i++] : b[j++];
  }

  // Exactly one of these runs; the leftover side needs no comparisons.
  while (i < a.length) merged[k++] = a[i++];
  while (j < b.length) merged[k++] = b[j++];

  return merged;
}
```

The classic in-place variant: `a` holds `m` real elements followed by `n` spare slots, and `b`
holds `n` elements. Write from the back so unread data is never overwritten:

```javascript
function mergeInto(a, m, b, n) {
  let i = m - 1;      // last real element of a
  let j = n - 1;      // last element of b
  let k = m + n - 1;  // last slot of a

  while (j >= 0) {
    // Compare only while a has unread elements; otherwise take from b.
    a[k--] = i >= 0 && a[i] > b[j] ? a[i--] : b[j--];
  }
  return a;
}
```

### Walkthrough

`mergeSorted([1, 3, 5, 7], [2, 4, 6])`:

```text
i=0 j=0  a[i]=1 <= b[j]=2  -> merged[0]=1  i=1
i=1 j=0  a[i]=3 <= b[j]=2  -> no;  merged[1]=2  j=1
i=1 j=1  a[i]=3 <= b[j]=4  -> merged[2]=3  i=2
i=2 j=1  a[i]=5 <= b[j]=4  -> no;  merged[3]=4  j=2
i=2 j=2  a[i]=5 <= b[j]=6  -> merged[4]=5  i=3
i=3 j=2  a[i]=7 <= b[j]=6  -> no;  merged[5]=6  j=3   (j exhausted)
cleanup: merged[6]=7  i=4
```

Result `[1, 2, 3, 4, 5, 6, 7]`. The `j` cleanup loop never runs because `j` reached `b.length`
first.

In-place variant with `a = [1, 3, 5, 0, 0, 0]`, `m = 3`, `b = [2, 4, 6]`, `n = 3`: start
`k = 5`, `i = 2`, `j = 2`. `5 > 6`? No → `a[5] = 6`, `j = 1`. `5 > 4`? Yes → `a[4] = 5`,
`i = 1`. `3 > 4`? No → `a[3] = 4`, `j = 0`. `3 > 2`? Yes → `a[2] = 3`, `i = 0`. `1 > 2`? No →
`a[1] = 2`, `j = -1`. The loop ends → `[1, 2, 3, 4, 5, 6]`.

### Complexity

Time: `O(m + n)` — each element is written once and compared at most once. Space: `O(m + n)`
for the result; the in-place variant is `O(1)` extra space. Concatenate-then-sort is
`O((m+n) log(m+n))` and allocates a third array.

### Edge Cases

- One or both inputs empty → the result is a copy of the other.
- Cross-array duplicates are all kept; stability decides the order of equals.
- Stability matters when the arrays hold records sorted by one key and ties must keep source
  order — a common real-world merge of event logs.
- `NaN`: every comparison with `NaN` is false, so it is taken from `b` when sitting in `a`'s
  slot, and its final position is arbitrary. Document it.
- Strings: `<=` is lexicographic for strings (fine if both sides are strings); mixing numbers
  and strings triggers coercion surprises.
- Holes: indexing reads a hole as `undefined`, so the result contains `undefined`; filter or
  document. Native `sort` would move holes to the end instead.
- Frozen inputs are safe? yes for `mergeSorted`, which never mutates; the in-place variant
  mutates `a` by design.
- Huge arrays: two inputs plus the output triple peak memory, which is what the in-place
  variant exists to avoid.

### Interview Follow-ups

- **Merge in place** where `a` has trailing capacity (above) — writing backwards is the whole
  insight, and the interviewer is checking that you see it.
- **Merge `k` sorted arrays:** a min-heap of heads is `O(N log k)`; pairwise divide-and-conquer
  merging is the same complexity with a smaller constant.
- **Merge two sorted linked lists:** the same two-pointer walk, reusing nodes rather than
  allocating, with a dummy head to remove the empty-list special case.
- **One array much larger than the other:** galloping/binary insertion cuts the work from
  `O(m + n)` to `O(m log n)` when `m ≪ n`.
- **Custom comparator:** accept `(x, y) => number` and replace `<=` with `compare(x, y) <= 0`,
  keeping the tie rule for stability.
- **Why not `.concat().sort()`?** Correct output, but `O((m+n) log(m+n))`, an extra allocation,
  and it needs a numeric comparator or it sorts lexicographically.

### Common Mistakes

- Forgetting a cleanup loop, so the tail of the longer array is dropped.
- `a[i] < b[j]` instead of `<=`, breaking stability on ties.
- `shift()` on the inputs, making the merge `O(n²)` and mutating the caller's arrays.
- Writing `merged[k] = ...` without incrementing `k`, or preallocating the wrong length.
- In the in-place variant, writing from the front and overwriting unread elements of `a`.
- Assuming the inputs are sorted without checking; an unsorted input silently produces a wrong
  order.

### Takeaway

The merge is two read pointers plus one write pointer, taking from `a` on `<=` ties to stay
stable and draining the leftover tail with no comparisons. It is linear, and it is exactly the
merge inside merge sort — get the stability and the cleanup loops right and both problems fall
out.

## Sort an Array Without Using `.sort()`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `sortArray(array, compare?)` returning a new array sorted ascending, **without**
calling `Array.prototype.sort`. The contract:

- Returns a new array; the input is not mutated.
- The optional comparator `(a, b) => number` matches the sort spec: negative puts `a` first,
  positive puts `b` first, and `0` or `NaN` means "equal."
- The sort is **stable** — elements comparing equal keep their original relative order (native
  `sort` has been stable since ES2019).

Which algorithm? Merge sort is the safe answer: `O(n log n)` **guaranteed**, stable by
construction, and easy to prove. Quicksort is faster in practice but needs a random or
median-of-three pivot to avoid `O(n²)` on sorted input, and its classic in-place partition is
not stable. State the choice; the reasoning is part of the answer.

### Examples

```text
sortArray([5, 2, 9, 1, 5, 6])         // => [1, 2, 5, 5, 6, 9]
sortArray([3, 1, 2])                  // => [1, 2, 3]
sortArray([])                         // => []
sortArray([7])                        // => [7]
sortArray([2, 1, 1, 2])               // => [1, 1, 2, 2]
sortArray([3, 1, 2], (a, b) => b - a) // => [3, 2, 1]  (comparator honoured)
sortArray([10, 2, 1])                 // => [1, 2, 10] (numeric, not lexicographic)
```

### Approach

Merge sort in three parts:

1. **Base case:** an array of length `0` or `1` is already sorted; return it to stop the
   recursion.
2. **Divide:** split at `mid = length >> 1` and recursively sort both halves. The halves are
   disjoint, so each is independently sorted.
3. **Merge:** the `mergeSorted` walk from the previous problem. Using `compare(...) <= 0` keeps
   ties in left-before-right order, which is exactly stability.

Why merge sort over quicksort here:

- **Guaranteed** `O(n log n)`; quicksort degrades to `O(n²)` on already-sorted input unless
  the pivot is randomized.
- **Stable** with no extra bookkeeping; a classic in-place quicksort partition is not, and
  making it stable means tagging each element with its original index.
- The merge is the function you just wrote, so the code stays short and the invariant is easy
  to state.

Comparator handling must mirror the spec: coerce with `Number` and treat `NaN` as `0` (a
comparator returning `NaN` means "equal"). Skipping that turns a broken comparator into
arbitrary output instead of deterministic output.

Numbers gotcha: the **default** `Array.prototype.sort` compares strings, so `[10, 2, 1]` sorts
to `[1, 10, 2]`. Our default comparator is numeric (`a < b ? -1 : a > b ? 1 : 0`), which is
what an interviewer usually wants; say so explicitly so it is not read as a bug.

### Implementation

```javascript
const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // numeric, NaN -> 0

function sortArray(array, compare = defaultCompare) {
  if (!Array.isArray(array)) throw new TypeError("sortArray expects an array");
  if (typeof compare !== "function") throw new TypeError("compare must be a function");

  // Normalize the comparator once: Number(...), and NaN -> 0 per the sort spec.
  const order = (a, b) => {
    const result = Number(compare(a, b));
    return Number.isNaN(result) ? 0 : result < 0 ? -1 : result > 0 ? 1 : 0;
  };

  const merge = (left, right) => {
    const merged = new Array(left.length + right.length);
    let i = 0;
    let j = 0;
    let k = 0;

    while (i < left.length && j < right.length) {
      // `<= 0` keeps the sort stable: equal elements stay in original order.
      merged[k++] = order(left[i], right[j]) <= 0 ? left[i++] : right[j++];
    }
    while (i < left.length) merged[k++] = left[i++];
    while (j < right.length) merged[k++] = right[j++];
    return merged;
  };

  const divide = (items) => {
    if (items.length <= 1) return items;       // base case: already sorted
    const mid = items.length >> 1;             // integer half
    return merge(divide(items.slice(0, mid)), divide(items.slice(mid)));
  };

  return divide(array.slice());                // copy: the caller's array is untouched
}
```

Quicksort for contrast — average `O(n log n)`, worst `O(n²)`, **not stable**, but `O(log n)`
stack and fast in practice:

```javascript
function quickSort(array, compare = defaultCompare) {
  const items = array.slice();

  const partition = (lo, hi) => {
    // Random pivot so sorted or reverse-sorted input cannot trigger the quadratic case.
    const pivotIndex = lo + Math.floor(Math.random() * (hi - lo + 1));
    [items[pivotIndex], items[hi]] = [items[hi], items[pivotIndex]];
    const pivot = items[hi];

    let store = lo;
    for (let i = lo; i < hi; i += 1) {
      if (compare(items[i], pivot) < 0) {
        [items[store], items[i]] = [items[i], items[store]];
        store += 1;
      }
    }
    [items[store], items[hi]] = [items[hi], items[store]];
    return store;
  };

  const sort = (lo, hi) => {
    if (lo >= hi) return;                      // base case: 0 or 1 element
    const pivot = partition(lo, hi);
    sort(lo, pivot - 1);
    sort(pivot + 1, hi);
  };

  sort(0, items.length - 1);
  return items;
}
```

### Walkthrough

`sortArray([5, 2, 9, 1])` (`mid = 4 >> 1 = 2` at the top):

1. `divide([5, 2, 9, 1])`: `mid = 2` → `divide([5, 2])` and `divide([9, 1])`.
2. `divide([5, 2])`: `mid = 1` → `divide([5])` = `[5]`, `divide([2])` = `[2]`; merge:
   `order(5, 2) = 1 > 0`, so take `2`, then `5` → `[2, 5]`.
3. `divide([9, 1])`: merge `[9]` and `[1]`: `order(9, 1) = 1 > 0`, take `1`, then `9` →
   `[1, 9]`.
4. `merge([2, 5], [1, 9])`: `order(2, 1) = 1 > 0` → take `1`; `order(2, 9) = -1 <= 0` → take
   `2`; `order(5, 9) = -1 <= 0` → take `5`; `left` is exhausted → copy `9`. Result
   `[1, 2, 5, 9]`.

Stability check with `[{ k: 1, n: "a" }, { k: 1, n: "b" }]` and `compare = (x, y) => x.k - y.k`:
`order` returns `0`, the `<= 0` branch takes the left element first, so `"a"` stays before
`"b"` — the property a naive quicksort loses.

### Complexity

Merge sort: time `O(n log n)` in **all** cases; space `O(n)` for the merged arrays plus
`O(log n)` recursion depth. Quicksort: `O(n log n)` expected, `O(n²)` worst, `O(log n)` stack,
but not stable. Insertion sort is `O(n²)` yet the fastest for tiny `n`, which is why real
implementations switch strategies below a threshold.

### Edge Cases

- Empty and single-element arrays hit the base case immediately; no merge runs.
- All-equal elements: every comparison is `0`, the stable `<= 0` branch preserves order, and
  the sort is still `O(n log n)`.
- Already sorted: merge sort does not degrade, unlike a fixed-pivot quicksort.
- Reverse sorted: same complexity, just different merge choices.
- `NaN` with the default comparator → `order` returns `0`, so `NaN` compares "equal" to
  everything and is not part of a total order. Document it; `Array.prototype.sort` behaves the
  same way.
- Holes: `array.slice()` keeps holes, and recursion turns them into `undefined` values at
  merge time. Native `sort` moves holes to the end; match that if it matters.
- A throwing comparator propagates mid-recursion, but the caller's array is untouched because
  we sort a copy.
- Large arrays: many small allocations; production merge sort reuses one scratch buffer.
- `-0` vs `0`: the default comparator treats them as equal, so stability keeps input order —
  unlike `Object.is`, which distinguishes them.

### Interview Follow-ups

- **Quicksort with a random pivot** (above), and why randomization defeats the adversarial
  sorted-input case.
- **Three-way partition (Dutch national flag):** handles many duplicates in `O(n)` per
  partition, avoiding quicksort's duplicate pathology.
- **Insertion sort below a threshold** (`n <= 16`): the hybrid strategy behind Timsort, which is
  what V8 actually uses.
- **Heap sort:** `O(1)` extra space and `O(n log n)` guaranteed, but not stable and less
  cache-friendly.
- **Non-comparison sorts:** counting sort and radix sort are `O(n + k)` for bounded integers —
  faster than `O(n log n)` when the key range is small.
- **Stable quicksort:** tag elements with their original index and break comparator ties by
  index.

### Common Mistakes

- No base case (`length <= 1`), causing infinite recursion and a stack overflow.
- `mid = items.length / 2` (fractional), so `slice` splits oddly; use `>> 1` or `Math.floor`.
- Spreading `[...left, ...right]` inside the merge instead of a preallocated write, or
  re-sorting the halves instead of merging them.
- Using `< 0` in the merge tie-break, silently losing stability.
- Forgetting `array.slice()`, so the caller's array is mutated or partially sorted.
- Assuming `Array.prototype.sort`'s default is numeric; it is lexicographic, which is why
  `[10, 2, 1]` needs a comparator.
- Claiming quicksort is `O(n log n)` worst case without the pivot caveat.

### Takeaway

Merge sort is the interview-safe answer: split at the midpoint, sort both halves, merge with
`compare(...) <= 0` so equals keep their order — guaranteed `O(n log n)` and stable. Keep `<=`
versus `<` straight, handle the base case, and copy before you touch anything.

## Shuffle an Array (Why the Naive Version Is Biased)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `naiveShuffle(array)` using the famous one-liner — `[...array].sort(() =>
Math.random() - 0.5)` — and then explain precisely **why it is biased** and what to use
instead. This problem is half coding, half analysis: interviewers ask it to see whether
you understand the contract a comparison sort requires, not whether you can recite
Fisher–Yates (which is the next problem on this page).

### Examples

```text
naiveShuffle([1, 2, 3]) // => e.g. [2, 1, 3] (a permutation, but not a uniform one)
```

Over many runs with three elements, some of the six permutations appear far more often
than others. With V8's TimSort, `[1, 2, 3]` yields `[1, 3, 2]`-style outcomes with
measurably uneven frequencies — the exact skew depends on the engine's sort, which is
itself part of the lesson.

### Approach

A comparison sort is only correct if the comparator defines a **consistent ordering**:
it must be antisymmetric (`cmp(a,b)` and `cmp(b,a)` must disagree in sign) and
transitive. A random comparator violates both on every call — the sort asks "is `a`
before `b`?", gets "yes", asks again later, and gets "no". The algorithm then takes a
path through its decision tree that was never designed to be taken, and different
engines (merge sort, quicksort, TimSort, different array sizes) take *different* broken
paths, so the bias is engine-dependent and unfixable from the outside.

The empirical test is a chi-squared or even a plain frequency table: shuffle `[1, 2, 3]`
60,000 times, count the six permutations, and watch them diverge from 10,000 each.
The correct replacement is Fisher–Yates: each position `i` swaps with a uniformly random
position in `0..i`, giving every permutation probability exactly `1/n!`.

### Implementation

```javascript
function naiveShuffle(array) {
  if (!Array.isArray(array)) throw new TypeError("naiveShuffle expects an array");
  // Deliberately biased — kept here so the skew can be measured, not shipped.
  return [...array].sort(() => Math.random() - 0.5);
}

function shuffleFrequencies(array, runs = 60000) {
  const counts = new Map();
  for (let i = 0; i < runs; i += 1) {
    const key = naiveShuffle(array).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
```

### Walkthrough

For `shuffleFrequencies([1, 2, 3])`: each run produces one of the six permutations and
tallies it. A uniform shuffle would show each near `runs / 6` (≈10,000). The naive
version instead shows a spread — some permutations several thousand above expectation,
some below — and the pattern changes between engines and array lengths, because the
bias lives in the interaction between the random answers and the sort's internals,
not in any single coin flip.

### Complexity

Time: whatever the host sort costs (`O(n log n)` comparisons) plus `O(n)` randomness —
but the output distribution is wrong, so the complexity is moot. Space: `O(n)` for the
copy. The frequency harness is `O(runs · n log n)` time and `O(n!)` space for the table.

### Edge Cases

- Empty and single-element arrays shuffle to themselves under any implementation.
- The bias is invisible on tiny samples — you need thousands of runs to see it, which is
  exactly why it ships to production unnoticed.
- `Math.random()` itself is not cryptographically strong; for gambling or security,
  `crypto.getRandomValues()` is the randomness source, Fisher–Yates is still the algorithm.
- A *consistent* random key per element (`map` to `{key: Math.random(), value}`,
  `sort` by key, `map` back) is uniform — but it is `O(n log n)` where Fisher–Yates is
  `O(n)`, and equal keys need a tiebreak.

### Interview Follow-ups

- **Prove the bias:** run the frequency harness and explain which sort invariant breaks.
- **Implement Fisher–Yates:** the next problem — uniform, in place, `O(n)`.
- **Shuffle a stream (reservoir sampling):** keep `k` items, replace item `j` with
  probability `k/i` for the `i`th arrival.

### Common Mistakes

- Shipping the one-liner because "it looks random" — randomness of the comparator is
  not uniformity of the permutation.
- "Fixing" it with `sort(() => 0.5 - Math.random())` — same violation, same bias.
- Testing with ten runs and concluding it works.
- Confusing a bad *source* of randomness with a bad *algorithm* — here the algorithm is
  the problem even with perfect coin flips.

### Takeaway

`sort` with a random comparator breaks the consistency contract every comparison sort
depends on, so the result is biased in an engine-dependent way. Measure with a frequency
table, then replace it with Fisher–Yates.
