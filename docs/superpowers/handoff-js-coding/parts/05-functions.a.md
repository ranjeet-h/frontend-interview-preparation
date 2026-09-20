## Create a Counter Using Closures

`Difficulty: Easy` `Probability: Very High`

### Problem

Write `createCounter(start = 0)` that returns a function. Every call to that returned function
increments an internal count and returns the **new** value. The count is private: no caller can read
or write it except by invoking the function, and two counters made by two factory calls never share
state.

Contract:

- `createCounter()` starts at `0`; `createCounter(10)` starts at `10`.
- Each invocation adds `1` and returns the updated count (increment **then** return).
- The state lives in the closure, one binding per factory call.
- The returned function never reads `this`, so it works when detached, destructured, or passed as a
  callback.

### Examples

```text
const c = createCounter();
c() // => 1
c() // => 2
c() // => 3

const from10 = createCounter(10);
from10() // => 11
c()      // => 4    (still the first counter's state)

const [inc] = [createCounter(5)]; // detached: no `this`, so this still works
inc()    // => 6
```

### Approach

A closure is a function plus the environment it captured. `let count = start` creates one binding per
call to `createCounter`, and the returned function closes over that specific binding. State is
therefore per-instance and unreachable from outside — the cheapest encapsulation JavaScript has: no
class, no `this`, no private field.

Two decisions worth stating out loud, because interviews grade them:

1. **Increment then return, or return then increment?** Increment-first means the first call returns
   `1`; post-increment (`return count++`) means the first call returns `0`. Both are defensible, but
   you must document the choice — silently returning `0` reads as an off-by-one bug.
2. **Validate `start`.** `createCounter("5")` would otherwise compute `"5" + 1 === "51"`; a
   `TypeError` is more useful than string concatenation. Note that a default parameter only fires
   for `undefined`, so `createCounter(0)` and `createCounter(null)` are different inputs.

The invariant to hold on to: nothing outside the returned function can observe or mutate `count`.
That is exactly what memory-leak questions probe — the closure keeps `count` alive only while the
function object is reachable.

### Implementation

```javascript
function createCounter(start = 0) {
  if (typeof start !== "number" || Number.isNaN(start)) {
    throw new TypeError("createCounter expects a number");
  }

  let count = start; // one binding per call to createCounter

  return function counter() {
    count += 1;  // increment first ...
    return count; // ... then return the new value
  };
}
```

### Walkthrough

`const c = createCounter();`

1. `start` defaults to `0`; `count` is bound to `0`. The returned function closes over that binding.
2. `c()` runs `count += 1` → `1` and returns `1`. The environment keeps the value; the call stack does
   not.
3. `c()` again → `2`, then `3` on the next call.

Now `const from10 = createCounter(10)` creates a **second** lexical environment with its own
`count = 10` and returns a different function object. `from10()` → `11`; `c()` → `4`. The two
environments are independent, which is the property a module-level `let` would destroy.

Because the body never mentions `this`, `const [inc] = [createCounter(5)]; inc()` still returns `6`.
The same holds for `element.addEventListener("click", counter)` and `setTimeout(counter, 0)` — no
receiver required.

### Complexity

Time: `O(1)` per call — one addition and one closure read. Space: `O(1)` per counter for the captured
binding; each returned closure is a single object that retains its environment.

### Edge Cases

- `createCounter(0)` → first call returns `1`; `0` must not be treated as "missing" (default
  parameters only substitute for `undefined`).
- `createCounter(-5)` → `-4`, `-3`, ... — the counter is not clamped to non-negative values.
- `createCounter()` → starts at `0`.
- `createCounter(NaN)` / `createCounter("5")` → `TypeError`, instead of silently producing `NaN` or
  `"51"`.
- `createCounter(Infinity)` → stays `Infinity`; `Number.isFinite` could be used if that should be
  rejected.
- `Number.MAX_SAFE_INTEGER` → adding `1` no longer changes the value (float precision), so the
  counter stalls; an honest limit of numeric state.
- Two counters never interfere: state is per-closure, not per-module.
- Dropping the last reference to the function lets GC reclaim both the function and `count`.

### Interview Follow-ups

- **Add `step` and `reset`:** `createCounter(start, step)` returning `{ next, reset }`, where `reset`
  restores `start`. This is the bridge to the counter-object question.
- **Implement it as a class** with a `#count` private field, then compare: closure state costs one
  environment per instance, while private fields keep methods on the prototype (one copy).
- **Expose a read-only peek:** `peek()` returns the count without incrementing — state the contract
  explicitly, since silently mutating on read is a common API bug.
- **Why not a module-level `let`?** Module scope is shared by every consumer; a closure is per
  factory call, which is what "counter" means.
- **Is it thread-safe?** JavaScript run-to-completion means no other code interleaves inside one
  synchronous call, so no locking is needed on one agent. `Worker`s and `SharedArrayBuffer` are a
  genuinely concurrent, different problem.

### Common Mistakes

- Declaring `count` at module scope, so every "counter" shares one variable.
- `return count++` while documenting "returns the new value" — an off-by-one contract mismatch that
  unit tests catch immediately.
- Creating functions inside a `for` loop with `var`, capturing the loop variable instead of a
  per-iteration binding.
- Skipping validation so `createCounter("5")` yields `"51"`.
- Using `start || 0`, which silently turns a legitimate `0` (and `NaN`) into the default; prefer `??`
  when only `null`/`undefined` should fall back.

### Takeaway

A closure is a function plus the environment it captured. `let count` inside the factory gives each
counter private, GC-managed state with no `this` involved — the simplest encapsulation in the
language, and the base case every other closure question builds on.

## Create a Counter Object (`increment` / `decrement` / `reset` / `value`)

`Difficulty: Easy` `Probability: Very High`

### Problem

Write `createCounter(initial = 0, step = 1)` that returns an object exposing four methods:

- `increment(by = step)` — adds `by` to the count, returns the new count.
- `decrement(by = step)` — subtracts `by`, returns the new count.
- `reset()` — restores `initial`, returns it.
- `value()` — returns the current count **without** mutating anything.

The state is private to the returned object: no property holds the count, so it cannot be read or
written except through the methods. Any number of counters coexist without interfering.

### Examples

```text
const c = createCounter(10, 2);
c.increment()    // => 12
c.increment(5)   // => 17   (explicit step overrides the default)
c.decrement()    // => 15
c.value()        // => 15   (read-only: calling it twice returns 15, 15)
c.reset()        // => 10
c.value()        // => 10

const { increment } = createCounter(5); // methods must not rely on `this`
increment()      // => 6
```

### Approach

Two viable shapes; the interview is about choosing deliberately.

1. **Closure + object literal.** `let count = initial` in the factory, and each method is a function
   that closes over it. Simple, and the state is genuinely unreachable — there is no `this.count`
   property to poke at.
2. **Class with a private field** (`#count`). Also truly private, methods live on the prototype, and
   the class is instantiable with `new`. The trade-off is one prototype object and `instanceof`
   semantics.

