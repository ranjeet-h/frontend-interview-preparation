# Iterators & Generators

Iterators are the protocol behind `for...of`, spread, and destructuring; generators are functions that can pause. Together they let you model lazy, potentially infinite sequences without allocating the whole result. These problems are short but they expose whether you understand the iteration protocol rather than just arrays.

## Create a Custom Iterable Object

`Difficulty: Medium` `Probability: High`

### Problem

Implement `makeCollection(...items)` returning an **iterable** object — one that works with
`for...of`, spread, `Array.from`, and destructuring. The contract has a subtlety most candidates
miss: the object must produce a **fresh iterator on every iteration**, because consumers call
`obj[Symbol.iterator]()` once per loop. If `[Symbol.iterator]` returns a shared cursor, the
second `for...of` over the same object yields nothing.

An **iterable** has a `[Symbol.iterator]()` method returning an **iterator**. An **iterator** is
the object with `next()` that the loop actually pulls from. They are different roles: the
collection is the iterable, the cursor is the iterator.

### Examples

```text
const pages = makeCollection("a", "b", "c");

[...pages]                      // => ["a", "b", "c"]
Array.from(pages)               // => ["a", "b", "c"]
const [first, second] = pages;  // => first="a", second="b"
for (const p of pages) { }      // visits "a", "b", "c"

// Multi-shot: a fresh iterator each time.
[...pages]                      // => ["a", "b", "c"]   (NOT empty)
[...makeCollection()]           // => []
```

### Approach

`for...of` performs three steps at loop entry (the desugaring is worth memorising):

1. `const iterator = iterable[Symbol.iterator]();`
2. `let result = iterator.next();`
3. while `!result.done`, run the body with `result.value`, then `result = iterator.next()`.

So the collection itself only needs one method. The cleanest implementation closes over the
array in a factory function rather than reading `this`, so passing `pages[Symbol.iterator]`
around as a detached function still works. Return a **brand-new** closure over a fresh `index`
each call: that is what makes the iterable multi-shot.

Two properties worth stating in the interview: an iterator should also be iterable (return
`this` from its own `[Symbol.iterator]`) so it can be fed back into `for...of`; and `next()` must
keep returning `{ value: undefined, done: true }` once exhausted rather than throwing.

### Implementation

```javascript
function makeCollection(...items) {
  return {
    size: items.length,

    // Called once per for...of / spread / Array.from.
    [Symbol.iterator]() {
      let index = 0; // fresh cursor per call => the collection is re-iterable

      return {
        next() {
          if (index >= items.length) {
            return { value: undefined, done: true }; // exhausted stays exhausted
          }
          return { value: items[index++], done: false };
        },
        // An iterator is also an iterable, so it can be used in for...of directly.
        [Symbol.iterator]() {
          return this;
        },
      };
    },
  };
}
```

### Walkthrough

`const pages = makeCollection("a", "b", "c");`

1. Spreading runs `pages[Symbol.iterator]()`, which sets a new closure's `index = 0`.
2. `next()` returns `{ value: "a", done: false }`, then `"b"`, then `"c"`, with `index` at `3`.
3. The fourth `next()` hits `index >= 3` and returns `{ value: undefined, done: true }`; spread
   stops and produces `["a", "b", "c"]`.
4. A *second* `[...pages]` calls `[Symbol.iterator]()` again, creating a distinct `index`, so the
   spread is `["a", "b", "c"]` again — the multi-shot guarantee.

### Complexity

Time: `O(1)` per `next()` and `O(n)` to consume all items. Space: `O(1)` extra for the cursor
(the items array is captured, not copied).

### Edge Cases

- Empty collection: the first `next()` reports `done`, so spread gives `[]`.
- Re-iteration always restarts from index `0`; iterating does **not** consume the collection.
- Mutating `items` mid-iteration is observable, because the closure shares the array reference.
- Destructuring `const [a, b] = pages` pulls only two values and abandons the iterator; no cleanup
  method is defined, which is correct here but not for resources.
- `pages[Symbol.iterator]` used detached still works: the factory closed over `items` rather than
  reading `this`.
- Non-iterables throw `TypeError: x is not iterable`, so a missing `[Symbol.iterator]` is loud.

### Interview Follow-ups

- **Make it single-shot** so the *object itself* is the iterator (return `this` and hold `index`
  on the object). That is what generators give you for free.
- **Add class syntax:** put `[Symbol.iterator]()` on `Collection.prototype` and call it with
  `this.items`; note that a method call binds `this` correctly for `for...of`.
- **Add `return()`** so `break` can clean up (close a file handle, release a lock, cancel a fetch).
- **Why does spread work on a `Map` but not on a plain object?** `Map` implements
  `[Symbol.iterator]`; plain objects do not, hence `Object.entries`/`Object.keys`.

### Common Mistakes

- Returning `this` from a shared `[Symbol.iterator]` with one persistent `index`, making a
  single-shot iterable that appears empty on the second loop.
- Forgetting `[Symbol.iterator]` on the returned iterator, so `for...of` over it throws.
- Reading `this.items` inside a method that may be detached (`const it = obj[Symbol.iterator]`).
- Returning `{ value: items[index], done: false }` without incrementing, producing an infinite loop.

### Takeaway

An iterable is a factory for iterators. Return a fresh cursor from `[Symbol.iterator]` and the
object is re-iterable; reuse one cursor and it is single-shot. `for...of`, spread, `Array.from`,
and destructuring all consume that same protocol.

## Implement `[Symbol.iterator]` (The Iterator Protocol)

`Difficulty: Medium` `Probability: Very High`

### Problem

Write `createIterator(items)` that returns a well-behaved **iterator**: an object with a `next()`
method returning `{ value, done }`, where

