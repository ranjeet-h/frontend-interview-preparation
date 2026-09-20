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