I use the closure here because it composes with the first question and because the methods end up
receiver-independent: because they never read `this`, `const { increment } = createCounter(5)` keeps
working. That is the property most candidates break by writing `this.count += by`.

The remaining contract details are small but observable:

- Methods that change the count **return the new value**; `value()` returns the count and changes
  nothing. Return values make chaining and assertions painless.
- `initial` is captured, not re-read: `reset()` restores the value passed at construction even if the
  caller mutated their own variable afterwards. Capture by value for primitives.
- Validate `by` on each mutating call, not just `initial` — otherwise `increment("2")` turns the
  counter into a string-concatenation machine.

### Implementation

```javascript
function createCounter(initial = 0, step = 1) {
  let count = initial; // private: no property exposes this

  const assertNumber = (value, name) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new TypeError(`${name} must be a number`);
    }
    return value;
  };

  assertNumber(initial, "initial");
  assertNumber(step, "step");

  return {
    increment(by = step) {
      count += assertNumber(by, "by");
      return count;
    },
    decrement(by = step) {
      count -= assertNumber(by, "by");
      return count;
    },
    reset() {
      count = initial; // captured at construction, not re-read
      return count;
    },
    value() {
      return count; // pure read: no mutation, no side effects
    },
  };
}
```

### Walkthrough

`const c = createCounter(10, 2);`

1. `count` is bound to `10`; `step` is `2`. Four function objects are created, all closing over the
   same `count` binding — that sharing is what makes the methods operate on one counter.
2. `c.increment()` uses the default `by = step = 2` → `count = 12`, returns `12`.
3. `c.increment(5)` passes `by = 5` → `count = 17`; the default only applies to `undefined`.
4. `c.decrement()` → `count = 15`.
5. `c.value()` returns `15` and leaves `count` at `15`; calling it again still returns `15`.
6. `c.reset()` assigns the captured `initial` (`10`) and returns `10`.

For `createCounter(5)` destructured into `{ increment }`: the method's body never reads `this`, so the
missing receiver is irrelevant and the call returns `6`.

### Complexity

Time: `O(1)` per method call. Space: `O(1)` per counter for the captured state plus one object with
four methods. With a class, methods live once on the prototype instead of once per instance.

### Edge Cases

- `value()` called repeatedly → same number; forgetting this turns a getter into a mutator.
- `increment(0)` → returns the current count unchanged, and must not be mistaken for "no argument"
  (defaults fire only for `undefined`).
- `decrement` below zero → allowed; the counter is signed unless you explicitly clamp.
- `reset()` before any mutation → returns `initial`, not `0`, when `initial !== 0`.
- `increment("2")` / `increment(NaN)` → `TypeError`, not `NaN` or `"102"`.
- Destructured or `Reflect.apply`-ed methods → still work, because the body has no `this`.
- `Object.freeze(counter)` → freezes the methods, not the count; state remains mutable, which is
  usually the intent. Freezing the *state* would require a class with a setter that throws.
- Two counters → independent; nothing is shared except the immutable `initial`/`step` values.

### Interview Follow-ups

- **Chainable API:** return `this` from the mutators. Convenient (`c.increment().increment()`), but it
  breaks destructuring and arrow-wrapped usage — an explicit trade-off worth voicing.
- **Observability:** add `subscribe(listener)` so every change notifies subscribers; keep listener
  errors isolated so one throw does not abort the others.
- **Undo history:** push each previous value onto an array in the closure and add `undo()`. Name the
  memory cost of an unbounded history.
- **The class version:** `class Counter { #count; constructor(...) {} }` and compare memory/`this`
  semantics; note `#count` is not reachable even via `Reflect.get`.
- **Concurrency in the browser:** the count is per-closure, so two tabs or workers each get their own;
  shared state needs `localStorage` events or a `SharedArrayBuffer`.

### Common Mistakes

- Writing `this.count` in the methods, which breaks on destructuring and on any detached call.
- Returning `undefined` from `increment`, forcing callers to call `value()` for the new number.
- Re-reading a mutable outer variable in `reset` instead of capturing `initial`.
- Validating only at construction, so bad `by` values poison the count later.
- Making `value()` increment "for convenience" — a read with a side effect is a bug factory.

### Takeaway

Move the counter's state into a closure and expose only the four operations. Rejecting `this` makes the
methods safe to detach, and capturing `initial` at construction makes `reset` predictable.

## Implement `once` (Execute a Function Only Once)

`Difficulty: Easy` `Probability: Very High`

### Problem

Write `once(fn)` returning a wrapper that invokes `fn` **at most once**. The first call runs `fn` with
the wrapper's `this` and arguments and caches the return value; every later call returns that cached
value without running `fn` again.

Contract:

- The first invocation forwards `this` and all arguments (`Reflect.apply`).
- Later invocations **ignore** their arguments and receiver entirely.
- The cached value is returned exactly, including `undefined`, `null`, `NaN`, or `0`.
- If `fn` throws on the first call, the error propagates and the wrapper is already spent — the
  default contract is "at most one *attempt*".

### Examples

```text
let calls = 0;
const init = once((x) => { calls += 1; return x * 2; });

init(2)     // => 4
init(100)   // => 4      (arguments on later calls are ignored)
calls       // => 1

let flag;
const setFlag = once(() => { flag = true; }); // returns undefined
setFlag()   // => undefined
setFlag()   // => undefined   (still cached, not re-run)

const ctx = { factor: 10, scale: once(function (n) { return n * this.factor; }) };
ctx.scale(3) // => 30     (`this` is forwarded on the first call)

const load = once(async () => "data");
load() === load() // => true   (the promise itself is cached)
```

### Approach

`once` is memoization with no arguments in the key: a closure holding two variables — a boolean saying
whether the function has run, and the result. Two details separate a correct answer from a plausible
one.

1. **Track "called" with a boolean, not with the result.** `if (result !== undefined)` re-runs a
   function that legitimately returns `undefined` forever. Use a `called` flag, or return a sentinel
   object.
2. **Decide the throw semantics explicitly.** Marking `called = true` *before* invoking means a
   throwing first call permanently poisons the wrapper (later calls return `undefined`). Marking it
   *after* means a throw allows a retry, but a synchronous re-entrant call from inside `fn` would run
   `fn` a second time. Mark-before is the safer default: "at most once" is a stronger and more useful
   guarantee than "at most once per success".

Ordering and receiver follow the usual rules: `Reflect.apply(fn, this, args)` forwards both, so a
method-style first call keeps its receiver. Nothing here needs `bind`.

### Implementation

```javascript
function once(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("once expects a function");
  }

  let called = false; // a flag, not `result !== undefined`
  let result;

  return function onceWrapper(...args) {
    if (!called) {
      called = true; // marked BEFORE the call: a throw cannot allow a second run
      result = Reflect.apply(fn, this, args); // forwards `this` and arguments
    }
    return result; // cached, even when it is `undefined`
  };
}
```

