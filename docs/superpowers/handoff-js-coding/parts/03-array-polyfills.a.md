## Implement `Array.prototype.map`

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `Array.prototype.myMap(callback, thisArg)` matching `Array.prototype.map`.

The contract has five parts, and most implementations get at least one wrong:

1. **Receiver coercion.** The receiver becomes an object with `Object(this)`, so any array-like works when the method is borrowed: `Array.prototype.myMap.call({ 0: "a", 1: "b", length: 2 }, fn)`. A `null`/`undefined` receiver throws `TypeError`.
2. **Length snapshot.** `length` is read once (via `ToLength`) before the loop. Appending to the array inside the callback does not extend traversal.
3. **Callback arguments.** `callback.call(thisArg, value, index, object)` — three arguments, in that order, with `thisArg` passed through untouched (`undefined` when omitted).
4. **Holes.** `map` checks `index in object` before each call. A hole is skipped and left as a hole in the result; do not confuse a hole with an explicit `undefined`.
5. **Return value.** A brand-new array of the *same* length. The receiver is never mutated. A non-callable callback throws `TypeError` before iteration.

### Examples

```text
[1, 2, 3].myMap((x) => x * 2)                    // => [2, 4, 6]
[1, 2, 3].myMap((x, i) => x * 10 + i)            // => [10, 21, 32]
[1, 2].myMap(function (x) { return x * this.f; }, { f: 3 }) // => [3, 6]

Array.prototype.myMap.call({ 0: "a", 1: "b", length: 2 }, (s) => s.toUpperCase())
// => ["A", "B"]

const sparse = [10, , 30];
sparse.myMap((x) => x + 1)                       // => [11, <hole>, 31]  (length still 3)
sparse.myMap((x) => x + 1).length                // => 3

[1, 2].myMap((x) => x) === [1, 2].myMap((x) => x) // => false (fresh array each call)
```

### Approach

Every array iterator on this page shares one skeleton; only the "policy" — what happens to the callback's result — differs. For `map` the policy is: *write the callback's return value at the same index.*

The skeleton:

1. Throw if `callback` is not callable, before touching the receiver.
2. `const object = toObject(this)` and `const length = toLength(object.length)`, snapshotted once.
3. `for (let index = 0; index < length; index += 1)`.
4. `if (index in object)` — the hole guard. `in` is `HasProperty`, which walks the prototype chain, exactly like the spec.
5. Call with `callback.call(thisArg, object[index], index, object)`.

Why `index in object` and not `object[index] !== undefined`? Because `[undefined]` has a present index whose value is `undefined`, and native `map` calls the callback for it. `1 in [ , ]` is `false`; `1 in [undefined]` is `true`. That is the distinction the guard exists to make.

Why `toObject`? Native array methods are *generic*: they need only `length` and indexed access, so `{ 0: "a", length: 1 }` is a valid receiver when borrowed. `Object(this)` also boxes primitives, which is why `Array.prototype.myMap.call("ab", fn)` works — a `String` object has indexed properties.

The result is allocated as `new Array(length)`, not `[]` plus `push`. That preserves length and leaves skipped indices as real holes rather than `undefined`; `push` would compact holes and break the same-length guarantee.

### Implementation

The two helpers below are reused by every polyfill on this page.

```javascript
// RequireObjectCoercible + generic receiver. Object(value) boxes primitives.
function toObject(value) {
  if (value === null || value === undefined) {
    throw new TypeError("Array.prototype method called on null or undefined");
  }
  return Object(value);
}

// ToLength: NaN/negative -> 0, fractions truncate, clamp to 2^53 - 1.
function toLength(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return 0;
  return Math.min(Math.trunc(n), Number.MAX_SAFE_INTEGER);
}

if (!Array.prototype.myMap) {
  Array.prototype.myMap = function myMap(callback, thisArg) {
    if (typeof callback !== "function") {
      throw new TypeError(`${callback} is not a function`);
    }

    const object = toObject(this);          // generic receiver: array or array-like
    const length = toLength(object.length); // snapshot once; callbacks cannot extend it

    const result = new Array(length);       // same length, holes preserved
    for (let index = 0; index < length; index += 1) {
      if (index in object) {                // HasProperty: skip holes
        result[index] = callback.call(thisArg, object[index], index, object);
      }
    }
    return result;                          // a fresh array; the receiver is untouched
  };
}
```

### Walkthrough

Take `const sparse = [10, , 30]` and `sparse.myMap((x) => x + 1)`:

1. `toObject(sparse)` is `sparse`; `toLength(3)` is `3`.
2. `index = 0`: `0 in sparse` is `true` → `callback(10, 0, sparse)` → `result[0] = 11`.
3. `index = 1`: `1 in sparse` is `false` → **skip**. `result[1]` stays an empty slot.
4. `index = 2`: `2 in sparse` is `true` → `result[2] = 31`.
5. Return `result`, which is `[11, <hole>, 31]` with `length === 3`.

