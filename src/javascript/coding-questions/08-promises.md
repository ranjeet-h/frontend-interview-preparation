# Promises

Promises are a state machine plus a queue, and every combinator is a variation on ordering and settlement. This page implements the core class and then the real-world helpers interviews actually ask for: `all`/`allSettled`/`race`/`any`, promisify, retry with backoff, timeouts, concurrency limits, deduplication, caching, and polling.

## Implement a Basic Promise-Like Class

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `MyPromise`, a minimal promise with the observable contract of a native one. The
deliverable is the state machine and its scheduling rules, not a full spec polyfill.

Constructor: `new MyPromise(executor)` where `executor(resolve, reject)` is called
**synchronously**. `then(onFulfilled, onRejected)` returns a **new** `MyPromise`. Also provide
`catch(onRejected)`.

The contract:

- Three states: **pending**, **fulfilled**, **rejected**. Transitions are one-way and happen
  **exactly once**; later `resolve`/`reject` calls are ignored. `resolve` and `reject` share one
  "already resolved" flag, so `resolve(x); reject(y)` keeps `x`.
- A throw inside the executor is a **rejection**, not a thrown error.
- Handlers are **never** called during settlement; they run in a later microtask, via
  `queueMicrotask`.
- `then` always returns a new promise. Missing/non-function handlers **pass through** the parent's
  value or reason instead of swallowing it.
- If a handler returns a value, the child fulfils with it; if it throws, the child rejects.
- **Thenable assimilation:** resolving with any object that has a callable `then` adopts that
  thenable's eventual state (via `then.call(thenable, resolve, reject)`); a thenable that resolves
  with another thenable is assimilated again.
- Resolving a promise with **itself** rejects with `TypeError`.

Honest framing: this is a **teaching implementation**. A production promise additionally
implements species-aware subclassing, iterator closing in combinators, unhandled-rejection
reporting, `finally`/`Symbol.toStringTag`, and exact host job ordering (native promise jobs are
scheduled on the engine's promise queue, which is not always interchangeable with
`queueMicrotask`).

### Examples

```text
const p = new MyPromise((resolve) => resolve(1));
p.then((v) => v + 1).then((v) => console.log(v)); // logs 2, asynchronously

new MyPromise((_, reject) => reject(new Error("nope")))
  .catch((e) => e.message);                        // => MyPromise fulfilled with "nope"

new MyPromise((resolve) => setTimeout(() => resolve("late"), 10))
  .then((v) => v.toUpperCase());                   // => MyPromise fulfilled with "LATE"

// Missing handler passes the value through rather than swallowing it:
new MyPromise((resolve) => resolve(7)).then(undefined, () => 0).then((v) => v); // => 7

// Thenable assimilation:
new MyPromise((resolve) => resolve({ then: (res) => res(42) })).then((v) => v); // => 42

// One-way settlement: the first call wins.
new MyPromise((resolve, reject) => { resolve("first"); reject("second"); })
  .then((v) => v);                                 // => "first"
```

### Approach

Model the promise as three fields: `state`, `value` (the fulfilment value *or* the rejection
reason — a settled promise has exactly one, never both), and a `handlers` array of queued
reactions. Each reaction carries the caller's two callbacks plus the **child** promise's own
`resolve`/`reject`, so the child can be settled from the parent's reaction.

The non-obvious contracts, and how a naive version misses them:

1. **One-shot settlement.** A boolean `used` closes over both `resolve` and `reject`; the first
   call flips it, so the pair is at-most-once even though the promise is still pending while a
   thenable is being assimilated. `#fulfill`/`#reject` additionally guard on `state !== PENDING`,
   making settlement one-way.
2. **Async reactions.** Settlement itself is synchronous (the state flips immediately), but every
   reaction is scheduled with `queueMicrotask`. Calling `queueMicrotask(() => this.#runReaction(h))`
   is the whole "callbacks are always async" rule. `setTimeout` would work but would be a
   macrotask and change interleaving with other microtasks.
3. **Child chaining.** Because `then` builds the child with `new MyPromise((resolve, reject) => ...)`,
   the executor's `resolve`/`reject` are exactly the ones a reaction needs. A handler's return
   value goes to `resolve(...)`, which re-runs thenable assimilation; a throw goes to `reject(...)`.
4. **Pass-through.** A non-function handler must not become the child's value. When the handler is
   missing, forward the parent's value/reason to the child directly, preserving both fulfilment
   and rejection.
5. **Thenable assimilation.** `resolve(value)` checks `value.then` (a getter may throw — that is a
   rejection), and if it is callable, adopts the thenable in a **fresh microtask job** with its own
   one-shot pair. That job boundary is required: the executor must not be re-entered synchronously,
   and a thenable that calls back later must not race the original settlement.

### Implementation

```javascript
const PENDING = "pending";
const FULFILLED = "fulfilled";
const REJECTED = "rejected";

class MyPromise {
  #state = PENDING;
  #value = undefined;   // fulfilment value OR rejection reason
  #handlers = [];       // reactions queued while pending

  constructor(executor) {
    if (typeof executor !== "function") {
      throw new TypeError("MyPromise resolver is not a function");
    }

    // resolve/reject are at-most-once AS A PAIR ([[AlreadyResolved]]).
    let used = false;
    const resolve = (value) => {
      if (used) return;
      used = true;
      this.#resolve(value);
    };
    const reject = (reason) => {
      if (used) return;
      used = true;
      this.#reject(reason);
    };

    try {
      executor(resolve, reject); // runs synchronously
    } catch (error) {
      reject(error); // a throw inside the executor is a rejection
    }
  }

  #resolve(value) {
    if (value === this) {
      this.#reject(new TypeError("Chaining cycle detected for promise"));
      return;
    }

    let then;
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      try {
        then = value.then; // a throwing getter becomes a rejection
      } catch (error) {
        this.#reject(error);
        return;
      }
    }

    if (typeof then !== "function") {
      this.#fulfill(value); // plain value: settle now
      return;
    }

    // Thenable: adopt its state later, with a fresh one-shot pair.
    queueMicrotask(() => {
      let used = false;
      const resolve = (v) => { if (!used) { used = true; this.#resolve(v); } };
      const reject = (r) => { if (!used) { used = true; this.#reject(r); } };
      try {
        then.call(value, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  #fulfill(value) {
    if (this.#state !== PENDING) return;
    this.#state = FULFILLED;
    this.#value = value;
    this.#flush();
  }

  #reject(reason) {
    if (this.#state !== PENDING) return;
    this.#state = REJECTED;
    this.#value = reason;
    this.#flush();
  }

  #flush() {
    const handlers = this.#handlers;
    this.#handlers = [];
    for (const handler of handlers) {
      queueMicrotask(() => this.#runReaction(handler)); // never sync
    }
  }

  #runReaction({ onFulfilled, onRejected, resolve, reject }) {
    const handler = this.#state === FULFILLED ? onFulfilled : onRejected;
    try {
      if (typeof handler !== "function") {
        // Missing handler: pass the parent's outcome through.
        (this.#state === FULFILLED ? resolve : reject)(this.#value);
      } else {
        resolve(handler(this.#value)); // returned thenable is assimilated
      }
    } catch (error) {
      reject(error);
    }
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const reaction = { onFulfilled, onRejected, resolve, reject };
      if (this.#state === PENDING) {
        this.#handlers.push(reaction);
      } else {
        queueMicrotask(() => this.#runReaction(reaction)); // already settled
      }
    });
  }

  catch(onRejected) {
    return this.then(undefined, onRejected);
  }
}
```

### Walkthrough

Chain: `new MyPromise((resolve) => setTimeout(() => resolve(1), 10)).then((v) => v + 1)`
and call it `p1`; then `p1.then((v) => { throw new Error("boom"); }).catch((e) => e.message)`.

1. The executor stores nothing yet; the construct returns a **pending** `root`. `p1` is registered
   as a reaction on `root` **while pending**, so `p1` is pending too.
2. After 10 ms, the timer fires `resolve(1)`. The one-shot guard flips; `#resolve(1)` sees no
   thenable and `#fulfill(1)` sets `root.state = FULFILLED`, `root.value = 1`, and calls `#flush`.
3. `#flush` schedules `queueMicrotask(() => root.#runReaction(handler))`. So the `.then` callback
   still runs **after** the current call stack, even though settlement happened in a timer.
4. `#runReaction` picks `onFulfilled` (state is fulfilled), calls `(v) => v + 1` with `1` → `2`, and
   passes `2` to `p1`'s `resolve`. `p1` becomes fulfilled with `2`. Its own queued reaction flushes.
5. The third reaction's handler throws; the `catch` clause routes the thrown error to the child's
   `reject`, so the child is **rejected** with the `Error`, and the `.catch` handler returns
   `"boom"` → the final promise fulfils with `"boom"`.

### Complexity

Time: `O(1)` per `resolve`/`reject`/`then`; draining `h` queued reactions is `O(h)`. Space: `O(h)`
for the handler queue plus `O(1)` per promise for state and value.

### Edge Cases

- Executor throws before settling → the catch forwards it to `reject`, so the promise rejects.
- `resolve` then `reject` (or twice either way) → the shared `used` flag keeps the first outcome.
- Resolve with a **thenable whose `then` getter throws** → rejection with that error.
- Thenable calls both callbacks → the inner `used` flag keeps the first.
- Resolve with the promise itself → `TypeError`, matching native.
- Indirect cycles (A adopts B, B adopts A) are **not** detected and hang; native detects only the
  direct self-resolution too, so this is faithful but worth stating.
- Non-`Promise` thenables and native promises are assimilated; a plain object without `.then` is
  used as-is.
- `then()` with no arguments forwards both value and reason unchanged — a rejection is not swallowed.
- Unhandled rejections are silently dropped here; native reports them to the host
  (`unhandledrejection` / `process` event) on the next macrotask.
- Ancient runtimes lack `queueMicrotask`; `Promise.resolve().then` or `MutationObserver` are the
  fallbacks, and either changes exact ordering relative to native jobs.

### Interview Follow-ups

- **Implement `finally(cb)`:** run `cb`, await its result if it is a thenable, then re-forward the
  original value or reason. It must not change either outcome.
- **Add statics** `resolve`/`reject`/`all`/`allSettled`/`race`/`any` — the next six problems.
- **`Symbol.species` and subclassing:** native `then` builds the child with
  `new (this.constructor)` guarded by species, so subclass `then` returns subclass instances; the
  teaching version hard-codes `new MyPromise`.
- **Unhandled rejection tracking:** keep a `rejected` flag cleared when a rejection handler is
  attached, and report from a `setTimeout`/host hook if it is still set.
- **Why must reactions be microtasks?** Determinism and run-to-completion: handlers must not run
  during the settling call, and microtasks drain before the next macrotask.

### Common Mistakes

- Running handlers **synchronously** when the promise is already settled — the classic bug; every
  reaction must be scheduled.
- Calling `#fulfill`/`#reject` without a state guard, allowing double settlement.
- Skipping thenable assimilation, so `resolve(thenable)` fulfils with the *thenable object*.
- Swallowing the reason when `onRejected` is missing instead of passing it to the child.
- Forgetting to `return` inside `then`, so `then(...)` yields `undefined` and chaining breaks.
- Using one shared `resolve`/`reject` for both the constructor and each reaction, so separate
  children settle the same promise.
- Using `setTimeout` for reactions (macrotask) instead of a microtask, changing interleaving.

### Takeaway

A promise is a one-shot state machine plus a reaction queue: settle synchronously at most once,
unwraps thenables in fresh jobs, and always runs reactions in a microtask through a **new** child
promise. Every remaining combinator is a variation on which child settles, and when.

## Implement `Promise.all`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `all(iterable)` matching `Promise.all`. It returns a promise that:

- fulfils with an **array of results in input order** when every input fulfils — completion order
  is irrelevant, because each result is written at its own index;
- rejects with the **first** rejection reason as soon as any input rejects (later rejections are
  ignored; the other inputs keep running — they are not cancelled);
- accepts any **iterable** (arrays, `Set`, generators, strings). A non-iterable (e.g.
  `{ length: 2, 0: 1 }`) makes the returned promise **reject** with `TypeError`; `all` does not
  throw synchronously;
- treats non-promise inputs as already fulfilled (they are wrapped with `Promise.resolve`, so
  thenables are assimilated);
- resolves `all([])` with `[]`.

The core invariant: **results are indexed by input position, not by settlement position.**

### Examples

```text
Promise.all([1, 2, 3])                              // => [1, 2, 3]
Promise.all([])                                     // => []
Promise.all([sleep(30).then(() => "slow"), "fast"]) // => ["slow", "fast"] (order kept)
Promise.all([Promise.reject(new Error("x")), 1])    // => rejects with Error("x")
Promise.all("ab")                                   // => ["a", "b"]  (strings are iterable)
Promise.all({ length: 2, 0: 1, 1: 2 })              // => rejects TypeError (array-like, not iterable)
Promise.all([Promise.resolve(1), { then: (r) => r(2) }]) // => [1, 2] (thenables unwrapped)
```

### Approach

The shape is "count down from the input length." Snapshot the iterable once, allocate a
`results` array of the same length, keep `remaining = total`, and for each item attach a
fulfilment handler that stores `results[index] = value` and decrements. When `remaining` hits `0`,
resolve with `results`. The `reject` callback is attached directly, so the first rejection wins
automatically because a promise settles once.

Two contracts a naive loop gets wrong:

1. **Ordering.** `result[i] = v` (not `push`) is what makes results follow input order even when a
   later input settles first. `push` would record completion order.
2. **Wrapping.** Each element must go through `Promise.resolve(item).then(...)`, not
   `item.then(...)`, so plain values work and arbitrary thenables are assimilated. `Promise.resolve`
   also gives us the empty and already-resolved cases for free.

Snapshotting with `[...iterable]` runs the iterator **synchronously**, which matches the spec's
`GetIterator` + `IteratorStep` ordering closely enough for interview purposes; the only observable
difference is a pathological iterator that throws *after* yielding some items while an earlier
item's `then` getter throws (exact spec interleaving), which we note in Edge Cases.

### Implementation

```javascript
function all(iterable) {
  return new Promise((resolve, reject) => {
    let items;
    try {
      items = [...iterable]; // a sync iterator error becomes a rejection
    } catch (error) {
      reject(error);
      return;
    }

    const total = items.length;
    const results = new Array(total);
    let remaining = total;

    if (remaining === 0) {
      resolve(results); // Promise.all([]) -> []
      return;
    }

    items.forEach((item, index) => {
      Promise.resolve(item).then(
        (value) => {
          results[index] = value; // input order, not completion order
          remaining -= 1;
          if (remaining === 0) resolve(results);
        },
        reject, // first rejection wins; a settled promise ignores the rest
      );
    });
  });
}
```

### Walkthrough

`all([sleep(30).then(() => "slow"), "fast", Promise.resolve("mid")])`:

1. `items` is the three-element snapshot; `results = [ , , ]`, `remaining = 3`.
2. Attach handlers in index order. `"fast"` is already fulfilled, so its reaction is queued first
   and `results[1] = "fast"`, `remaining = 2`. `"mid"` likewise sets `results[2] = "mid"`,
   `remaining = 1`.
3. 30 ms later the timer fulfils the first promise with `"slow"`; its reaction sets `results[0] = "slow"`,
   `remaining = 0`, and calls `resolve(results)`.
4. The returned promise fulfils with `["slow", "fast", "mid"]` — the fast inputs did **not** reorder
   the output, and nothing resolved before all three were accounted for.

For the rejection path, `all([Promise.reject(e), sleep(1000)])` rejects immediately with `e`; the
slow input is still running but its later fulfilment is ignored because the outer promise is
already settled.

### Complexity

Time: `O(n)` to iterate plus `O(n)` reaction work. Space: `O(n)` for `items` and `results`.

### Edge Cases

- `all([])` → fulfils with `[]`, never rejects.
- Non-iterable input (`{ length: 2, 0: 1 }`, a number) → rejected `TypeError`, **not** a sync throw.
- Sparse arrays: `[...[ , ]]` fills the hole with `undefined`, so `all([ , ])` → `[undefined]`.
- A `Set`/generator/string is consumed once; a partly-consumed iterator continues from where it is.
- Duplicate promises are fine: each index gets the same value independently.
- Inputs are **not** cancelled on rejection; they keep running (use `AbortSignal` for cancellation).
- A thenable whose `then` getter throws rejects the whole `all`.
- The order of `.then` attachment is input order, so if several inputs are already settled, their
  fulfilments occur in input order — but only completion order matters for timers.
- Very large inputs allocate one `results` array plus one reaction per element; there is no
  engine-level batching.

### Interview Follow-ups

- **Implement a concurrency-limited `all`:** process at most `k` inputs at a time, still preserving
  input order (a worker-pool with a shared cursor).
- **`allSettled` / `race` / `any`** — the next four problems; notice they differ only in the
  handler and the completion condition.
- **Abort support:** accept an `AbortSignal`, reject on abort, and let participating tasks observe
  the same signal.
- **Why not `Promise.all(inputs.map(fn))` with async `fn`?** That still runs all tasks eagerly; the
  concurrency limit requires scheduling the calls, not just the promises.

### Common Mistakes

- Using `push` instead of index assignment, so results follow completion order.
- Calling `item.then(...)` directly, which throws for non-thenable values.
- Reading `iterable.length` instead of using the iterator, so array-likes silently "work" (they
  should throw) and `Set`/generators silently break.
- Letting the iterator throw synchronously out of `all` instead of rejecting.
- Assuming rejection cancels the remaining inputs.
- Forgetting the empty-input branch and resolving only when `remaining` changes (which never
  happens), leaving `all([])` pending forever.

### Takeaway

`Promise.all` is a countdown plus an index-keyed results array: wrap each input with
`Promise.resolve`, store by index, decrement on fulfilment, and reject on the first failure. Order
in equals order out; only the completion condition cares about timing.

## Implement `Promise.allSettled`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `allSettled(iterable)` matching `Promise.allSettled`. It returns a promise that always
**fulfils** with an array, in input order, of one result object per input:

- `{ status: "fulfilled", value }` for a fulfilled input;
- `{ status: "rejected", reason }` for a rejected input.

The contract:

- Input rejection **never** rejects the returned promise; it only records a `"rejected"` entry.
- The returned promise rejects only if the **iterable itself** is invalid or its iteration throws.
- `allSettled([])` → `[]`.
- Every input is wrapped with `Promise.resolve`, so plain values count as fulfilled and thenables
  are assimilated.

So the only two differences from `Promise.all` are the payload shape and the completion rule: wait
for **all** outcomes, never short-circuit.

### Examples

```text
Promise.allSettled([1, Promise.resolve(2)])         // => [{status:"fulfilled",value:1},
                                                    //     {status:"fulfilled",value:2}]
Promise.allSettled([Promise.reject("bad"), 1])      // => [{status:"rejected",reason:"bad"},
                                                    //     {status:"fulfilled",value:1}]
Promise.allSettled([])                              // => []
Promise.allSettled("ab")                            // => [fulfilled "a", fulfilled "b"]
Promise.allSettled({ length: 1 })                   // => rejects TypeError (not iterable)
// Input order is preserved even when completion order differs:
Promise.allSettled([sleep(30).then(() => "slow"), Promise.reject("fast")])
                                                    // => [{...fulfilled "slow"}, {...rejected "fast"}]
```

### Approach

Same skeleton as `all`, with two changes:

1. Both the fulfilment and rejection handlers **write a result object and decrement**; neither
   rejects the outer promise. That is what makes `allSettled` total.
2. `resolve` fires when `remaining` reaches `0`, regardless of how many entries are rejections.
   There is no `reject` on the element path at all.

Because the element path never calls `reject`, the only way the outer promise rejects is the
`[...iterable]` snapshot throwing, which we forward. Note that a throwing `then` getter on a
thenable also arrives on the **rejection** handler (as the `reason`), not as an outer rejection —
`Promise.resolve(thenable)` is the thing that rejects, and the handler records it.

The result objects should be created as plain literals `{ status, value }` / `{ status, reason }`;
native uses exactly the keys `status` and `value`/`reason`.

### Implementation