The retry-friendly variant, for when a failed first attempt should be repeatable:

```javascript
function onceRetryable(fn) {
  let hasResult = false;
  let result;

  return function (...args) {
    if (hasResult) return result;
    result = Reflect.apply(fn, this, args); // throws before hasResult is set
    hasResult = true;
    return result;
  };
}
// Caveat: a synchronous re-entrant call from inside `fn` reaches `fn` a second time.
```

### Walkthrough

`const init = once((x) => { calls += 1; return x * 2; });`

1. `once` creates `called = false` and an empty `result`, then returns `onceWrapper`.
2. `init(2)`: `called` is `false`, so it becomes `true` and `Reflect.apply(fn, undefined, [2])` runs the
   callback → `calls === 1`, return `4`, stored in `result`. The wrapper returns `4`.
3. `init(100)`: `called` is `true`, so the whole `if` body is skipped — `fn` is never entered and the
   argument `100` is discarded. `result` is still `4`, so the call returns `4`.
4. `calls` is `1`, proving the single execution.

For the async example, step 2 stores a pending promise. Both `load()` calls return that same promise
object, so a dozen concurrent callers share **one** network request and one settlement — the reason
`once` shows up in production as request de-duplication.

### Complexity

Time: `O(1)` per call after the first; the first call costs whatever `fn` costs. Space: `O(1)` for the
flag, plus `O(1)` for the cached result (a reference — the value itself may be large).

### Edge Cases

- `fn` returns `undefined` → the next call must return `undefined` **without** re-running; only the
  boolean flag gets this right.
- `fn` returns `NaN`, `0`, `""`, or `null` → truthiness checks (`if (!result)`) would re-run; the flag
  does not.
- `fn` throws on the first call → with `once`, later calls return `undefined` and never retry; with
  `onceRetryable`, the next call tries again.
- Re-entrancy: `fn` calling the wrapper itself sees `called === true` (mark-before) and receives
  `undefined`; document it rather than being surprised by it.
- Async `fn` that **rejects** → the rejected promise is cached, so every later caller sees the same
  rejection. Clear the cache on rejection if retries should be possible.
- Different arguments on later calls → silently ignored; no per-argument caching (that is `memoize`).
- `this`: forwarded on the first call only; later calls ignore their receiver.
- Non-function argument → `TypeError` at wrap time, not at call time.

### Interview Follow-ups

- **`before(n)` / `after(n)`:** run `fn` at most `n` times. The bookkeeping is a counter; `once` is
  `before(2)`.
- **`once` for async retries:** wrap in an async function and `catch` the rejection, resetting the flag
  so a later call retries — a common "initialize once, retry on failure" utility.
- **`once` per object:** key a `WeakMap` by the argument so each element is initialized independently
  while the entries stay garbage-collectable.
- **Event listeners:** `element.addEventListener("click", once(handler))` self-limits, but the listener
  is never removed — call `removeEventListener` inside the wrapper to avoid the lingering reference.
- **Why cache the promise instead of the resolved value?** Caching the value still lets N concurrent
  callers start N requests; caching the promise de-duplicates the in-flight work itself.

### Common Mistakes

- Checking `result !== undefined` instead of a flag, so an `undefined`-returning function runs on every
  call.
- Forgetting `return`, so the cached value exists but is never handed back.
- Using an arrow for the wrapper and capturing the wrong `this` (or writing `.call` and dropping the
  arguments).
- Assuming a throw keeps the wrapper usable — with mark-before semantics it does not.
- Expecting per-argument caching (`once(fn)(1)` then `(2)` both returning the first result is the
  point).

### Takeaway

`once` is "one capture, one flag, one cached value". The flag (not the value) is what makes an
`undefined` result cacheable, and caching a promise is what turns `once` into request de-duplication.

## Implement Memoization

`Difficulty: Medium` `Probability: Very High`

### Problem

Write `memoize(fn)` returning a wrapper that caches results by the **first argument**. If the key has
been seen before, return the stored result; otherwise call `fn`, store what it returns, and return it.

Contract:

- The key is `args[0]`, compared with `Map` key equality (**SameValueZero**): `NaN` matches `NaN`, and
  `0` matches `-0`.
- The cache distinguishes "no entry" from "entry whose value is `undefined`", so `cache.has` — never
  `!== undefined`.
- `this` is forwarded to `fn` with `Reflect.apply`.
- `fn` is assumed pure: same key ⇒ same result. Memoizing an impure function caches a stale answer.

### Examples

```text
let calls = 0;
const square = memoize((n) => { calls += 1; return n * n; });

square(9)   // => 81   (computed)
square(9)   // => 81   (cached)
square(10)  // => 100  (computed)
calls       // => 2

const maybe = memoize((x) => undefined);
maybe(1)    // => undefined
maybe(1)    // => undefined   (still a cache hit)

const scaled = memoize(function (n) { return n * this.k; });
scaled.call({ k: 10 }, 2)  // => 20

// SameValueZero means these are one key:
const probe = memoize((x) => (Number.isNaN(x) ? "NaN" : x));
probe(NaN)  // => "NaN"
probe(NaN)  // => "NaN"  (hit, despite NaN !== NaN)
```

### Approach

A `Map` is the whole data structure: `O(1)` average lookup, keys of any type, and SameValueZero
equality. An object property bag (`cache[key]`) is the classic wrong answer — every key stringifies,
so `1` and `"1"` collide, `NaN` becomes `"NaN"`, objects become `"[object Object]"`, and
`__proto__`/`constructor` are inherited keys you must defend against.

Three contract points a naive version misses:

1. **`cache.has(key)` before `cache.get(key)`.** Otherwise a cached `undefined` is indistinguishable
   from a miss and `fn` re-runs forever.
2. **`this` must be captured per call.** `Reflect.apply(fn, this, args)` runs `fn` with the receiver
   the wrapper was called on. Note the sharp edge: with a single shared cache, the *same key* under
   two different receivers returns the first receiver's result — memoize is only sound for receiver-
   independent (pure-ish) functions, or the key must include the receiver.
3. **The cache is unbounded.** Each distinct key keeps its value alive forever. That is a memory leak
   waiting for user input; mention an LRU bound or a `WeakMap` for object keys.

Exposing `memoized.cache` (the `Map`) is a deliberate escape hatch: tests can inspect it, and callers
can `delete` a single key or `clear()` everything when the underlying data changes.

### Implementation

```javascript
function memoize(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("memoize expects a function");
  }

  const cache = new Map(); // SameValueZero keys: NaN works, 1 !== "1"

  function memoized(...args) {
    const key = args[0]; // single-argument contract; extra args are ignored

    if (cache.has(key)) {
      return cache.get(key); // `has` first: a cached `undefined` is a hit
    }

    const result = Reflect.apply(fn, this, args); // preserve the receiver
    cache.set(key, result);
    return result;
  }

  memoized.cache = cache; // invalidation escape hatch: delete(key) / clear()
  return memoized;
}
```

### Walkthrough