Now the snapshot behavior. With `const a = [1, 2, 3]` and a callback that does `a.push(4)`:

```text
const calls = [];
[1, 2, 3].myMap((x, i) => { calls.push(i); return x; }); // length snapshot is 3
calls // => [0, 1, 2]
```

Even though the array grows, the loop bound was fixed at `3` before the first call.

### Complexity

Time: `O(n)` over the snapshotted length (`n = length`; `map` never short-circuits). Space: `O(n)` for the new array; the loop itself is `O(1)`. The callback's own cost is not counted.

### Edge Cases

- **Sparse arrays:** holes are skipped and stay holes: `[10, , 30].myMap(f)` keeps `length === 3` and `1 in result === false`.
- **Explicit `undefined`:** `[undefined].myMap(f)` *does* call `f`, because the index is present.
- **`length` mutation:** snapshotted, so `push` inside the callback does not extend the loop.
- **Array-likes:** `myMap.call({ 0: "a", length: 1 }, f)` returns a real `Array`; missing indices behave as holes.
- **Primitive receivers:** `myMap.call("ab", f)` boxes the string and maps its two code units.
- **Non-callable callback:** throws `TypeError` before any callback call.
- **Callback throws:** the exception propagates and the partial result is discarded; the receiver is unchanged.
- **Huge `length`:** `toLength` clamps at `2^53 - 1`, and `new Array(length)` may throw `RangeError` above `2^32 - 1`, same as native.
- **`null`/`undefined` receiver:** `myMap.call(null, f)` throws `TypeError`.

### Interview Follow-ups

- **Implement `filter` and `forEach` on the same skeleton.** Only step 5 changes: `filter` keeps truthy values (compacted), `forEach` discards the result.
- **Why `index in object` rather than comparing to `undefined`?** A present `undefined` and an absent hole are different states; `HasProperty` is the spec's test.
- **What does native `map` return for a subclass?** `ArraySpeciesCreate` makes `[].map` on a subclass return an instance of that subclass (via `Symbol.species`); a fully faithful polyfill mirrors that.
- **Why snapshot `length` but test `index in object` live?** The boundary is fixed at entry; membership is re-checked each iteration because earlier callbacks may `delete` or add indices.

### Common Mistakes

- Using `for...of` or `.forEach` inside the polyfill — both hide the hole and `this` contracts.
- Re-reading `object.length` each iteration, so a callback that pushes extends the loop.
- Dropping the `index in object` guard, turning holes into `undefined` values.
- Building the result with `push`, which compacts holes and breaks the length guarantee.
- Checking `typeof callback !== "function"` after iteration has begun.
- Forgetting `return`, or returning the receiver instead of the new array.

### Takeaway

Every array iterator is "snapshot length, visit present indices, call with `(value, index, array)`, honour `thisArg`." `map`'s personality is just that it writes the callback's return value at the same index of a same-length new array.

## Implement `Array.prototype.filter`

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `Array.prototype.myFilter(callback, thisArg)` matching `Array.prototype.filter`.

Same skeleton as `map`, different policy: keep the element when the callback's result is truthy (`ToBoolean`), in original order.

- Receiver coerced with `toObject`; array-likes work.
- `length` snapshotted once via `toLength`.
- `callback.call(thisArg, value, index, object)`.
- **Holes are skipped**, so a hole can never be kept — not even by an always-true predicate.
- Returns a **new, compacted** array: no holes, and `result.length` equals the number of elements that passed.
- Non-callable callback → `TypeError` first.

### Examples

```text
[1, 2, 3, 4].myFilter((x) => x % 2 === 0)     // => [2, 4]
[1, 2, 3].myFilter((x, i) => i > 0)           // => [2, 3]
["a", "b", "c"].myFilter(function (s) { return this.keep.has(s); }, { keep: new Set(["b", "c"]) })
// => ["b", "c"]

const sparse = [1, , 3];
sparse.myFilter((x) => x > 0)                 // => [1, 3]   (hole dropped, compacted)
[, ,].myFilter(() => true)                    // => []       (callback never runs)
[0, "", null, NaN, "x"].myFilter(Boolean)     // => ["x"]    (truthiness, not identity)
```

### Approach

Identical loop to `map`; only the write step differs. Where `map` did `result[index] = ...`, `filter` does `if (callback(...)) result.push(value)`. Because `push` appends, the output is compact and the holes it skipped vanish. The `if` performs `ToBoolean`: the callback may return a non-boolean, and only truthiness matters.

The contract detail that matters is that holes are **not** visited. A naive `object[index] !== undefined` guard would call the predicate with `undefined` for every hole and then — if the predicate returned truthy — push `undefined`, which native `filter` never does. `[, ,].filter(() => true)` is `[]`, not `[undefined, undefined]`.