- `done` is coerced with `Boolean` — it is truthiness, not a strict `true`;
- after the first `done: true`, every later `next()` must also be `done: true` (an exhausted
  iterator "sticks"), even if the underlying data grows;
- `value` is ignored by `for...of` once `done` is truthy;
- the returned object must itself be iterable (`[Symbol.iterator]()` returning `this`) so it can be
  passed straight to `for...of`, spread, or `Array.from`.

Then wrap it in `toIterable(items)` so the same underlying data can be iterated many times.

### Examples

```text
const it = createIterator(["x", "y"]);
it.next()                    // => { value: "x", done: false }
it.next()                    // => { value: "y", done: false }
it.next()                    // => { value: undefined, done: true }
it.next()                    // => { value: undefined, done: true }   (sticks)

[...createIterator([1, 2, 3])]   // => [1, 2, 3]   (iterator is iterable)
for (const v of createIterator(["a"])) { }  // visits "a"

// Multi-shot wrapper
const iterable = toIterable(["x", "y"]);
[...iterable]                // => ["x", "y"]
[...iterable]                // => ["x", "y"]   (fresh iterator each time)

({})[Symbol.iterator]        // => undefined
for (const v of {}) { }      // => TypeError: {} is not iterable
```

### Approach

The protocol is a state machine with exactly two rules that naive implementations break:

1. **Latch exhaustion.** Keep a `done` flag. Once `next()` has reported `done: true`, return the
   same terminal result forever; do not recompute from `index < items.length`, or a `push` after
   exhaustion would resurrect values.
2. **Self-iterable.** Define `[Symbol.iterator]() { return this; }` on the iterator. Without it,
   `Array.from(iterator)` throws, because `Array.from` accepts an *iterable*, not a bare iterator.

`toIterable` is the other half of the distinction: it exposes `[Symbol.iterator]` that calls
`createIterator(items)` **afresh** each time, making the wrapper re-iterable. Use `Object.defineProperty`
with `enumerable: false` if you want the method hidden from `Object.keys`/spread-of-properties.

### Implementation

```javascript
function createIterator(items) {
  let index = 0;
  let done = false; // latched: once true, it never flips back

  return {
    next() {
      if (done || index >= items.length) {
        done = true;
        return { value: undefined, done: true };
      }
      return { value: items[index++], done: false };
    },
    [Symbol.iterator]() {
      return this; // an iterator is also an iterable
    },
  };
}

function toIterable(items) {
  return {
    [Symbol.iterator]() {
      return createIterator(items); // NEW iterator per loop => multi-shot
    },
  };
}
```

### Walkthrough

`const it = createIterator(["x", "y"]);`

1. `it.next()` — `done` is `false` and `index (0) < 2`, so it returns `{ value: "x", done: false }`
   and `index` becomes `1`.
2. `it.next()` — returns `{ value: "y", done: false }`, `index` becomes `2`.
3. `it.next()` — `index >= 2`, so `done` latches to `true` and returns
   `{ value: undefined, done: true }`.
4. `items.push("z"); it.next()` — still `{ value: undefined, done: true }` because of the latch. A
   version that only tested `index < items.length` would wrongly yield `"z"`.

`[...toIterable(["x", "y"])]`: the spread calls `[Symbol.iterator]()`, which builds a *new*
iterator, so a second spread repeats from the top rather than returning `[]`.

### Complexity

Time: `O(1)` per `next()`, `O(n)` to drain. Space: `O(1)` for the cursor; `O(n)` only if the
consumer materialises the values.

### Edge Cases

- **Exhaustion latch:** after `done`, stay `done` even if `items` grows (contrast with array
  iterators, which also latch, versus `Set`/`Map` iterators, which *do* see later insertions).
- **`done` is coerced:** `{ done: 1 }` and `{ done: "yes" }` both terminate the loop.
- **`value` at `done: true`:** generators return a final value here, and it is available via
  `.next()` and `yield*`'s return value, but ignored by `for...of`.
- **Missing `[Symbol.iterator]`:** `Array.from` throws `TypeError`; `for...of` throws
  `"x is not iterable"`.
- **Reusing a spent iterator:** `for...of` over it runs zero times — the classic "why is my second
  loop empty" bug.
- **Non-array `items`:** accept any array-like via `items.length` and indexed access, or any
  iterable via `for...of`.

### Interview Follow-ups

- **Implement `return()`** so `break`/`throw` inside `for...of` triggers cleanup
  (`for...of` calls `iterator.return()` automatically on early exit).
- **Implement `throw()`** to forward an error into a generator, and explain it is what `yield*`
  uses to propagate exceptions.
- **Convert to a generator** — `function* gen(items) { yield* items; }` gives the same iterator with
  less code; the manual version is what interviewers ask for to see the protocol.
- **Why is `Array.from` different from spread?** `Array.from` also accepts array-likes and takes a
  `mapFn`; spread requires an iterable.

### Common Mistakes

- Forgetting `[Symbol.iterator]` on the iterator, breaking `Array.from`/`for...of` over it.
- Not latching `done`, so an exhausted iterator revives when the source array is mutated.
- Assuming `done` must be strictly `true`; any truthy value ends the loop.
- Returning a shared iterator from `[Symbol.iterator]` so the iterable can only be walked once.
- Reading `.length` once and caching it when the source is meant to be live.

### Takeaway

The iterator protocol is `next() -> { value, done }` plus a latched `done`. Make the iterator
itself iterable, and put a *fresh*-iterator factory behind `[Symbol.iterator]` whenever the
container should be traversable more than once.

## Implement a Range Iterator (`range(1, 5)`)

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `range(start, end, step)` returning a **lazy, re-iterable** sequence of numbers over the
half-open interval `[start, end)` — the same convention as Python's `range` and lodash's `_.range`.