`const square = memoize((n) => { calls += 1; return n * n; });`

1. `memoize` creates `cache = new Map()` and returns `memoized`; the closure keeps the `Map` alive.
2. `square(9)`: `key = 9`; `cache.has(9)` is `false`, so `Reflect.apply(fn, undefined, [9])` runs the
   callback — `calls` becomes `1` — and `81` is stored at key `9`. Returns `81`.
3. `square(9)`: `cache.has(9)` is `true`, so `fn` is skipped entirely and `81` is returned. `calls` is
   still `1`.
4. `square(10)`: a miss; `calls` becomes `2`, and the key `10` is added. The cache now holds
   `9 → 81, 10 → 100`.

For `probe(NaN)`, `cache.has(NaN)` is `true` on the second call even though `NaN !== NaN`, because
`Map` uses SameValueZero rather than `===`.

### Complexity

Time: `O(1)` average per cached call (`O(1)` hash lookup) plus `O(T)` for the first call, where `T` is
`fn`'s cost. Space: `O(k)` for `k` distinct keys, **unbounded** — plus all the key objects kept alive.

### Edge Cases

- Cached `undefined` → returned forever via `has`; `get(key) !== undefined` would recompute every time.
- `NaN` as a key → one key (SameValueZero); `-0` and `0` are also the same key.
- `undefined` as a key → legal in a `Map`; `f()` and `f(undefined)` are indistinguishable under a
  first-arg key.
- Extra arguments → ignored, so `f(1, "a")` and `f(1, "b")` share one entry. Fix in the multi-argument
  variant.
- Impure `fn` (time, `Math.random`, DOM reads) → stale results; the wrapper cannot detect impurity.
- Mutable result → every caller receives the **same** object reference, so one caller's mutation is
  visible to the rest. Document it or return a clone.
- Different receivers with the same key → the first receiver's result wins; unsafe for methods that
  read `this`.
- `fn` throwing → nothing is cached, so the next call retries; often what you want.
- Object keys used as keys → stored by identity and held strongly, so the cache pins them; a `WeakMap`
  (next problem) fixes that.

### Interview Follow-ups

- **Multiple arguments:** key by the whole argument list without colliding; see the next problem.
- **Object arguments:** identity (`WeakMap`) versus value (`JSON.stringify`/stable key); see problem 6.
- **Bound the cache:** an LRU keyed by insertion order (`Map` preserves it) so memory stays `O(cap)`.
- **`WeakMap` keys:** when the only key is an object, a `WeakMap` lets the entry disappear with the
  object, avoiding the leak without an eviction policy.
- **Invalidation:** expose `cache.delete(key)`/`clear()`, or key on a version number that changes when
  data changes. "Memoization is a cache; every cache needs an invalidation story."
- **Async functions:** cache the promise to de-duplicate in-flight work, and evict on rejection so a
  failure is retriable.

### Common Mistakes

- `const key = JSON.stringify(args)` as a reflex — `undefined` disappears, key order matters, functions
  and symbols are dropped, and cyclic values throw.
- Using a plain object as the cache, so all numeric and object keys collide after stringification.
- Testing the cache with `cache.get(key) !== undefined` instead of `cache.has(key)`.
- Dropping `this` with `fn(...args)` and breaking method-style usage.
- Memorizing an impure function and shipping stale data.
- Never invalidating or bounding the cache, then calling it a "memory leak in production".

### Takeaway

Memoization is a `Map` from key to result plus a purity assumption. `has`-before-`get` handles
`undefined`, SameValueZero makes `NaN` work for free, and bounding the cache is the part that keeps it
production-safe.

## Implement Memoization Supporting Multiple Arguments

`Difficulty: Medium` `Probability: Very High`

### Problem

Extend `memoize(fn)` so the cache key is the **entire argument list**, not just the first argument.
`f(1, 2)`, `f(2, 1)`, `f(1)`, and `f(1, undefined)` must all be distinct keys, and any number of
arguments must work.

Contract:

- The key is the ordered argument list, compared with SameValueZero at each position.
- Arity matters: a 1-argument call and a 2-argument call ending in `undefined` are different keys.
- Object arguments are compared by **identity** in this version (the next problem adds value equality).
- `this` and the return value are forwarded as before.

### Examples

```text
let calls = 0;
const join = memoize((...xs) => { calls += 1; return xs.join("|"); });

join()             // => ""      (computed)
join()             // => ""      (cached)
join(1)            // => "1"     (computed)
join(1)            // => "1"     (cached)
join(1, undefined) // => "1|"    (computed: different arity, different path)
calls              // => 3

const add = memoize((a, b) => a + b);
add(1, 2) // => 3
add(2, 1) // => 3   (computed separately: order is part of the key)

const tag = memoize((obj) => Object.keys(obj).length);
const a = { x: 1 };
tag(a) // => 1  (computed)
tag(a) // => 1  (cached: same object)
tag({ x: 1 }) // => 1  (computed: different object, same shape)
```

Note the last pair: `tag(a)` twice is one computation, but `tag({ x: 1 })` with a fresh literal is a
different key. Identity is the honest default — it is `O(1)` and never wrong, just conservative.

### Approach

Two families, and the interview usually wants both named.

**1. Nested `Map`s (a trie).** Walk one level per argument: `root.children.get(args[0])` gives the node
for the first argument, and a leaf holds the result. No serialization, `O(arity)` per lookup, and each
level keeps SameValueZero semantics — so `NaN`, `-0`, and object identity all behave. Distinguishing
arity is free: `f(1)` stores at `root → (1)` while `f(1, undefined)` stores at `root → (1) → (undefined)`.
Represent "has a value" with an explicit flag so a cached `undefined` is a hit.

**2. A string key from the arguments.** `JSON.stringify(args)` is the one-liner everyone reaches for,
and it has real holes: `undefined` and functions vanish inside arrays (`JSON.stringify([1, undefined])`
is `"1"`), key order is insertion order so `{a:1,b:2}` and `{b:2,a:1}` differ, `NaN`/`Infinity` become
`null`, cyclic values throw, and a `BigInt` argument throws outright. A sentinel-joined key such as
`args.join("|")` is even worse: `["a|b"]` and `["a","b"]` collide. Fixing it means a type-tagged
canonical encoding — which is exactly the value-based approach in the next problem.

Cost of the trie: memory is proportional to the total number of argument nodes, not the number of
calls, and every level is a `Map` object. It also makes eviction awkward — there is no single key to
`delete`, so an LRU has to walk or maintain a parallel list of paths. If you need bounding more than
you need cheap lookup, prefer a canonical *string* key in a bounded `Map`: one key, one `delete`,
`Map` iteration order gives you LRU for free.

### Implementation