### Implementation

```javascript
// Uses the shared toObject / toLength helpers defined with `map`.
if (!Array.prototype.myFilter) {
  Array.prototype.myFilter = function myFilter(callback, thisArg) {
    if (typeof callback !== "function") {
      throw new TypeError(`${callback} is not a function`);
    }

    const object = toObject(this);
    const length = toLength(object.length);

    const result = [];                       // compacted output, no holes
    for (let index = 0; index < length; index += 1) {
      if (index in object) {                 // holes are skipped entirely
        const value = object[index];
        if (callback.call(thisArg, value, index, object)) { // ToBoolean
          result.push(value);                // sequential append keeps order
        }
      }
    }
    return result;
  };
}
```

### Walkthrough

`[1, 2, 3, 4].myFilter((x) => x % 2 === 0)`: `length = 4`.

- index 0: present, `1 % 2 === 0` is `false` → not pushed.
- index 1: present, `2 % 2 === 0` is `true` → `result = [2]`.
- index 2: `false`; index 3: `true` → `result = [2, 4]`. Return `[2, 4]`, length 2.

Now sparse: `const sparse = [1, , 3]` with `(x) => x > 0`:

- index 0: present → `1 > 0` true → `[1]`.
- index 1: `1 in sparse` is `false` → callback never runs; nothing pushed.
- index 2: present → `[1, 3]`.

Result `[1, 3]`; the hole is gone and the length shrank from 3 to 2.

### Complexity

Time: `O(n)` over the snapshotted length. Space: `O(k)` where `k` is the number of kept elements (worst case `O(n)`).

### Edge Cases

- **Holes:** skipped, so they never appear in the output and the predicate is not called for them.
- **Truthiness:** `0`, `""`, `null`, `NaN`, `false` are dropped; any truthy value is kept.
- **`thisArg`:** forwarded via `.call`; arrow callbacks ignore it.
- **Explicit `undefined`:** `[undefined].myFilter(() => true)` → `[undefined]` (present index, unlike a hole).
- **Empty / all-false:** → `[]`, but the callback still runs for every present index.
- **Mutation during iteration:** the length snapshot bounds the loop; a deleted index is skipped when reached.
- **Non-callable callback:** `TypeError` before iteration.

### Interview Follow-ups

- **Implement `compact` as `filter(Boolean)`:** one line, but note it removes legitimate falsy values too.
- **How would `filter` differ with `reduce`?** The result is the same, but `reduce` still needs the hole guard to avoid visiting holes.
- **`Symbol.species`:** native builds the result via `ArraySpeciesCreate(O, 0)`, so `[].filter` on a subclass returns a subclass instance.
- **Ordering:** `filter` is stable; relative order of survivors is preserved.

### Common Mistakes

- Using `object[index] !== undefined` instead of `index in object`, so holes become `undefined` entries.
- Building with `result[index] = value`, which leaves holes and a wrong length.
- Re-reading `length` each pass.
- Assuming the callback returns a boolean — it may return anything, and only truthiness matters.
- Forgetting to skip holes, then being surprised the output contains `undefined`.

### Takeaway

`filter` is `map` plus a boolean gate and a compacted output. Skip holes, keep truthy results in order, and return a new array whose length is the count of survivors.

## Implement `Array.prototype.forEach`

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `Array.prototype.myForEach(callback, thisArg)` matching `Array.prototype.forEach`.

- Same skeleton: `toObject`, snapshotted `toLength`, `index in object` guard.
- Calls `callback.call(thisArg, value, index, object)` for every **present** index.
- **Always returns `undefined`**, regardless of what the callback returns.
- **No early termination:** there is no way to `break`; the callback runs for all present indices unless it throws.
- Holes are skipped.
- Non-callable callback → `TypeError` before iteration.

### Examples

```text
const log = [];
[1, 2, 3].myForEach((x) => log.push(x * 2));
log                                    // => [2, 4, 6]

[1, 2].myForEach((x) => x * 100)       // => undefined (return value ignored)

const ctx = { sum: 0 };
[1, 2, 3].myForEach(function (x) { this.sum += x; }, ctx);
ctx.sum                                // => 6

const sparse = [1, , 3];
const seen = [];
sparse.myForEach((x) => seen.push(x));
seen                                   // => [1, 3]  (hole skipped)
```

### Approach

`forEach` is `map` minus the result, and that omission is the whole method: it exists purely for side effects. Two consequences are worth stating plainly.

1. **Return value is discarded.** `[1, 2].forEach((x) => x * 100)` is `undefined`; the callback's return is not collected anywhere. This trips people coming from `map`.
2. **There is no early exit.** The spec has no break path; running to the end is the only exit. To stop early, use `for...of` with `break`, or `some`/`find`.