- `range(end)` → `0` to `end` with step `1`.
- `range(start, end)` → step defaults to `1` when `start <= end`, else `-1` (lodash behavior).
- `range(start, end, step)` → explicit step; `0`, `NaN`, or non-finite bounds throw.
- The result must support spread, destructuring, and `for...of`, and expose `size` **without
  iterating** (the length is arithmetic, so laziness costs nothing here).
- The sign of `step` must agree with the direction; a mismatched step yields an empty sequence.

The point of the exercise is that you never build the array.

### Examples

```text
[...range(1, 5)]        // => [1, 2, 3, 4]
[...range(5)]           // => [0, 1, 2, 3, 4]
[...range(0, 10, 3)]    // => [0, 3, 6, 9]
[...range(1, 5, 2)]     // => [1, 3]
[...range(5, 1, -1)]    // => [5, 4, 3, 2]
[...range(5, 1)]        // => [5, 4, 3, 2]     (default direction)
[...range(3, 3)]        // => []
[...range(1, 5, -1)]    // => []               (step fights the direction)

range(1, 5).size        // => 4  (computed, never iterated)
const [a, b] = range(10, 20);   // => a=10, b=11
Array.from(range(0, 4)) // => [0, 1, 2, 3]
range(1, 5, 0)          // => TypeError: step must be non-zero
```

### Approach

Compute the **count** first, then derive each value from the index: `value = start + i * step`.
That formula is the important detail — accumulating `value += step` drifts for fractional steps
(`0.1 * 3 !== 0.3` in floating point), while `start + i * step` is a single rounding per term.

```
count = step > 0 ? ceil((end - start) / step) : ceil((start - end) / -step)
count = max(0, count)
```

The `max(0, ...)` is what makes a wrong-direction step (`range(1, 5, -1)`) or an empty interval
produce zero iterations instead of a negative count that would loop forever or throw.

`[Symbol.iterator]` returns a fresh cursor over that count, so the range is re-iterable. Because
`count` is known up front, `size` needs no traversal, and `for...of` still pulls one value at a
time — the sequence is never materialised.

### Implementation

```javascript
function range(start, end, step) {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new TypeError("range bounds must be finite numbers");
  }
  if (step === undefined) {
    step = start <= end ? 1 : -1; // lodash-style default direction
  }
  if (!Number.isFinite(step) || step === 0) {
    throw new TypeError("range step must be a non-zero finite number");
  }

  // Count items up front; clamp so a wrong-direction step yields an empty range.
  const span = step > 0 ? end - start : start - end;
  const size = Math.max(0, Math.ceil(span / Math.abs(step)));

  return {
    size, // known arithmetically, no iteration required

    [Symbol.iterator]() {
      let index = 0;
      return {
        next() {
          if (index >= size) return { value: undefined, done: true };
          const value = start + index * step; // no cumulative float drift
          index += 1;
          return { value, done: false };
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    },
  };
}
```

### Walkthrough

`range(0, 10, 3)`:

1. `start = 0`, `end = 10`, `step = 3`; `span = 10 - 0 = 10`.
2. `size = max(0, ceil(10 / 3)) = max(0, 4) = 4` — so `range(0, 10, 3).size === 4` with no loop.
3. Spread calls `[Symbol.iterator]()`, creating `index = 0`.
4. `next()` → `0 + 0 * 3 = 0`; then `3`, `6`, `9`; after the fourth call `index === 4` so the next
   `next()` returns `{ value: undefined, done: true }`. Spread stops at `[0, 3, 6, 9]`.

`range(5, 1)` with no step: `step = start <= end ? 1 : -1` → `-1`; `span = 5 - 1 = 4`;
`size = ceil(4 / 1) = 4`; values `5, 4, 3, 2`. `range(1, 5, -1)`: `span = start - end = -4`;
`size = max(0, ceil(-4)) = 0`, so spreading gives `[]` — no infinite loop.

### Complexity

Time: `O(1)` per `next()`, `O(n)` to consume `n` values. Space: `O(1)` regardless of `n` — the
whole point versus `Array.from({ length: n }, ...)`.

### Edge Cases

- `range(3, 3)` → empty (`span = 0`), not one element: the interval is half-open.
- Negative, zero, and fractional bounds work; `range(-2, 3)` yields `-2, -1, 0, 1, 2`.
- Fractional `step`: `range(0, 1, 0.25)` → `[0, 0.25, 0.5, 0.75]`; values are `start + i * step` so
  they do not accumulate error.
- `step === 0` → `TypeError`; a silent `Infinity` count would be worse.
- `NaN`/`Infinity` bounds → `TypeError`; infinite sequences belong to a generator (`while (true)`),
  not a range whose `size` is defined.
- Very large `n` (e.g. `range(1e9)`) is fine **only if consumed lazily**; `[...range(1e9)]` still
  allocates a billion-element array.
- `size` is a snapshot; `start`/`end` are captured at creation, so later mutation of the arguments
  has no effect (numbers are immutable).

### Interview Follow-ups

- **Make it inclusive:** change `span` to `end - start` and add `1`, or return `size + 1` items.
- **Descending with a float step:** already handled by the sign-aware `span`.
- **`range` as a generator:** `function* range(start, end, step)` with `yield` inside the same
  arithmetic loop is shorter but loses `size` unless you compute it separately.
- **Lazy map/filter over a range:** compose generator adapters (`map(range(1, n), fn)`) so a chain
  like `range(1, 1e6)` filtered down to a few values never allocates the million elements.

### Common Mistakes

- Building the array eagerly with a `for` loop and `push` — the lazy contract is the exercise.
- `value += step` accumulation, which drifts for fractional steps.
- Missing the sign check, so `range(1, 5, -1)` loops forever (`index` grows, `value` never reaches
  the bound).