```javascript
function createNode() {
  // One node per argument level. `hasValue` distinguishes a missing
  // entry from a cached `undefined`; the root node holds the f() result.
  return { children: new Map(), hasValue: false, value: undefined };
}

function memoize(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("memoize expects a function");
  }

  const root = createNode();

  function memoized(...args) {
    let node = root;

    for (const arg of args) {
      let child = node.children.get(arg); // SameValueZero: NaN/-0/identity
      if (child === undefined) {
        child = createNode();
        node.children.set(arg, child);
      }
      node = child;
    }

    if (node.hasValue) return node.value; // arity-correct leaf lookup

    node.value = Reflect.apply(fn, this, args);
    node.hasValue = true;
    return node.value;
  }

  memoized.cache = root; // traversal-based: replace the root to clear
  return memoized;
}
```

### Walkthrough

`join(1, undefined)` after `join(1)` was cached:

1. `node = root`; loop over args `[1, undefined]`.
2. `arg = 1`: `root.children` already has a node from the earlier `join(1)` call, so `node` moves to it.
   No allocation.
3. `arg = undefined`: that node has no child for `undefined`, so a fresh node is created and stored
   under the key `undefined`; `node` moves to it.
4. `node.hasValue` is `false` — this is a *different* leaf from the one `join(1)` used — so `fn` runs,
   `calls` becomes `3`, and `"1|"` is stored at that leaf.

Contrast `join(1)`: the walk stops at the first node, whose `hasValue` is `true`, so it returns `"1"`
without entering `fn`. And `join()` stops immediately at `root`, whose own leaf flag holds `""` —
arity `0` needs no special case.

### Complexity

Time: `O(a)` per lookup for `a` arguments (one `Map` probe per level) plus `O(T)` on a miss. Space:
`O(total arguments across distinct calls)` nodes, each with its own `Map` — larger constant factor than
a flat `Map` of string keys, but no serialization cost and no key string retained.

### Edge Cases

- `f()` → the result lives on the root node's flag; no sentinel key needed.
- `f(1)` vs `f(1, undefined)` vs `f(undefined, 1)` → three distinct paths, which is correct.
- `NaN` and `-0` as arguments → handled by `Map` (SameValueZero), unlike `===` or a string key.
- Object/function arguments → keyed by identity; the node keeps a strong reference, so those objects
  are never collected (use `WeakMap` levels, or the value-based approach, when that matters).
- Array argument → identity too; `[1, 2]` twice is two keys unless it is the same array object.
- Argument order → significant; sorting arguments would silently change semantics.
- Cached `undefined` → `hasValue` makes it a hit; a `!== undefined` check would recompute forever.
- `fn` throws → no value is stored, so the next call retries.
- Unbounded growth → each new argument value adds a node permanently; add a cap or TTL for
  user-controlled inputs.
- Clearing → `memoized.cache = createNode()` replaces the tree in `O(1)`; per-key `delete` needs a walk.

### Interview Follow-ups

- **Value-based keys for object arguments:** the next problem — sort keys, tag types, handle cycles.
- **Bounded LRU:** keep a flat `Map` of canonical keys and re-insert on every hit; `Map` iteration
  order makes the oldest key the first entry.
- **Recursive memoization:** `const fib = memoize(function (n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); });`
  works only if the wrapper is bound to the outer name before the first call — a classic gotcha.
- **Async:** cache the promise at the leaf; evict on rejection.
- **Why not `JSON.stringify(args)`?** Name the four holes (`undefined`/functions dropped, key order,
  `NaN`→`null`, cycles/BigInt throw) rather than dismissing it — a tagged canonical encoding is the
  bridge to problem 6.

### Common Mistakes

- Keying with `args.join("|")`, where `["a|b"]` and `["a", "b"]` collide, and object arguments all
  become `"[object Object]"`.
- Treating `f(1)` and `f(1, undefined)` as the same key by ignoring trailing `undefined`s.
- Storing the result directly in `children` alongside child nodes, so a later longer call finds a
  primitive where it expects a node (the bug the node object exists to prevent).
- Forgetting `Reflect.apply` and losing `this`.
- Assuming object arguments compare by value, then reporting a stale result as a caching win.

### Takeaway

A multi-argument key is a path, not a string. One `Map` level per argument gives exact SameValueZero
semantics, correct arity handling, and no serialization — at the cost of a bigger, harder-to-evict cache.

## Implement Memoization with Object Arguments

`Difficulty: Hard` `Probability: High`

### Problem

Make memoization treat **structurally equal objects as the same key**: `f({ a: 1 })` and
`f({ a: 1 })` must hit the same cache entry even though the two literals are different references.

The decision to make explicit: *identity* or *value*?

- **Identity** (`WeakMap`) — `O(1)`, never wrong, and GC-friendly because the key is held weakly. But
  two equal literals miss.
- **Value** (canonical key) — equal structures hit, but you must define equality: key order, types,
  cycles, prototypes, and which built-ins are compared by content.

The answer is both: value-based as the default contract, identity as the escape hatch for hot paths and
mutable keys.

### Examples

```text
let calls = 0;
const area = memoizeDeep((rect) => { calls += 1; return rect.w * rect.h; });

area({ w: 2, h: 3 })  // => 6   (computed)
area({ w: 2, h: 3 })  // => 6   (cached: same structure, different object)
area({ h: 3, w: 2 })  // => 6   (cached: key order is normalized)
area({ w: 2, h: 4 })  // => 8   (computed)
calls                 // => 2

const type = memoizeDeep((v) => (Array.isArray(v) ? "array" : typeof v));
type({ a: 1 }) // => "object"  (computed)
type({ a: 1 }) // => "object"  (cached)
type({ b: 2 }) // => "object"  (computed: a different structure, even though `type` ignores the keys)
type([1, 2])   // => "array"   (computed: arrays are tagged, so no collision with objects)

canonicalKey({ a: 1, b: [2, { c: 3 }] }) // => '{"a":number:1,"b":[number:2,{"c":number:3}]}'
const cyc = { name: "x" }; cyc.self = cyc;
canonicalKey(cyc)                        // => '{"name":string:"x","self":ref:0}'
```

Note the third line: the cache is *more specific* than the function. `type` ignores the keys, but the
canonical key includes them, so it recomputes. Value-based caching can only ever over-key.

### Approach

You cannot hash an object without deciding what makes two objects equal, so define equality first.

**Option A — identity (the `WeakMap` path).** Keep the object as the key; the `WeakMap` gives `O(1)`
lookup, SameValueZero semantics for free, and — the underrated part — it does **not** keep the key
alive. When the caller drops the object, the entry disappears. The cost: equal-but-distinct objects
miss, which is exactly the case the question asks about.

**Option B — value (the canonical-key path).** Serialize the argument into a string that two
structurally equal values produce identically. The rules that make it correct:

- **Tag every type.** `number:1`, `string:"1"`, `boolean:true` — otherwise `1` and `"1"` collide.
  `String(value)` alone is not a hash.
- **Escape strings.** `"string:" + JSON.stringify(value)` means a string containing `,` or `"` cannot
  forge structure. Bare concatenation can: `{ a: "1,b:2" }` versus `{ a: 1, b: 2 }`.