The hole guard still matters: side effects must not run for indices that do not exist. `[1, , 3].forEach(f)` calls `f` twice, not three times.

`forEach` also does not await async callbacks: an `async` callback returns a promise that is ignored, so the loop finishes before the work does. Sequential async work needs `for await...of`.

### Implementation

```javascript
// Uses the shared toObject / toLength helpers defined with `map`.
if (!Array.prototype.myForEach) {
  Array.prototype.myForEach = function myForEach(callback, thisArg) {
    if (typeof callback !== "function") {
      throw new TypeError(`${callback} is not a function`);
    }

    const object = toObject(this);
    const length = toLength(object.length);

    for (let index = 0; index < length; index += 1) {
      if (index in object) {                 // present indices only; holes skipped
        callback.call(thisArg, object[index], index, object);
      }
    }
    // No `return` — forEach's result is always undefined.
  };
}
```

### Walkthrough

`const ctx = { sum: 0 }; [1, 2, 3].myForEach(function (x) { this.sum += x; }, ctx)`:

1. `callback` is a function; `object` is the array, `length = 3`.
2. index 0: present → `callback.call(ctx, 1, 0, arr)` → `ctx.sum = 1`.
3. index 1: → `ctx.sum = 3`. index 2: → `ctx.sum = 6`.
4. The loop ends; the function returns `undefined`.

For sparse `[1, , 3]`: `1 in sparse` is `false`, so the callback runs only for indices 0 and 2; a `seen` array records `[1, 3]`.

### Complexity

Time: `O(n)` over the snapshot; it never short-circuits. Space: `O(1)` beyond the callback's own allocations.

### Edge Cases

- **Holes:** skipped; the callback is never invoked for them.
- **Return value:** ignored — `forEach` returns `undefined` even when the callback returns a value.
- **No `break`:** the only exits are completion or a thrown error; use `for...of`/`some`/`find` to stop early.
- **Mutating during iteration:** appends do not extend the loop (snapshot); deletes remove later visits; the current value was already read.
- **Async callback:** the returned promise is dropped; the loop does not await. Use `for await...of` for sequencing.
- **`thisArg`:** forwarded via `.call`; irrelevant to arrow callbacks.
- **Non-callable callback:** `TypeError` before iteration.
- **Empty array:** callback never runs; returns `undefined`.

### Interview Follow-ups

- **`forEach` vs `for...of`:** `for...of` supports `break`/`continue`/`return`, and `for await...of` awaits; `forEach` supports neither. Reach for `for...of` when control flow matters.
- **Why no early exit?** The callback is a black box with no return channel to the loop; the spec chose simplicity and added `some`/`every`/`find` for short-circuiting.
- **Reimplement `forEach` with `reduce`:** possible, but it still needs the hole guard and still returns `undefined`.
- **Sequential async work:** `await` inside `forEach` does not serialize; use a `for...of` loop with `await`, or `await Promise.all(arr.map(fn))` for parallelism.

### Common Mistakes

- Expecting a return value from `forEach`, or chaining off it.
- Trying to `break` or `return` out of a `forEach` to stop early.
- Using `forEach` to build an array (use `map`) or to accumulate (use `reduce`).
- `await`ing inside `forEach` and assuming calls are sequential.
- Skipping the hole guard so the callback runs for empty slots.

### Takeaway

`forEach` is the side-effect loop: snapshot the length, visit present indices, ignore the callback's return, and always give back `undefined`. It cannot stop early — that is what `some`, `every`, and `find` are for.

## Implement `Array.prototype.find`

`Difficulty: Easy` `Probability: High`

### Problem

Add `Array.prototype.myFind(predicate, thisArg)` matching `Array.prototype.find`: return the **first element** for which `predicate` is truthy, else `undefined`.

The contract differs from the skipping methods in one decisive way:

- **`find` visits holes.** It reads `object[index]` (`Get`), not `HasProperty`, so a hole is seen as `undefined` and the predicate is called for it.
- **Short-circuits** on the first truthy result and returns that *element* (not the index).
- `predicate.call(thisArg, value, index, object)`.
- Receiver coercion, length snapshot, and the `TypeError` on a non-callable predicate are otherwise the same.
- "Not found" and "found an explicit `undefined`" both return `undefined`; use `findIndex` to distinguish them.

### Examples

```text
[1, 2, 3, 4].myFind((x) => x > 2)                 // => 3
[1, 2, 3].myFind((x) => x > 9)                    // => undefined
[{ id: 1 }, { id: 2 }].myFind((o) => o.id === 2)  // => { id: 2 }
[1, 2].myFind(function (x) { return x === this.target; }, { target: 2 }) // => 2

const seen = [];
[1, , 3].myFind((x) => { seen.push(x); return false; });
seen                                              // => [1, undefined, 3]  (hole visited)
```