- Reusing one `index` across calls to `[Symbol.iterator]`, making the range single-shot.
- Assuming `range(3, 3)` yields `[3]`; half-open is empty.

### Takeaway

Compute the count arithmetically, then generate `start + i * step` on demand. Laziness buys `O(1)`
memory, and a clamped count keeps wrong-direction steps from becoming infinite loops.

## Create an Infinite Sequence Using a Generator

`Difficulty: Medium` `Probability: High`

### Problem

Write generators for unbounded sequences and the adapters that make them safe to consume:

- `naturals()` → `0, 1, 2, 3, ...` forever;
- `repeat(value)` → an infinite stream of one value;
- `cycle(iterable)` → repeats a finite iterable indefinitely;
- `take(iterable, count)` and `takeWhile(iterable, predicate)` → lazy, short-circuiting adapters.

The contract: an infinite generator is safe **only** when the consumer decides when to stop. Every
adapter must pull lazily, one value at a time, and must close the upstream iterator when it stops
early — `for...of` calls `iterator.return()` on `break`, which runs any `finally` in the generator.

### Examples

```text
const it = naturals();
it.next()                        // => { value: 0, done: false }
it.next()                        // => { value: 1, done: false }

[...take(naturals(), 5)]         // => [0, 1, 2, 3, 4]
[...takeWhile(naturals(), (n) => n < 3)]   // => [0, 1, 2]
[...take(cycle(["a", "b"]), 5)]  // => ["a", "b", "a", "b", "a"]
[...take(repeat(7), 3)]          // => [7, 7, 7]

let visited = 0;
for (const n of naturals()) { visited += 1; if (n >= 2) break; } // visited === 3; upstream closed

[...naturals()]                  // => hangs / RangeError — never materialise an infinite sequence
```

### Approach

A generator function with `while (true) yield ...` is an infinite *iterable* but a perfectly
well-behaved value: nothing runs until `.next()` is called, and each `.next()` runs only up to the
next `yield`. The generator's own frame holds the loop state (`n`, the array, the index), so memory
is `O(1)` — the sequence is never stored anywhere.

`take` is deliberately written as a **generator** rather than returning an array: that keeps it
lazy and composable (`take(cycle(take(inner, 3)), 5)`). Its `for...of` over the upstream iterator
does two jobs — pulls values and, on `break`, triggers `IteratorClose`, which calls the upstream
`.return()` and lets a `finally` block in the source run. That is the mechanism behind "cancel a
stream by breaking out of the loop".

`zip` shows the same pattern across several inputs: stop as soon as the shortest one is done.

### Implementation

```javascript
function* naturals() {
  let n = 0;
  while (true) yield n++; // state lives in the generator frame: O(1) memory
}

function* repeat(value) {
  while (true) yield value;
}

function* cycle(iterable) {
  while (true) {
    for (const value of iterable) yield value; // re-runs the iterable each lap
  }
}

function* take(iterable, count) {
  if (count <= 0) return;
  let taken = 0;
  for (const value of iterable) {
    yield value;                 // pull lazily, one at a time
    if (++taken >= count) break; // leaving the for...of closes the upstream iterator
  }
}

function* takeWhile(iterable, predicate) {
  for (const value of iterable) {
    if (!predicate(value)) return; // stops without yielding the failing value
    yield value;
  }
}
```

### Walkthrough

`[...take(naturals(), 3)]`:

1. Spread calls `take(...)[Symbol.iterator]()`. Because `take` is a generator, that returns the
   generator itself (already paused at the top of the body) — no work has run yet.
2. Spread's first `.next()` starts `take`'s body: `count = 3`, `taken = 0`, then `for...of` calls
   `naturals()[Symbol.iterator]()` and pulls `0`. `take` `yield`s `0`; `taken` becomes `1`; the
   consumer receives `{ value: 0, done: false }`.
3. The next two `.next()` calls repeat for `1` and `2`; on the third, `++taken === 3`, so `break`
   exits `take`'s `for...of`, which calls `naturals`'s `return()`.
4. Spread continues: `take` is finished, so `.next()` returns `{ value: undefined, done: true }`
   and the array is `[0, 1, 2]`.

The upstream `naturals` generator is now closed and will never produce `3` — memory and CPU stay
bounded no matter how long the infinite sequence could have run.

### Complexity

Time: `O(k)` for `k` consumed values, independent of how infinite the source is. Space: `O(1)`
for the generators plus `O(k)` for whatever the consumer stores. `zip`/`take` add no buffers.

### Edge Cases

- `take(x, 0)` or a negative count → no values; the `return` guard avoids touching the source.
- `[...naturals()]` or `Array.from(naturals())` never terminates and eventually throws
  `RangeError: Invalid array length`; infinite streams must be bounded by the consumer.
- `for...of` with `break` closes the generator via `return()`; without `break` the loop never ends.
- Generators are **single-shot**: `const g = naturals(); [...take(g, 2)]; [...take(g, 2)]` gives
  `[2, 3]`, not `[0, 1]` — call the *factory* for a fresh sequence.
- `cycle` of an empty iterable spins forever producing nothing; guard with a length check.
- `throw()` inside the loop propagates out through the generator and closes it.

### Interview Follow-ups

- **Implement `zip(...iterables)`** (stop at the shortest) and **`chain(...iterables)`** (exhaust
  each in turn) using the same pull-one-at-a-time shape.
- **Back-pressure / two-way communication:** `gen.next(value)` resumes the generator with `value`
  as the result of the paused `yield`, so a consumer can feed data per step — the basis of "push
  into a generator".
- **Async infinite sequences:** `async function*` + `for await...of` gives the same laziness for
  paginated APIs and sockets.
- **`yield*` delegation:** `yield* naturals()` forwards every `next`, `return`, and `throw` to the
  inner generator, so delegation preserves laziness and cleanup.