- **Sort object keys.** `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are the same object to any sane caller;
  `Object.keys().sort()` makes the key order-insensitive.
- **Distinguish arity and tag containers.** `[1, 2]` must not encode like `{ 0: 1, 1: 2 }`, so arrays
  get `[...]`, sets `set{...}`, maps `map{...}`, dates `date:<ISO>`, regexes `regexp:<source/flags>`.
- **Handle cycles.** A `WeakMap` of objects to small integers turns a back-reference into `ref:0`
  instead of infinite recursion. Two graphs built the same way then hash the same.
- **Normalize numeric specials.** `Object.is(value, -0) ? "-0" : value` keeps `-0` distinct, and
  `NaN` needs its own token because `String(NaN)` is fine but must not merge with a string `"NaN"`.

Then length-prefix each encoded argument before joining, so `["ab", "c"]` and `["a", "bc"]` cannot
collide (`2:ab1:c` versus `1:a2:bc`). Length prefixes are the cheap, provably unambiguous join.

Honest limits to state: functions and symbols have no structural identity (encode a name, know that
distinct functions with the same name collide), class instances hash by own enumerable properties so
two different classes with the same shape collide, the prototype chain is ignored, and reading
enumerable getters while hashing executes side effects. Hashes are also `O(size of the argument)`, so
for a trivial `fn` the hash can cost more than the work it saves.

### Implementation

```javascript
// Encodes a value into a string such that equal structures encode equally.
function canonicalKey(value, seen = new WeakMap(), state = { id: 0 }) {
  if (value === null) return "null";

  const type = typeof value;
  if (type === "undefined") return "undefined";
  if (type === "number") {
    if (Number.isNaN(value)) return "number:NaN";
    return `number:${Object.is(value, -0) ? "-0" : value}`; // keep -0 distinct
  }
  if (type === "string") return `string:${JSON.stringify(value)}`; // escaped: no forging
  if (type === "boolean" || type === "bigint") return `${type}:${value}`;
  if (type === "symbol") return `symbol:${Symbol.keyFor(value) ?? value.description ?? ""}`;
  if (type === "function") return `function:${value.name}`; // no structural identity exists

  if (seen.has(value)) return `ref:${seen.get(value)}`; // cycle => back-reference
  seen.set(value, state.id++);

  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (value instanceof RegExp) return `regexp:${value.toString()}`;
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalKey(v, seen, state)).join(",")}]`;
  }
  if (value instanceof Set) {
    const items = [...value].map((v) => canonicalKey(v, seen, state)).sort();
    return `set{${items.join(",")}}`; // order-insensitive
  }
  if (value instanceof Map) {
    const entries = [...value].map(([k, v]) =>
      `${canonicalKey(k, seen, state)}=>${canonicalKey(v, seen, state)}`).sort();
    return `map{${entries.join(",")}}`; // order-insensitive
  }

  const keys = Object.keys(value).sort(); // own enumerable, order-insensitive
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalKey(value[k], seen, state)}`).join(",")}}`;
}

// Length-prefixed encoding: unambiguous, unlike args.join("|").
function encodeArgs(args) {
  return args.map((arg) => {
    const encoded = canonicalKey(arg);
    return `${encoded.length}:${encoded}`;
  }).join("");
}

function memoizeDeep(fn) {
  const cache = new Map();

  function memoized(...args) {
    const key = encodeArgs(args);
    if (cache.has(key)) return cache.get(key);

    const result = Reflect.apply(fn, this, args);
    cache.set(key, result);
    return result;
  }

  memoized.cache = cache;
  return memoized;
}
```

The identity alternative, for the hot path where the first argument is a long-lived object:

```javascript
function memoizeByReference(fn) {
  const cache = new WeakMap(); // object -> Map of encoded remaining args -> result

  return function (object, ...rest) {
    if (object === null || (typeof object !== "object" && typeof object !== "function")) {
      throw new TypeError("memoizeByReference expects an object first argument");
    }
    let results = cache.get(object);
    if (results === undefined) {
      results = new Map();
      cache.set(object, results); // entry dies with `object`: no leak
    }
    const key = rest.length === 0 ? "0:" : encodeArgs(rest);
    if (results.has(key)) return results.get(key);

    const value = Reflect.apply(fn, this, [object, ...rest]);
    results.set(key, value);
    return value;
  };
}
```

### Walkthrough

`area({ w: 2, h: 3 })`, then `area({ h: 3, w: 2 })`:

1. First call: `encodeArgs([{ w: 2, h: 3 }])` → `canonicalKey` tags the object, sorts `["h", "w"]`, and
   emits `{"h":number:3,"w":number:2}`; `encodeArgs` prepends its length → `27:{"h":number:3,"w":number:2}`.
   `cache.has(key)` is `false`, so `fn` runs, `calls` becomes `1`, and `6` is stored under that key.
2. Second call with a **different object**: `Object.keys({ h: 3, w: 2 }).sort()` yields `["h", "w"]`
   again, so the encoding is byte-for-byte identical. `cache.has(key)` is `true` → returns `6`
   immediately and `calls` stays `1`.

For the cycle example, `canonicalKey(cyc)`: the root object gets id `0` and `seen.set(cyc, 0)` happens
*before* its properties are visited, so when `self` is reached, `seen.has(cyc)` is true and it emits
`ref:0`. Recursion terminates, and a second, identically-shaped cyclic object produces the same string.

### Complexity

Time: `O(S)` per call to hash `S` bytes of argument structure, plus `O(1)` average `Map` lookup and
`O(T)` on a miss. Space: `O(k · S)` for `k` distinct keys — the full canonical string is retained as
the cache key, which `memoizeByReference` avoids.

### Edge Cases

- Key order → normalized by `Object.keys().sort()`, so `{b:2,a:1}` hits `{a:1,b:2}`.
- Type confusion → `1`/`"1"`/`true` are separate keys because every encoding is type-tagged.
- `NaN`, `-0`, `Infinity` → distinct tokens; `-0` does not collide with `0`.
- Cycles → `ref:<id>`; without the `seen` map, the walk recurses until the stack overflows.
- Sparse arrays → holes read as `undefined` and encode as `undefined`, which merges `[1, , 3]` with
  `[1, undefined, 3]`; a known, stated approximation.
- `Map`/`Set` → order-insensitive via sorted entries, but nested cycles inside them can assign ids in
  a different order for the same logical contents — treat that as best-effort.
- Getters → invoked by `Object.keys`/property reads while hashing; observable side effects.
- Symbols/functions → encoded by description/name, so two distinct functions named `add` collide.
- Prototypes and non-enumerable properties → ignored; `Object.create(null)` objects and class
  instances hash the same as plain objects of the same shape.
- Big inputs → hashing cost can exceed `fn`'s cost; measure before memoizing cheap functions.
- Mutation → mutating a key object after it was cached produces a *new* key, so the stale entry is
  orphaned but still retained.

### Interview Follow-ups

- **Hybrid:** try identity first (`WeakMap`), fall back to the canonical string on a miss. Best of both,
  at the price of two lookups.