### Approach

Start from the shared skeleton, then delete the hole guard: that single deletion is the whole difference between `find` and `map`/`some`.

1. `toObject(this)`, snapshot `toLength(object.length)`.
2. Iterate `for (let index = 0; index < length; index += 1)`.
3. `const value = object[index]` — a `Get`, so holes yield `undefined`.
4. `if (predicate.call(thisArg, value, index, object)) return value;` — `ToBoolean` on the result, then return the element.
5. Fall through to `return undefined`.

Returning the element (not a boolean, not an index) is the contract; comparing `find` with `some` makes the point: `some` answers "does any?", `find` answers "which one?". The early `return` is what makes `find` lazy — once a match exists, no later index is touched.

The spec reads with `Get` because `find` searches over *values*, and an absent value and an `undefined` value are indistinguishable to a predicate. That is why `[undefined].find((x) => x === undefined)` and `[, ].find((x) => x === undefined)` behave the same. It is also why `find`/`findIndex` are the exception on this page.

### Implementation

```javascript
// Uses the shared toObject / toLength helpers defined with `map`.
if (!Array.prototype.myFind) {
  Array.prototype.myFind = function myFind(predicate, thisArg) {
    if (typeof predicate !== "function") {
      throw new TypeError(`${predicate} is not a function`);
    }

    const object = toObject(this);
    const length = toLength(object.length);

    for (let index = 0; index < length; index += 1) {
      const value = object[index];           // Get: holes are read as undefined
      if (predicate.call(thisArg, value, index, object)) {
        return value;                        // first match wins; stops here
      }
    }
    return undefined;                        // also the result for a found `undefined`
  };
}
```

### Walkthrough

`[1, 2, 3, 4].myFind((x) => x > 2)`:

1. `length = 4`; index 0: `1 > 2` false. index 1: `2 > 2` false. index 2: `3 > 2` true → return `3`.
2. Index 3 is never examined — the early return short-circuits.

Now `const seen = []; [1, , 3].myFind((x) => { seen.push(x); return false; })`:

- index 0 → `seen = [1]`; index 1: no hole guard, so `object[1]` is `undefined` → `seen = [1, undefined]`; index 2 → `seen = [1, undefined, 3]`; no match → `undefined`.

Contrast with `[1, , 3].myMap((x) => { seen2.push(x); return x; })`, which records only `[1, 3]` because `map` skips the hole. That is the sparse distinction the interviewer is probing.

### Complexity

Time: `O(n)` worst case, `O(1)` best case (a match at index 0) because of short-circuiting. Space: `O(1)` beyond the callback.

### Edge Cases

- **Holes are visited** as `undefined`; the predicate runs for them, unlike `map`/`filter`/`some`/`every`.
- **Ambiguous miss:** a missing element and a found `undefined` both return `undefined`; use `findIndex` (→ `-1`) to tell them apart.
- **Early exit:** later elements are not read, so their side effects do not happen.
- **`thisArg`:** forwarded by `.call`.
- **Mutation:** the length snapshot bounds the loop; deleting an element before it is reached turns it into `undefined`.
- **Empty array:** predicate never runs → `undefined`.
- **Predicate throws:** propagates immediately.

### Interview Follow-ups

- **`findLast` / `findLastIndex`:** the same logic iterating from `length - 1` down to `0`; it is not a reversed `find` over a copy.
- **`find` vs `filter(...)[0]`:** `find` is lazy and allocates nothing; `filter` walks the whole array and builds an intermediate.
- **Why does `find` visit holes while `map` skips them?** `find` uses `Get` (returns `undefined` for a hole); `map` uses `HasProperty` (`in`) to decide whether to call.
- **Implement `find` with `for...of`:** works for iterables but changes semantics — `for...of` never yields holes, so it would skip them and diverge from the spec.

### Common Mistakes

- Adding `if (index in object)` out of habit, which silently changes hole behavior — the exact thing being tested.
- Returning a boolean instead of the element.
- Materializing with `filter(...)[0]` and losing the short-circuit.
- Using a falsy check on the result when the found value is legitimately `0`/`""`/`false`.
- Forgetting the `TypeError` guard.

### Takeaway

`find` is a lazy search that returns the first matching *value*. Its signature quirk is that it reads with `Get`, so holes are visited as `undefined` — the opposite of the transform iterators. Drop the `in` guard and return the element.

## Implement `Array.prototype.findIndex`

`Difficulty: Easy` `Probability: High`

### Problem

Add `Array.prototype.myFindIndex(predicate, thisArg)` matching `Array.prototype.findIndex`: return the **index** of the first element for which `predicate` is truthy, else `-1`.