### Common Mistakes

- Materialising with `[...naturals()]`, `Array.from`, or `.forEach` — hangs or `RangeError`.
- Writing `take` to return an array, which forces the whole source to be consumed.
- Storing produced values in an array "just in case", defeating the `O(1)` memory benefit.
- Reusing a generator object instead of calling the factory function again for a fresh sequence.
- Assuming `break` does nothing to the producer; it calls `.return()`, which is how cancellation
  is implemented.

### Takeaway

`while (true) yield` is only unsafe at the point of materialisation. Generators make the sequence
lazy and `O(1)` in memory; adapters like `take`/`takeWhile` let the *consumer* decide when to stop
and automatically close the upstream through `IteratorClose`.

## Implement Fibonacci Using a Generator

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `fibonacci()` — a generator that yields the Fibonacci sequence `0, 1, 1, 2, 3, 5, ...`
indefinitely, one term per `.next()`. Then implement `nthFibonacci(n)` on top of it, and a
`fibonacciBig()` variant that stays exact past `Number.MAX_SAFE_INTEGER`.

- `fibonacci()` takes no arguments and remembers two numbers of state.
- `nthFibonacci(n)` returns the `n`th term with `n` 0-indexed (`nthFibonacci(0) === 0`), throwing
  `RangeError` for negative or non-integer `n`.
- The generator must be `O(1)` in memory: no array of previous terms, no memo table.
- `fibonacciBig()` yields `BigInt` values and must be exact for any `n`.

### Examples

```text
const it = fibonacci();
[it.next().value, it.next().value, it.next().value, it.next().value]  // => [0, 1, 1, 2]

[...take(fibonacci(), 10)]   // => [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]

nthFibonacci(0)              // => 0
nthFibonacci(1)              // => 1
nthFibonacci(10)             // => 55
nthFibonacci(78)             // => 8944394323791464  (last exact Number term)
nthFibonacci(-1)             // => RangeError
nthFibonacci(1.5)            // => RangeError

const big = fibonacciBig();
big.next().value             // => 0n
[...take(fibonacciBig(), 4)] // => [0n, 1n, 1n, 2n]
[...take(drop(fibonacciBig(), 90), 1)]  // => [2880067194370816120n] (exact where Number drifts)
```

### Approach

The generator carries exactly two variables, `prev` and `curr`. Each step yields `prev`, then
slides the window with the destructuring assignment `[prev, curr] = [curr, prev + curr]`. The
right-hand side is evaluated **before** either binding is written, so no temporary is needed —
this is the idiomatic swap-and-advance line.

`nthFibonacci` should drive the generator **manually**, not via `for...of`: you want to stop after
exactly `n + 1` calls and you want `O(1)` space, so `for (let i = 0; i < n; i += 1) it.next();` then
`it.next().value` is both the shortest and the most memory-frugal version. A `for...of` with a
counter also works but reads as if it might consume the whole (infinite) stream.

Note the value/laziness contrast that interviewers are probing: naive **recursive** Fibonacci is
exponential (`O(2^n)`) because it recomputes subtrees, memoised recursion is `O(n)` time and `O(n)`
space, and the generator is `O(n)` time and `O(1)` space. The generator wins on memory because it
is an iterative loop wearing a lazy interface.

### Implementation

```javascript
function* fibonacci() {
  let prev = 0;
  let curr = 1;
  while (true) {
    yield prev;
    [prev, curr] = [curr, prev + curr]; // RHS evaluated first: no temp variable
  }
}

function nthFibonacci(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError("nthFibonacci expects a non-negative integer");
  }
  const it = fibonacci();
  for (let i = 0; i < n; i += 1) it.next(); // discard the first n terms
  return it.next().value;                   // O(1) space, unlike an array or memo
}

function* fibonacciBig() {
  let prev = 0n;
  let curr = 1n;
  while (true) {
    yield prev;
    [prev, curr] = [curr, prev + curr];
  }
}

// Small helper so you can skip ahead without materialising: drop(iterable, n)
function* drop(iterable, count) {
  let dropped = 0;
  for (const value of iterable) {
    if (dropped < count) {
      dropped += 1;
      continue;
    }
    yield value;
  }
}
```

### Walkthrough

`nthFibonacci(5)`:

1. The guard passes; `fibonacci()` creates a paused generator with `prev = 0, curr = 1`.
2. The loop calls `it.next()` five times. Each call yields a term **and then advances the pair**,
   so the five discarded values are `0, 1, 1, 2, 3` (terms 0–4) and the generator is left ready to
   yield term 5.
3. `it.next().value` is the sixth pull: it yields `5` and moves `(prev, curr)` on to `(8, 13)`.
4. `nthFibonacci(5)` returns `5 === F(5)`, having never stored a previous term.

The generator was abandoned after that sixth `.next()` with no cleanup needed; when a generator is
garbage-collected mid-suspension, its frame is released.

### Complexity

Time: `O(n)` for the `n`th term (each `.next()` is `O(1)`), versus `O(2^n)` for naive recursion.
Space: `O(1)` — two numbers plus the generator frame, versus `O(n)` for an array or memo table.

### Edge Cases

- `n = 0` → `0`, `n = 1` → `1`; the loop skips zero iterations for `n = 0`.
- Negative, `NaN`, or fractional `n` → `RangeError` before touching the generator.
- **Number precision:** terms are exact only up to `F(78) = 8944394323791464`; `F(79)` exceeds
  `Number.MAX_SAFE_INTEGER` and silently rounds. Use `fibonacciBig()` there.
- **BigInt mixing:** `1n + 1` throws `TypeError`; keep every literal in the BigInt generator as
  `0n`/`1n`.
- Very large `n` (millions) is fine memory-wise but still `O(n)` time; `nthFibonacci` will not
  return instantly.