- **Bound the cache:** store canonical keys in an LRU `Map` and re-insert on hit; the first key in
  iteration order is the oldest.
- **Hash the key:** feed the canonical string through a fast non-cryptographic hash (FNV-1a) to keep
  keys short, accepting collisions as a documented risk.
- **Skip hashing deep objects:** use a caller-supplied `resolver(...args)` returning a key, which is
  how production libraries stay fast.
- **Async:** hash the arguments, cache the promise, and evict on rejection.
- **Production:** `fast-json-stable-stringify` for canonical keys and an LRU library; say so in one
  line, then be ready to explain the encoder above.

### Common Mistakes

- `JSON.stringify(args)` under the delusion that it is canonical: key order is not sorted,
  `undefined`/functions disappear, `NaN` becomes `null`, and cycles throw.
- Concatenating without type tags or escaping, so `{ a: 1 }` and `{ a: "1" }` collide.
- Joining encoded arguments with a bare delimiter, letting `["ab","c"]` collide with `["a","bc"]`.
- No cycle handling, then blaming the input for a stack overflow.
- Using a value-keyed cache for objects the caller mutates, so every mutation misses forever.
- Hashing on every call but never noticing the hash costs more than `fn` for small inputs.

### Takeaway

Value-based memoization *is* a canonicalization problem: tag types, escape strings, sort keys, tag
containers, and break cycles — then length-prefix the join. Identity (`WeakMap`) is the correct default
when keys are long-lived objects and structural equality is not required.

## Implement Memoization with Cache Expiry (TTL)

`Difficulty: Medium` `Probability: High`

### Problem

Write `memoizeWithTTL(fn, ttlMs)` that caches results but treats each entry as **stale after `ttl`
milliseconds**. A hit returns the cached value only while it is fresh; once expired, the entry is
discarded and `fn` runs again.

Contract:

- TTL is measured from **insertion** (write time), not from the last access. State that; "sliding"
  expiry is a variant, not the default.
- Freshness is checked lazily, on read: `expiresAt > Date.now()`.
- Only successful results are cached; a throw writes nothing, so the next call retries.
- Expose cache control (`clear`, `delete`, `size`) — a cache without an invalidation story is a bug.
- `ttl = Infinity` behaves like the unbounded memoize; `ttl = 0` should expire almost immediately.

### Examples

```text
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let calls = 0;
const slowSquare = memoizeWithTTL((n) => { calls += 1; return n * n; }, 100);

slowSquare(4) // => 16   (computed)
slowSquare(4) // => 16   (fresh hit)
calls         // => 1

await sleep(120);
slowSquare(4) // => 16   (expired: recomputed)
calls         // => 2

slowSquare.size()      // => 1
slowSquare.delete(4)   // => true
slowSquare.size()      // => 0
slowSquare.clear()     // => undefined
```

### Approach

Store an **entry object**, not the bare value: `{ value, expiresAt }`. Two reasons.

1. `cache.get(key)` returning `undefined` can then only mean "missing", so caching an `undefined`
   result still works. (The alternative is a `has` check plus a separate timestamp map — more state.)
2. The timestamp travels with the value, so eviction is a single `delete`.

Read path: look up the entry; if it exists and `entry.expiresAt > now`, return `entry.value`; if it
exists and is stale, `delete` it and fall through to a recompute. That is **lazy eviction** — cheap and
correct, but expired entries that are never requested again still occupy memory, so pair it with one of:

- a **periodic sweep** (`setInterval` walking the `Map`, clearing dead entries) — remember to hold the
  timer id and `dispose()`/`unref()` it, or the process (and the cache) never dies;
- a **size-triggered sweep**, e.g. sweep when `cache.size` crosses a threshold, which avoids timers
  entirely and is friendlier to tests.

Time source: `Date.now()` is wall-clock and shared across tabs, which matches "cache this API response
for 30 seconds". `performance.now()` is monotonic (immune to clock adjustments) but per-document, so
it cannot be compared across contexts. Use `Date.now()` here and say why.

Write the entry **after** `fn` returns — memoizing a throw would pin a failure, and callers would keep
receiving an error whose cause has been fixed.

### Implementation

```javascript
function memoizeWithTTL(fn, ttlMs) {
  if (typeof fn !== "function") {
    throw new TypeError("memoizeWithTTL expects a function");
  }
  if (typeof ttlMs !== "number" || Number.isNaN(ttlMs) || ttlMs < 0) {
    throw new TypeError("ttlMs must be a non-negative number");
  }

  const cache = new Map(); // key -> { value, expiresAt }

  function memoized(...args) {
    const key = encodeArgs(args);          // canonical, from the previous problem
    const entry = cache.get(key);
    const now = Date.now();

    if (entry !== undefined) {
      if (entry.expiresAt > now) return entry.value; // fresh hit
      cache.delete(key);                             // stale: lazy eviction
    }

    const value = Reflect.apply(fn, this, args);     // throws write nothing
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  memoized.cache = cache; // exposed for the sweeper and for tests
  memoized.size = () => cache.size;
  memoized.delete = (...args) => cache.delete(encodeArgs(args));
  memoized.clear = () => cache.clear();
  return memoized;
}

// Optional: actively reclaim stale entries instead of waiting for a re-read.
function withSweeper(memoized, intervalMs) {
  const timer = setInterval(() => {
    const now = Date.now();
    // Deleting from a Map during iteration is safe: removed entries are skipped.
    for (const [key, entry] of memoized.cache) {
      if (entry.expiresAt <= now) memoized.cache.delete(key);
    }
  }, intervalMs);
  timer.unref?.(); // Node: do not keep the process alive just for the sweep
  return () => clearInterval(timer); // caller owns disposal
}
```

### Walkthrough

`memoizeWithTTL(fn, 100)` then `slowSquare(4)` at `t = 0`, `t = 20`, and `t = 120` (all `Date.now()`
values):

1. `t = 0`: `cache.get(key)` is `undefined`, so `fn(4)` runs (`calls === 1`) and the entry
   `{ value: 16, expiresAt: 100 }` is stored. Returns `16`.
2. `t = 20`: the entry exists and `100 > 20`, so the fresh hit returns `16` without calling `fn`.
3. `t = 120`: the entry exists but `100 > 120` is false, so it is deleted and `fn` runs again —
   `calls === 2` — and a new entry `{ value: 16, expiresAt: 220 }` is written.
4. `slowSquare.delete(4)` recomputes the same canonical key and removes the entry, returning `true`;
   `size()` is now `0`.

The `fn`-throws path is worth tracing too: `Reflect.apply` propagates the error before `cache.set`
runs, so nothing is stored and the next call retries rather than replaying a stale failure.

### Complexity

Time: `O(H)` to hash the arguments plus `O(1)` average per lookup; a miss adds `O(T)`. Space: `O(k)`
for `k` live entries — bounded by the TTL only if something actually evicts, which is why the lazy
`delete` matters.

### Edge Cases