- Same as `find`, but the success value is the index and the sentinel is `-1`.
- **Visits holes** (`Get`), so a hole is tested as `undefined` and a match yields the hole's index.
- Short-circuits on the first truthy result.
- `predicate.call(thisArg, value, index, object)`; receiver coercion, length snapshot, and the non-callable `TypeError` are unchanged.

Returning `-1` (instead of `undefined`) is what makes "not found" distinguishable from "found at index 0" and from a found `undefined`.

### Examples

```text
[1, 2, 3].myFindIndex((x) => x > 1)             // => 1
[1, 2, 3].myFindIndex((x) => x > 9)             // => -1
[1, 2, 3].myFindIndex((x, i) => i === 2)        // => 2
[NaN].myFindIndex((x) => Number.isNaN(x))       // => 0   (indexOf returns -1 for NaN)

const sparse = [1, , 3];
sparse.myFindIndex((x) => x === undefined)      // => 1   (hole visited, index returned)
sparse.myFindIndex((x) => x > 1)                // => 2   (index 1 is undefined, then 3 > 1)
```

### Approach

Identical to `find` with two substitutions: return `index` instead of `value`, and `return -1` instead of `return undefined`. Everything else — `toObject`, `toLength`, the `Get` (no hole guard), the early return, `thisArg` — carries over.

Worth calling out the `indexOf` contrast. `indexOf` compares with **strict equality** (`===`), which is why `[NaN].indexOf(NaN)` is `-1` while `findIndex` can use `Number.isNaN`. `indexOf` also takes a value, whereas `findIndex` takes a predicate, so `findIndex` is the right tool for object searches (`[{ id: 2 }]` cannot be found with `indexOf`).

### Implementation

```javascript
// Uses the shared toObject / toLength helpers defined with `map`.
if (!Array.prototype.myFindIndex) {
  Array.prototype.myFindIndex = function myFindIndex(predicate, thisArg) {
    if (typeof predicate !== "function") {
      throw new TypeError(`${predicate} is not a function`);
    }

    const object = toObject(this);
    const length = toLength(object.length);

    for (let index = 0; index < length; index += 1) {
      const value = object[index];           // Get: holes read as undefined
      if (predicate.call(thisArg, value, index, object)) {
        return index;                        // first matching index
      }
    }
    return -1;                               // clear "not found" sentinel
  };
}
```

### Walkthrough

`[NaN].myFindIndex((x) => Number.isNaN(x))`:

1. `length = 1`; index 0: `object[0]` is `NaN`.
2. `Number.isNaN(NaN)` is `true` → return `0`.
3. `0` is a valid index; the caller must test `result !== -1`, not `if (result)`.

Sparse `[1, , 3]` with `(x) => x === undefined`:

- index 0: `1 === undefined` false.
- index 1: `object[1]` is `undefined` (the hole, read via `Get`), predicate true → return `1`.

So the hole's index is returned, exactly as native `findIndex` does.

### Complexity

Time: `O(n)` worst case, `O(1)` best case (a match at index 0) via short-circuit. Space: `O(1)`.

### Edge Cases

- **Not found:** `-1`, which is truthy, so compare with `!== -1`.
- **Found at index 0:** returns `0` (falsy!) — never test the result with `if (result)`.
- **NaN:** `findIndex` handles it via a predicate; `indexOf` cannot, because it uses `===`.
- **Holes visited:** a hole can match when the predicate tests `undefined`.
- **Empty array:** → `-1`.
- **`thisArg` / mutation / throws:** same as `find`.

### Interview Follow-ups

- **`findLastIndex`:** iterate from `length - 1` down to `0`; still uses `Get`, still clamps `length`.
- **`findIndex` vs `indexOf`:** predicate vs value; `===` vs an arbitrary test (`NaN`, deep equality, objects).
- **Get the element too:** have `findIndex` return an index, then read `object[index]` — or just use `find`.
- **Binary-search variant:** only valid on a sorted array; `findIndex` is linear by contract.

### Common Mistakes

- Testing `if (result)` and treating index `0` as "not found."
- Adding the hole guard so holes are skipped, diverging from native.
- Returning `undefined` instead of `-1` on a miss.
- Searching for `NaN` with `findIndex` but still using `===` inside the predicate (`NaN === NaN` is false — use `Number.isNaN`).

### Takeaway

`findIndex` is `find` with the value/index swap and a `-1` sentinel. It reads via `Get` (holes visited) and short-circuits. Remember `0` is a valid result, so compare against `-1`.

## Implement `Array.prototype.some`

`Difficulty: Easy` `Probability: High`

### Problem

Add `Array.prototype.mySome(callback, thisArg)` matching `Array.prototype.some`: return `true` if the callback is truthy for **at least one** present index, else `false`.