- Consumers may `break` out of `for...of` over the generator at any time; that is a feature.
- The generator is single-shot: `const g = fibonacci(); g.next().value` is `0`, and the next
  `.next()` continues from `1`; there is no reset — call `fibonacci()` again for a fresh stream.

### Interview Follow-ups

- **`yield*` a precomputed prefix:** `yield* [0, 1]` at the top of a variant delegates the first
  two terms and forwards `return`/`throw` into the array's iterator.
- **Memoised generator via two-way `.next(value)`:** have the caller inject a computed term
  (`it.next(34)`) so the generator can resume with a value it did not compute itself.
- **`fibonacciIterative(n)`** with two variables is the "no generator" answer; mention that it is
  the same loop, so pick generators only when you actually need laziness or an open-ended stream.
- **Parallel/fused Fibonacci** (returning pairs `[F(n), F(n+1)]`) to build fast-doubling in
  `O(log n)`; a nice "can you go faster?" follow-up.

### Common Mistakes

- Recomputing with recursion inside `nthFibonacci`, making it exponential for no reason.
- Writing `[prev, curr] = [prev + curr, prev]` (order bugs) or `curr = prev + curr; prev = curr;`
  which loses the old `prev`.
- Using a `for...of` counter that consumes one term too many, or forgetting that `for...of` over
  an infinite generator never finishes without a `break`.
- Returning `curr` instead of `prev`, an off-by-one that shows on `n = 0`.
- Ignoring the `Number.MAX_SAFE_INTEGER` boundary and claiming exactness for all `n`.

### Takeaway

Two variables and a `yield` give you the whole sequence in `O(1)` space. The generator turns the
classic iterative loop into a lazy stream, and the same code with `BigInt` literals stays exact —
the interesting part is the precision cliff at `F(79)`, not the loop.

## Implement Lazy Traversal of Nested Data

`Difficulty: Medium` `Probability: High`

### Problem

Implement `walk(value)` — a generator that lazily yields every **leaf** of a nested structure
depth-first, in document order. Arrays and plain objects are recursed into; everything else
(`string`, `number`, `boolean`, `null`, `undefined`, functions, and class instances you choose not
to descend) is a leaf.

Then implement `findLeaf(value, predicate)` on top of it. The contract that matters:

1. Traversal must be **lazy** — `findLeaf` may stop early and the generator must not have visited
   the rest of the tree.
2. Use `yield*` for delegation so `return()`, `throw()`, and two-way `next(value)` all forward into
   the recursive call.
3. Guard against **cycles** so a self-referential object does not recurse forever.
4. Preserve encounter order: array elements left to right, object properties with integer keys
   first, then string keys in insertion order (`Object.keys` order).

### Examples

```text
const tree = { a: [1, { b: 2 }], c: [3, 4] };
[...walk(tree)]                  // => [1, 2, 3, 4]

[...walk([1, [2, [3, [4]]]])]    // => [1, 2, 3, 4]
[...walk("ab")]                  // => ["ab"]   (strings are leaves, not char sequences)
[...walk({})]                    // => []
[...walk(42)]                    // => [42]

findLeaf(tree, (x) => x > 2)     // => 3   (stops as soon as 3 is found; 4 is never visited)

const cyclic = { name: "root" };
cyclic.self = cyclic;
[...walk(cyclic)]                // => ["root"]   (cycle detected, no infinite recursion)
```

### Approach

Recursion plus `yield*`. The generator inspects the current value:

- **Array** → `for (const item of value) yield* walk(item, seen);`
- **Non-null object** → same over `Object.values(value)`, after a cycle check.
- **Anything else** → `yield value;`

`yield*` is the whole trick: it delegates iteration to the inner generator, forwarding each
`next`, plus `return`/`throw`, so a `break` in the outer consumer unwinds the entire recursive
descent. Writing `for (const leaf of walk(item)) yield leaf;` instead would still be lazy but would
**not** forward `return()` into the inner generator, so cleanup in a deep level would be skipped.

Cycles need a `WeakSet` of **objects currently on the path**. Adding a node on entry and deleting
it on exit (in a `finally`) is the correct "ancestor" check: it prevents infinite recursion while
still allowing the same object to appear twice as siblings (shared, not cyclic). A simpler
"seen anything, ever" `WeakSet` is cheaper but silently drops shared subtrees — say which
semantics you chose.

Laziness is the payoff: `findLeaf` breaks out of `for...of` at the first match, so an early hit in
a huge tree costs `O(depth)` stack and no more work than the path to it.

### Implementation

```javascript
function* walk(value, ancestors = new WeakSet()) {
  if (Array.isArray(value)) {
    for (const item of value) yield* walk(item, ancestors); // delegate, stay lazy
    return;
  }

  if (value !== null && typeof value === "object") {
    if (ancestors.has(value)) return; // cycle: stop this branch
    ancestors.add(value);
    try {
      for (const key of Object.keys(value)) yield* walk(value[key], ancestors);
    } finally {
      ancestors.delete(value); // only ancestors count as cycles, not shared nodes
    }
    return;
  }

  yield value; // primitives, null, undefined, functions
}

function findLeaf(value, predicate) {
  for (const leaf of walk(value)) {
    if (predicate(leaf)) return leaf; // for...of closes the generator on `return`
  }
  return undefined;
}
```

### Walkthrough

`walk({ a: [1, { b: 2 }], c: [3, 4] })` spread:

1. The top-level object is not an array, is a non-null object, is not in `ancestors`, so it is
   added and its keys are walked: `"a"`, then `"c"`.
2. `walk(value.a)`: the array yields `yield* walk(1)` → leaf `1`, then `yield* walk({ b: 2 })` →
   object → `yield* walk(2)` → leaf `2`.
