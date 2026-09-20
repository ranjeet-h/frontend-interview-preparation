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