```javascript
function allSettled(iterable) {
  return new Promise((resolve, reject) => {
    let items;
    try {
      items = [...iterable]; // iterator failure rejects the outer promise
    } catch (error) {
      reject(error);
      return;
    }

    const total = items.length;
    const results = new Array(total);
    let remaining = total;

    if (remaining === 0) {
      resolve(results); // Promise.allSettled([]) -> []
      return;
    }

    const done = () => {
      remaining -= 1;
      if (remaining === 0) resolve(results); // fulfil even if all rejected
    };

    items.forEach((item, index) => {
      Promise.resolve(item).then(
        (value) => { results[index] = { status: "fulfilled", value }; done(); },
        (reason) => { results[index] = { status: "rejected", reason }; done(); },
      );
    });
  });
}
```

### Walkthrough

`allSettled([sleep(30).then(() => "slow"), Promise.reject("fast")])`:

1. `items` has length 2; `results = [ , ]`, `remaining = 2`.
2. The second input is already rejected, so its reaction runs first: `results[1] =
   { status: "rejected", reason: "fast" }`, `remaining = 1`.
3. 30 ms later the first input fulfils: `results[0] = { status: "fulfilled", value: "slow" }`,
   `remaining = 0`, and `resolve(results)` fires.
4. The outer promise fulfils with the array in **input** order — index `0` is the slow fulfilment,
   index `1` the fast rejection — and never rejected despite containing a rejection.

### Complexity

Time: `O(n)` to iterate and `O(n)` reaction work. Space: `O(n)` for `items`, `results`, and the `n`
result objects.

### Edge Cases

- All inputs rejected → still fulfils with all `"rejected"` entries; this is the case people forget.
- Empty iterable → `[]` immediately.
- Non-iterable → rejected `TypeError` (the only rejection path).
- A thenable whose `then` getter throws → recorded as `{ status: "rejected", reason }`.
- `undefined` inputs are valid and become `{ status: "fulfilled", value: undefined }`; the object
  shape still has the `value` key.
- Reason can be any value (`undefined`, a non-`Error` string, `null`); do not assume `Error`.
- Sparse arrays: holes become `undefined` inputs and thus fulfilled entries.
- The result array is always dense and exactly `items.length` long.

### Interview Follow-ups

- **Add a timeout wrapper:** `Promise.allSettled` plus a `sleep` that never rejects gives a
  "settle everything, bounded by time" helper, though it cannot stop the underlying work.
- **Difference from `all` in one sentence:** `all` is fail-fast on the first rejection; `allSettled`
  is total and reports every outcome.
- **Implement `all` in terms of `allSettled`:** map entries, then throw the first `"rejected"`
  reason; explain why this loses the fail-fast property.
- **`AggregateError` reporting:** collect `reason`s and reject with `new AggregateError(reasons)`
  if you want `any`-style summaries.

### Common Mistakes

- Rejecting the outer promise on the first element rejection, which defeats the entire method.
- Pushing only fulfilled entries, so the result array is shorter than the input.
- Using `push` instead of index assignment, losing input order.
- Assuming `reason` is an `Error` (`e.message` on a rejected string is `undefined`).
- Forgetting the empty-input branch, leaving `allSettled([])` pending forever.

### Takeaway

`allSettled` is `all` with a total completion rule: both handlers record an outcome and count down,
and only an invalid iterable can reject. The result array is always dense, input-ordered, and one
entry per element.

## Implement `Promise.race`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `race(iterable)` matching `Promise.race`. It returns a promise that settles with the
outcome — fulfilment **or** rejection — of the **first input to settle**:

- Completion order decides, not input order.
- `race([])` returns a promise that **never settles**: with no inputs there is no first settler.
- A non-iterable makes the returned promise reject with `TypeError` (it does not throw).
- Each input is wrapped with `Promise.resolve`, so plain values count as already-fulfilled.
- Inputs that lose the race keep running; they are not cancelled.

The subtle contract: because `resolve`/`reject` are passed straight through as the handlers, the
outer promise forwards whichever callback the winner invokes first, and the one-shot settlement of
the outer promise ignores all later settlers.

### Examples

```text
Promise.race([sleep(30).then(() => "slow"), sleep(10).then(() => "fast")]) // => "fast"
Promise.race([1, 2, 3])                                  // => 1 (input order among already-settled)
Promise.race([Promise.reject("boom"), sleep(100)])       // => rejects with "boom"
Promise.race([])                                         // => <pending forever>
Promise.race({ length: 1, 0: Promise.resolve(1) })       // => rejects TypeError (not iterable)
Promise.race(["a", sleep(50).then(() => "b")])           // => "a" (a plain value wins)
```

### Approach

`race` is the smallest combinator: snapshot the iterable, then for each item attach the outer
promise's own `resolve` and `reject` as the handlers. There is no counter and no results array —
settlement of the outer promise is the completion condition.

Why the pass-through is correct and not a bug:

- `Promise.resolve(item).then(resolve, reject)` means each input's outcome is delivered verbatim to
  the outer promise. The first call wins because a promise settles exactly once; the rest are
  ignored by the already-settled promise.
- Plain values are wrapped by `Promise.resolve`, so they fulfil in a microtask; when several inputs
  are already settled, they settle in the order their reactions were attached, which is input
  order. That is why `race([1, 2, 3])` is `1`.
- Empty input attaches no handlers, so the outer promise stays pending forever. There is no
  `resolve` call on that path.

An honest note: `race` cannot cancel the losers, and a losing rejection becomes an
**unhandled rejection** unless something else handles it. This mirrors native behaviour and is
often the actual interview follow-up.

### Implementation

```javascript
function race(iterable) {
  return new Promise((resolve, reject) => {
    let items;
    try {
      items = [...iterable]; // iterator failure rejects the outer promise
    } catch (error) {
      reject(error);
      return;
    }

    // No counter: the first input to settle resolves/rejects the outer promise.
    for (const item of items) {
      Promise.resolve(item).then(resolve, reject);
    }
    // Empty input: no handler is attached, so the promise stays pending forever.
  });
}
```

### Walkthrough

`race([sleep(30).then(() => "slow"), sleep(10).then(() => "fast"), Promise.reject("boom")])`:

1. Snapshot three inputs; attach handlers in order. The third is already rejected, so its reaction
   is queued first.
2. Before 10 ms, the third input's reaction runs and calls the outer `reject("boom")`. The outer
   promise is now **rejected**; it ignores everything after.
3. At 10 ms `"fast"` fulfils and at 30 ms `"slow"` fulfils, but their reactions call the outer
   `resolve`, which is a no-op on a rejected promise.
4. The result is `Promise.reject("boom")` — the earliest settler, even though it was not the
   earliest timer.

Swap the third input for `sleep(5).then(() => "early")` and the outer promise fulfils with
`"early"` at 5 ms.

### Complexity

Time: `O(n)` to iterate and attach handlers. Space: `O(n)` for the snapshot and one reaction per
input; no results array.

### Edge Cases

- `race([])` → pending forever (never fulfils, never rejects). This is the most-missed case.
- Non-iterable → rejected `TypeError`.
- Already-settled inputs settle in attachment (input) order, so a plain value at index `0` wins.
- A rejection can win; `race` does not prefer fulfilment.
- Losing rejections are unhandled rejections unless separately attached.
- Duplicate references are harmless: each attachment is its own reaction.
- Defensive wrapping: `Promise.resolve(item).then(resolve, reject)` binds the callbacks so a
  subclassed `then` cannot pass unexpected extra arguments to the outer `resolve`.
- Snapshotting means a lazily-infinite iterable hangs while being consumed; use `race` on finite
  inputs or take the first result from a lazy iterator by hand.

### Interview Follow-ups

- **Implement a timeout:** `race([work, sleep(ms).then(() => { throw new Error("timeout"); })])`.
- **Difference from `any`:** `race` settles on the first outcome (either kind); `any` waits for the
  first **fulfilment** and only rejects after all reject.
- **Add cancellation:** combine `race` with `AbortController` so the loser can be signalled; plain
  `race` leaves losers running.
- **`race` with a cache:** wrap a fetch and the cache read; whichever settles first wins and the
  other should ideally be aborted.

### Common Mistakes

- Adding a countdown and waiting for all inputs — that is `all`/`allSettled`, not `race`.
- Forgetting that empty input stays pending, then writing an empty-input `resolve()` that breaks the
  contract.
- Using `item.then(resolve, reject)` without `Promise.resolve`, which throws on plain values.
- Expecting input order to win over timing (it only decides ties among already-settled inputs).
- Assuming losers are cancelled by the race.
- Re-wrapping the already-wrapped result and changing the delivered value.

### Takeaway

`race` forwards the first settlement straight through: attach `resolve` and `reject` to every
input, attach nothing for an empty iterable, and let the promise's one-shot rule ignore the
losers. Completion order wins; input order only breaks ties.

## Implement `Promise.any`

`Difficulty: Medium` `Probability: High`

### Problem

Implement `any(iterable)` matching `Promise.any`. It returns a promise that:

- fulfils with the **first fulfilment value** among the inputs;
- rejects with a single `AggregateError` whose `.errors` array holds **every** rejection reason,
  in input order, and only after **all** inputs have rejected;
- rejects `any([])` with `AggregateError` and `errors: []` — the empty case is a rejection, not a
  hang (contrast `race([])`);
- rejects with the **iterator's** error (not an `AggregateError`) if the iterable itself is invalid
  or throws;
- wraps each input with `Promise.resolve`.

The distinguishing rule: unlike `race`, a rejection does **not** settle the result on its own; it
is recorded and the combinator waits for a possible later fulfilment. Only an all-rejected input
set produces the `AggregateError`.

### Examples

```text
Promise.any([Promise.reject("a"), 42, Promise.reject("b")]) // => 42
Promise.any([sleep(30).then(() => "slow"), sleep(10).then(() => "fast")]) // => "fast"
Promise.any([])                                             // => AggregateError, .errors === []
Promise.any([Promise.reject("x"), Promise.reject("y")])
  // => rejects AggregateError; err.errors === ["x", "y"] (input order)
Promise.any([1, 2])                                         // => 1 (input order among settled)
Promise.any({ length: 1 })                                  // => rejects TypeError (not AggregateError)
```

### Approach

Combine `allSettled`'s counting with `race`'s pass-through: keep `remaining` and an `errors` array
indexed by input position. On fulfilment, call `resolve(value)` immediately (first fulfilment
wins; later ones are ignored). On rejection, store `errors[index] = reason`, decrement, and when
`remaining` reaches `0`, reject with `new AggregateError(errors, "All promises were rejected")`.

Three contracts a naive version misses:

1. **A rejection does not finish the race.** You cannot use `race`-style `reject` pass-through;
   each rejection must be counted, because a later fulfilment still wins. This is the entire
   difference from `race`.
2. **`errors` is input-ordered and dense.** Assign by `index`, not `push`, exactly like `all`
   results; duplicates and out-of-order rejection are preserved by position.
3. **Empty input is a rejection with an empty `errors` array**, constructed before any handlers are
   attached, so the method never returns a pending promise.

`AggregateError` is the standard multi-error container (ES2021). Its `errors` argument is read into
an own `errors` property; the second argument is the message, which V8 sets to
`"All promises were rejected"`.

### Implementation

```javascript
function any(iterable) {
  return new Promise((resolve, reject) => {
    let items;
    try {
      items = [...iterable]; // iterator failure: plain rejection, not AggregateError
    } catch (error) {
      reject(error);
      return;
    }

    const total = items.length;
    const errors = new Array(total);
    let remaining = total;

    if (remaining === 0) {
      // any([]) rejects with an empty AggregateError (race([]) would hang).
      reject(new AggregateError([], "All promises were rejected"));
      return;
    }

    items.forEach((item, index) => {
      Promise.resolve(item).then(
        resolve, // first fulfilment wins outright
        (reason) => {
          errors[index] = reason; // record by input position
          remaining -= 1;
          if (remaining === 0) {
            reject(new AggregateError(errors, "All promises were rejected"));
          }
        },
      );
    });
  });
}
```

### Walkthrough

`any([Promise.reject("x"), sleep(20).then(() => "ok"), Promise.reject("y")])`:

1. `errors = [ , , ]`, `remaining = 3`; attach three handlers in input order.
2. The first input is already rejected: `errors[0] = "x"`, `remaining = 2`. **No reject yet** —
   this is the key difference from `race`.
3. The third is already rejected: `errors[2] = "y"`, `remaining = 1`.
4. At 20 ms, input `1` fulfils with `"ok"`; its handler calls `resolve("ok")`. The result fulfils
   with `"ok"`.
5. If instead all three had rejected, `remaining` would hit `0` and the outer promise would reject
   with `AggregateError` whose `.errors` is `["x", <reason from input 1>, "y"]` — in input order,
   even though the rejections arrived in a different order.

### Complexity

Time: `O(n)` to iterate and attach handlers. Space: `O(n)` for the snapshot, the `errors` array, and
one reaction per input.

### Edge Cases