3. Back at the top, `walk(value.c)` yields leaf `3`, then leaf `4`.
4. Result `[1, 2, 3, 4]`, produced one value at a time; at no point is a flattened copy built.

`findLeaf(tree, (x) => x > 2)` pulls one leaf at a time: `1` fails, `2` fails, `3` passes and
`return 3` exits the `for...of`. That triggers `IteratorClose`, which calls `return()` on the outer
generator and unwinds every `yield*`, running the `finally` blocks that remove ancestors. Leaf `4`
is never produced.

For `cyclic`: `walk(cyclic)` adds the root, then `walk(cyclic.self)` sees the same object still in
`ancestors` and returns immediately, so only `"root"` is yielded.

### Complexity

Time: `O(v + e)` for `v` nodes and `e` edges, and `O(k)` when the consumer stops after `k` leaves.
Space: `O(d)` for the recursion/`yield*` chain of depth `d`, plus `O(d)` in the `WeakSet`; the
flattened output is never materialised.

### Edge Cases

- Empty array/object → yields nothing.
- `null` and `undefined` are leaves, not "no value" — `[...walk({ a: null })]` is `[null]`.
- Sparse arrays: `for...of` yields `undefined` for holes, so `[...walk([1, , 3])]` is `[1, undefined, 3]`.
- Strings are leaves by design; if you want characters, special-case `typeof value === "string"`.
- Keys with no value (`{ a: undefined }`) — decided by `Object.keys`, which includes `"a"`.
- `Map`/`Set`/`Date`/typed arrays are objects with no enumerable own keys, so `Object.keys` yields
  nothing and they become empty subtrees; special-case `Map`/`Set` with a `for...of` branch.
- Cycles are handled; **shared** subtrees are emitted once per reference (the `finally` removes the
  ancestor), which is usually what you want.
- Deep trees can overflow the call stack around 10k levels; an explicit stack (`while` + `for...of`)
  removes the depth limit at the cost of more code.
- Getter properties are evaluated by `value[key]`; a throwing getter propagates out of the generator.

### Interview Follow-ups

- **Depth-aware traversal:** `yield [leaf, depth]` and stop recursing past a max depth.
- **`flattenDeep` from `walk`:** `[...walk(input)]` is the eager version; explain the trade-off.
- **Breadth-first variant:** replace the implicit stack of recursion with a queue; iterator
  protocols do not care which order you emit.
- **Lazy path collection:** `yield path` (an array of keys) instead of the leaf, so the consumer
  knows where a match lives — build the path incrementally and copy on yield.

### Common Mistakes

- Rebuilding the output array inside `walk`, which destroys laziness.
- Using `for (const x of walk(v)) yield x` instead of `yield*`, which stops `return()`/`throw()`
  from propagating into the inner generator.
- Marking visited objects with an "ever seen" set, silently dropping shared subtrees.
- Forgetting `finally` around the ancestor removal, leaving stale entries after an early `break`.
- Treating strings as containers, so a word explodes into characters.

### Takeaway

`yield*` turns recursive descent into a lazy stream. Because `for...of` closes the generator on
`break`, an early match aborts the whole traversal — and an ancestor `WeakSet` makes cycles safe
without giving up shared nodes.

## Implement Chunk Processing Using Generators

`Difficulty: Hard` `Probability: Medium`

### Problem

Build a lazy pipeline that processes a potentially huge (or infinite) sequence in fixed-size
batches with bounded memory:

- `map(iterable, fn)` and `filter(iterable, predicate)` — lazy, one value at a time;
- `chunk(iterable, size)` — yields arrays of at most `size` items, a fresh array per batch;
- `accumulate()` — a generator that uses **two-way communication** so callers push values in with
  `gen.next(value)` and read the running total out of `value`.

Contract details: `chunk` must throw on a non-positive/integer `size`, must not emit an empty
trailing batch, must never reuse the yielded array, and must propagate `return()` so a `break`
stops pulling from the source. `accumulate` must document that the argument to the **first**
`.next()` is discarded.

### Examples

```text
[...chunk([1, 2, 3, 4, 5], 2)]        // => [[1, 2], [3, 4], [5]]
[...chunk([1, 2], 5)]                 // => [[1, 2]]
[...chunk([], 3)]                     // => []
[...chunk([1, 2], 0)]                 // => RangeError

const sum = accumulate();
sum.next()        // => { value: 0, done: false }   (first argument is ignored)
sum.next(5)       // => { value: 5, done: false }
sum.next(3)       // => { value: 8, done: false }

// Lazy pipeline: no intermediate arrays, memory bounded by `size`.
function* numbers() { let n = 0; while (true) yield n++; }
for (const batch of chunk(filter(map(numbers(), (n) => n * 2), (n) => n % 3 === 0), 1000)) {
  // consume `batch`, e.g. write it to a stream or a DB
  if (batch[0] >= 30) break; // closing `chunk` closes the whole chain upstream
}
```

### Approach

Every stage is a generator that owns one piece of state and yields as soon as it can. Composing
`map → filter → chunk` builds three suspended frames; a value travels through all of them before
the consumer receives a batch, and **no stage allocates an array of the whole input**. That is the
memory benefit: peak memory is the batch (`O(size)`), not the stream (`O(n)`).

Three details separate a correct `chunk` from a plausible one:

1. **Fresh batch array per yield.** After `yield batch`, reassign `batch = []` so a consumer that
   retains a batch does not watch it mutate on the next iteration.
2. **No empty trailing batch.** Only flush if `batch.length > 0`; otherwise `chunk([1, 2], 2)` would
   emit a spurious `[]`.
3. **`return()` propagation.** `break` in the consuming `for...of` calls `chunk`'s `return()`, whose
   `for...of` over the upstream closes *it* too — the standard `IteratorClose` chain, so an infinite
   source stops cleanly.

