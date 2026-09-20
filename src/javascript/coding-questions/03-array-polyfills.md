# Array Method Polyfills

Recreating `map`, `reduce`, `flat`, and friends is the classic "do you actually know the contract?" question. The loop is easy; the interview is about `this`, callback arguments, sparse arrays, `reduce`'s seed rule, `SameValueZero`, and `ToIntegerOrInfinity`. State the contract before you write a line.

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