- `any([])` → rejects `AggregateError` with `errors: []`; it does **not** hang.
- All inputs reject → `AggregateError`; inspect `err.errors`, not `err.message`, for the reasons.
- Non-iterable or a throwing iterator → plain `TypeError`/original error, **not** `AggregateError`.
- `errors` is always dense and `items.length` long, because indices are assigned, not pushed.
- `undefined` reasons are stored as `undefined`; `errors` can contain holes only if you `push`.
- A thenable with a throwing `then` getter counts as a **rejection** whose reason is that error.
- First fulfilment can be an already-fulfilled plain value, which wins in input order.
- Losing rejections are suppressed only while at least one input can still fulfil; they are
  reported via `AggregateError` at the end, so `any` does not leak unhandled rejections the way
  `race` can (all rejections are observed by the combinator's handlers).

### Interview Follow-ups

- **`any` vs `race` in one sentence:** `race` settles on the first outcome of either kind; `any`
  waits for the first fulfilment and rejects only when every input rejects.
- **Build `any` on `allSettled`:** run `allSettled`, then scan for the first `"fulfilled"` entry or
  reject with `AggregateError` of all reasons; note the extra tick it costs.
- **Errors by input order, not rejection order:** explain why `errors[index]` matters for
  reproducible output.
- **`AggregateError` ergonomics:** `err.errors.map((e) => e.message).join(", ")` is the common
  reporting helper; guard for non-`Error` reasons.

### Common Mistakes

- Forwarding each rejection straight to `reject`, which turns `any` into `race`.
- Forgetting the empty-input rejection, so `any([])` hangs forever.
- Using `push` for `errors`, so they follow rejection order instead of input order.
- Rejecting with the iterator error wrapped in an `AggregateError`, or vice versa.
- Reading `err.message` for the reasons — they live in `err.errors`.
- Calling `resolve` on every fulfilment without relying on the promise's one-shot rule.

### Takeaway

`Promise.any` is `race` for fulfilments: rejections are counted and collected by input index, the
first fulfilment settles the result, and an all-rejected input rejects with an `AggregateError`.
Empty input is the mirror image of `race([])`: an immediate rejection, not an eternal pending.

## Implement `Promise.resolve`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `resolve(value)` matching `Promise.resolve`. It returns a promise, with three distinct
paths that the contract depends on:

1. **Direct promise of the same constructor:** if `value` is a promise and `value.constructor` is
   the receiver's constructor, return `value` **unchanged** (identity, no wrapping) — the only case
   where `resolve` does not allocate.
2. **Thenable:** otherwise, if `value` is an object with a callable `then`, return a new promise
   that adopts the thenable's eventual state (its `then` is called, results assimilated).
3. **Plain value (and all non-objects):** return a new promise already **fulfilled** with `value`.
   `resolve()` with no argument fulfils with `undefined`.

Additional contract:

- `resolve` is **generic over the constructor**: as a static, it uses `this` as the promise
  constructor, so `Sub.resolve(x)` returns a `Sub`, not a base `Promise`.
- A non-callable `this` throws `TypeError` synchronously (it must be a constructor).
- The identity fast path applies only when the constructor matches; `Promise.resolve(otherRealmPromise)`
  does **not** return it unchanged.

### Examples

```text
Promise.resolve(42)                       // => Promise fulfilled with 42
Promise.resolve()                         // => Promise fulfilled with undefined
Promise.resolve(Promise.resolve(1))       // => resolves with 1
const p = Promise.resolve(1);
Promise.resolve(p) === p                  // => true   (identity fast path)
Promise.resolve({ then: (r) => r(7) })    // => resolves with 7
Promise.resolve(Promise.reject("e"))      // => the SAME rejected promise (identity, not a throw)
Promise.resolve.call(() => {}, 1)         // => TypeError (this is not a constructor)
```

### Approach

The whole method is a three-way branch, and the order matters:

1. **Identity first.** `if (value instanceof Promise && value.constructor === Promise) return value;`
   Native uses internal `IsPromise` plus a `constructor` comparison against the receiver `C`. The
   constructor check is what prevents a subclass promise from skipping the subclass's wrapping
   rules, and (in a real implementation) makes `Promise.resolve` on a foreign-realm promise wrap
   it. Getting this branch wrong is the most common interview error: an unconditional
   `new Promise((res) => res(value))` loses identity and costs a tick.
2. **Thenables.** The naive remaining path, `new Promise((resolve) => resolve(value))`, already
   assimilates thenables, because resolving a promise with a thenable adopts it. So no extra code
   is needed — delegate the thenable logic to the constructor.
3. **Plain values.** The same constructor call fulfils immediately (settlement is synchronous;
   reactions are async).

For genericity, use `this` rather than hard-coding `Promise`, and validate that `this` is a
constructor. A minimal check is `typeof this === "function"`; the precise check is the
`Reflect.construct` probe used for `new`. If you are writing this as a static on a class, `this`
is the class.

### Implementation

```javascript
// Static-style implementation. `this` is the promise constructor (subclass-friendly).
function resolve(value) {
  const C = this;

  if (typeof C !== "function") {
    throw new TypeError("Promise.resolve called on a non-constructor");
  }

  // 1) Identity: a promise built by the SAME constructor is returned unchanged.
  if (value instanceof C && value.constructor === C) {
    return value; // do not re-wrap; no extra tick, same object
  }

  // 2) + 3) Thenables and plain values: the constructor already assimilates thenables.
  return new C((res) => res(value));
}
```

Used as a method: `MyPromise.resolve = resolve;` or `static resolve(value) { return resolve.call(this, value); }`.

### Walkthrough

`Promise.resolve(Promise.resolve(1))`:

1. The inner `Promise.resolve(1)` produces a fulfilled promise, call it `p`.
2. Outer call: `value instanceof Promise` is true and `value.constructor === Promise` is true, so
   branch 1 returns `p` itself. Result: `Promise.resolve(p) === p` is `true`; no new promise, no
   extra microtask.

`Promise.resolve({ then: (r) => r(7) })`:

1. Not an instance of `Promise`, so branch 1 is skipped.
2. `new Promise((res) => res(obj))` runs; `res(obj)` sees a callable `then` and adopts it in a job.
3. The thenable's `then` is called with the promise's resolving functions; `r(7)` fulfils the new
   promise with `7`.

`Promise.resolve(Promise.reject("e"))` is the identity case again: the returned promise **is** the
rejected one, so a later `.catch` sees `"e"` — `resolve` does not throw and does not convert.

### Complexity

Time: `O(1)` for the identity and plain-value paths; thenable adoption adds one job. Space: `O(1)`
for branch 1, one promise otherwise.

### Edge Cases

- No argument → fulfilled with `undefined` (the parameter is simply absent).
- `Promise.resolve(promise)` → identical object; mutating neither. Do not deep-clone.
- Already-rejected promise passed in → returned as-is; `resolve` is not `reject`.
- Foreign-realm or subclass promise → **not** identity; it is wrapped (a new promise assimilates it).
- Thenable whose `then` getter throws → the new promise rejects with that error.
- A thenable that calls `then` with a non-function `resolve` should throw; native's resolver
  functions are functions, so this only matters for hostile thenables.
- `this` not a constructor → synchronous `TypeError`; `resolve.call({}, 1)` should throw.
- `Symbol.species` (advanced): native combinators use species to pick the result constructor;
  `resolve` uses `this` directly, so a static implementation on a subclass returns subclass
  promises.

### Interview Follow-ups

- **Why the identity check?** Native's `Promise.resolve(x)` for a native `x` is `x` itself; this
  avoids a wasted wrapper and an extra tick, and is observable via `===`.
- **Why check `constructor` and not just `instanceof`?** A subclass promise must go through the
  subclass constructor, and cross-realm promises must not be mistaken for same-realm ones
  (`instanceof` is realm-sensitive, so pair it with the constructor check).
- **Implement `Promise.reject` on the same skeleton** — the next problem, where the identity path
  must NOT exist.
- **How do combinators use `resolve`?** Every element is promoted with `C.resolve(x)` so plain
  values and thenables are handled uniformly; a wrong `resolve` corrupts every combinator.

### Common Mistakes

- Always allocating `new Promise((res) => res(value))`, losing identity and adding a tick.
- Checking only `instanceof` without the constructor check, so subclass promises short-circuit
  incorrectly.
- Hard-coding `Promise` instead of using `this`, breaking subclass statics.
- Assuming `resolve(rejectedPromise)` throws or unwraps the rejection — it returns the same promise.
- Forgetting that no argument is a valid call (fulfils with `undefined`), not an error.
- Re-`resolve`-ing a promise that is already a promise of the same constructor and expecting a copy.

### Takeaway

`Promise.resolve` is "return the same promise if same-constructor, otherwise build a promise and
let the constructor assimilate the value." Identity, thenable adoption, and plain fulfilment are
three branches, and the constructor comparison is what makes them correct for subclasses.

## Implement `Promise.reject`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `reject(reason)` matching `Promise.reject`. It returns a **new** promise rejected with
`reason`. The contract is deliberately the mirror image of `resolve` minus its special cases:

- **No identity path.** Every call allocates a new promise, even if `reason` is already a promise.
  `Promise.reject(p) !== p`.
- **No unwrapping/assimilation.** If `reason` is a thenable, it stays the reason verbatim; the
  returned promise is rejected **with the thenable object**, it does not adopt the thenable's
  state. This is the key contrast with `resolve`.
- `reject()` with no argument rejects with `undefined`.
- Generic over the constructor like `resolve`: `Sub.reject(x)` returns a `Sub` promise; a
  non-constructor `this` throws `TypeError` synchronously.

The reason can be anything — `Error`, string, `undefined`, `null`, a thenable — and is delivered
unchanged to rejection handlers.

### Examples

```text
Promise.reject(new Error("nope"))       // => Promise rejected with that Error
Promise.reject()                        // => Promise rejected with undefined
const t = { then: (r) => r(1) };
Promise.reject(t).catch((e) => e === t) // => true   (reason is the thenable itself)
Promise.reject(Promise.resolve(1))      // => rejected WITH that promise as reason
Promise.reject.call(() => {}, "x")      // => TypeError (this is not a constructor)

// No identity:
const p = Promise.reject("e");
Promise.reject(p) === p                 // => false (a new rejected promise each time)
```

### Approach

There is essentially nothing to implement beyond delegating to the constructor's `reject`. The
entire point of the question is the **absence** of `resolve`'s two special paths, and being able to
say why:

- **Why no identity?** `resolve` returns a same-constructor promise unchanged because fulfilment is
  idempotent and wrapping is pointless. `reject` is not idempotent in the same way: the spec
  defines `Promise.reject` as `NewPromiseCapability(C)` then `reject(reason)` unconditionally, so
  callers can rely on getting a fresh promise they own (and on the reason being preserved). It also
  means `Promise.reject(p)` and `p` can be handled independently.
- **Why no thenable assimilation?** Assimilation is a property of the **resolve** algorithm, not of
  rejection. Rejecting is "settle this promise as rejected with this value," full stop. A thenable
  in a rejection position is data, not a state machine to follow.

Implementation: validate `this`, then `return new this((_, reject) => reject(reason));`.

### Implementation

```javascript
function reject(reason) {
  const C = this;

  if (typeof C !== "function") {
    throw new TypeError("Promise.reject called on a non-constructor");
  }

  // Always a NEW promise, always rejected with the reason verbatim.
  return new C((_resolve, rejectPromise) => {
    rejectPromise(reason); // no identity, no thenable unwrapping
  });
}
```

Used as a method: `MyPromise.reject = reject;` or
`static reject(reason) { return reject.call(this, reason); }`.

### Walkthrough

`Promise.reject({ then: (resolve) => resolve(1) })`:

1. `reason` is the thenable object; `reject` does **not** look at its `then`.
2. `new Promise((_, rej) => rej(reason))` is created; `rej(reason)` rejects it with the object.
3. A later `.catch((e) => e)` receives the exact same object — `e === thenable` is `true`. Unlike
   `Promise.resolve(thenable)`, which would have fulfilled with `1`, no assimilation happened.

Contrast with `resolve`: `Promise.reject(Promise.resolve(1))` rejects with that fulfilled promise as
its reason, whereas `Promise.resolve(p)` returns `p` itself.

### Complexity

Time: `O(1)`. Space: `O(1)` for the new promise (the reason is stored by reference).

### Edge Cases

- No argument → rejected with `undefined`; `catch((e) => e)` yields `undefined`.
- A thenable reason is preserved by reference, **not** assimilated.
- A promise reason is preserved by reference; the returned promise is still a new object.
- Non-`Error` reasons (`"x"`, `0`, `false`, `null`) are legal and unchanged; do not wrap them.
- `this` not a constructor → synchronous `TypeError` before a promise is created.
- Immediate unhandled-rejection warning if no handler is attached; `reject` is a common source of
  noisy `unhandledrejection` events.
- `Symbol.species` is irrelevant here because the constructor is taken from `this`, not from a
  species lookup (native uses `NewPromiseCapability(C)` with `C = this`).

### Interview Follow-ups

- **Why is there no `Promise.reject(p) === p` fast path?** `reject` must produce a fresh promise it
  owns, and there is nothing to "unwrap"; the spec defines it as an unconditional reject.
- **Implement `resolve` on the same skeleton** and list the two branches `reject` intentionally
  omits (identity, assimilation).
- **Rejecting with a promise:** how do you create a promise that "follows" another's rejection?
  `p.then(undefined, reject)` adopts it; `Promise.reject(p)` does not.
- **AggregateError-style helpers:** `rejectAll` patterns collect reasons and reject once; they build
  on `Promise.reject`'s no-unwrap rule to keep reasons intact.

### Common Mistakes

- Adding a `if (reason instanceof Promise) return reason;` fast path, which is `resolve`'s contract,
  not `reject`'s.
- Rejecting with `Promise.resolve(reason)` or otherwise assimilating a thenable reason.
- Wrapping primitives in `new Error(reason)`, changing the observed reason.
- Assuming `reject()` is invalid because it has no argument.
- Forgetting the `this`-not-a-constructor validation.
- Expecting the same promise back for the same reason; every call allocates.

### Takeaway

`Promise.reject` is the plain, total counterpart of `resolve`: always a new promise, always
rejected with the reason by reference. No identity fast path and no thenable assimilation — those
belong to `resolve` alone.

## Implement `sleep(ms)`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `sleep(ms)` returning a promise that fulfils after approximately `ms` milliseconds. State
the contract precisely:

- The signature is `sleep(ms)` (optionally `sleep(ms, value)` resolving with `value`, default
  `undefined`).
- The promise fulfils **once**, after a host timer; it never rejects on its own.
- Timing is a **lower bound**, not exact: the callback runs no earlier than `ms`, but possibly
  later, because timers are macrotasks and the event loop may be busy. `ms` is clamped by the host
  (browsers/Node treat short delays as at least ~1–4 ms; nested timers are throttled).
- Non-finite or negative `ms` behaves as `0` (`NaN`, `-5`, `undefined`), i.e. "next macrotask."
- A delay larger than the 32-bit signed max (`2_147_483_647` ms, ~24.8 days) overflows in browsers
  and can fire **immediately**; long sleeps must be chunked.
- Crucially, this is a **macrotask**: `await sleep(0)` yields past all pending microtasks, unlike
  `await Promise.resolve()` which only yields one microtask.

### Examples

```text
sleep(1000)                       // => resolves ~1s later with undefined
sleep(0, "done")                  // => resolves on the next macrotask with "done"
sleep(-5)                         // => treated as 0; resolves on the next macrotask
sleep(NaN)                        // => treated as 0

// Macrotask vs microtask ordering:
console.log("a");
sleep(0).then(() => console.log("b"));
Promise.resolve().then(() => console.log("c"));
console.log("d");
// => a, d, c, b   (c is a microtask; b waits for the timer phase)
```

### Approach

`sleep` is the thinnest possible bridge between a callback API and a promise: wrap `setTimeout` in
the promise constructor and resolve in the callback.

```javascript
setTimeout(resolve, delay, value)
```

passes `value` straight to `resolve`; no closure is needed. Normalize `ms` first so the timer
always receives a finite, non-negative, in-range number:

- `Number.isFinite(ms) && ms > 0` → use `ms`; otherwise `0`.
- Optionally chunk delays above `2 ** 31 - 1` to avoid the browser overflow, which is the honest
  answer for "sleep for a day."

Why not a busy-wait or a microtask loop? A `while (Date.now() - start < ms) {}` blocks the event
loop (the browser tab freezes) and a `Promise.resolve()` loop only yields microtasks, so it
starves rendering and I/O. `setTimeout` is the correct primitive, with its macrotask semantics.

The cancellable variant uses `AbortSignal`: register an `abort` listener that clears the timer and
rejects, and remove the listener on normal completion so long-lived signals do not leak listeners.

### Implementation

```javascript
function sleep(ms, value) {
  // Normalize: NaN/Infinity/negative/undefined all mean "next macrotask".
  const raw = Number(ms);
  const delay = Number.isFinite(raw) && raw > 0 ? raw : 0;

  return new Promise((resolve) => {
    setTimeout(resolve, delay, value); // extra args are forwarded to resolve
  });
}

// Cancellable variant: rejects with the abort reason (default: DOMException/AbortError).
function sleepAbortable(ms, { signal, value } = {}) {
  const raw = Number(ms);
  const delay = Number.isFinite(raw) && raw > 0 ? raw : 0;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort); // no listener leak
      resolve(value);
    }, delay);

    function onAbort() {
      clearTimeout(id); // stop the timer so it cannot resolve later
      reject(signal.reason);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Chunked sleep for delays beyond the 32-bit overflow limit.
async function sleepLong(ms, value) {
  const MAX = 2 ** 31 - 1;
  let remaining = Number.isFinite(Number(ms)) && ms > 0 ? Number(ms) : 0;
  while (remaining > 0) {
    await sleep(Math.min(remaining, MAX));
    remaining -= MAX;
  }
  return value;
}
```

### Walkthrough

`sleep(0, "done")` inside the ordering example:

1. `raw = 0`, so `delay = 0`. A pending promise is created and `setTimeout(resolve, 0, "done")` is
   scheduled — a **macrotask**.
2. The surrounding script continues: `"d"` is logged.
3. The call stack empties; the engine drains the **microtask** queue, running `"c"`.
4. Only then does the timer phase run the timeout, calling `resolve("done")`. That queues the
   `.then` reaction as a new microtask, which logs `"b"`.
5. Output order is `a, d, c, b` — proof that `sleep(0)` yields to the macrotask queue, not just one
   microtask.

For `sleep(1000)`, the timeout is scheduled with `delay = 1000`; `resolve` fires no earlier than
1000 ms, and later if the main thread is blocked.

### Complexity

Time: `O(1)` to schedule; actual waiting is the host timer. Space: `O(1)` per pending sleep (one
timer handle plus one promise), or `O(1)` per chunk in `sleepLong`.

### Edge Cases

- `ms = 0`, negative, `NaN`, `Infinity`, or missing → next macrotask; never throws.
- `sleep()` with no argument resolves with `undefined` on the next macrotask.
- Delay above `2_147_483_647` in browsers overflows and may fire immediately — chunk it.
- Host clamping/throttling: background tabs and nested timers can delay far beyond `ms`; treat the
  value as a floor.
- `await sleep(0)` still lets queued microtasks (including chained `.then`s) run first.
- System sleep/suspend: the timer fires late (or on resume); `sleep` guarantees no early firing, not
  a deadline.
- `sleepAbortable`: aborting **before** the call rejects immediately; aborting during clears the
  timer so the promise cannot fulfil afterward; the listener is removed on normal completion.
- `signal.reason` is `undefined` in older runtimes; default it to an `AbortError`.
- Recursion (`sleep` inside `.then`) creates new timers each iteration; a loop with `await` is
  equivalent but flatter.

### Interview Follow-ups

- **Implement `timeout(promise, ms)`:** `race` the work against `sleep(ms).then(() => { throw ... })`.
  Note the loser keeps running without cancellation.
- **Add `AbortSignal` support** so callers can cancel a long sleep — the pattern shown above.
- **Why is `sleep(0)` not immediate?** It schedules a macrotask; the current run-to-completion turn
  and all microtasks finish first.
- **Precision and drift:** a `setInterval`-based ticker accumulates drift; re-aim with
  `Date.now()`-based deadlines or use `performance.now()` deltas for animation-like timing.
- **Why not `Atomics.wait`?** It blocks the thread and is disallowed on the main browser thread.

### Common Mistakes

- Using `setTimeout` without normalizing `ms`, so `sleep(NaN)` or `sleep(-1)` behaves
  host-dependently.
- Claiming `sleep(0)` is synchronous or a microtask; it is a macrotask.
- Busy-waiting (`while`) and freezing the event loop instead of using a timer.
- Ignoring the 32-bit overflow so long sleeps fire immediately.
- Leaving the `abort` listener attached after completion, leaking listeners on a reused signal.
- Treating the delay as a hard deadline rather than a lower bound.
- Forgetting that `await sleep(ms)` resumes in a fresh microtask after the timer, so it does not
  "hold" the event loop.

### Takeaway

`sleep` is `setTimeout` lifted into a promise with the arguments passed through to `resolve`. Its
real contract is scheduling: it is a **macrotask**, it is a lower bound, it needs normalization for
non-finite/negative input, and long delays must be chunked past the 32-bit limit.



## Convert a Callback-Based API into a Promise

`Difficulty: Easy` `Probability: Very High`

### Problem

Given a callback-style API, wrap it so it returns a `Promise`. Concretely, given
`loadUser(id, callback)` where `callback` is Node-style `(error, value)`, write
`loadUserAsync(id)` that returns a `Promise`.

The contract:

- Reject with `error` when the first callback argument is truthy; otherwise resolve with `value`.
- The wrapper must **return** the promise, not fire-and-forget it.
- Settlement is always asynchronous to observers: even if the callback fires synchronously, `.then`
  handlers run on a microtask.
- A synchronous throw inside the executor becomes a rejection; a throw from the callback *later* does
  not, and leaves the promise pending forever.
- A callback that fires more than once cannot settle the promise twice: the first settlement wins.

### Examples

```text
loadUserAsync(2).then((u) => u.name)   // => "user-2"
loadUserAsync(-1).catch((e) => e.message) // => "invalid id"
loadUserAsync(2) instanceof Promise    // => true

// the executor runs synchronously, but the promise does not settle synchronously:
const p = loadUserAsync(2);
console.log("after");                  // prints "after" BEFORE any .then callback
```

### Approach

The `Promise` executor runs synchronously and hands you `resolve` and `reject`. The wrapper's whole
job is to translate one calling convention into the other. Three details a naive version misses:

1. **Argument order.** Node's convention is `(err, value)`, so the value is the *second* parameter.
   APIs that use `(value)` only need a different adapter, not different plumbing.
2. **Always return the promise.** `return new Promise(...)`; dropping the `return` gives the caller
   `undefined`, and their `.then` throws immediately.
3. **Do not add a "settled" flag.** Promise settlement is already idempotent, which is the safety net
   for double-calling APIs.

Also be deliberate about the error test. `if (error)` follows Node exactly; `if (error != null)`
treats `0`, `""`, and `false` as failures. Pick one and document it, because a test suite will probe
`cb(0)` / `cb(null)`.

The classic trap is `new Promise(async (resolve, reject) => { ... })`. An `async` executor swallows
synchronous throws into a rejected promise that nobody observes, so the outer promise hangs and the
error disappears. Never pass an `async` function to the executor.

### Implementation

```javascript
// The callback-style API we are adapting: last argument is (error, value).
function loadUser(id, callback) {
  setTimeout(() => {
    if (id <= 0) callback(new Error("invalid id"));
    else callback(null, { id, name: `user-${id}` });
  }, 10);
}

function loadUserAsync(id) {
  return new Promise((resolve, reject) => {
    loadUser(id, (error, value) => {
      if (error) reject(error);   // truthy-first-arg => failure
      else resolve(value);        // second arg is the success value
    });
  });
}
```

The same shape generalizes to any `(...args, callback)` API:

```javascript
function toPromise(callbackApi, thisArg, ...args) {
  return new Promise((resolve, reject) => {
    callbackApi.call(thisArg, ...args, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

const getUser = (id) => toPromise(loadUser, undefined, id); // => Promise<User>
```

### Walkthrough

`loadUserAsync(2)`:

1. The function returns a pending promise and synchronously calls `loadUser(2, cb)`.
2. `loadUser` schedules a timer and returns; the executor returns; the promise is still pending.
3. After ~10ms the callback runs with `error = null`, `value = { id: 2, name: "user-2" }`.
4. `resolve(value)` fulfils the promise. Queued `.then` handlers are scheduled as microtasks.
5. `.then((u) => u.name)` observes `"user-2"`.

For `loadUserAsync(-1)`, step 3 delivers a truthy `Error`, so `reject(error)` runs and `.catch` gets
`Error: invalid id`.

The subtlety is the gap between "the executor ran synchronously" and "the promise settled": the
executor is synchronous, but observers are notified asynchronously. `console.log("after")` between the
call and the `.then` registration always prints first.

### Complexity

Time: `O(1)` wrapper overhead per call (the real cost is the underlying API). Space: `O(1)` per
pending promise, plus whatever the resolved value retains.

### Edge Cases

- **Synchronous callback** (e.g. a cache hit): the promise is already fulfilled when the executor
  returns, but `.then` still runs on a microtask, so surrounding sync code is unaffected.
- **Callback fired twice**: the second `resolve`/`reject` is ignored. No userland guard required.
- **Callback throws after resolving**: ignored, because the promise is already settled.
- **Callback throws asynchronously**: the executor cannot catch it. It becomes an uncaught exception
  and the promise stays pending forever. Do not pretend otherwise.
- **Falsy error values** (`0`, `""`, `false`): `if (error)` treats them as success. Choose `error !=
  null` if the API uses `null` strictly.
- **Non-`Error` rejection reason** (a string): still rejects; `catch` receives the string.
- **Thenable value**: `resolve(thenable)` adopts it, so the promise may wait longer than expected.
- **Missing `return`**: the caller gets `undefined` and `.then` throws `TypeError`.

### Interview Follow-ups

- **Generalize to `promisify`** for arbitrary Node-style APIs (next problem).
- **Multiple success values** `(err, a, b)`: decide between resolving `a` and `[a, b]`, and say why.
- **Cancellation**: pass an `AbortSignal` through and reject on `abort`; a promise cannot cancel work.
- **Event-based APIs**: wrap `emitter.once("data")` plus `on("error")`, and remove the listeners once
  settled to avoid leaks.
- **`Promise.withResolvers()`** (ES2024) returns `{ promise, resolve, reject }`, useful when the
  resolver must escape the executor.

### Common Mistakes

- **`new Promise(loadUser)`** — passing the API directly makes `resolve` play the role of the
  callback, so a Node-style `(err, value)` call resolves the promise *with the error*.
- **`new Promise(async (resolve, reject) => ...)`** — an async executor turns synchronous throws into
  an unobserved rejection; the outer promise never settles.
- **Forgetting `return`**, so the caller receives `undefined` instead of a promise.
- **Assuming a synchronous callback settles synchronously** and depending on that ordering.
- **Re-implementing settlement guards** with a boolean flag when promise semantics already handle it.

### Takeaway

Wrapping is a translation: `(error, value)` becomes `reject(error)` / `resolve(value)`. The executor
runs synchronously, but settlement always reaches `.then` on a microtask, and after the first
settlement every later `resolve`/`reject` is a silent no-op.

## Implement `promisify(callbackFunction)`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `promisify(original)` where `original` is a Node-style function whose **last** argument is a
callback `(error, ...values)`. Return a new function that takes the same arguments *without* the
callback and returns a `Promise`.

The contract:

- Append the callback to the arguments the caller supplies: `promisified(a, b)` calls
  `original(a, b, cb)`.
- Forward `this`, so a promisified method still works: `promisify(obj.method).call(obj, x)`.
- Reject when the callback's first argument is truthy; otherwise resolve with the success value(s).
- Throw `TypeError` if `original` is not a function.
- Honour `original[util.promisify.custom]` when present, returning that function instead.
- A callback that never fires leaves the promise pending forever — there is no built-in timeout.

**Multiple success values.** A Node callback may deliver more than one value after the error. Node's
history matters here: the widely-quoted polyfill resolves `values.length > 1 ? values : values[0]`,
while modern Node resolves `values[0]` and assembles an object only for functions that declare named
values via `util.promisify.custom` (that is how `child_process.exec` yields `{ stdout, stderr }`).
State your policy explicitly; an interviewer is checking that you know the "value" is the callback's
*extra* arguments, not simply its second parameter.

### Examples

```text
const loadUserAsync = promisify(loadUser);      // loadUser(id, cb)
loadUserAsync(2)            // => Promise<{ id: 2, name: "user-2" }>
loadUserAsync(-1)           // => Promise rejects Error("invalid id")

const getStats = (id, cb) => cb(null, 3, 4);    // callback delivers two values
promisify(getStats)(1)      // => [3, 4]         (array policy)

// `this` forwarding
const obj = {
  base: 10,
  add(n, cb) { cb(null, this.base + n); },
};
const addAsync = promisify(obj.add);
addAsync.call(obj, 5)       // => 15

promisify(42)               // => TypeError
```

### Approach

`promisify` is a higher-order function: it closes over `original` and returns a wrapper that appends
the callback and pivots the callback convention into `resolve`/`reject`.

- **Argument shuffling.** The wrapper collects the caller's args as a rest array and pushes a fresh
  callback onto it. Rest parameters already give you a private array, so pushing is safe.
- **`this` forwarding.** Use `original.call(this, ...args, cb)`, not `original(...args, cb)`. Without
  it, promisified methods break the moment they are passed around detached.
- **Error test.** Reject on a truthy first argument, matching Node. `err != null` is defensible but
  different; do not mix the two rules between problems.
- **Custom override.** `util.promisify.custom` is
  `Symbol.for("nodejs.util.promisify.custom")`. If `original` has it and it is a function, return it
  immediately — this is how libraries replace the generic wrapper with something smarter.
- **Name fidelity.** Copy `original.name` onto the wrapper with `Object.defineProperty` so logs and
  stack traces look right; `Function.prototype.name` is configurable, so this works.

Do **not** infer the callback position from `original.length`. Default parameters, rest parameters,
and bound functions all make `.length` unreliable. Node's contract is positional: the callback is
always last, and it is the wrapper that supplies it.

### Implementation

```javascript
const kCustom = Symbol.for("nodejs.util.promisify.custom");

function promisify(original) {
  if (typeof original !== "function") {
    throw new TypeError("promisify expects a function");
  }

  // A function may ship its own promisified form; prefer it.
  const custom = original[kCustom];
  if (typeof custom === "function") return custom;

  function promisified(...args) {
    return new Promise((resolve, reject) => {
      // `this` here is the wrapper's `this`, so method calls keep working.
      original.call(this, ...args, (error, ...values) => {
        if (error) {
          reject(error);
          return;
        }
        // One value -> the value; several -> the array of values.
        resolve(values.length > 1 ? values : values[0]);
      });
    });
  }

  Object.defineProperty(promisified, "name", {
    value: original.name,
    configurable: true,
  });

  return promisified;
}
```

### Walkthrough

`const loadUserAsync = promisify(loadUser); loadUserAsync(2)`:

1. `promisify` validates `loadUser`, finds no custom symbol, and returns `promisified`.
2. `loadUserAsync(2)` enters the wrapper with `args = [2]` and `this = undefined`.
3. The executor calls `loadUser.call(undefined, 2, cb)`, appending `cb`.
4. `loadUser`'s timer fires with `(null, { id: 2, name: "user-2" })`. `error` is `null`, so the
   rejection branch is skipped.
5. `values = [{ id: 2, name: "user-2" }]`, length is `1`, so `resolve(values[0])` fulfils the promise
   with the user object.

Now `promisify(getStats)(1)` where `getStats` calls `cb(null, 3, 4)`: step 5 instead sees
`values = [3, 4]`, length `2`, and resolves with the array `[3, 4]`. That single ternary is the whole
multi-value policy.

For the `this` case, `addAsync.call(obj, 5)` sets the wrapper's `this` to `obj`; the wrapper forwards
it with `.call`, so `this.base` inside `add` is `10` and the promise resolves to `15`.

### Complexity

Time: `O(k)` per call for `k` arguments (the array spread and push). Space: `O(k)` for the argument
array, plus `O(1)` for the pending promise. No copies of the resolved value.

### Edge Cases

- **Falsy error** (`0`, `""`, `false`): `if (error)` treats it as success. Only truthy values reject.
- **Zero success values**: `values.length > 1` is false, so it resolves `values[0]`, i.e. `undefined`.
- **Callback called twice**: the promise keeps the first settlement; extra calls are ignored.
- **Never called back**: the promise stays pending forever — wrap it with a timeout if that is a risk.
- **`promisify(promisify(fn))`**: the outer wrapper appends a callback that the inner wrapper never
  calls, so it hangs. Promisify exactly once.
- **Already-promise-returning function**: the appended callback is ignored and the promise hangs; do
  not promisify functions that already return promises.
- **Custom symbol**: `original[kCustom]` is returned as-is, so guard against a non-function value.
- **Constructors / arrows**: arrows ignore `this` harmlessly; class constructors cannot be promisified
  because you cannot call them without `new`.

### Interview Follow-ups

- **`promisifyAll(obj)`**: walk `Object.getOwnPropertyNames` up the prototype chain, wrap each
  function-valued property, and skip `constructor` and underscore-prefixed names.
- **Why not sniff `.length`?** Default, rest, and bound parameters make `length` a lie; the callback
  position is a convention, not a computed value.
- **What is `util.promisify.custom` for?** `exec` needs to return `{ stdout, stderr }` rather than a
  bare value, so it declares a bespoke promisified function plus named values.
- **Typing it** (TypeScript): `(...args: Parameters<F> extends [...infer A, unknown] ? A : never) =>
  Promise<Return>` — strip the final parameter and wrap the result.
- **Production:** prefer the built-in promise API (`node:fs/promises`, `fetch`) over promisifying.

### Common Mistakes

- Calling `original(...args, cb)` and losing `this`; method calls then read the wrong receiver.
- Always resolving `values` (the array), so callers of single-value APIs get `[value]`.
- Mixing `if (error)` and `error != null` between the wrapper and its tests.
- Pushing the callback into a caller-owned array (fine with rest, a bug when `arguments` or a shared
  array is reused).
- Double-promisifying, which produces a promise that never settles.
- Hard-coding the callback as the second parameter instead of the last.

### Takeaway

`promisify` is argument-shuffling plus `this` forwarding wrapped around the callback-to-promise
translation: append the callback, reject on the first argument, resolve the rest. The only judgement
call is what to do with multiple success values, and you should state that policy out loud.

## Implement `retry`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `retry(fn, retries, options?)` where `fn` is a function returning a promise. Call `fn`; if
it rejects, try again until the attempts are exhausted, then resolve with the first success.

The contract:

- `retries` is the number of **additional** attempts after the first, so total calls are
  `retries + 1`. Say this out loud — "3 retries" is ambiguous in every interview.
- Only a **rejection** triggers a retry. A resolved value, including `undefined`, ends the loop
  immediately.
- When every attempt fails, reject with the **last** error, not the first. That is the error the
  caller needs in order to decide what went wrong most recently.
- `shouldRetry(error, attempt)` is an optional predicate. If it returns `false`, stop immediately and
  reject with that error — this is how you avoid retrying a `400` or a validation failure.
- `fn` is called with the zero-based attempt index.
- A synchronous throw from `fn` must be treated exactly like a rejection.
- `retries` must be a non-negative integer; otherwise throw before doing any work.

Retrying is only safe for **idempotent** operations, or for operations the server explicitly marks
retryable. Blindly retrying a `POST` can duplicate a payment.

### Examples

```text
retry(fetchOnce, 3)                  // fn called at most 4 times; last error on total failure
retry(fetchOnce, 0)                  // exactly one attempt, no retries
retry(fetchOnce, 2)                  // 3 attempts: indices 0, 1, 2

// succeed on the third call
retry(flaky, 3)                      // => value from attempt index 2

// stop early on a non-retryable error
retry(fetchOnce, 5, {
  shouldRetry: (err) => err.status >= 500,
})                                   // => rejects immediately on a 404

retry(fn, -1)                        // => RangeError
retry(notAFunction, 3)               // => TypeError
```

### Approach

Use one loop with an explicit attempt counter, and let `try/catch` do the rejection handling. Because
the wrapper is `async`, `await fn(attempt)` captures both a rejected promise and a synchronous throw
in the same `catch` — no extra normalization needed.

Two invariants carry the whole problem:

1. **The loop condition is `attempt <= retries`.** Attempt `0` is the first call, so the last index
   is `retries`, giving `retries + 1` total calls.
2. **On failure, record and re-check before retrying.** Assign `lastError = error` first, then decide
   whether to continue. Breaking out of the loop funnels every exit path into a single
   `throw lastError`, which is what makes "preserve the last error" structural rather than incidental.

The stop predicate is evaluated **after** incrementing/considering the attempt, and it also decides
whether the error is thrown. Note that a `shouldRetry` that itself throws propagates its own error and
replaces `lastError` — a sharp edge worth mentioning rather than coding around.

Do not use recursion here without thought: a synchronous `fn` that rejects many times still yields
microtasks because of `await`, so a loop is both simpler and constant-space.

### Implementation

```javascript
async function retry(fn, retries = 3, { shouldRetry = () => true } = {}) {
  if (typeof fn !== "function") {
    throw new TypeError("retry expects a function");
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a non-negative integer");
  }

  let lastError;

  // attempt 0 is the first call; the last index is `retries`.
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);        // handles both rejection and sync throw
    } catch (error) {
      lastError = error;               // always keep the most recent failure

      const hasRetriesLeft = attempt < retries;
      // Stop when exhausted, or when the error is not worth retrying.
      if (!hasRetriesLeft || !shouldRetry(error, attempt)) break;
    }
  }

  throw lastError;                     // the single rejection path
}
```

### Walkthrough

Take a `fn` that rejects on index 0, rejects on index 1, and resolves `"ok"` on index 2, called as
`retry(fn, 3)`:

1. `attempt = 0`: `await fn(0)` rejects `Error("boom-0")`. `lastError` is set. `0 < 3` is true and
   `shouldRetry` defaults to `true`, so the loop continues.
2. `attempt = 1`: `await fn(1)` rejects `Error("boom-1")`. `lastError` is replaced. `1 < 3`, continue.
3. `attempt = 2`: `await fn(2)` resolves `"ok"`, so `return "ok"` exits the function. The loop never
   reaches `attempt = 3`.

If instead every attempt rejected through index 3: step 3 sets `lastError = Error("boom-3")`, and
`3 < 3` is false, so the loop breaks and `throw lastError` rejects with `"boom-3"` — the last error,
not `"boom-0"`.

With `retries = 0`, the loop body runs once at `attempt = 0`; a failure immediately breaks and throws
that single error.

### Complexity

Time: `O(retries + 1)` attempts, each as long as `fn` takes; the errors and successes are not copied.
Space: `O(1)` beyond `lastError`, regardless of how many retries happen — the loop does not accumulate.

### Edge Cases

- `retries = 0` → exactly one attempt; still uses the same code path.
- Negative, fractional, or `NaN` retries → `RangeError` before any call is made.
- Sync-throwing `fn` → caught by the same `catch`; retried just like a rejection.
- `fn` resolves with `undefined` → counts as success; `return` exits, no retry.
- `shouldRetry` returns `false` on the first failure → break and throw that error.
- `shouldRetry` throws → its error propagates and effectively replaces the retry error.
- All attempts fail → the last error is thrown, so callers correlate to the most recent attempt.
- Non-idempotent work → retrying may duplicate side effects; production code needs an idempotency key.
- Rejected-then-succeeded attempts leave earlier errors only in the failure path, so there is nothing
  to clean up.

### Interview Follow-ups

- **Add delay between attempts** — the next problem; insert an `await sleep(delay)` before continuing.
- **Exponential backoff with jitter** — problem 5; compute the wait from the attempt index.
- **Per-attempt timeout**: wrap each `fn(attempt)` call in `withTimeout`, or reset a shared deadline.
- **`shouldRetry` by status class**: default to retrying only on network errors, `429`, and `5xx`;
  honour `Retry-After` when present.
- **Result metadata**: resolve `{ value, attempts }` so callers can log how flaky the dependency is.
- **Production:** `fetch-retry`, `p-retry`, or your HTTP client's built-in retry policy.

### Common Mistakes

- Treating `retries` as total attempts, off by one in both directions.
- Throwing the **first** error (captured once outside the loop) instead of `lastError`.
- Retrying on a resolved-but-unsatisfactory value; `retry` cannot see your business rules.
- Forgetting that `await fn()` inside `try` is what makes synchronous throws retryable.
- Retrying every error, including `401`/`404`, and hammering a server that already said no.
- Calling `shouldRetry` before recording `lastError`, so a `false` verdict loses the error.

### Takeaway

`retry` is a bounded loop plus one shared rejection path. Keep the latest error in a variable, test
"is there another attempt" and "is this error worth retrying" separately, and let the final `throw`
be the only exit for failure.

## Implement Retry With Delay

`Difficulty: Medium` `Probability: High`

### Problem

Extend `retry` so there is a wait between attempts: `retryWithDelay(fn, retries, options?)` where
`options.delay` is either a number of milliseconds or a function `(attempt, error) => ms`.

The contract:

- Wait **after** a failure and **before** the next attempt. Never delay before the first call, and
  never delay after the final failure — the promise should reject as soon as the last attempt fails.
- Retry only on rejection, preserve the last error, and honour `shouldRetry`, exactly as before.
- A `delay` function receives the failed attempt index (0-based) and the error, so it can compute a
  per-attempt wait or skip the wait entirely by returning `0`.
- Support cancellation with an `AbortSignal`: aborting must clear the pending timer and reject with
  the abort reason instead of waiting out the delay.
- `delay` must be a finite, non-negative number; reject invalid values up front.

Delay exists to protect the dependency, not the caller. A retry storm immediately after a failure is
often worse than the original error: every client retries at the same instant and the struggling
service stays down. Real systems therefore pair delay with **jitter** (problem 5).

### Examples

```text
retryWithDelay(fetchOnce, 3, { delay: 200 })
// call -> fail -> wait 200ms -> call -> fail -> wait 200ms -> call -> fail -> wait 200ms -> call
// (4 calls, 3 waits)

retryWithDelay(fetchOnce, 2, { delay: (attempt) => attempt * 100 })
// failed attempt 0 -> wait 0ms; failed attempt 1 -> wait 100ms

retryWithDelay(fetchOnce, 5, { delay: 100, signal })
// aborting during a wait rejects immediately and clears the timer

retryWithDelay(fetchOnce, 3, { delay: -1 })   // => RangeError
```

### Approach

Split the timing out into a cancellable `sleep(ms, signal)` helper, then reuse the retry skeleton.
Two rules make the timing correct:

1. **Delay lives inside the `catch`, after the "do we continue?" check.** That ordering guarantees no
   wait before the first attempt and no trailing wait when the attempts are exhausted or
   `shouldRetry` returns `false`.
2. **The sleep must be abortable.** A bare `setTimeout` promise cannot be interrupted, so an aborted
   request would still burn the full delay before rejecting. `sleep` registers an `abort` listener,
   clears the timer on abort, and rejects with `signal.reason`.

Testing note: real timers make a retry test take seconds. Make the delay injectable (a function) or
use fake timers; do not hard-code `setTimeout` at the call site.

For non-`AbortSignal` cleanup there is nothing to release — a resolved timer is done. The only leak
risk is registering an abort listener that is never removed; remove it in the timeout callback too,
not just on abort.

### Implementation

```javascript
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);                 // do not leave the timer pending
      reject(signal.reason);
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function retryWithDelay(fn, retries = 3, options = {}) {
  const { delay = 100, shouldRetry = () => true, signal } = options;

  if (typeof fn !== "function") throw new TypeError("retry expects a function");
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a non-negative integer");
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      const hasRetriesLeft = attempt < retries;
      if (!hasRetriesLeft || !shouldRetry(error, attempt)) break;

      const wait = typeof delay === "function" ? delay(attempt, error) : delay;
      if (!Number.isFinite(wait) || wait < 0) {
        throw new RangeError("delay must be a non-negative finite number");
      }
      await sleep(wait, signal);           // only between attempts
    }
  }

  throw lastError;
}
```

### Walkthrough

`retryWithDelay(fn, 2, { delay: (attempt) => attempt * 100 })`, where `fn` fails on indices 0 and 1
and succeeds on index 2:

1. `attempt = 0`: `await fn(0)` rejects `boom-0`. `lastError = boom-0`, `0 < 2` is true,
   `shouldRetry` allows it. `delay(0, boom-0)` is `0`, so `sleep(0)` resolves on the next timer tick
   and the loop continues.
2. `attempt = 1`: `await fn(1)` rejects `boom-1`. `lastError = boom-1`, `1 < 2` is true.
   `delay(1, boom-1)` is `100`, so `sleep(100)` waits ~100ms.
3. `attempt = 2`: `await fn(2)` resolves `"ok"` and the function returns.

Total wall time is ~100ms; two waits at most. Note step 1's `sleep(0)` still yields to the event loop
— `setTimeout(..., 0)` is a macrotask, so it is a real (if tiny) delay, not a no-op.

If the signal aborts during step 2, `onAbort` clears the 100ms timer and rejects, so the `await
sleep` throws the abort reason out of the `catch` block, propagating it to the caller rather than
being retried. That is intentional: an abort is not a failure to retry.

### Complexity

Time: `O(retries + 1)` attempts plus `O(sum of delays)` wall time. Space: `O(1)` state; each `sleep`
holds one timer until it fires or is cleared.

### Edge Cases

- `delay` missing → defaults to `100`.
- `delay: 0` → still a macrotask hop, useful for yielding without a real wait.
- `delay(attempt, error)` returns `0` selectively → per-error backpressure.
- Abort before the first attempt → the signal is checked by `sleep`, but `fn` still runs once unless
  you also check `signal.aborted` at the top of the loop.
- Abort during a wait → timer cleared, reject with `signal.reason`.
- Abort during `fn` → only works if `fn` itself accepts the signal; `sleep` cannot interrupt it.
- `shouldRetry` false → no delay is consumed, the loop breaks and throws immediately.
- Invalid `delay` (negative, `NaN`, `Infinity`) → `RangeError` rather than a `setTimeout` clamp.
- Process exit in Node → a pending `sleep` timer keeps the event loop alive; clear it or call
  `timer.unref()` in server code.

### Interview Follow-ups

- **Add jitter and exponential growth** — the next problem; replace the constant with
  `backoff(attempt)` and randomize inside the cap.
- **Respect `Retry-After`**: when a `429`/`503` response names a delay, use it instead of your own.
- **Shared deadline**: pass a total budget so `retries` and `delay` cannot combine into a 10-minute
  hang.
- **Injected timer**: take `sleep` as a dependency so tests use fake timers and finish instantly.
- **Why not `setInterval`?** `setTimeout` once per attempt is simpler to cancel and needs no state.

### Common Mistakes

- Sleeping *before* the first attempt, adding latency to the happy path.
- Sleeping after the final failure, so the promise rejects late for no benefit.
- A non-cancellable sleep, so an aborted request still waits out the full delay.
- Forgetting `clearTimeout` on abort, leaking a timer and keeping Node's event loop alive.
- Using `delay: 0` and assuming it is synchronous — it is still a macrotask.
- Retrying on abort because the sleep rejection flows through the same `catch`; distinguish abort from
  a genuine failure.

### Takeaway

Delay is scheduling, not retrying: it belongs between attempts only, it must be cancellable, and the
decision to wait is separate from the decision to retry. Split it into `sleep` and let the loop call
it after the continue-check.

## Implement Exponential Backoff (With Jitter and Max Delay)

`Difficulty: Hard` `Probability: High`

### Problem

Implement `retryWithBackoff(fn, options?)`: retry a promise-returning function, waiting longer after
each failure, with an optional random jitter and a hard cap.

Options and defaults:

```text
retries    : number   = 3       additional attempts after the first
baseDelay  : number   = 100     milliseconds before the first retry
factor     : number   = 2       multiplier applied per consecutive failure
maxDelay   : number   = 30_000  ceiling for a single wait
jitter     : "none" | "full" | "equal" = "none"
shouldRetry: (error, attempt) => boolean = () => true
signal     : AbortSignal
random     : () => number = Math.random   (injectable for deterministic tests)
```

The contract:

- The wait before retry number `n` (counting failures; the first failure is `n = 0`) is
  `min(baseDelay * factor ** n, maxDelay)`, then jitter is applied.
- Retry only on rejection; preserve the last error; `shouldRetry` can stop early.
- `maxDelay` caps the computed delay **before** jitter, so a capped wait cannot exceed `maxDelay`.
- `random` is injected so the delay sequence is testable; production passes `Math.random`.
- Growth must not overflow: `factor ** n` reaches `Infinity` quickly for large `n`, and `Math.min`
  must be what keeps it finite.

The two jitter modes, both applied to the capped value:

- **full**: `random() * capped` — the wait is uniform in `[0, capped]`. Best at breaking synchronised
  retries across clients, but it can pick a value near `0`, so senders still bunch up sometimes.
- **equal**: `capped / 2 + random() * (capped / 2)` — uniform in `[capped/2, capped]`. Preserves a
  minimum wait at the cost of less spread.

Without jitter, every client that failed at the same moment retries at the same moment. That
synchronised wave is the "thundering herd", and it is why production backoff is always jittered.

### Examples

```text
// baseDelay 100, factor 3, no jitter, maxDelay 1000:
// failures at 0,1,2,3 produce waits 100, 300, 900, 1000 (2700 capped)

// full jitter with a seeded random, retries 2, baseDelay 1000:
backoffDelay(0, { baseDelay: 1000, factor: 2, maxDelay: 60000, jitter: "full", random: () => 0.25 })
// => 250

// equal jitter:
backoffDelay(0, { baseDelay: 1000, factor: 2, maxDelay: 60000, jitter: "equal", random: () => 0.5 })
// => 750   (500 + 0.5 * 500)

// cap dominates once growth passes maxDelay
backoffDelay(10, { baseDelay: 100, factor: 2, maxDelay: 5000, jitter: "none" })
// => 5000
```

### Approach

Separate **computing** the delay from **waiting** for it. A pure `backoffDelay(attempt, config)`
function is trivially unit-testable because `random` is a parameter; the retry loop then only calls
it and awaits `sleep`.

Order of operations matters:

1. Grow: `baseDelay * factor ** attempt`.
2. Cap: `Math.min(raw, maxDelay)` — always cap before jitter, so the cap is a true upper bound.
3. Jitter the capped value.

Guards to include: clamp `attempt` at `0` (negative exponents produce fractions), coerce a bad
`factor` to the default rather than letting it produce `NaN`, and treat a non-finite `raw` as
`maxDelay` (which `Math.min` already does for `Infinity`, but `NaN` would poison `Math.min`).

The retry loop is identical in structure to the previous problem — record `lastError`, check
`hasRetriesLeft && shouldRetry`, sleep, retry — with the constant delay replaced by `backoffDelay`.

**`jitter: "full"` can return `0`.** That is legal but means a full-jitter implementation can retry
immediately; if a floor is required, use equal jitter or `Math.max(floor, value)`.

### Implementation

```javascript
function backoffDelay(attempt, {
  baseDelay = 100,
  factor = 2,
  maxDelay = 30_000,
  jitter = "none",
  random = Math.random,
} = {}) {
  const n = Math.max(0, attempt);
  const f = Number.isFinite(factor) ? factor : 2;
  const grown = baseDelay * f ** n;

  // Cap BEFORE jitter so maxDelay stays a real upper bound.
  const capped = Math.min(grown, maxDelay);
  if (!Number.isFinite(capped)) return maxDelay;   // Infinity or NaN growth

  if (jitter === "full") return Math.round(random() * capped);
  if (jitter === "equal") return Math.round(capped / 2 + random() * (capped / 2));
  return capped;
}
```

```javascript
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);

    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 100,
    factor = 2,
    maxDelay = 30_000,
    jitter = "none",
    shouldRetry = () => true,
    signal,
    random = Math.random,
  } = options;

  if (typeof fn !== "function") throw new TypeError("retry expects a function");
  if (!Number.isInteger(retries) || retries < 0) throw new RangeError("invalid retries");

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error, attempt)) break;

      const wait = backoffDelay(attempt, { baseDelay, factor, maxDelay, jitter, random });
      await sleep(wait, signal);
    }
  }

  throw lastError;
}
```

### Walkthrough

`retryWithBackoff(fn, { retries: 3, baseDelay: 100, factor: 2, maxDelay: 400 })` with no jitter, where
`fn` fails on indices 0, 1, 2 and succeeds on 3:

1. `attempt = 0` fails. `0 >= 3` false, `shouldRetry` true. `grown = 100 * 2**0 = 100`, `capped =
   min(100, 400) = 100`. Sleep 100ms.
2. `attempt = 1` fails. `grown = 100 * 2**1 = 200`, `capped = 200`. Sleep 200ms.
3. `attempt = 2` fails. `grown = 100 * 2**2 = 400`, `capped = 400`. Sleep 400ms.
4. `attempt = 3` resolves and returns.

Total wait 700ms. Note the cap never binds here; with `retries: 5` the sequence would be 100, 200,
400, 400 (min(800, 400)), 400.

Now `backoffDelay(1, { baseDelay: 1000, factor: 2, maxDelay: 60000, jitter: "equal", random: () =>
0.5 })`: `grown = 2000`, `capped = 2000`, equal jitter gives `1000 + 0.5 * 1000 = 1500`. With
`jitter: "full"` and the same `random`, it would be `0.5 * 2000 = 1000`.

### Complexity

Time: `O(retries + 1)` attempts, wall time `O(sum of waits)` which is dominated by `maxDelay` once the
cap binds. Space: `O(1)`. `backoffDelay` itself is `O(1)` — `f ** n` is a single operation, not a
loop.

### Edge Cases

- `attempt` negative (misuse) → clamped to `0` so the delay is `baseDelay`.
- `factor <= 1` → a flat or shrinking schedule; legal but pointless, worth logging in review.
- `factor ** n` overflows to `Infinity` → `Math.min` keeps `maxDelay`; `NaN` growth returns
  `maxDelay` explicitly.
- `maxDelay < baseDelay` → the first wait is capped, so all waits equal `maxDelay`.
- `jitter: "full"` returns `0` → the next attempt fires immediately; use equal jitter for a floor.
- `retries = 0` → `backoffDelay` is never called and no timer is created.
- Abort during a wait → `sleep` clears the timer and throws `signal.reason`.
- Abort before the first attempt → `fn` still runs once unless the loop checks `signal.aborted`.
- `random` injected as a constant → fully deterministic tests; production must pass the real thing.
- `Math.round` can produce a value one below/above the formula's bounds by rounding, but never above
  `maxDelay` for `jitter: "none"` or `"equal"`.

### Interview Follow-ups

- **Add a ceiling on total time**, not just per-wait, so the whole retry budget is bounded.
- **Honour `Retry-After`** from `429`/`503` responses, falling back to backoff when the header is
  absent or invalid.
- **Decorrelated jitter** (`min(maxDelay, random(base, prev * 3))`) is a third, widely used algorithm.
- **Why is backoff not enough without jitter?** Deterministic schedules keep client retries
  synchronised; jitter spreads them.
- **Where should the schedule live?** Behind a small pure function, exactly as here, so tests can
  assert the sequence without waiting.

### Common Mistakes

- Jittering **before** the cap, so a random value can exceed `maxDelay`.
- Using `Math.random()` directly inside the loop, making the schedule untestable.
- Forgetting that `factor ** n` overflows, and surfacing `Infinity` to `setTimeout` (which clamps to
  1ms and turns the backoff into a hammer).
- Retrying after the final attempt because the delay is computed before the exhaustion check.
- Treating `retries` as total attempts and running one fewer than intended.
- Assuming `jitter: "full"` always waits; it can legitimately wait `0ms`.

### Takeaway

Backoff is one formula — `min(base * factor ** attempt, maxDelay)` — applied between attempts, with
jitter applied **after** the cap to break the thundering herd. Keep the formula pure and injectable,
and keep the retry loop identical to the simple `retry` skeleton.

## Implement `withTimeout`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `withTimeout(input, ms, message?)` that resolves or rejects with `input` if it settles
within `ms` milliseconds, and otherwise rejects with a timeout error.

`input` is either a promise or a function returning a promise, so both
`withTimeout(fetchData(), 3000)` and `withTimeout(() => fetchData(), 3000)` work.

The contract:

- If `input` fulfils first, the returned promise fulfils with the same value.
- If `input` rejects first, the returned promise rejects with the same reason.
- If `ms` elapses first, reject with a `TimeoutError` (or `new Error(message)` when a message is
  supplied).
- **The timer is always cleared**, on every path. A surviving timer keeps Node's event loop alive,
  leaks test handles, and can fire after the call has already finished.
- After the timeout fires, a late rejection from `input` must **not** become an unhandled rejection.
- `input` is not cancelled. JavaScript has no promise cancellation; the underlying work keeps running
  until it finishes or is aborted through a shared `AbortSignal`.

`Promise.race([input, timeoutPromise])` looks like the answer and is not. It leaves the losing timer
pending, it cannot distinguish a timeout from a rejection of `input`, and it gives you no place to
clean up. The race also cannot clear the timer when `input` wins, which is the most common leak.

### Examples

```text
await withTimeout(fetchData(), 3000)                 // resolves if fetchData settles < 3000ms
await withTimeout(fetchData(), 3000)                 // rejects TimeoutError after 3000ms
await withTimeout(Promise.reject(new Error("x")), 50) // rejects Error("x") immediately
await withTimeout(() => { throw new Error("sync") }, 50) // rejects, does not throw
withTimeout(fetchData(), 3000, "request took too long")
// rejects Error("request took too long")

await withTimeout(Promise.resolve(1), 0)
// ms = 0: the timer is a macrotask, so the already-resolved promise wins the microtask race
```

### Approach

Build the returned promise manually so both outlets can clear the timer:

1. Normalize `input` to a promise. If it is a function, call it; wrap the call in `try/catch` and
   return `Promise.reject(error)` on a synchronous throw, so the timeout never starts for a failure
   you already have.
2. Start `setTimeout` that rejects with the timeout error.
3. Attach `input.then(onFulfilled, onRejected)`. **Both** handlers call `clearTimeout(timer)` before
   forwarding.

Two subtleties:

- **Handling the late rejection.** Because you attach an `onRejected` handler synchronously, the
  original promise's rejection is always observed — even if the timeout already won. If you instead
  used `Promise.race`, or only attached a `.then(onFulfilled)`, a slow rejection would surface as an
  `unhandledrejection`.
- **`Timer` typing in Node vs browsers.** `setTimeout` returns a `number` in browsers and a `Timeout`
  object in Node; `clearTimeout` accepts both, so do not annotate the variable as `number`.

A `.finally(() => clearTimeout(timer))` variant is idiomatic and shorter, but it adds a microtask hop
before the outer promise settles and reads as if cleanup were incidental. The explicit two-branch
version states the invariant — "clear on settle, whichever settle" — in the control flow itself.

**Distinguishing a timeout from a failure.** A dedicated `TimeoutError` subclass with a `name` and
the `ms` value lets callers branch with `err instanceof TimeoutError` or `err.name ===
"TimeoutError"`, which a bare `Error` cannot support reliably.

### Implementation

```javascript
class TimeoutError extends Error {
  constructor(ms, message = `Operation timed out after ${ms}ms`) {
    super(message);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

function withTimeout(input, ms, message) {
  let promise;
  try {
    promise = typeof input === "function" ? input() : input;
  } catch (error) {
    return Promise.reject(error);      // sync throw -> rejection, not a synchronous throw
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(message === undefined ? new TimeoutError(ms) : new Error(message)),
      ms,
    );

    promise.then(
      (value) => {
        clearTimeout(timer);           // settle path 1: input won
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);           // settle path 2: input failed
        reject(error);                 // also marks the late rejection as handled
      },
    );
  });
}
```

### Walkthrough

`await withTimeout(fetchData(), 3000)` where `fetchData` resolves after 1200ms:

1. `input` is a promise (not a function), so `promise` is that promise and no `catch` runs.
2. The executor creates a 3000ms timer and attaches `then` handlers to `promise`.
3. At 1200ms, the `onFulfilled` handler runs: `clearTimeout(timer)` removes the pending timer, then
   `resolve(value)` fulfils the outer promise.
4. `await` receives the value. The timer never fires, and Node's event loop is not held open by it.

Now the same call where `fetchData` takes 5000ms:

1. Steps 1–2 are identical.
2. At 3000ms the timer fires and rejects the outer promise with
   `TimeoutError("Operation timed out after 3000ms")`. The `await` throws.
3. At 5000ms the underlying promise resolves; the `onFulfilled` handler calls `clearTimeout` on an
   already-fired timer (a no-op) and `resolve(value)`, which is ignored because the outer promise is
   settled. No unhandled rejection, no double settle.

If instead the slow promise *rejects* at 5000ms, the `onRejected` handler consumes the rejection, so
it also produces no `unhandledrejection`. That is the cleanup the naive `Promise.race` version gets
wrong only when the loser is unobserved.

### Complexity

Time: `O(1)` bookkeeping; the wait is the underlying operation's duration up to `ms`. Space: `O(1)`
per call — one promise, one timer, two closures.

### Edge Cases

- `ms = 0`: the timer is a macrotask, so an already-settled `input` wins the microtask race; an
  unsettled one times out.
- `ms` negative → `setTimeout` clamps to `0`.
- `ms = Infinity` → Node warns and clamps to `1ms`; guard non-finite values or document the behavior.
- Function `input` throws synchronously → returns `Promise.reject(error)`, no timer created.
- Non-promise `input` (a value) → `promise.then` throws; either require a thenable or wrap with
  `Promise.resolve(input)`.
- `input` rejects before the timeout → the timer is cleared and the rejection is forwarded unchanged.
- Timeout then late resolve/reject → ignored, and still marked handled.
- The underlying operation keeps running after a timeout — `withTimeout` cannot cancel it.
- A `TimeoutError` crossing realms or `structuredClone` loses its prototype; check `name` as a fallback.

### Interview Follow-ups

- **Real cancellation with `fetch`**: pass `{ signal: AbortSignal.timeout(ms) }`, which aborts the
  request rather than just abandoning it, and rejects with a `TimeoutError` `DOMException`.
- **Share a signal instead**: `const c = new AbortController(); withTimeout(fn(c.signal), ms)` plus
  `c.abort()` on timeout if the callee supports it.
- **`Promise.race` version**: write it, then list the leaks — pending timer, error-source ambiguity,
  no cleanup hook.
- **Timeout with a fallback**: `withTimeout(fn(), ms).catch(() => fallback)`; use `Promise.any` when
  several paths can win.
- **`AbortSignal.timeout` vs `setTimeout`**: the former is the platform's cancellable timer and
  composes with `fetch` and any signal-aware API.

### Common Mistakes

- Forgetting `clearTimeout` on the success path, so a timer outlives the call and keeps the process
  alive.
- Using `Promise.race` and assuming the loser is cleaned up.
- Rejecting with a generic `Error`, leaving callers unable to tell a timeout from a network failure.
- Letting a late rejection be unhandled because only `onFulfilled` was attached.
- Putting the `setTimeout` **inside** the `try`, so a synchronous throw leaks the timer.
- Believing the timeout cancels the work; it only stops waiting for it.

### Takeaway

`withTimeout` is "start a timer, forward whichever settles first, and clear the timer on both paths."
The clear-on-every-path rule and the always-attached rejection handler are the whole difference
between this and `Promise.race`.

## Execute Promise-Returning Functions Sequentially

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `runSequentially(tasks)` where `tasks` is an array of **functions** that return promises.
Run them one at a time, starting each only after the previous one has settled, and resolve with an
array of results in input order.

The contract:

- **No overlap.** Task `i + 1` must not begin until task `i` has resolved.
- **Order preserved.** The result array is parallel to `tasks`, not completion order.
- **Fail fast.** The first rejection rejects the whole run; tasks after the failure never start.
- Each task receives `(previousResult, index)`; `previousResult` is `undefined` for index `0`.
- Empty input resolves `[]`.
- Every entry must be a function; throw `TypeError` before starting anything otherwise.
- A task that throws synchronously must reject the run exactly like a rejected promise.

The central point is **why the input is an array of functions**. A promise starts executing the moment
it is constructed, so `runSequentially([a(), b(), c()])` is already parallel — the calls happened
before the function was invoked. Sequential execution requires deferring the call, which is why the
API takes thunks.

### Examples

```text
runSequentially([() => delay(300, "a"), () => delay(100, "b"), () => delay(200, "c")])
// total ~600ms, resolves ["a", "b", "c"]   (sum of durations, not max)

runSequentially([
  () => fetchUser(1),
  (user) => fetchPosts(user.id),
  (posts) => fetchComments(posts[0].id),
])
// a waterfall: each task consumes the previous result

runSequentially([() => Promise.resolve(1), () => { throw new Error("boom"); }, () => ...])
// rejects Error("boom"); the third task never runs

runSequentially([])              // => []
runSequentially([1, 2])          // => TypeError
```

Contrast with parallel over the same durations: `Promise.all` finishes in ~300ms, the slowest task.
Sequential finishes in ~600ms and needs one connection at a time.

### Approach

Three equivalent ways to express sequencing; know one cold and mention the others.

1. **`for...of` with `await`** (primary). A plain loop suspends between iterations, so `await` inside
   it serialises the calls. It is the most readable, needs no accumulator gymnastics, and naturally
   passes the previous result.
2. **`reduce` building a promise chain.** Each step returns `chain.then(...)`, appending to the
   results array. Correct and popular in legacy code, but harder to read and it allocates a link per
   task.
3. **An explicit index queue.** A `next()` function that runs `tasks[i]()`, then calls itself from
   the `.then`. This is the no-`async/await` version, and it is the shape to reach for when you also
   need a concurrency limit.

Cross-cutting rules:

- **Push, do not index.** In the `for...of` version a rejected task aborts the loop, so `push` keeps
  results densely aligned with the tasks that actually ran. In the queue version, keep a local `i`
  captured per step so a later increment cannot misattribute a result.
- **Capture synchronous throws.** `await task(...)` inside `try` catches both; the queue version must
  go through `Promise.resolve().then(() => task(i))` for the same guarantee.
- **Argument contract.** Passing `(previousResult, index)` makes it a reduce/waterfall; passing
  `(index)` alone makes it a pure pipeline. Document which one you implemented.
- **No recursion depth problem.** `next()` is invoked from a `.then` callback, i.e. in a fresh
  microtask, so even a 100,000-task queue does not grow the stack.

### Implementation

```javascript
// Primary: a loop that suspends between iterations.
async function runSequentially(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array");

  for (let i = 0; i < tasks.length; i += 1) {
    if (typeof tasks[i] !== "function") {
      throw new TypeError(`task ${i} must be a function`);
    }
  }

  const results = [];
  for (let i = 0; i < tasks.length; i += 1) {
    // `await` is what serialises: the next call cannot happen before this settles.
    const value = await tasks[i](results[i - 1], i);
    results.push(value);
  }
  return results;
}
```

```javascript
// No-async version: an explicit index queue, the shape a concurrency limiter builds on.
function runSequentiallyQueue(tasks) {
  return new Promise((resolve, reject) => {
    const results = [];
    let index = 0;

    const next = () => {
      if (index >= tasks.length) {
        resolve(results);
        return;
      }
      const i = index;                       // capture before any await
      Promise.resolve()
        .then(() => tasks[i](results[i - 1], i))  // wraps sync throws into rejection
        .then(
          (value) => {
            results.push(value);
            index += 1;
            next();                          // runs in a new microtask: no stack growth
          },
          reject,                            // fail fast; index never advances
        );
    };

    next();
  });
}
```

### Walkthrough

`runSequentially` on `[() => delay(300, "a"), () => delay(100, "b")]`, where `delay(ms, v)` resolves
`v` after `ms`:

1. Validation passes; `results = []`.
2. `i = 0`: `await tasks[0](undefined, 0)` calls the first thunk. It returns a promise that settles
   after 300ms. The loop is suspended, so `tasks[1]` has not been called.
3. At 300ms the promise fulfils with `"a"`; `results` becomes `["a"]`.
4. `i = 1`: `await tasks[1]("a", 1)` starts the second thunk, which resolves `"b"` after another
   100ms.
5. `results` becomes `["a", "b"]`, the loop ends, and the function resolves with it.

Total wall time is ~400ms — the **sum** of the durations. The parallel version of the same two tasks
takes ~300ms (the **max**). If the first task rejected at step 3, the `await` would throw out of
`runSequentially` and `tasks[1]` would never run, so no request is wasted.

For the queue version, step 4's work happens inside the `onFulfilled` handler: `index += 1` then
`next()`. Because `next` is called from a promise callback, it runs in a new microtask, which is why
a long task list cannot overflow the stack.

### Complexity

Time: `O(n)` tasks, wall time `O(sum of task durations)` — the defining cost of sequencing. Space:
`O(n)` for the results array, `O(1)` working memory (the loop is iterative). The queue version adds
one microtask per task.

### Edge Cases

- Empty array → resolves `[]` immediately.
- Single task → behaves like awaiting it directly.
- Non-function entry → `TypeError` from validation, before any task runs.
- Synchronous throw → rejection; remaining tasks skipped.
- Rejection mid-run → fail fast; earlier results are discarded, later tasks never start.
- Task returns a non-promise → `await` passes it through as if resolved.
- Huge arrays → the loop does not recurse; the queue version is also safe because of the microtask hop.
- Results retained → `O(n)` memory for large payloads; if you only need the last value, keep just that.
- `this` and extra arguments → if tasks need a receiver, wrap as `() => obj.method()`.

### Interview Follow-ups

- **Waterfall vs pipeline**: `(previous, index)` turns it into a pipeline; there is no difference in
  the loop, only in what you pass.
- **Continue after failure** (sequential `allSettled`): wrap each `await` in `try/catch` and store
  `{ status, value | reason }` at the same index instead of aborting.
- **Early exit** when a task returns a sentinel, to model "stop when you find it".
- **Add a concurrency limit** by keeping a pool of in-flight workers pulling from a shared index; the
  queue version here is one slot.
- **`for await...of`** over an async generator is the idiomatic form when the task list is itself
  produced asynchronously.

### Common Mistakes

- Passing promises (`[a(), b()]`) instead of thunks, and silently getting parallel execution.
- Using `tasks.forEach(async (t) => { await t(); })` — `forEach` ignores the returned promise, so all
  tasks start at once and rejections vanish.
- Indexing results while aborting on failure, which leaves holes.
- Awaiting only the last promise of a chain built without returning each link.
- Forgetting that `await` in a loop is what serialises; `map` + `await` is not sequential.
- Letting a synchronous throw escape validation and reject with a different error type.

### Takeaway

Sequential execution is `await` inside a loop over **thunks**. Everything else — `reduce` chains,
index queues — is the same idea expressed without `async/await`, and the reason the API must take
functions is that an array of promises has already started running.

## Execute Promise-Returning Functions in Parallel

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `runParallel(tasks)` where `tasks` is an array of functions returning promises. Start all
of them at once and resolve with an array of results **in input order**, regardless of the order in
which they settle.

The contract:

- Every task starts before the first one settles; total wall time is the slowest task, not the sum.
- `results[i]` corresponds to `tasks[i]`, and **must not** be assigned by push order. This is the
  preserve-order requirement: a 100ms task at index 2 settles before a 300ms task at index 1, yet
  index 1 must still hold the slower task's value.
- Resolve only after **all** tasks settle; the counter reaching `length` is the only resolve path.
- The first rejection rejects the run. Every task still receives an `onRejected` handler so no
  rejection is left unhandled.
- Empty input resolves `[]`.
- Validate that every entry is a function before starting anything, so `TypeError` cannot leave work
  half-started.
- `Promise.all` is the sanctioned answer; the hand-rolled version exists to prove you understand the
  ordering bookkeeping.

### Examples

```text
runParallel([() => delay(300, "a"), () => delay(100, "b"), () => delay(200, "c")])
// completes in ~300ms and resolves ["a", "b", "c"]
// notice "b" and "c" *finish* first, but the array is still input-ordered

runParallel([() => Promise.resolve(1), () => Promise.reject(new Error("x"))])
// rejects Error("x"); the promise never resolves

runParallel([])                  // => []
runParallel([1])                 // => TypeError
runParallel([() => Promise.resolve(1), () => { throw new Error("sync"); }])
// rejects Error("sync"); rejection, not a synchronous throw
```

The one-line version, which is what you would ship:

```javascript
const runParallel = (tasks) => Promise.all(tasks.map((task) => task()));
// Promise.all itself guarantees input-order results.
```

### Approach

Hand-rolled parallel execution is a small fan-in: one shared results array, one remaining counter, one
first-error guard.

1. **Validate first**, so a bad entry throws before any task has started.
2. **Allocate `new Array(n)` and start every task synchronously.** The launching loop must not
   contain `await`; the moment it does, the tasks are sequential again.
3. **Write by index, never by push.** `results[index] = value` is the entire preserve-order semantics.
   `push` records completion order, which is not the contract.
4. **Decrement a counter and resolve at zero.** Resolving on the first success would return a partial
   array; resolving when `remaining === 0` waits for everything.
5. **Attach the rejection handler to every task.** Even after the run has rejected, later failures
   are already observed, so nothing reaches `unhandledrejection`.

The tricky part is the *first* error. A `settled` boolean makes the "only the first rejection counts"
rule explicit and prevents a second `resolve`/`reject` — though promise settlement is already
idempotent, the guard also stops a late success from resolving after a rejection.

**Parallelism has a ceiling.** JavaScript is single-threaded; "parallel" means overlapping I/O waits,
not simultaneous CPU work. Launching 10,000 fetches at once will exhaust sockets and get you rate
limited, so the production shape is a bounded pool: keep `limit` workers alive and pull the next index
when one finishes. That is the natural follow-up, and the queue from the previous problem with `limit`
slots is its skeleton.

### Implementation

```javascript
function runParallel(tasks) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(tasks)) {
      reject(new TypeError("tasks must be an array"));
      return;
    }

    // Validate up front so a bad entry cannot leave work half-started.
    for (let i = 0; i < tasks.length; i += 1) {
      if (typeof tasks[i] !== "function") {
        reject(new TypeError(`task ${i} must be a function`));
        return;
      }
    }

    const results = new Array(tasks.length);
    let remaining = tasks.length;

    if (remaining === 0) {
      resolve(results);
      return;
    }

    let settled = false;                  // only the FIRST outcome is reported

    tasks.forEach((task, index) => {
      // Wrap the call so a synchronous throw becomes a rejection too.
      Promise.resolve()
        .then(() => task(index))
        .then(
          (value) => {
            results[index] = value;       // index-keyed: preserves input order
            remaining -= 1;
            if (remaining === 0 && !settled) {
              settled = true;
              resolve(results);
            }
          },
          (error) => {
            if (!settled) {
              settled = true;
              reject(error);              // first failure wins; others still handled
            }
          },
        );
    });
  });
}
```

### Walkthrough

`runParallel([() => delay(300, "a"), () => delay(100, "b"), () => delay(200, "c")])`:

1. Validation passes; `results = new Array(3)`, `remaining = 3`.
2. `forEach` launches all three thunks synchronously (each wrapped so sync throws reject). All three
   timers are now pending: `a` at 300ms, `b` at 100ms, `c` at 200ms. The launching loop returns.
3. At 100ms `b` settles: `results[1] = "b"`, `remaining = 2`. Not zero, so no resolve.
4. At 200ms `c` settles: `results[2] = "c"`, `remaining = 1`.
5. At 300ms `a` settles: `results[0] = "a"`, `remaining = 0`, so `resolve(results)`.

The result is `["a", "b", "c"]` even though the completion order was `b`, `c`, `a`. That is the whole
point of index assignment: the array is keyed by *input position*, and the counter only controls
*when* to resolve, never *where* values land. Total wall time is ~300ms.

Now the failure case: `[slowOk, fastFail]` where index 1 rejects at 50ms. Index 1's `onRejected`
sets `settled = true` and rejects the run with that error. At 500ms index 0 resolves, writes
`results[0]`, decrements `remaining`, but `remaining !== 0` and `settled` is true, so nothing happens.
The rejected run has already been observed, and index 0's value is discarded.

### Complexity

Time: `O(n)` bookkeeping; wall time is `O(max task duration)`, which is the entire advantage over
sequential. Space: `O(n)` for results plus `O(n)` pending-settle state — one promise and two closures
per task.

### Edge Cases

- Empty array → resolves `[]` without launching anything.
- Single task → resolves with a one-element array.
- Non-function entry → `TypeError` before any task starts (validate first).
- Synchronous throw → converted to a rejection by the `Promise.resolve().then(...)` hop.
- First rejection wins; remaining tasks keep running but their outcomes are ignored and handled.
- Out-of-order completion → handled by index assignment; a `push` implementation fails this.
- Huge fan-out → no built-in concurrency limit; 10k tasks means 10k in-flight operations.
- CPU-bound tasks → no speedup at all; JavaScript cannot overlap synchronous work.
- Duplicate or missing indices in the input → results align positionally, so duplicates collapse into
  two positions as expected; there is no sparse input in a dense array.
- Late success after rejection → ignored because of the `settled` guard.
- Tasks resolving to promises → adopted normally by the `.then` chain.

### Interview Follow-ups

- **Add a concurrency limit** (`runWithLimit(tasks, limit)`): a shared index, `limit` workers, each
  pulling the next task when its current one settles. Preserve the index-keyed results array.
- **All-settled variant**: always resolve with `{ status, value | reason }` per index; never reject.
- **`Promise.all` vs `Promise.allSettled` vs `Promise.any`**: fail-fast, never-fail, and first-success
  semantics respectively; all three preserve input order.
- **Early resolve on first success**: `Promise.race(tasks.map((t) => t()))` for latency-sensitive
  races; note the losing promises are not cancelled.
- **Abort the rest**: pass a shared `AbortController.signal` so the first failure can cancel the
  in-flight work instead of just ignoring it.
- **Production:** `p-map` with a `concurrency` option, or your runtime's bulk APIs.

### Common Mistakes

- Assigning results with `push` and calling it parallel — it is completion-ordered, which silently
  breaks the contract whenever durations differ.
- Resolving on the first success, so the caller gets a partial array.
- Starting tasks one per `.then` (misplaced `await`) and getting sequential behaviour with parallel
  syntax.
- Omitting the rejection handler on some tasks, causing `unhandledrejection` for losers.
- Unbounded fan-out that exhausts sockets or trips a rate limit.
- Validating lazily inside the launch loop, leaving earlier tasks running after a `TypeError`.
- Forgetting that "parallel" in JS is I/O concurrency, not multi-core CPU work.

### Takeaway

Parallel execution is "launch everything, collect by index, resolve at zero." The counter decides
*when* to settle; the index decides *where* each value goes. Get those two roles backwards and you
have written a completion-order `Promise.all` that fails only under timing that tests rarely
reproduce.


## Execute Asynchronous Tasks With a Maximum Concurrency of `N`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `asyncPool(limit, items, iteratorFn)` that runs `iteratorFn(item, index)` for every item but never has more than `limit` calls in flight at once. It returns a promise for an array of results **in the same order as `items`**, regardless of which task finishes first.

Contract:

- `limit` is a positive integer; `limit < 1` is a programming error (`RangeError`).
- `iteratorFn` is called at most once per item, with `(item, index, items)`.
- Concurrency is capped at `min(limit, items.length)`; no more than `limit` promises are pending at any instant.
- Results are positional: `results[i]` is the result of `items[i]`.
- The first rejection rejects the returned promise. Tasks already running are **not** cancelled.

That last point is the honest limit: JavaScript has no way to stop a promise that is already in flight. "Cancellation" is cooperative — the task must accept an `AbortSignal` and honour it.

### Examples

```text
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await asyncPool(2, [30, 10, 20, 5], async (ms, i) => {
  await sleep(ms);
  return ms * 2;
});
// => [60, 20, 40, 10]     (index 0 is slowest yet comes first)

await asyncPool(1, [1, 2, 3], async (n) => n * n)  // => [1, 4, 9]  (strictly serial)
await asyncPool(5, [], async () => 0)              // => []
await asyncPool(3, [1, 2], async (n) => n + 1)     // => [2, 3]
```

### Approach

Two shapes solve this; both cap in-flight work at `N`.

1. **Worker pool (shown).** Spawn `min(limit, n)` workers. Each worker is an async loop that pulls the next index from a shared cursor, awaits its task, and repeats. The number of `await`s in flight equals the number of workers, so the cap is structural — it falls out of the loop count, not from bookkeeping.
2. **Sliding window.** Keep a `Set` of in-flight promises; launch new items while `set.size < limit`, and `await Promise.race(set)` to free a slot. Correct, but you re-derive the cap on every iteration and the code is easier to get wrong.

The worker pool is preferred because "at most `limit` awaits in flight" is true by construction. Two details a naive version misses:

- **The cursor read/increment is safe without a lock.** JavaScript runs on one thread and there is no `await` between reading `nextIndex` and incrementing it, so two workers cannot claim the same index. Never put an `await` there.
- **Order is preserved by writing `results[index]`, not `results.push(value)`.** Push records completion order; positional assignment records input order.

Rejection semantics: `Promise.all(workers)` rejects on the first failure, but the other workers keep running, because their promises already exist and nothing stops them. If partial failure must be tolerated, use `Promise.allSettled` and throw an `AggregateError`.

### Implementation

```javascript
async function asyncPool(limit, items, iteratorFn) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (typeof iteratorFn !== "function") {
    throw new TypeError("iteratorFn must be a function");
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    // Pull-based: claim the next index, then process it. No `await` between the
    // read and the increment, so two workers can never claim the same index.
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      // Positional write keeps results aligned with `items` no matter which
      // task finishes first.
      results[index] = await iteratorFn(items[index], index, items);
    }
  }

  // Never spawn more workers than there is work.
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);
  return results;
}
```

### Walkthrough

`asyncPool(2, [30, 10, 20, 5], task)`:

1. `workerCount = min(2, 4) = 2`. Two workers start; both bodies run synchronously up to the first `await`.
2. Worker A claims index `0` and awaits `task(30, 0)`. Worker B claims index `1` and awaits `task(10, 1)`. Exactly two tasks in flight — the cap.
3. `task(10, 1)` finishes first; worker B writes `results[1] = 20` and loops: claims index `2`, starts `task(20, 2)`. Still two in flight.
4. `task(20, 2)` finishes → `results[2] = 40`; worker B claims index `3`, starts `task(5, 3)`.
5. `task(5, 3)` finishes → `results[3] = 10`; `nextIndex` is now `4`, so worker B's loop exits and B resolves.
6. `task(30, 0)` finishes → `results[0] = 60`; worker A exits.
7. `await Promise.all(workers)` resolves with `[60, 20, 40, 10]`. Index `0` ran longest yet is first — order came from the write index, not from timing.

### Complexity

Time: `O(n)` scheduling overhead plus the sum of task durations; wall-clock is roughly `⌈n / limit⌉` task-durations when tasks are balanced. Space: `O(n)` for `results`, plus `O(limit)` for in-flight worker state. The algorithm never allocates a queue — the cursor is one integer.

### Edge Cases

- `limit >= items.length` → every task starts at once; equivalent to `Promise.all` over mapped arguments.
- `limit = 1` → strictly serial, the shape you want for rate-limited APIs.
- `items.length === 0` → no workers spawned; `Promise.all([])` resolves; returns `[]`.
- A task rejects → the returned promise rejects with that error while sibling workers continue in the background; use `allSettled` if that matters.
- `limit < 1` or non-integer → `RangeError` before any task starts, so there is no partial work.
- `items` is a `Set` or generator → this version assumes `length` and index access; wrap with `[...items]` first.
- Wildly uneven task durations → the concurrency cap still holds; only the finish time changes.

### Interview Follow-ups

- **Return results in completion order:** push onto a shared array or invoke an `onResult` callback.
- **Fail fast vs collect:** swap `Promise.all` for `Promise.allSettled`, then decide a policy for partial failure (retry with backoff, or `AggregateError`).
- **Per-task timeout:** race each task against a timer and pass an `AbortController` signal into `iteratorFn` so the underlying I/O actually stops.
- **Dynamic queue:** when tasks arrive over time (uploads, clicks), do not take an array — build a reusable queue with `add(task)` and the same worker pump (next problem).
- **Production:** `p-limit` is the standard library; the exercise is the pump underneath it.

### Common Mistakes

- Using `results.push(...)`, which silently reorders results by completion time.
- Putting an `await` between reading and incrementing the cursor, so two workers claim the same index.
- Spawning `limit` workers unconditionally and letting extras spin on an empty list — harmless, but wasteful and confusing when `limit > n`.
- Assuming a rejection cancels sibling tasks; it does not — only the returned promise fails.
- `for (const item of items) await task(item)` — correct order, zero concurrency.

### Takeaway

A concurrency limit is just "spawn `N` workers, each pulling from a shared cursor." The cap comes from the number of loops, and input order comes from writing `results[index]` instead of pushing.

## Build a Promise Queue

`Difficulty: Medium` `Probability: High`

### Problem

Implement `createPromiseQueue()` — a reusable FIFO queue that runs asynchronous tasks **one at a time, in submission order**, and survives failures.

Contract:

- `queue.add(task)` returns a promise for that task's result or rejection.
- Tasks start in submission order, and a task starts only after the previous one settles (success or failure). Serial by default.
- A rejected task rejects only its own returned promise; the queue keeps running.
- Tasks do not begin synchronously: `add` returns before the task body executes.
- `queue.size` reports tasks enqueued but not settled; `queue.onIdle()` resolves when the queue drains.

The difference from the previous problem: `asyncPool` is a one-shot batch over a known array; a queue is a long-lived object that accepts work over time, so ordering and fault isolation matter more than throughput.

### Examples

```text
const queue = createPromiseQueue();
const order = [];

const a = queue.add(async () => { await sleep(20); order.push("a"); return 1; });
const b = queue.add(async () => { order.push("b"); throw new Error("boom"); });
const c = queue.add(async () => { order.push("c"); return 3; });

await Promise.allSettled([a, b, c]);
order                  // => ["a", "b", "c"]  (serial, even though `a` is slow)
await a                // => 1
await b                // => rejects with Error("boom"); `c` still ran
await c                // => 3
queue.size             // => 0
await queue.onIdle()   // => resolves
```

### Approach

Two implementations, same contract.

1. **Promise chain (shown).** Keep a `tail` promise that resolves when the queue is idle. `add` does `tail.then(() => task())` and sets `tail` to a version of that result that never rejects. Five lines, no scheduler.
2. **Array + pump.** Push `{ task, resolve, reject }` into an array and run a pump that shifts while `running < concurrency`. More code, but it buys pause/clear/concurrency, which the chain cannot express cleanly.

The two invariants that make the chain version correct:

- **`tail` must never stay rejected.** If you set `tail = result` and `result` rejects, every later `tail.then` is skipped and the queue is dead. Re-map to a promise that always fulfills (`result.then(noop, noop)`).
- **The task is invoked inside `.then`, not before it.** `tail.then(() => task())` defers the call to a microtask, which is exactly what guarantees "previous task finished first." Calling `task()` eagerly and then chaining its result would start every task immediately.

Also decide deliberately whether `add` should reject the caller's promise. It should: the task's outcome belongs to the caller. That rejection is separate from the internal chain, and both must be handled. `result` is handled by the `tail` remap, so there is no unhandled rejection even if the caller ignores the returned promise.

### Implementation

```javascript
function createPromiseQueue() {
  let tail = Promise.resolve(); // settles when the queue is idle
  let pending = 0;              // enqueued but not settled

  function add(task) {
    if (typeof task !== "function") {
      return Promise.reject(new TypeError("task must be a function"));
    }
    pending += 1;

    // Running the task inside `.then` is what serializes it: it starts only
    // after the previous tail settles.
    const result = tail.then(() => task());

    // Keep the chain alive after a rejection, or every later task is skipped.
    tail = result.then(
      () => undefined,
      () => undefined,
    );

    // Return the real outcome to the caller; decrement regardless of failure.
    return result.finally(() => {
      pending -= 1;
    });
  }

  return {
    add,
    get size() {
      return pending;
    },
    onIdle: () => tail,
  };
}
```

### Walkthrough

`add(a)`, `add(b)`, `add(c)` where `b` rejects:

1. `add(a)`: `pending = 1`; `tail0` is the resolved `Promise.resolve()`. `resultA = tail0.then(() => a())`. `tail1 = resultA.then(noop, noop)`. `add` returns `resultA.finally(...)`.
2. `add(b)`: `pending = 2`; `resultB = tail1.then(() => b())`. Because `tail1` fulfills only after `a` settles, `b` cannot start early. `tail2 = resultB.then(noop, noop)`.
3. `add(c)`: `pending = 3`; `resultC = tail2.then(() => c())`.
4. `a` resolves after 20 ms with `1`; `tail1` fulfills; the microtask queue runs `b`. `b` throws; `resultB` rejects, but `tail2` fulfills (`noop` handles the rejection), so `c` still runs.
5. `c` returns `3`; `tail3` fulfills; `pending` reaches `0`. `Promise.allSettled([a, b, c])` reports `[fulfilled(1), rejected(boom), fulfilled(3)]`, and `order` is `["a", "b", "c"]`.

### Complexity

Time: `O(n)` scheduling overhead plus the sum of task durations — serial, so no overlap. Space: `O(1)` per queued task beyond the task's own closure; the chain retains one link per unsettled task.

### Edge Cases

- First task rejects → later tasks still run, because `tail` is remapped to a fulfilled promise.
- Caller ignores the returned promise and the task rejects → still no unhandled rejection, because `result` has a handler (the `tail` remap). Only `result.finally(...)` is left for the caller.
- `add` returns synchronously from the caller's view, but the task body starts on a microtask — do not assume side effects happened right after `add`.
- Non-function argument → rejected promise, not a synchronous throw.
- Long-running first task → everything behind it waits; that is the contract, not a bug.
- `onIdle()` when already idle → an already-resolved promise; safe to call repeatedly.
- A queue with a producer that adds forever → `onIdle` may never resolve; that is inherent.

### Interview Follow-ups

- **Add concurrency:** replace `tail` with an array of `N` chains (one lane per slot) or an explicit pump with `running < concurrency`.
- **Add `pause()` / `resume()` / `clear()`:** the explicit array pump is the right structure; the chain cannot un-enqueue.
- **Priorities:** two chains (high/normal) drained in preference order, or a small heap.
- **Drain semantics:** should `clear()` reject pending tasks or resolve them with a sentinel? Decide and document it; many libraries get this wrong.
- **Production:** `p-queue` covers pause, priorities, and timeouts.

### Common Mistakes

- Setting `tail = result` without the catch remap, so one rejection silently kills the queue.
- Calling `task()` eagerly (`tail.then(task())`) — that starts every task at once.
- Decrementing `pending` only on success, so `size` drifts upward forever.
- Rejecting the internal `tail`, reintroducing the dead-queue bug one level down.
- Claiming the queue is "concurrent" by default; serial execution is the defining property.

### Takeaway

A promise queue is a single never-rejected promise chain. Tasks start inside `.then`, the chain is remapped so failures cannot poison it, and the caller still gets the real outcome. Everything else — pause, priority, concurrency — is a wrapper around an explicit pump.

## Cancel Obsolete Async Requests

`Difficulty: Hard` `Probability: High`

### Problem

Implement `createLatestOnly()` returning `{ run, cancel }`. `run(task)` invokes `task(signal)` and resolves with `{ stale: false, value }` for the newest call, or `{ stale: true, value: undefined }` for any call that a newer one supersedes. `cancel()` invalidates the current request.

This is the "last write wins" rule behind search-as-you-type, tab switching, and route changes: a slow earlier response must never overwrite a newer one.

Contract:

- At most one `run` is current at any time; starting a new one supersedes the previous.
- The superseded `task` is aborted via an `AbortSignal` if it cooperates.
- A superseded call never rejects for being superseded; it resolves with `stale: true`.
- Genuine failures from the current call still reject.
- `cancel()` makes the in-flight call stale and aborts it.

Two mechanisms are needed, and knowing which does the real work is the interview:

- **Token (sequence number) — authoritative.** Even if the underlying work cannot be aborted, the token check discards its result.
- **`AbortController` — cooperative.** It can stop real I/O (a `fetch`), saving network and CPU. It cannot cancel a promise; it only asks the producer to stop, and the producer must honour `signal`.

### Examples

```text
const latest = createLatestOnly();

const first  = latest.run((s) => fetchJSON("/q?q=a",  { signal: s })); // slow
const second = latest.run((s) => fetchJSON("/q?q=ab", { signal: s })); // newer

await first   // => { stale: true, value: undefined }  (and first's fetch was aborted)
await second  // => { stale: false, value: [...] }     (only this one is applied)

latest.cancel();
await latest.run((s) => fetchJSON("/slow", { signal: s })) // => { stale: true }
```

### Approach

Each `run` does three things in order:

1. **Abort the previous** request and install a fresh `AbortController` and token.
2. **Await the task**, passing the signal so the real I/O can stop.
3. **Check the token** before returning. If `token !== sequence`, a newer call has started, so report the result as stale rather than delivering it.

Why the ordering matters: the token must be taken *after* incrementing, and the comparison must happen *after* the `await`. Comparing before the await is a no-op — at that point the call is still the newest.

Rejection handling deserves care. Aborting a `fetch` rejects with an `AbortError`; that is expected, not a failure. Swallow it when the call is stale or the error is an abort. Only rethrow errors from a call that is still current.

Honest limit: if `task` ignores the signal (a plain computation, a library call with no abort support), the work runs to completion. The token still prevents its result from being applied, which is why the token is the load-bearing part.

### Implementation

```javascript
function createLatestOnly() {
  let sequence = 0;      // identity of the most recent call
  let controller = null; // controller for the in-flight call

  async function run(task) {
    controller?.abort();       // ask the previous request to stop real I/O
    controller = new AbortController();
    const token = ++sequence;  // this call's identity
    const { signal } = controller;

    try {
      const value = await task(signal);
      // A newer call has started since we awaited: drop this result.
      if (token !== sequence) return { stale: true, value: undefined };
      return { stale: false, value };
    } catch (error) {
      const isAbort = error?.name === "AbortError";
      if (isAbort || token !== sequence) {
        return { stale: true, value: undefined };
      }
      throw error; // a real error from the current call reaches the caller
    }
  }

  function cancel() {
    controller?.abort();
    sequence += 1; // invalidate the token still in flight
  }

  return { run, cancel };
}
```

### Walkthrough

Search-as-you-type, typing `"a"` then `"ab"`:

1. `run(taskA)`: aborts nothing, `controller = C1`, `token = 1`. `taskA` starts `fetch(..., { signal: C1.signal })` and awaits.
2. The user types again. `run(taskB)`: `C1.abort()` fires, so `taskA`'s fetch is cancelled and its promise rejects with `AbortError`. `controller = C2`, `token = 2`, `taskB` starts.
3. `taskA`'s catch sees `isAbort === true` → returns `{ stale: true }`. The caller ignores it.
4. `taskB` resolves; `token === sequence` (`2 === 2`) → `{ stale: false, value: results }`. Applied to the UI.
5. Had the user typed a third time while `taskB` was in flight, `sequence` would be `3` and step 4's check would fail even if the response arrived — the same protection without relying on abort.

### Complexity

Time and space: `O(1)` bookkeeping per call; the task's own cost dominates. Memory is bounded by the number of calls that have not yet settled, which in practice is at most two (the current call and a recently aborted one).

### Edge Cases

- Task ignores `signal` → it still runs, but the token drops its result; behaviour is correct, only wasted work remains.
- Task rejects with something other than `AbortError` while current → rethrown to the caller.
- `cancel()` with nothing in flight → increments the sequence; a later `run` gets a fresh token.
- `cancel()` mid-flight then a new `run` → the cancelled call is stale by token; the new call is never mistaken for it.
- Two components sharing one coordinator → they share the token, which is usually wrong; create one coordinator per logical stream.
- An external signal (component unmount) → combine with `AbortSignal.any([external, controller.signal])`.
- Detecting aborts → check `error.name`, which is portable; `error instanceof DOMException` fails across realms and for some Node errors.

### Interview Follow-ups

- **Apply the result automatically:** accept an `onSuccess(value)` callback inside `run` so the caller cannot forget the `stale` check.
- **React:** this is the `ignore` flag from a `useEffect` cleanup body promoted to a helper; `AbortController` also cancels the network request, which the flag alone cannot do.
- **Debounce + latest-only:** debounce reduces request count, latest-only fixes ordering; they compose and are not substitutes.
- **Multiple parallel streams:** key coordinators by request identity (`Map<string, coordinator>`) instead of one global sequence.
- **Why not just compare arrival order?** Responses can arrive out of order, and equal payloads are not the same as recency; only a token tracks "newest."

### Common Mistakes

- Relying on `AbortController` alone: aborts are best-effort, and the promise still settles.
- Checking the token before the `await`, which always passes.
- Treating an `AbortError` as a user-visible failure, surfacing an error toast on every keystroke.
- Incrementing the sequence after installing the controller, so two rapid calls can share a token.
- Reusing one coordinator for unrelated components, so one component's request cancels another's.

### Takeaway

Cancellation is two independent things: a monotonic token that decides whether a result is allowed to be used, and an `AbortController` that asks real I/O to stop. The token is the guard; the abort is an optimization.

## Deduplicate Identical Concurrent Requests

`Difficulty: Hard` `Probability: High`

### Problem

Implement `createRequestDeduper(fetcher, keyFn)` that shares a single in-flight promise among identical concurrent calls. While request `K` is in flight, another call with the same key returns the **same promise** instead of issuing a second request. Once it settles, the entry is removed so the next call refetches.

Contract:

- `keyFn(...args)` returns the request identity (default: `JSON.stringify(args)`).
- Concurrent identical calls share one promise; the fetcher runs exactly once per flight.
- Sharing is **only while in flight**; this is not a cache. A call after settlement starts a new request.
- All sharers observe the same resolution **or** the same rejection.
- The map entry is removed on settlement, so a failed request does not poison future calls.

The distinction from the Promise cache (next problem) is the eviction rule: a deduper's lifetime is exactly "one flight," so it cannot go stale and needs no invalidation. A cache outlives the flight and therefore needs TTL, size limits, and invalidation.

### Examples

```text
const getUser = createRequestDeduper(
  (id) => fetch(`/api/users/${id}`).then((r) => r.json()),
  (id) => `user:${id}`,
);

const a = getUser(1);
const b = getUser(1);
a === b              // => true   (one fetch, one shared promise)

await a;             // => { id: 1, name: "Ada" }
const c = getUser(1);
c === a              // => false  (settled, so this starts a fresh request)

getUser(1); getUser(2); getUser(1)  // => exactly TWO fetches
```

### Approach

A `Map` from key to promise. The algorithm is four lines, but the details that separate a working version from a subtly broken one are these:

- **Store the promise before the fetcher can run.** If `fetcher` is called synchronously and throws, a second call in the same tick could miss the map. Wrap in `Promise.resolve().then(() => fetcher(...))`, which also normalizes a sync throw into a rejection.
- **Delete in `finally`, not `then`.** Deleting only on success leaks a rejected entry forever, so a failing endpoint stays "in flight" permanently. `finally` covers both paths.
- **Share the rejection.** All concurrent sharers get the same rejection, which is correct: they asked the same question and it has the same answer. If you would rather not broadcast a failure, that is a caching policy, not deduplication.
- **Key identity is the hard part.** Default `JSON.stringify(args)` is order-sensitive for object arguments and cannot distinguish two functions or `undefined` from a missing property. Real APIs key on method + URL + normalized query + relevant headers/auth. The caller supplies `keyFn` because only the caller knows what makes two requests "the same."

Memory: entries are removed on settle, so the map is bounded by the number of distinct in-flight requests. A key that is never removed (forgot `finally`, or a promise never settles) is a leak.

### Implementation

```javascript
function createRequestDeduper(fetcher, keyFn = (...args) => JSON.stringify(args)) {
  const inFlight = new Map(); // key -> shared promise

  return function deduped(...args) {
    const key = keyFn(...args);

    const existing = inFlight.get(key);
    if (existing) return existing; // join the flight; do not start another

    // Defer the fetch by one microtask so `inFlight.set` runs first and a
    // synchronous throw is normalized to a rejection.
    const promise = Promise.resolve()
      .then(() => fetcher(...args))
      .finally(() => {
        inFlight.delete(key); // a later call will start a fresh request
      });

    inFlight.set(key, promise);
    return promise;
  };
}
```

### Walkthrough

`getUser(1)` twice in the same tick:

1. First call: `key = "user:1"`; `inFlight.get` is `undefined`. A promise is created and `fetch` is scheduled for the next microtask. `inFlight.set("user:1", promise)` runs before the fetcher body, so the map is populated before any I/O starts. The promise is returned.
2. Second call: `inFlight.get` returns the same promise. `a === b` is `true`; no second `fetch`.
3. Microtask: `fetcher(1)` runs and returns a fetch promise; the shared promise tracks it. Both `a` and `b` are the same object, so both resolve with the parsed user.
4. On settlement, `finally` deletes `"user:1"`. A later `getUser(1)` finds no entry and issues a fresh request — `c !== a`.

For a rejection, both `a` and `b` reject with the same error, and `finally` still deletes the key, so the next call retries immediately.

### Complexity

Time: `O(1)` map operations per call; total work is one fetcher call per distinct in-flight key. Space: `O(k)` where `k` is the number of distinct keys in flight; each entry disappears on settlement.

### Edge Cases

- Fetcher throws synchronously → the `Promise.resolve().then` wrapper turns it into a rejection; sharers all see it and the key is removed.
- Fetcher returns a non-promise → `Promise.resolve().then` wraps it; the API still returns a promise.
- Key collisions from `JSON.stringify`: `{a:1,b:2}` and `{b:2,a:1}` serialize differently, though they are the same request. Provide a `keyFn`.
- `undefined` vs missing argument → `JSON.stringify([undefined])` is `"[null]"` and `JSON.stringify([])` is `"[]"`, so they differ; but `JSON.stringify([undefined]) === JSON.stringify([null])`, so those collide.
- Never-settling promise → the entry stays forever; bound it with a timeout if the source can hang.
- Unbounded key cardinality under a burst → the map grows with concurrency only, because entries are deleted on settle.
- Rejected shared promise with no sharer attaching a handler → the caller's own code owns that; the deduper does not add one.

### Interview Follow-ups

- **Combine with a cache:** wrap the deduper's fetcher in the Promise cache from the next problem; the deduper prevents concurrent duplicates, the cache prevents repeated sequential ones.
- **Stale-while-revalidate:** return the cached value immediately and start a background refetch keyed by the same identity.
- **Abort a shared flight:** give the entry a refcount and abort only when the last sharer detaches; otherwise one component's unmount kills another's request.
- **Stable keys:** a canonical serializer that sorts object keys, or an explicit id per request type.
- **Production:** TanStack Query deduplicates by query key and `staleTime`; `SWR` does the same with a keyed cache.

### Common Mistakes

- Calling `fetcher(...args)` eagerly and only then consulting the map, so duplicates slip through in the same tick.
- Using `.then` cleanup instead of `.finally`, leaking rejected entries as permanently "in flight."
- Turning the deduper into an accidental cache by forgetting to delete on settle — then stale data is served forever.
- Assuming `JSON.stringify` is a stable identity for objects; it is not.
- Sharing one deduper across tenants or auth tokens, so user A's response is handed to user B.

### Takeaway

Deduplication is a `Map` from request identity to the in-flight promise, deleted on settlement. It is a concurrency optimization with a one-flight lifetime — deliberately not a cache, so it needs no invalidation.

## Cache Promise Results

`Difficulty: Hard` `Probability: High`

### Problem

Implement `memoizeAsync(fn, { ttl, max, keyFn })` that caches the promise returned by `fn` so that repeated calls with the same arguments are served from memory. It must handle in-flight requests, expiry, and bounded size.

Contract:

- `keyFn(...args)` derives the cache key (default `JSON.stringify`).
- A cache hit within the TTL returns the **same promise** — in-flight calls are shared, exactly like the deduper.
- `ttl` is a lifetime in milliseconds (`Infinity` = never expires). An expired entry is removed and refetched.
- `max` bounds the number of entries; overflow evicts the least-recently-used entry.
- A rejection is **not** cached: the entry is removed so the next call retries.
- Resolved values are returned; callers may `await` the result as usual.

Caching the promise (not the settled value) is the key move: it gives deduplication and caching in one structure. The cost is that you must reason about expiry of an entry that may still be in flight.

### Examples

```text
let calls = 0;
const fetchUser = memoizeAsync(
  async (id) => { calls += 1; return { id, name: `User ${id}` }; },
  { ttl: 1000, max: 100, keyFn: (id) => `user:${id}` },
);

await fetchUser(1); await fetchUser(1);   // => calls === 1
await fetchUser(2);                        // => calls === 2

// concurrent, same key: one call, shared promise
const [a, b] = await Promise.all([fetchUser(3), fetchUser(3)]);
a === b                                    // => true; calls === 3

await sleep(1001);
await fetchUser(1);                        // => calls === 4 (TTL expired)

// failure is not cached
let attempts = 0;
const flaky = memoizeAsync(async () => { attempts += 1; throw new Error("nope"); });
await flaky().catch(() => {}); await flaky().catch(() => {});
attempts                                   // => 2
```

### Approach

Store `{ promise, expiresAt }` in a `Map`. `Map` preserves insertion order, which makes LRU easy: on every hit, delete and re-set the key to move it to the end; on overflow, evict from the front.

Three decisions carry the correctness:

- **Return the stored promise, not a stored value.** Storing `await fn(...)` would drop the in-flight sharing and lose the distinction between "no entry" and "pending."
- **Check expiry on read, not with a timer.** There is no `setTimeout` per entry; an entry is stale the first time it is read after `expiresAt`. This is cheaper and avoids holding timers alive, at the cost of stale entries occupying `max` slots until touched. A periodic sweep is the alternative.
- **Do not cache rejections.** Delete on failure, guarded by an identity check so a newer entry for the same key is not removed by a slower older call.

The negative-cache case is a policy decision: some systems cache the rejection for a short TTL to avoid hammering a dead upstream. If you do, use a separate, small TTL and document it.

### Implementation

```javascript
function memoizeAsync(fn, {
  ttl = Infinity,
  max = Infinity,
  keyFn = (...args) => JSON.stringify(args),
} = {}) {
  const cache = new Map(); // key -> { promise, expiresAt }

  function evict() {
    // Oldest insertion is the least recently used because hits re-insert.
    while (cache.size > max) {
      cache.delete(cache.keys().next().value);
    }
  }

  return function memoized(...args) {
    const key = keyFn(...args);
    const now = Date.now();

    const hit = cache.get(key);
    if (hit) {
      if (hit.expiresAt > now) {
        cache.delete(key);
        cache.set(key, hit); // LRU refresh: move to the most-recent end
        return hit.promise;
      }
      cache.delete(key); // expired
    }

    let promise;
    promise = Promise.resolve()
      .then(() => fn(...args))
      .catch((error) => {
        // Never cache a failure, and only remove the entry if it is still ours.
        if (cache.get(key)?.promise === promise) cache.delete(key);
        throw error;
      });

    cache.set(key, { promise, expiresAt: now + ttl });
    evict();
    return promise;
  };
}
```

### Walkthrough

`fetchUser` with `ttl: 1000`, `max: 100`, key `user:1`:

1. `fetchUser(1)`: `cache.get("user:1")` is `undefined`. `fn(1)` is scheduled; `cache.set("user:1", { promise, expiresAt: now + 1000 })`; `evict()` is a no-op because `1 <= 100`. The promise is returned.
2. Second `fetchUser(1)` (same tick): the hit is unexpired, so the key is deleted and re-set (LRU refresh) and the stored promise is returned — `calls` stays `1`.
3. `await` on both resolves with the same object; the two callers received the identical promise, so they share the result.
4. `sleep(1001)`; `fetchUser(1)`: `hit.expiresAt <= now`, so the entry is deleted and a fresh call runs — `calls` becomes `2`. The old result is not returned.
5. For a rejecting `fn`: the `.catch` runs, `cache.get(key)?.promise === promise` is true, so the entry is deleted, then the error is rethrown. A second call starts a new attempt instead of replaying the failure.

With `max = 1`, calling `fetchUser(1)` then `fetchUser(2)` inserts key 2, `cache.size` becomes `2 > 1`, and `evict` deletes the oldest key (`user:1`).

### Complexity

Time: `O(1)` amortized per lookup and insert (`Map` operations; eviction is `O(1)` per removed entry). Space: `O(max)` entries, each holding a promise and an expiry. The `keyFn` cost is the caller's.

### Edge Cases

- In-flight then expiry → the entry expires while its promise is still pending; a read after `expiresAt` starts a second request. If that is unacceptable, track pending entries separately and let them finish.
- `max` smaller than the working set → thrashing; every insert evicts a still-useful entry, so hits drop to zero. Size `max` to the hot set.
- `ttl: 0` → everything is stale on the next read; use `Infinity` for no expiry, not `0`.
- Mutable cached values → if `fn` returns an object and a caller mutates it, every later caller sees the mutation. Clone on the way out if that matters.
- Rejections → not cached, so a failing endpoint is retried on every call; add negative caching deliberately if needed.
- Keys that are objects → `JSON.stringify` is order-sensitive; supply a canonical `keyFn`.
- Memory of long-lived entries → with `ttl: Infinity` and no `max`, the cache is a plain leak; always bound at least one.
- Clock changes → `Date.now()` is wall-clock; `performance.now()` is monotonic and better for TTLs within one process.

### Interview Follow-ups

- **Negative caching:** store a rejection with its own short TTL to protect a dead upstream, and prove the entry cannot be mistaken for success.
- **Background revalidation:** return the cached value and refresh in the background when it is past a soft `staleTime`, the TanStack Query model.
- **Persist the cache:** serialize resolved values (never promises) to `localStorage` with an `expiresAt`, and rehydrate on boot.
- **Per-key in-flight de-duplication:** the next problem's deduper is this cache with `ttl: 0`; explain how the eviction rule is the only difference.
- **Eviction policy:** LRU via `Map` re-insertion is `O(1)`; LFU or 2Q needs counters and is rarely worth it in the browser.

### Common Mistakes

- Caching the resolved value with `.then` and returning a new promise each time, losing in-flight sharing.
- Caching rejections unintentionally, so one transient failure is replayed for the whole TTL.
- Deleting an entry inside `.catch` without the identity guard, so a slow failed call removes a newer successful entry.
- Using a `setTimeout` per entry to expire, holding timers (and closures) alive for every key.
- Forgetting that `Map` iteration order is insertion order and evicting the wrong end.
- Serving mutated cached objects.

### Takeaway

Cache the promise, expire on read, evict LRU, and never cache a failure. One `Map` of `{ promise, expiresAt }` gives deduplication, caching, and bounded memory — the difference from the deduper is just how long an entry is allowed to live.

## Implement Asynchronous Polling

`Difficulty: Medium` `Probability: High`

### Problem

Implement `poll(fn, { interval, immediate, signal })` that calls an async `fn` repeatedly, once every `interval` milliseconds, and returns a `stop()` function that halts it cleanly.

Contract:

- `fn` is called with no arguments; its resolved value is passed to an optional `onResult` callback.
- The next call is scheduled **after the current `fn` settles**, so a slow `fn` never produces overlapping calls.
- `immediate: true` runs `fn` once right away; otherwise the first call happens after one `interval`.
- `stop()` is idempotent: it clears any pending timer and prevents an in-flight `fn` from rescheduling.
- An `AbortSignal` can stop the poll the same way `stop()` does.
- A rejected `fn` does not kill the poll; errors are reported to an optional `onError`.

The choice to poll *after* each completion rather than on a fixed clock is the central design decision, and it is what makes this different from `setInterval`.

### Examples

```text
const stop = poll(
  async () => fetch("/health").then((r) => r.json()),
  { interval: 1000, immediate: true, onError: (e) => console.warn(e) },
);

stop();          // clears the pending timer; no further calls

// with an AbortController
const ctrl = new AbortController();
poll(fetchStatus, { interval: 500, signal: ctrl.signal });
ctrl.abort();    // same as stop()

// stop() is idempotent
stop(); stop();
```

### Approach

Use recursive `setTimeout`, not `setInterval`. `setInterval` fires on a fixed schedule regardless of whether the previous callback finished, so a `fn` slower than `interval` accumulates overlapping calls and unbounded requests. Recursive scheduling waits for completion, which bounds concurrency to one by construction.

Two subtleties:

- **Check the `stopped` flag after every `await`.** `stop()` can be called while `fn` is in flight; when it resolves, the continuation must not schedule another tick. Clearing the timer is not enough, because at that moment there is no timer — the tick is suspended on `await`.
- **Rejections are contained.** Wrap `fn` in `try/catch` so one failed poll does not stop the loop or become an unhandled rejection. Report through `onError` and keep going.

Fixed-cadence alternative: if the caller needs ticks aligned to a clock (e.g. every 5 s on the 5 s boundary), compute the next delay from a deadline (`nextAt += interval; setTimeout(tick, Math.max(0, nextAt - Date.now()))`). That corrects drift but can still overlap if `fn` outruns the interval; combine it with the completion wait.

Honest limits: no timer is exact, background tabs throttle timers to ≥1 s (and much more aggressively when hidden), and `stop()` cannot abort an in-flight `fn` unless it is given a signal.

### Implementation

```javascript
function poll(fn, {
  interval = 1000,
  immediate = false,
  signal,
  onResult,
  onError,
} = {}) {
  let timer = null;
  let stopped = false;

  function stop() {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    signal?.removeEventListener("abort", stop);
  }

  if (signal) {
    if (signal.aborted) return stop; // already done; no-op stop
    signal.addEventListener("abort", stop, { once: true });
  }

  async function tick() {
    if (stopped) return;
    try {
      const value = await fn();
      onResult?.(value);
    } catch (error) {
      onError?.(error); // one failure must not end the poll
    }
    // `stop()` may have been called while `fn` was awaiting.
    if (stopped) return;
    timer = setTimeout(tick, interval); // schedule AFTER completion: no overlap
  }

  if (immediate) {
    tick();
  } else {
    timer = setTimeout(tick, interval);
  }

  return stop;
}
```

### Walkthrough

`poll(fn, { interval: 100, immediate: true })` where `fn` takes 30 ms:

1. `stopped = false`; `immediate` is true, so `tick()` is called directly.
2. `tick` calls `fn()`; the 30 ms timer starts. There is no `setTimeout` pending yet.
3. At 30 ms `fn` resolves; `onResult` fires; `stopped` is false; `timer = setTimeout(tick, 100)`. The next tick is due at 130 ms.
4. At 130 ms `tick` runs again. The observed period is `100 + 30 = 130` ms: `interval` is the *gap* between calls, not the call frequency.
5. If `stop()` is called at 50 ms (between ticks): `timer` is cleared, so the 130 ms tick never fires.
6. If `stop()` is called at 10 ms (while `fn` is in flight): there is no timer to clear, so `stopped = true` is the only effect; at 30 ms the post-`await` check sees `stopped` and returns without scheduling. That check is why `stop()` cannot be a bare `clearTimeout`.

With `immediate: false`, step 1 only sets `timer = setTimeout(tick, 100)`, so the first call happens at 100 ms.

### Complexity

Time: `O(n)` scheduling overhead for `n` ticks; each tick's cost is `fn`'s. Space: `O(1)` — one timer handle and two flags. Concurrency is bounded at one in-flight `fn` by the recursive schedule.

### Edge Cases

- `fn` slower than `interval` → no overlap, because the next timer is scheduled only after resolution; the effective period is `fn` duration + `interval`.
- `stop()` while `fn` is in flight → the post-`await` flag check prevents rescheduling; the in-flight call still completes (it was not aborted).
- `stop()` called twice → idempotent; `clearTimeout(null-able)` and removal of an already-removed listener are safe.
- Signal already aborted before `poll` → returns `stop` immediately; `fn` is never called.
- `fn` rejects every time → `onError` fires each interval; the poll continues. Without `onError`, the error is swallowed — decide that consciously.
- `interval: 0` → clamps to the timer minimum (≈1–4 ms) and can starve the event loop; use a realistic value.
- Background tab → timers are throttled, so the real period is longer than `interval`; do not build latency-sensitive logic on `poll`.
- `fn` never settles → the poll stalls permanently; add a timeout around `fn` if that is possible.

### Interview Follow-ups

- **Drift-corrected cadence:** track `nextAt += interval` and schedule `Math.max(0, nextAt - Date.now())`.
- **Exponential backoff on error:** multiply `interval` up to a cap after each failure and reset it on success; the polling-until pattern (next problem) formalizes this.
- **Poll until a condition, then stop:** return a promise instead of a `stop` function — the next problem.
- **Pause/resume:** expose `pause()` that clears the timer and `resume()` that re-arms it, keeping `stopped` separate.
- **Visibility-aware polling:** listen for `visibilitychange` and stop while hidden; browsers throttle anyway, but the request itself is wasted.
- **Long-polling:** instead of `interval`, re-issue immediately after each response, optionally with a server-provided delay.

### Common Mistakes

- Using `setInterval` with an async callback, producing overlapping requests that pile up.
- Implementing `stop()` as only `clearTimeout`, so a tick suspended on `await` reschedules after `stop()`.
- Letting a rejected `fn` reject the loop, ending the poll on the first transient error.
- Not clearing the timer before reassigning it, leaking a timer per tick.
- Assuming `interval` is the period between call *starts*; with completion-based scheduling it is the gap between *finishes and starts*.
- Forgetting to remove the abort listener when the poll stops naturally, retaining the closure.

### Takeaway

Polling is a self-rescheduling `setTimeout` where the next tick is armed only after the previous `fn` settles. That single choice bounds concurrency to one. Clean shutdown needs both `clearTimeout` and a flag checked after every `await`, because the moment that matters has no pending timer.

## Implement Asynchronous Polling Until a Condition Becomes True

`Difficulty: Hard` `Probability: High`

### Problem

Implement `pollUntil(fn, { interval, timeout, signal, predicate, immediate })` that repeatedly awaits `fn` and resolves as soon as its result satisfies `predicate`. It rejects if the deadline passes or the caller aborts.

Contract:

- `fn` is called with no arguments and awaited each round.
- `predicate(value)` defaults to `Boolean`; the first truthy evaluation resolves the returned promise with that `value`.
- `interval` is the delay between the end of one attempt and the start of the next, exactly as in `poll`.
- `timeout` bounds total elapsed time; exceeding it rejects with a descriptive error.
- `signal` aborts the wait and rejects with the signal's reason (an `AbortError`).
- A rejected `fn` is treated as "not done yet" by default; an optional `onError` observes it. Set `failFast: true` to reject immediately instead.
- The returned promise settles exactly once; after that, no timer is left pending.

This is the promise-returning form of polling: instead of a `stop` handle, the caller awaits an outcome, so the difficult parts are the timeout, the abort, and cleanup on every exit path.

### Examples

```text
// Poll a job until it reports "done".
const job = await pollUntil(
  () => fetch(`/api/jobs/${id}`).then((r) => r.json()),
  {
    interval: 500,
    timeout: 30_000,
    predicate: (j) => j.status === "done" && j.result,
  },
);
// => resolves with the job object whose status is "done"

// Timeout
await pollUntil(() => Promise.resolve(false), { interval: 50, timeout: 200 });
// => rejects with Error("pollUntil timed out after 200ms")

// Abort
const ctrl = new AbortController();
const p = pollUntil(check, { interval: 100, signal: ctrl.signal });
ctrl.abort();
await p;  // => rejects with AbortError
```

### Approach

The scheduler is the previous problem's recursive `setTimeout`, but wrapped in a `new Promise` so the caller awaits the outcome instead of holding a stop handle. Every exit path — success, timeout, abort, fail-fast — must run the same `cleanup()`: clear the timer **and** remove the abort listener. Miss one and you leak a timer or a listener.

The three decisions:

- **Check `timeout` against elapsed time, not a separate timer.** Compute `Date.now() - startedAt >= timeout` before scheduling the next round. A second `setTimeout` for the deadline would race the polling loop and double the cleanup paths.
- **Treat abort as rejection, not resolution.** `AbortError` is the standard signal, so `try/catch` around `await p` behaves like `fetch`. Prefer `signal.reason` when present; `AbortSignal.timeout(ms)` is a convenient source of both.
- **Separate "the check failed" from "the check could not run."** A transient rejection should usually keep polling (the server is warming up), but a deterministic error should not spin forever. Default to continue, offer `failFast`, and always surface errors through `onError` so they are visible.

Overlap is impossible for the same reason as before: the next timer is armed only after `fn` settles. And `immediate` defaults to `true` here, because callers of `pollUntil` almost always want to test the condition before waiting an interval.

### Implementation

```javascript
function pollUntil(fn, {
  interval = 500,
  timeout = Infinity,
  signal,
  predicate = Boolean,
  immediate = true,
  failFast = false,
  onError,
} = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timer = null;
    let settled = false;

    function cleanup() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      signal?.removeEventListener("abort", onAbort);
    }

    function finish(fnOutcome, value) {
      if (settled) return; // guarantee a single settlement
      settled = true;
      cleanup();
      fnOutcome(value);
    }

    function onAbort() {
      finish(reject, signal.reason ?? new DOMException("Aborted", "AbortError"));
    }

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    async function tick() {
      if (settled) return;
      try {
        const value = await fn();
        if (predicate(value)) return finish(resolve, value);
      } catch (error) {
        onError?.(error);
        if (failFast) return finish(reject, error);
      }

      if (Date.now() - startedAt >= timeout) {
        return finish(reject, new Error(`pollUntil timed out after ${timeout}ms`));
      }
      timer = setTimeout(tick, interval); // arm only after the attempt settles
    }

    if (immediate) tick();
    else timer = setTimeout(tick, interval);
  });
}
```

### Walkthrough

`pollUntil(fn, { interval: 500, timeout: 2000, predicate: (v) => v === "ready" })` where `fn` takes 100 ms and returns `"pending"`, `"pending"`, `"ready"`:

1. `startedAt = now`; `immediate` is true, so `tick()` runs. `fn` awaits 100 ms → `"pending"`. `predicate` is false. Elapsed ≈ 100 ms < 2000, so `timer = setTimeout(tick, 500)`; the next attempt starts at 600 ms.
2. At 600 ms, `tick` runs `fn` again → `"pending"` at 700 ms. Elapsed 700 < 2000 → schedule; next at 1200 ms.
3. At 1200 ms, `fn` returns `"ready"` at 1300 ms. `predicate` is true → `finish(resolve, "ready")`: `settled = true`, the pending timer (if any) is cleared, the abort listener is removed, and the promise resolves.
4. Observed spacing between attempt starts is `100 + 500 = 600` ms — `interval` is the gap, not the period.

Timeout path: if every value is `"pending"`, then at the attempt starting at 1800 ms `fn` returns at 1900 ms; elapsed `1900 < 2000`, so a timer is armed for 2400 ms. At 2400 ms `tick` runs, but the first thing it does after `await` is compute elapsed `2400 >= 2000` → rejects with the timeout error. Note the check happens *after* an attempt (before scheduling), so a check that can still succeed is never skipped, and the total time is bounded by `timeout + one attempt`.

Abort path: `ctrl.abort()` calls `onAbort` synchronously from the signal event, which calls `finish(reject, ...)`. `settled` becomes true, the timer is cleared, and the listener is removed. If an `fn` was in flight, its later resolution finds `settled === true` and returns without scheduling — the same post-`await` guard as `poll`.

### Complexity

Time: `O(n)` scheduling overhead for `n` attempts; wall-clock is bounded by `timeout + one fn duration`. Space: `O(1)` — a timer handle and flags.

### Edge Cases

- Condition already true on the first attempt → resolves immediately, no timer ever armed.
- `timeout: 0` → the first attempt still runs (the check is after it), then it rejects; document that a zero timeout means "one attempt, no waiting."
- `timeout` smaller than `fn`'s duration → the first attempt finishes and the check rejects; the promise never hangs.
- Abort before the first tick → `signal.aborted` short-circuits to rejection; `fn` is never called.
- Abort while `fn` is in flight → `onAbort` rejects; the in-flight `fn` keeps running (abort it via the signal inside `fn`, or pass `signal` to `fetch`).
- `fn` rejects transiently → `onError` fires, polling continues; `failFast: true` rejects on the first error.
- `predicate` throws → caught by the same `catch` as `fn`; do not let a buggy predicate become an unhandled rejection.
- `fn` never settles and `timeout` is finite → the timeout is checked only between attempts, so a hung `fn` blocks the deadline. Race `fn` against `AbortSignal.timeout(...)` for a hard bound.
- Multiple resolutions attempted (abort racing success) → the `settled` guard makes the first one win.

### Interview Follow-ups

- **Exponential backoff:** grow `interval` (×2, capped) after each unsuccessful attempt and reset on success; pass a `maxInterval`.
- **Return a handle instead of a promise:** `poll` from the previous problem is the same loop with the outcome pushed to a callback.
- **Hard deadline per attempt:** `Promise.race([fn(), rejectAfter(interval)])` or `AbortSignal.timeout` inside `fn`.
- **Cancellable from outside:** `AbortSignal.any([userSignal, AbortSignal.timeout(timeout)])` replaces the manual elapsed check.
- **Retry semantics:** distinguish "condition not met" (keep polling) from "request failed" (retry with backoff, cap attempts); the two policies should be separate options, as in production job-polling helpers.

### Common Mistakes

- Forgetting to remove the abort listener on success, retaining the closure and the whole scope.
- Using a separate `setTimeout` for the timeout, creating two racing settle paths and duplicated cleanup.
- Resolving on abort instead of rejecting, so callers cannot tell the wait was cancelled.
- Checking the timeout *before* the attempt, which skips a final check that could have succeeded.
- Letting a rejected `fn` reject the whole promise by default and turning a warming-up server into a hard failure.
- Scheduling the next `setTimeout` before `await fn()`, reintroducing overlap.
- No `settled` guard, so a late timer and an abort both settle the promise and the second is ignored — or worse, throws.

### Takeaway

Poll-until is the polling loop wrapped in a promise, so every exit path must funnel through one `cleanup` and one `settled` guard. The condition check runs after each attempt; the timeout is checked between attempts; abort is a rejection; and the next timer is armed only after the current attempt settles — which is what keeps concurrency at one and shutdown clean.