`accumulate` is there to show generators are **two-way**. A `yield` expression evaluates to the
argument passed to the *next* `.next(value)` call, so the consumer can push data into the paused
frame. The asymmetry to state out loud: the argument to the first `.next()` is dropped, because at
that moment the generator has not yet reached a `yield` to receive it. This is the same mechanism
`yield*` and transpiled `async/await` use internally.

### Implementation

```javascript
function* map(iterable, fn) {
  let index = 0;
  for (const value of iterable) yield fn(value, index++);
}

function* filter(iterable, predicate) {
  let index = 0;
  for (const value of iterable) {
    if (predicate(value, index++)) yield value;
  }
}

function* chunk(iterable, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("chunk size must be a positive integer");
  }

  let batch = [];
  for (const value of iterable) {
    batch.push(value);
    if (batch.length === size) {
      yield batch;   // hand the batch out...
      batch = [];    // ...then start a fresh array so it cannot mutate under the consumer
    }
  }
  if (batch.length > 0) yield batch; // never emit an empty trailing batch
}

function* accumulate() {
  let total = 0;
  while (true) {
    const received = yield total; // the value of this `yield` comes from the NEXT `next(v)`
    total += received ?? 0;
  }
}
```

### Walkthrough

`[...chunk([1, 2, 3, 4, 5], 2)]`:

1. Spread's first `.next()` starts `chunk`: `batch = []`, then `for...of` pulls `1` → `[1]`,
   pulls `2` → `[1, 2]`, hits `length === 2`, yields `[1, 2]` and resets `batch = []`.
2. Second `.next()` resumes after the `yield`: pulls `3` → `[3]`, `4` → `[3, 4]`, yields `[3, 4]`,
   resets.
3. Third `.next()` pulls `5` → `[5]`; the `for...of` ends and `batch.length > 0`, so it yields
   `[5]`.
4. Fourth `.next()` falls off the end of the function body →
   `{ value: undefined, done: true }`. Spread stops with `[[1, 2], [3, 4], [5]]`.

`accumulate()`, three calls:

1. `sum.next()` — no code has run; the body starts, `total = 0`, reaches `yield total`, and returns
   `{ value: 0, done: false }`. Its argument (`undefined`) would have been dropped anyway.
2. `sum.next(5)` — `5` becomes the value of the suspended `yield total` expression, so
   `received = 5`; `total = 5`; the loop yields `5`.
3. `sum.next(3)` — same path: `received = 3`, `total = 8`, yields `{ value: 8, done: false }`.

For the pipeline in Examples, `map`/`filter` emit individual numbers and `chunk` pulls until it has
`1000`, so peak allocation is one batch regardless of how long `numbers()` runs. `break` once
`batch[0] >= 30` closes `chunk`, which closes `filter`, which closes `map`, which closes
`numbers` — all through `return()`.

### Complexity

Time: `O(n)` total, `O(1)` amortised per value through the whole chain (each stage does constant work
per item). Space: `O(size)` for the current batch plus `O(stages)` generator frames — never `O(n)`.
`accumulate` is `O(1)` per `.next()`.

### Edge Cases

- **`size` validation throws lazily.** `chunk([1], 0)` returns a generator without throwing; the
  `RangeError` surfaces on the first `.next()`/spread. Call `[...chunk(x, 0)]` to observe it.
- `size` larger than the input → exactly one batch; `size === 1` → one batch per item.
- Empty input → no batches at all (not `[[]]`).
- A `break` inside the consuming loop closes the whole chain; without it, an infinite source runs
  forever.
- **Batch aliasing:** because a fresh array is created per yield, `const batches = [...chunk(...)]`
  holds distinct arrays; reusing one buffer would corrupt earlier batches.
- Mutating the yielded batch is safe for `chunk` (its `batch` reference was replaced), but the
  consumer's mutation is visible in the array it holds — copy if you need to keep the original.
- `chunk` over a string iterates code points, so `chunk("abc", 2)` → `[["a","b"],["c"]]`.
- Generator argument errors (`fn` not a function) surface on first pull, not on `map(x, 1)`.
- `accumulate.next()` with no prior argument inside a `for...of` is not possible; it is the
  push-style API, so it is driven with explicit `.next(v)`.

### Interview Follow-ups

- **Implement `flatten`/`window`/`pairwise` generators** on the same skeleton — most streaming
  operators are one small state variable plus `yield`.
- **`yield*` in a pipeline:** `yield* map(iterable, fn)` inside a wrapper forwards `return()` and
  `throw()` into the delegated generator, so composition keeps cleanup semantics.
- **Async version:** `async function*` batched with `for await...of` is the standard way to process
  paginated APIs or file streams; back-pressure is implicit because each pull is awaited.
- **Two-way generators as coroutines:** `.next(value)` also accepts an error path via
  `.throw(err)`, which is how libraries build push/pull bridges and redux-saga-style workers.

### Common Mistakes

- Reusing the same `batch` array and `batch.length = 0`, so every previously yielded batch mutates.
- Emitting a trailing empty batch on exact multiples of `size` (check `batch.length > 0`).
- Expecting `chunk(x, 0)` to throw at call time; generator bodies are lazy.
- Thinking the first `.next(value)` argument reaches the generator — it is discarded; only calls
  made *after* the first suspension are received.
- Building the pipeline with array methods (`map`/`filter`) mid-chain, which materialises the whole
  input and defeats the bounded-memory claim.

### Takeaway

Generators compose into a lazy pipeline: each stage holds one variable and yields as soon as it can,
so memory stays at `O(batch)` instead of `O(input)`. `IteratorClose` makes `break` a real
cancellation signal, and `yield` being an expression makes generators two-way — remember that only
`.next()` calls *after* the first suspension deliver a value into the frame.