- Shares the skeleton: `toObject`, snapshotted `toLength`, `index in object`.
- **Skips holes** (unlike `find`), because it uses `HasProperty`.
- **Short-circuits** on the first truthy result; later callbacks do not run.
- `callback.call(thisArg, value, index, object)`; the callback's result is coerced with `ToBoolean`.
- **Empty receiver → `false`** (no element can satisfy the predicate). Non-callable callback → `TypeError`.

### Examples

```text
[1, 2, 3].mySome((x) => x > 2)          // => true
[1, 2, 3].mySome((x) => x > 9)          // => false
[1, 2].mySome((x, i) => i === 1)        // => true
[].mySome(() => true)                   // => false   (vacuous)

const calls = [];
[1, 2, 3].mySome((x) => { calls.push(x); return x === 2; });
calls                                   // => [1, 2]   (short-circuits; 3 never tested)

const sparse = [, ,];
sparse.mySome(() => true)               // => false   (holes skipped, callback never runs)
```

### Approach

`some` is `filter` without materializing anything: walk present indices, `ToBoolean` the callback result, and `return true` the moment one passes. If the loop drains, `return false`.

Two invariants:

1. **Short-circuit.** The first `true` ends iteration. This is observable through side effects, so it is part of the contract, not an optimization detail. `[1, 2, 3].some((x) => { calls.push(x); return true; })` records only `[1]`.
2. **Holes are skipped.** `[, ,].some(() => true)` is `false`, because the callback never runs; a naive loop over `length` without the guard would call it twice and return `true`.

The empty case is the identity of the OR-fold: an empty disjunction is `false`. `every` is its dual, where the empty conjunction is `true` (vacuous truth). Interviewers like to check both.

`some` and `every` relate by De Morgan: `!arr.some(p)` is `arr.every((x) => !p(x))` over the present indices.

### Implementation

```javascript
// Uses the shared toObject / toLength helpers defined with `map`.
if (!Array.prototype.mySome) {
  Array.prototype.mySome = function mySome(callback, thisArg) {
    if (typeof callback !== "function") {
      throw new TypeError(`${callback} is not a function`);
    }

    const object = toObject(this);
    const length = toLength(object.length);

    for (let index = 0; index < length; index += 1) {
      if (index in object && callback.call(thisArg, object[index], index, object)) {
        return true;                         // first truthy result ends the loop
      }
    }
    return false;                            // empty or no match
  };
}
```

### Walkthrough

`const calls = []; [1, 2, 3].mySome((x) => { calls.push(x); return x === 2; })`:

1. `length = 3`; index 0: present, `calls = [1]`, `1 === 2` false.
2. index 1: `calls = [1, 2]`, `2 === 2` true → return `true` immediately.
3. Index 2 is never visited; `calls` is `[1, 2]`.

Sparse `[, ,].mySome(() => true)`: `length = 2`, but `0 in object` and `1 in object` are both `false`, so the callback never runs and the result is `false`.

### Complexity

Time: `O(n)` worst case, `O(1)` best case via short-circuit. Space: `O(1)`.

### Edge Cases

- **Empty array:** `false` — not a bug; it is the OR-fold identity.
- **All holes:** `false`, callback never runs.
- **Short-circuit side effects:** later callbacks are skipped; do not rely on them for logging or cleanup.
- **Truthiness:** `"0"`, `[]`, `{}` are truthy; `0`, `""`, `NaN`, `null` are not.
- **`thisArg`:** forwarded via `.call`.
- **Mutation:** the snapshot bounds the loop; deleting a future index skips it (not present when reached).
- **Non-callable callback:** `TypeError`.

### Interview Follow-ups

- **De Morgan:** `some(p)` ≡ `!every((x) => !p(x))`; implement one in terms of the other.
- **`none`:** there is no native `Array.prototype.none`; write `!arr.some(p)`.
- **Async predicate:** `some` cannot await; `for await...of` with a `break` is the sequential form.
- **`some` vs `find`:** the same shape — `find` returns the element, `some` the boolean, and both short-circuit — but `find` visits holes while `some` skips them.

### Common Mistakes

- Missing the `index in object` guard, so holes invoke the callback and can flip the result.
- Building a `filter` and checking its length, losing the short-circuit.
- Assuming `some` on `[]` is `true` (that is `every`).
- Forgetting that `thisArg` is ignored by arrow callbacks.
- Expecting the callback's return *value* rather than its truthiness.

### Takeaway

`some` is the short-circuiting OR over present indices: `true` on the first truthy callback result, `false` for empty or all-falsy input. Skip holes, snapshot the length, and stop early.

## Implement `Array.prototype.every`

`Difficulty: Easy` `Probability: High`

### Problem

Add `Array.prototype.myEvery(callback, thisArg)` matching `Array.prototype.every`: return `true` only if the callback is truthy for **every** present index, else `false`.