- `ttl = 0` → `expiresAt === now`, so an entry read in a *later* millisecond is stale; a read within
  the same millisecond can still hit, because `Date.now()` has millisecond granularity. Do not promise
  "never caches" for `ttl = 0`.
- `ttl = Infinity` → never expires; equivalent to plain memoization with an entry wrapper.
- Negative or `NaN` TTL → throws at construction instead of silently caching forever or never.
- Cached `undefined` → the entry object is present, so it is a hit; only `cache.get` returning
  `undefined` means missing.
- `fn` throws → nothing cached; the next call retries.
- In-flight async work → for promises, cache the entry immediately with the pending promise; a TTL
  applies to the promise, and a rejection should `delete` the entry so callers can retry.
- Stale-while-revalidate → returning an expired value while refreshing in the background needs a
  second `Map` of in-flight refreshes; mention it as the production extension.
- Clock changes → `Date.now()` is wall-clock; a manual system time change can expire entries early or
  late. `performance.now()` is monotonic but per-document.
- Long-lived pages → lazy eviction only frees entries that are re-requested; without the sweeper, a
  function called once per unique key leaks one entry per key forever.
- Sweeper lifecycle → an un-disposed `setInterval` keeps the closure (and the cache) alive; always
  return a disposer and `unref()` where available.

### Interview Follow-ups

- **Sliding expiration:** refresh `expiresAt` on every hit. One line, but it changes "cache for 30s
  after a write" into "cache for 30s after the last read" — different semantics, state which you built.
- **Per-key TTL:** let `ttl` be a function `(value, args) => ms`, e.g. short TTL for volatile data and
  long for immutable records.
- **Bound + expire:** combine an LRU capacity with the TTL so memory is capped even when the TTL is
  large.
- **Async version:** cache the promise, apply the TTL to the entry, and evict on rejection — the
  standard "refresh an access token" pattern.
- **Why not `WeakMap`?** TTL needs iteration to sweep, and `WeakMap` is not iterable; a TTL cache must
  be a `Map` (accepting strong keys) or keep its own list of keys.

### Common Mistakes

- Storing the timestamp in a parallel `Map`, which doubles the bookkeeping and desynchronises.
- Writing the entry before calling `fn`, caching a throw.
- Sweeping with `memoized.delete(key)` on the *canonical* key, so the raw key gets hashed a second time
  and never matches.
- Leaving the sweep interval registered after the cache is no longer used — a timer leak that keeps
  the whole closure alive.
- Comparing `entry.expiresAt >= Date.now()` (off by one millisecond) or using `>`/`>=` inconsistently
  between the read path and the sweeper.
- Assuming TTL fixes unbounded growth; it only expires entries, it does not cap them.

### Takeaway

TTL memoization is an entry object — `{ value, expiresAt }` — plus a freshness check on read and lazy
eviction. The timestamp must travel with the value, and any background sweeper you add becomes a
lifecycle you have to dispose.

## Implement Currying

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `curry(fn)` so a multi-parameter function can be called one argument at a
time: `curriedSum(1)(2)(3)` returns `6`. Collect arguments across calls until the
original function's **arity** (`fn.length`) is reached, then invoke. Extra arguments
beyond arity are passed through; fewer keep returning a collector. Rest-parameter
functions have `length 0` — decide the contract (invoke immediately) and state it.

### Examples

```text
const sum3 = curry((a, b, c) => a + b + c);
sum3(1)(2)(3)      // => 6
sum3(1, 2)(3)      // => 6 (grouped calls work too)
sum3(1)(2, 3, 4)   // => 6 (extras flow to fn)
const add = curry((a, b) => a + b);
add(1)             // => [Function] (arity unmet: a collector, not a value)
add(1)(2)          // => 3
```

### Approach

Each call appends its arguments to the collected list and counts: if the total reaches
`fn.length`, invoke `fn.apply(this, collected)`; otherwise return a new collector
holding the longer list. The collector must be a fresh closure per step so branches
don't interfere (`const f = curried(1); f(2); f(3)` calls `fn` twice with different
tails — shared mutable state would corrupt this). `this` is forwarded from the final
call, which is where invocation actually happens.

`fn.length` counts parameters before the first default/rest one, so `(a, b = 1) =>
...` has length 1 — name this explicitly, because it surprises people.

### Implementation

```javascript
function curry(fn, arity = fn.length) {
  if (typeof fn !== "function") throw new TypeError("curry expects a function");

  function collector(collected) {
    return function (...args) {
      const all = [...collected, ...args];
      if (all.length >= arity) {
        return fn.apply(this, all); // arity met: invoke with everything
      }
      return collector(all); // fresh closure: branches stay independent
    };
  }

  // Arity 0 (rest params): nothing to collect, but keep the call shape uniform.
  if (arity < 1) {
    return function (...args) {
      return fn.apply(this, args);
    };
  }
  return collector([]);
}
```

### Walkthrough

`sum3(1, 2)(3)` with `arity = 3`:

1. `sum3(1, 2)` → `all = [1, 2]`, length 2 < 3 → returns `collector([1, 2])`.
2. That collector called with `(3)` → `all = [1, 2, 3]`, length 3 ≥ 3 → invokes
   `fn.apply(this, [1, 2, 3])` → `6`. // => 6

Branching stays safe: `const f = sum3(1)` gives `collector([1])`; `f(2)` and `f(3)`
each build their own `all` array, so neither sees the other's arguments.

### Complexity

Time: `O(calls)` closure allocations plus the underlying `fn` cost; each step copies
its argument list (`O(collected)`), which is negligible at interview arities. Space:
`O(arity)` retained arguments per open branch.

### Edge Cases

- Arity met exactly, exceeded (extras pass through), or never met (returns collectors).
- `fn.length` ignores post-default params: `(a, b = 1, c)` has length 1 — currying it
  invokes after one argument, with `b` defaulting.
- Rest-only functions (`length 0`) invoke on the first call.
- `this` comes from the final invocation call, not the intermediate collectors.
- Methods: `curry(obj.method)` detached from `obj` loses the receiver unless bound —
  same rule as any detached method.

### Interview Follow-ups

- **Infinite currying** (`sum(1)(2)(3)(4)()`): terminate on zero-arg call instead of
  arity — the next problem.
- **Mixed currying** (`sum(1, 2)(3)(4, 5)()`): already supported — every step takes
  any positive number of args.
- **Placeholders** (`curry(fn)(_, 2)(1)`): track holes by position, fill left to right.

### Common Mistakes

- Mutating one shared `args` array across branches instead of copying per step.
- Comparing with `=== arity`, which rejects grouped calls like `sum3(1, 2)(3)`.
- Ignoring `this` (using `fn(...all)`), breaking curried methods.
- Assuming `fn.length` equals "number of parameters" for defaulted/rest signatures.
- Invoking eagerly on the first call instead of waiting for arity.

### Takeaway

Currying is arity-counted collection: append args per call, invoke with `apply` when
the count reaches `fn.length`, and keep every intermediate step an independent closure.