- Shares the skeleton: `toObject`, snapshotted `toLength`, `index in object`.
- **Skips holes** (`HasProperty`), unlike `find`/`findIndex`.
- **Short-circuits** on the first falsy result.
- `callback.call(thisArg, value, index, object)`; `ToBoolean` on the result.
- **Empty receiver → `true`** (vacuous truth). Non-callable callback → `TypeError`.

### Examples

```text
[2, 4, 6].myEvery((x) => x % 2 === 0)     // => true
[2, 5, 6].myEvery((x) => x % 2 === 0)     // => false
[1, 2].myEvery((x, i) => i < 2)           // => true
[].myEvery(() => false)                   // => true    (vacuous truth)
[, ,].myEvery(() => false)                // => true    (holes skipped, callback never runs)

const third = [];
[1, 2, 3].myEvery((x) => { third.push(x); return x < 3; });
third                                     // => [1, 2, 3]  (never falsy)

const second = [];
[1, 2, 3].myEvery((x) => { second.push(x); return x < 2; });
second                                    // => [1, 2]     (2 is falsy -> short-circuit)
```

### Approach

`every` is the AND-fold over present indices: return `false` on the first falsy callback result, else `true`. The mirror of `some`, with the sentinels flipped.

The surprising contract is the empty case. `[].every(() => false)` is `true` because there is no counterexample — the same reason `[].some(() => true)` is `false`. This is vacuous truth and it is deliberate: an AND over zero terms is the identity `true`. Do not "fix" it.

Holes are skipped, so `[, ,].every(() => false)` is also `true` — the callback is never called, so no falsy result is ever observed. A naive loop without the guard would call the predicate twice and, if it returned `false`, incorrectly return `false`.

Short-circuiting is observable: `[1, 2, 3].every((x) => { second.push(x); return x < 2; })` records `[1, 2]` and stops at `2`.

De Morgan again: `every(p)` ≡ `!some((x) => !p(x))`.

### Implementation

```javascript
// Uses the shared toObject / toLength helpers defined with `map`.
if (!Array.prototype.myEvery) {
  Array.prototype.myEvery = function myEvery(callback, thisArg) {
    if (typeof callback !== "function") {
      throw new TypeError(`${callback} is not a function`);
    }

    const object = toObject(this);
    const length = toLength(object.length);

    for (let index = 0; index < length; index += 1) {
      if (index in object && !callback.call(thisArg, object[index], index, object)) {
        return false;                        // first counterexample wins
      }
    }
    return true;                             // all passed (and vacuously for empty)
  };
}
```

### Walkthrough

`[2, 5, 6].myEvery((x) => x % 2 === 0)`:

1. `length = 3`; index 0: `2 % 2 === 0` true → continue.
2. index 1: `5 % 2 === 0` false → return `false`. Index 2 is never visited.

`[].myEvery(() => false)`: `length = 0`, the loop body never runs, and the final `return true` fires — vacuous truth.

Sparse `[, ,].myEvery(() => false)`: `length = 2`, but neither index satisfies `index in object`, so the callback never runs and the function returns `true`.

### Complexity

Time: `O(n)` worst case, `O(1)` best case via short-circuit. Space: `O(1)`.

### Edge Cases

- **Empty array:** `true` (vacuous). Do not special-case it to `false`.
- **All holes:** `true`, callback never runs.
- **Short-circuit side effects:** callbacks after the first falsy result are skipped.
- **Truthiness:** any falsy callback result (`0`, `""`, `NaN`, `null`, `undefined`, `false`) stops the loop.
- **`thisArg`:** forwarded via `.call`.
- **Mutation:** the snapshot bounds the loop; a deleted future index is skipped.
- **Non-callable callback:** `TypeError`.

### Interview Follow-ups

- **Implement `every` via `some`:** `!some((value, index, array) => !callback.call(thisArg, value, index, array))`; both skip holes, so the hole behavior matches.
- **`every` vs `some` on empty:** `true` vs `false` — the vacuous identities; a favorite interview check.
- **Async predicate:** `every` cannot await; use `for await...of` with an early `break`.
- **Why is `[].every(...)` true?** Universal quantification over an empty domain is vacuously true; returning `false` would make `arr.every(p) && arr.every(q)` inconsistent.

### Common Mistakes

- Returning `false` for an empty array, breaking vacuous truth.
- Missing the `index in object` guard so holes are visited.
- Accumulating a boolean across the whole loop instead of short-circuiting (observable side effects differ).
- Confusing `every` with `some` — flipping the sentinel and the polarity of the callback test.
- Forgetting the `!` in `if (!callback(...))`, which inverts the method's meaning.

### Takeaway

`every` is the short-circuiting AND over present indices: `false` on the first falsy callback result, `true` otherwise and for empty input. Skip holes, snapshot the length, and stop early.
