# Async/Await Practical

This is the applied companion to the Promises page: scenarios phrased the way a product interview asks them. The recurring themes are sequential versus parallel execution, preserving input order, tolerating partial failure, cancellation with `AbortController`, and preventing a slow stale response from overwriting a newer one.

## Fetch Two Independent APIs Concurrently

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `loadDashboard(userId, { signal })` that returns `{ user, posts }` from two endpoints that do not depend on each other. The contract:

- Both requests start in the **same tick**. Total wall-clock is `max(tUser, tPosts)`, not the sum.
- The result is index-ordered and shape-stable: `user` is always the user, `posts` is always the array — `Promise.all` preserves the input order regardless of which settles first.
- If either rejects, the returned promise rejects with that first rejection. The sibling request keeps running unless you abort it; `Promise.all` does not cancel.
- The caller's `AbortSignal` is forwarded to both requests, so one abort drops both.

### Examples

```text
await timeIt(() => loadDashboardSequential(1)) // => ~200  (80 + 120, serialised)
await timeIt(() => loadDashboard(1))           // => ~120  (max(80, 120), overlapped)

await loadDashboard(1)
// => { user: { id: 1, name: "user-1", teamId: 101 }, posts: ["post-1-a", "post-1-b"] }

await loadDashboard(0)                          // => rejects Error: 404: user 0
const c = new AbortController();
const p = loadDashboard(1, { signal: c.signal });
c.abort();                                      // => p rejects DOMException AbortError
```

### Approach

The rule is: **an `await` serialises; starting a promise does not.** `fetchUser(id)` returns a pending promise immediately, and the network work begins in that call. So the fix is to *create* both promises before awaiting either:

1. Call `fetchUser(id)` and `fetchPosts(id)` — two pending promises, both in flight.
2. `await Promise.all([...])` — one suspension, resolving when the slowest settles.
3. Destructure positionally; the array order is the argument order, never completion order.

Why `Promise.all` and not a loop of `await`s: `await a; await b;` is two round trips end to end, giving `tA + tB`, which for a dashboard is the difference between a snappy and a sluggish page. `Promise.all` gives `max(tA, tB)`.

Contract details a naive answer misses:

- **`Promise.all` rejects on the first rejection but attaches handlers to every promise**, so a late sibling rejection is *not* an unhandled rejection. Siblings are not cancelled — if the request has side effects server-side, they still happen. Cancel deliberately with an `AbortController`.
- **Empty input is not an error:** `Promise.all([])` resolves to `[]` synchronously-ish (next microtask).
- **Non-promise values are fine:** `Promise.all` wraps them, which is why mixing a cached value with a live request works.

### Implementation

```javascript
// ---- Test double: real latency, real abort semantics, no server ----
function abortError(signal) {
  return signal?.reason ?? new DOMException("Aborted", "AbortError");
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError(signal));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchUser(id, { signal } = {}) {
  await wait(80, signal);
  if (id === 0) throw new Error(`404: user ${id}`);
  return { id, name: `user-${id}`, teamId: id + 100 };
}

async function fetchPosts(userId, { signal } = {}) {
  await wait(120, signal);
  return [`post-${userId}-a`, `post-${userId}-b`]; // independent of the user payload
}

// ---- The answer ----
async function loadDashboard(userId, { signal } = {}) {
  // Both calls happen here, before any await, so the requests overlap.
  const [user, posts] = await Promise.all([
    fetchUser(userId, { signal }),
    fetchPosts(userId, { signal }),
  ]);
  return { user, posts };
}

// The wrong version, for comparison: 200ms instead of 120ms.
async function loadDashboardSequential(userId, { signal } = {}) {
  const user = await fetchUser(userId, { signal });   // wait 80ms
  const posts = await fetchPosts(userId, { signal }); // then wait another 120ms
  return { user, posts };
}

async function timeIt(fn) {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}
```

### Walkthrough

`loadDashboard(1)`:

1. `fetchUser(1, { signal })` runs until its first `await` (`wait(80)`), returns a pending promise. The 80ms timer is already scheduled.
2. `fetchPosts(1, { signal })` does the same, scheduling the 120ms timer. Still no suspension of `loadDashboard` itself.
3. `await Promise.all([...])` suspends the function; the event loop is free.
4. At ~80ms `user` fulfills; at ~120ms `posts` fulfills. `Promise.all` resolves with `[user, posts]` **in argument order** — `posts` did not "arrive second" in the result.
5. Destructuring yields `user` and `posts`; the returned object is built and the promise resolves at ~120ms.

Contrast `loadDashboardSequential(1)`: `fetchPosts` is not called until 80ms have already elapsed, so its 120ms timer starts late and the total is ~200ms.

### Complexity

Time: one network round trip, `O(max(tUser, tPosts))`; sequential is `O(tUser + tPosts)`. Space: `O(payloadUser + payloadPosts)` for the two responses plus a two-element array.

### Edge Cases

- **First rejection wins but does not cancel:** with `Promise.all`, whichever rejects first becomes the result; the sibling's rejection is still handled, so no `unhandledRejection`.
- **Aborted after one has resolved:** the in-flight request rejects with `AbortError`; the already-cached value is discarded.
- **One request is much slower:** a 5s and a 50ms request still take 5s. Bound the wait with `AbortSignal.timeout(3000)` (see Follow-ups).
- **Empty list:** `Promise.all([])` → `[]`; add a length guard if an empty input is a caller bug.
- **Non-promise values:** `Promise.all([cachedUser, fetchPosts(id)])` works; `Promise.all` wraps the value.
- **Very many requests:** 50 concurrent `fetch`es hit the browser's per-host connection cap (often 6), so `Promise.all` of 50 is not 50-way parallel — that is the case for a concurrency limit (see the five-at-a-time problem).

### Interview Follow-ups

- **Add a timeout:** `Promise.all([...].map((p) => p), ...)` is wrong; instead combine signals — `AbortSignal.any([signal, AbortSignal.timeout(3000)])` — and pass that to each request.
- **Only one failure matters:** if a failed `posts` can degrade gracefully, switch to `Promise.allSettled` and default `posts` to `[]` (next problem but one).
- **Preserve partial results:** `Promise.all` throws away a fulfilled sibling's value. Use `allSettled`, or `Promise.all([p.catch(...), ...])`.
- **Why not `for await (const x of [a, b])`?** It awaits in sequence, exactly the bug this problem is about, unless you pass an array of already-started promises, which then only controls consumption order.

### Common Mistakes

- `const user = await fetchUser(id); const posts = await fetchPosts(id);` — sequential, the whole point of the question.
- Forgetting `await` on `Promise.all`, returning `{ user: Promise, posts: Promise }` to the caller.
- Believing `Promise.all` cancels the loser on rejection; it only stops *waiting*.
- Attaching `Promise.all(...).catch(() => ({ user: null, posts: [] }))` and silently mapping a 500 to "logged out".
- Assuming the array order follows completion; it follows input order. The flip side is real: if you `push` from `.then` callbacks you get completion order instead.

### Takeaway

`await` serialises; constructing a promise starts the work. Kick off independent requests first, then await them together — `Promise.all` gives you `max` latency and input-indexed results for free.

## Fetch API B Only After API A Succeeds

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `loadUserWithTeamPosts(userId, { signal })` returning `{ user, posts }`, where the posts endpoint needs something that only the user endpoint can provide. The contract:

- Request **B is never issued if A rejects** or if A's payload says there is nothing to fetch.
- B's arguments come from A's result (`user.teamId`), so the two calls cannot be started together.
- A's rejection propagates with its original identity — do not replace a 404 with a generic error, and never wrap an `AbortError`.
- One `signal` covers the whole chain: aborting cancels whichever request is in flight.

This is the mirror image of the previous problem. There the requests were independent and the bug was awaiting them in sequence; here the dependency is real, so sequence is correct — and the bug is starting a request you cannot yet describe.

### Examples

```text
await loadUserWithTeamPosts(1)
// => { user: { id: 1, name: "user-1", teamId: 101 }, posts: ["team-101-a", "team-101-b"] }
// teamPostsCalls === 1

await loadUserWithTeamPosts(2)      // user.teamId === null
// => { user: { id: 2, name: "user-2", teamId: null }, posts: [] }
// teamPostsCalls === 0  — B was skipped entirely, not requested and failed

await loadUserWithTeamPosts(0)      // A rejects
// => rejects Error: 404: user 0
// teamPostsCalls === 0  — B was never attempted

const c = new AbortController();
const p = loadUserWithTeamPosts(1, { signal: c.signal });
c.abort();                          // => p rejects DOMException: AbortError
```

### Approach

For a data dependency the plan is a plain sequential `await`, and the interesting content is the *guards and the error contract* around it:

1. `const user = await fetchUser(userId, { signal })` — if this throws, control jumps out and B is never constructed. Short-circuiting is free with `await`; no explicit `if (user)` is needed.
2. Guard the value B needs. If the parent field is absent, return an empty result **without** a request. Use a nullish test (`user.teamId == null`), not a truthiness test: `0`, `""`, and `false` can be legitimate identifiers.
3. `await fetchPostsByTeam(user.teamId, { signal })` — same signal, so the caller's abort reaches both.
4. Return the tuple.

Points a naive answer misses:

- **Sequential here costs `tA + tB` and that is unavoidable** — but only for the *dependent* leg. Any request that does not read A's payload should still overlap A. Start it before the first `await`, read it after.
- **Never wrap a cancellation.** `catch` blocks that convert every error into a domain error destroy the `AbortError` that callers and frameworks use to tell cancellation apart from failure.
- **Retry the failed step, not the chain.** If B fails, re-running A is wasted work and can be wrong (A may be non-idempotent). The index-aligned retry problem covers this.
- **`AbortSignal.timeout(ms)`** gives a per-step deadline; `AbortSignal.any([callerSignal, timeoutSignal])` combines it with cancellation. `AbortSignal.any` is newer than the rest of the API surface here, so feature-detect if you support older engines.

### Implementation

```javascript
// Reuses `wait` and `fetchUser` from the previous problem.
let teamPostsCalls = 0; // spy, to prove B is skipped rather than attempted

async function fetchPostsByTeam(teamId, { signal } = {}) {
  teamPostsCalls += 1;
  await wait(120, signal);
  return [`team-${teamId}-a`, `team-${teamId}-b`];
}

async function fetchSettings(userId, { signal } = {}) {
  await wait(60, signal);
  return { userId, theme: "dark" };
}

// ---- The answer ----
async function loadUserWithTeamPosts(userId, { signal } = {}) {
  // A: must settle before B's arguments even exist.
  const user = await fetchUser(userId, { signal });

  // Guard the parent field. `== null` keeps legitimate falsy ids such as 0.
  if (user.teamId == null) return { user, posts: [] };

  // B: reuses the SAME signal, so one abort cancels whichever request is in flight.
  const posts = await fetchPostsByTeam(user.teamId, { signal });
  return { user, posts };
}

// ---- Same chain, with error context and cancellation left intact ----
async function loadUserWithTeamPostsAnnotated(userId, { signal } = {}) {
  let user;
  try {
    user = await fetchUser(userId, { signal });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause; // cancellation is not a failure
    throw new Error(`Could not load user ${userId}`, { cause });
  }
  if (user.teamId == null) return { user, posts: [] };
  try {
    const posts = await fetchPostsByTeam(user.teamId, { signal });
    return { user, posts };
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new Error(`Could not load posts for team ${user.teamId}`, { cause });
  }
}

// ---- Overlap whatever is genuinely independent ----
async function loadProfile(userId, { signal } = {}) {
  const userPromise = fetchUser(userId, { signal });         // start now
  const settingsPromise = fetchSettings(userId, { signal }); // independent: start now too

  const user = await userPromise;                             // needed before the next line
  const posts = await fetchPostsByTeam(user.teamId, { signal });

  return { user, posts, settings: await settingsPromise };     // already settled, ~free
}
```

### Walkthrough

`loadUserWithTeamPosts(1)`:

1. `fetchUser(1, ...)` is awaited; after ~80ms it fulfills with `{ id: 1, name: "user-1", teamId: 101 }`.
2. `user.teamId == null` is false, so the guard does not fire.
3. `fetchPostsByTeam(101, ...)` is called — `teamPostsCalls` becomes `1` — and resolves after ~120ms.
4. The function resolves at ~200ms with `{ user, posts: ["team-101-a", "team-101-b"] }`.

`loadUserWithTeamPosts(2)`: `fetchUser` resolves at ~80ms with `teamId: null`. The guard returns `{ user, posts: [] }` at ~80ms, and `teamPostsCalls` stays `0` — B was never constructed, so there is no wasted round trip and no spurious 400 from `GET /teams/null/posts`.

`loadUserWithTeamPosts(0)`: `fetchUser` rejects at ~80ms. Because the rejection happens at the `await`, the rest of the function body never runs. B is not attempted and the original `Error: 404: user 0` reaches the caller.

### Complexity

Time: `O(tA + tB)` for the dependent pair — irreducible, since B's arguments are not known until A resolves. Space: `O(payloadA + payloadB)`. In `loadProfile`, time is `O(tA + tB)` too, because `tSettings` is overlapped with `tA`.

### Edge Cases

- **A rejects:** B is skipped by control flow, not by an `if` — nothing to get wrong.
- **Parent field is `0` or `""`:** `== null` keeps it; `if (!user.teamId)` would silently skip a valid id.
- **Abort between A and B:** the already-aborted signal is passed to B, which rejects immediately without touching the network (matching real `fetch`).
- **Signal never forwarded:** the classic bug where `signal` is dropped on the second call, so "cancel" only cancels half the chain.
- **A resolves but the user navigated away:** abort explicitly, or guard with a request token and drop the late result.
- **Deeper chains:** A → B → C is `tA + tB + tC`. Past two levels, prefer an aggregated endpoint or a GraphQL query over adding round trips.
- **`AbortError` wrapped:** callers can no longer distinguish "user cancelled" from "the server failed", and frameworks that special-case cancellation stop working.

### Interview Follow-ups

- **One deadline for the whole chain:** `const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(3000)])` and pass it to every step.
- **Three-step chain where step 3 is independent of step 2:** start step 3 next to step 2 and await both with `Promise.all`, folding it back into the previous problem's pattern.
- **Cursor pagination:** B returns `{ items, nextCursor }`; loop B with the previous cursor. Discuss deduplication and a max-page guard.
- **Stale results:** tag each request with a monotonically increasing id and ignore any response whose id is not the newest — the fix for fast typing in a search box.
- **Production:** a real client would put this behind a data-fetching library (`TanStack Query`), which already implements retries, cancellation, and stale-result suppression.

### Common Mistakes

- `fetchPostsByTeam(user.teamId, ...)` where `teamId` came from a field that does not exist, producing `GET /teams/undefined/posts`.
- Truthiness guards (`if (!user.teamId)`) that break for id `0`.
- Wrapping every error, including `AbortError`, so cancellation looks like a failure.
- Re-fetching A when only B failed; retry the failed step in place.
- Forgetting to forward `signal` to the second request, leaving half the chain uncancellable.
- Making two independent requests sequential because they were written in the same `async` function.

### Takeaway

Real dependencies force sequence: `tA + tB`, because B's arguments live in A's response. Everything that is *not* dependent should still overlap A, and the two rules that separate a careful answer from a sloppy one are "skip B when the parent field is missing" and "never swallow `AbortError`".

## Fetch Several Endpoints Where Some Failures Are Acceptable

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `loadWidgets(ids, { signal })` that fetches many independent widgets and returns `{ widgets, failures }`. The contract:

- **One failure must not discard the successes.** `Promise.all` rejects on the first failure and throws away every fulfilled sibling; this needs `Promise.allSettled`.
- Every outcome is correlated back to the **input id by index**, so a failure is reported against the request that caused it.
- `failures[i].error` is the **original rejection reason** — the `Error` itself, not `error.message`, so `cause`, stack, and type checks survive.
- The promise only rejects if the caller aborted: a deliberate cancellation is not "47 widgets failed".

### Examples

```text
await loadWidgets([1, 2, 3])
// => { widgets: [{id:1,...}, {id:2,...}, {id:3,...}], failures: [] }

await loadWidgets([1, 0, 3])
// => { widgets: [{id:1,...}, {id:3,...}],
//      failures: [{ id: 0, error: Error: 404: widget 0 }] }

await loadWidgets([])          // => { widgets: [], failures: [] }
await loadWidgets([0, 0])      // => { widgets: [], failures: [ {id:0,...}, {id:0,...} ] }

// The popular shortcut loses the distinction between a value and a failure:
await Promise.all([fetchWidget(0).catch((e) => e)])  // resolves with an Error *value* — looks fulfilled
```

### Approach

`Promise.allSettled(promises)` resolves with one result object per input, in input order, each of shape `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`. Unlike `all` it never rejects; the only way it throws is a synchronous error while building the iterable.

The correctness work is in the mapping step:

1. Use `settled.forEach((result, index) => ...)` so `ids[index]` identifies the failure. Filtering (`settled.filter(r => r.status === "rejected")`) detaches the error from its input unless the index was captured first.
2. Push successes and failures into separate arrays rather than overwriting one slot with `null`, so callers cannot confuse "missing" with "failed" (or with a legitimately `null` payload).
3. After settling, check `signal?.aborted` and rethrow. With a shared `signal`, aborting turns every in-flight request into a rejection, and `allSettled` reports that as `n` failures instead of a cancellation.

Alternatives and when they are actually better:

- **`Promise.all` + `.catch(e => e)`**: equal parallelism, but a fulfilled value that happens to be an `Error` is indistinguishable from a rejection. `allSettled` carries an explicit status field.
- **`Promise.any`**: first *success* wins and failures are dropped, with `AggregateError` only when everything fails. Use it for redundant mirrors; it cannot report partial results.
- **Per-request timeouts**: attach `AbortSignal.timeout(800)` (combined with the caller signal via `AbortSignal.any`) so one hung endpoint becomes a reported failure instead of holding the page open. `allSettled` waits for the slowest promise, so without a timeout a partial failure can still mean "never resolves".

### Implementation

```javascript
// Reuses `wait` / `abortError` from the first problem in this section.
async function fetchWidget(id, { signal } = {}) {
  await wait(40 + (id % 3) * 25, signal);
  if (id === 0) throw new Error(`404: widget ${id}`);
  return { id, label: `widget-${id}` };
}

// ---- The answer ----
async function loadWidgets(ids, { signal } = {}) {
  // allSettled never rejects: it resolves with a { status, ... } per input.
  const settled = await Promise.allSettled(
    ids.map((id) => fetchWidget(id, { signal })),
  );

  const widgets = [];
  const failures = [];

  // `index` is the only link back to the request that produced this outcome.
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      widgets.push(result.value);
    } else {
      failures.push({ id: ids[index], error: result.reason });
    }
  });

  return { widgets, failures };
}

// ---- Treat cancellation as cancellation, not as N failures ----
async function loadWidgetsStrict(ids, { signal } = {}) {
  const settled = await Promise.allSettled(
    ids.map((id) => fetchWidget(id, { signal })),
  );

  // Shared signal + abort means every request rejected with the same AbortError.
  if (signal?.aborted) throw abortError(signal);

  const out = { widgets: [], failures: [] };
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") out.widgets.push(result.value);
    else out.failures.push({ id: ids[index], error: result.reason });
  });
  return out;
}

// ---- Tolerate only what you meant to tolerate ----
function isTolerable(error) {
  if (error instanceof TypeError) return true;              // network/DNS
  return typeof error?.status === "number" && error.status >= 400 && error.status < 500;
}

async function loadWidgetsFiltered(ids, { signal } = {}) {
  const { widgets, failures } = await loadWidgets(ids, { signal });
  const fatal = failures.find(({ error }) => !isTolerable(error));
  if (fatal) throw fatal.error; // e.g. a 500: the page cannot render meaningfully
  return { widgets, failures };
}
```

### Walkthrough

`loadWidgets([1, 0, 3])`:

1. `ids.map(...)` starts three `fetchWidget` calls in the same tick; the requests overlap.
2. Latenices from the mock are `40 + id % 3 * 25`: id 1 → 65ms, id 0 → 40ms, id 3 → 40ms. They settle in the order 0, 3, 1.
3. `allSettled` waits for the slowest and returns `[fulfilled(id1), rejected(id0), fulfilled(id3)]` — **in input order**, not completion order.
4. `forEach`: index 0 fulfills → `widgets.push(widget1)`. Index 1 rejects → `failures.push({ id: ids[1] === 0, error })`. Index 2 fulfills → `widgets.push(widget3)`.
5. Result: `widgets` is `[{id:1..}, {id:3..}]` and `failures` is `[{ id: 0, error: Error("404: widget 0") }]`. The two fulfilled values survived the rejection, which is the whole point.

### Complexity

Time: `O(max(tᵢ))` — one overlapped batch, bounded by the slowest request (or by the timeout you attach, which is why timeouts matter here). Space: `O(n)` for the promise array plus `O(n)` for the settled results and the output arrays.

### Edge Cases

- **Empty input:** `Promise.allSettled([])` → `[]`; returns `{ widgets: [], failures: [] }`.
- **All fail:** still resolves, `widgets` empty, all `n` failures reported — no throw.
- **Duplicate ids:** preserved one-to-one; correlation is positional, not by value.
- **Non-promise entries:** wrapped as fulfilled values (useful when mixing a cache hit with live requests).
- **Abort:** by default every request rejects and appears as a failure; use the strict variant to rethrow.
- **Mixed error classes:** `AbortError` and HTTP errors land in the same `failures` array; filter on `error.name`/`error.status` rather than on a message string.
- **`widgets` order:** it is a filtered subsequence of `ids`, so it is ascending but no longer index-aligned. If the caller needs a slot per id, build `new Array(ids.length)` and fill it (see the ordering problem later in this section).
- **Slowest request dominates:** without a timeout, one hung request means the function never resolves even though every other widget is ready.

### Interview Follow-ups

- **Retry only the failures:** feed `failures.map(f => f.id)` back through the same function with backoff — the next problem.
- **Bound the concurrency:** `ids` may be 100 URLs, not 10 (see the five-at-a-time problem).
- **Why not `Promise.all` with per-promise `.catch`?** It cannot distinguish a fulfilled `Error` value from a rejection, so `status` has to be encoded by hand.
- **Redundant endpoints:** if three mirrors serve the same data, `Promise.any` returns the fastest success and only rejects with `AggregateError` when all three fail.
- **Production:** `TanStack Query`'s `useQueries` models exactly this "partial success" shape; mention it rather than hand-rolling in an app.

### Common Mistakes

- Using `Promise.all` and losing every successful response when one widget 404s.
- Reporting `error.message` instead of the `Error`, which destroys `cause` and stack information.
- Losing the id association by filtering without capturing the index.
- Treating a user-initiated abort as a batch of failures instead of a cancellation.
- `allSettled` with no timeout, so "tolerate partial failure" becomes "hang forever".
- Assuming an `Error` object in a fulfilled value means failure — with `allSettled`, only `status` decides.

### Takeaway

`Promise.allSettled` is "all must finish, none must succeed": it never rejects, the results are index-aligned with the input, and the `status` field is what separates a value from a rejection. Tolerating partial failure means correlating outcomes back to their request and deciding which error classes you actually tolerate.

## Retry Only the Failed Requests From a Batch

`Difficulty: Medium` `Probability: High`

### Problem

Implement `fetchAllWithRetry(urls, { maxAttempts, baseDelay, signal })` returning `{ results, errors }`, where both arrays are index-aligned with `urls`. The contract:

- Each round issues requests **only for the indices still unresolved**. A success is never re-fetched.
- At most `maxAttempts` rounds (default `3` = one initial attempt plus two retries).
- Backoff between rounds is exponential with jitter and **cancellable**: aborting must interrupt the delay, not wait it out.
- A caller abort stops the loop and rejects; it does not surface as `n` failed URLs.
- `results[i]` is the successful payload and `errors[i]` is the surviving `Error` (`null` on success), so the caller can zip both with the input.

### Examples

```text
await fetchAllWithRetry(["a", "bad", "c"])
// => { results: [ {url:"a",status:200}, undefined, {url:"c",status:200} ],
//      errors:  [ null, Error: GET bad failed, null ] }
// requests issued: "a", "bad", "c", "bad", "bad"   (5, not 9)

await fetchAllWithRetry(["a", "b"], { maxAttempts: 1 })
// => one round, no retries, "a" and "b" never re-requested

await fetchAllWithRetry([], {})                       // => { results: [], errors: [] }

const c = new AbortController();
c.abort();
await fetchAllWithRetry(["a"], { signal: c.signal })  // => rejects AbortError, zero requests
```

### Approach

A **round loop over a shrinking work set**:

```
pending = every index
for attempt = 1 .. maxAttempts:
    settled = await allSettled(pending.map(index => fetch(urls[index])))
    fulfilled  -> results[index] = value
    rejected   -> retryable and attempts remain ? keep index : errors[index] = reason
    pending = indices still worth retrying
    if pending is empty: stop
    await sleep(exponentialBackoff(attempt) with jitter, signal)
```

Contract details a naive answer misses:

- **Track indices, not values.** `urls` can contain duplicates, so an index is the only stable key. Assigning `results[index] = value` makes the output order correct for free — no sorting pass, no completion-order `push`.
- **`allSettled`, not `all`, inside a round.** With `all`, the first rejection aborts the round and discards the other outcomes, so indices that succeeded would be retried and indices that failed twice in a round would be invisible.
- **Backoff must race the signal.** `await new Promise(r => setTimeout(r, ms))` ignores aborts; aborting then waits out the full delay and can issue another round. Reuse the abort-aware `wait` from the first problem.
- **Jitter is not decoration.** Clients that failed together retry together; `* (0.5 + Math.random())` spreads the retry wave.
- **Classify before retrying.** A 400/401/404 is deterministic: retrying wastes quota and delays the error. Only 5xx, 429, and network-level failures (`TypeError` from `fetch`) are retryable.
- **Two bounds, not one.** `maxAttempts` caps rounds; it does not cap round-1 concurrency, which is always `n` requests.

### Implementation

```javascript
// Reuses `wait` / `abortError`; a cancellable delay is a hard requirement here.
const sleep = (ms, signal) => wait(ms, signal);

async function fetchData(url, { signal } = {}) {
  await wait(50 + (url.length % 5) * 30, signal); // deterministic pseudo-latency
  if (/bad|fail/.test(url)) throw new Error(`GET ${url} failed`);
  return { url, status: 200 };
}

// 5xx, 429 and network failures are worth another attempt; 4xx is not.
const isRetryable = (error) =>
  error?.name !== "AbortError" &&
  (error?.status == null || error.status >= 500 || error.status === 429);

async function fetchAllWithRetry(urls, { maxAttempts = 3, baseDelay = 100, signal } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  const results = new Array(urls.length);              // index-aligned payloads
  const errors = new Array(urls.length).fill(null);    // null === this one succeeded
  let pending = urls.map((_, index) => index);         // only these are re-requested

  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
    if (signal?.aborted) throw abortError(signal);      // never start a round we cannot finish

    const settled = await Promise.allSettled(
      pending.map((index) => fetchData(urls[index], { signal })),
    );

    if (signal?.aborted) throw abortError(signal);      // in-flight requests were cancelled

    const failed = [];
    settled.forEach((outcome, slot) => {
      const index = pending[slot];                      // slot -> original input index
      if (outcome.status === "fulfilled") {
        results[index] = outcome.value;                 // assign by index, never push
      } else if (attempt === maxAttempts || !isRetryable(outcome.reason)) {
        errors[index] = outcome.reason;                 // terminal: stop spending attempts
      } else {
        failed.push(index);
      }
    });

    pending = failed;
    if (pending.length > 0) {
      const backoff = baseDelay * 2 ** (attempt - 1);   // 100, 200, 400, ...
      await sleep(backoff * (0.5 + Math.random()), signal); // jitter, and abortable
    }
  }

  // At this point every index either has a result or a terminal error.
  return { results, errors };
}

// Optional: collapse duplicate URLs so "bad" is retried once per round, not twice.
function dedupeIndices(urls) {
  const byUrl = new Map();
  for (let i = 0; i < urls.length; i += 1) {
    const list = byUrl.get(urls[i]) ?? [];
    list.push(i);
    byUrl.set(urls[i], list);
  }
  return byUrl;
}
```

### Walkthrough

`fetchAllWithRetry(["a", "bad", "c"])`, `maxAttempts = 3`, latency `50 + url.length % 5 * 30`:

1. `pending = [0, 1, 2]`. Attempt 1 issues all three in one tick. `"a"` and `"c"` fulfill; `"bad"` rejects with `Error("GET bad failed")`. It is retryable and `attempt (1) < maxAttempts (3)`, so `failed = [1]`. `results[0]` and `results[2]` are set. Sleep ~50–150ms.
2. Attempt 2: `pending = [1]`, so **only** `"bad"` is requested. It rejects again; `attempt (2) < 3`, so `failed = [1]` and the loop continues. Sleep ~100–300ms.
3. Attempt 3: `pending = [1]`; `attempt === maxAttempts`, so the rejection is terminal: `errors[1] = Error("GET bad failed")` and `failed = []`.
4. `pending` is empty; the loop exits (also satisfying its condition). Total requests: `"a"`, `"bad"`, `"c"`, `"bad"`, `"bad"` — five. A retry-the-whole-batch implementation would have issued nine.

If the caller aborts during step 2's sleep, `sleep` rejects with the `AbortError`, which propagates out of the function before attempt 3 starts.

### Complexity

Time: `O(maxAttempts × maxLatency + Σ backoff)` in the worst case; a batch that succeeds on round 1 costs one overlapped round plus no delay. Space: `O(n)` for `results`, `errors`, `pending`, and the round's promise array.

### Edge Cases

- **Empty input:** `results` and `errors` are empty; the loop never runs.
- **All succeed first try:** one round, no sleep, `errors` stays all `null`.
- **All fail retryably:** exactly `maxAttempts` rounds, then the last rejection is stored per index.
- **Non-retryable error:** stored immediately; the index is removed from `pending` on round 1.
- **Abort mid-round:** in-flight requests reject with `AbortError`; the post-settle `signal.aborted` check rethrows so the result is a cancellation, not a pile of failures.
- **Duplicate URLs:** by default each index retries independently; dedupe when the batch may be large.
- **`results[i] === undefined`:** ambiguous on its own — a legitimately `undefined` payload versus no payload — which is exactly why `errors` is a parallel array rather than a sentinel.
- **Retry amplification:** each round is a fresh fan-out of `pending.length` requests. With `n = 100` and `maxAttempts = 3`, round 1 alone violates any per-host connection cap; combine with the concurrency limit in the next problem.
- **`maxAttempts <= 0`:** rejected up front with `RangeError` rather than silently returning everything as an error.

### Interview Follow-ups

- **Jitter strategies:** full jitter (`random() * backoff`), equal jitter (`backoff/2 + random() * backoff/2`), decorrelated jitter (`min(cap, random(base, prev * 3))`); ask which the interviewer means, since the guarantee differs.
- **Respect `Retry-After`:** on a 429/503, parse the header and use `max(backoff, retryAfterSeconds * 1000)`.
- **Per-attempt timeout:** wrap each call in a combined signal — `AbortSignal.any([signal, AbortSignal.timeout(2000)])` — so a hung request becomes a retryable failure instead of an indefinite stall.
- **Circuit breaker / retry budget:** above a failure rate, stop retrying for everyone for a cooldown window; retries are the classic cause of metastable outages.
- **Swap the loop for a queue:** `p-retry` / `p-map` in production; the interview still wants the mechanics.

### Common Mistakes

- Re-fetching the entire batch when any request fails (the "retry storm" answer).
- Using `Promise.all` inside a round, so one rejection discards the round's other outcomes.
- `await new Promise(r => setTimeout(r, ms))` for backoff, which ignores the signal and delays cancellation.
- Unbounded retries (`while (true)`), or retrying 4xx responses forever.
- Pushing into `results` inside the callbacks, which yields completion order instead of input order.
- Retrying with a constant delay, so every failed client returns in lockstep.

### Takeaway

Batch retry is a round loop over a shrinking index set: settle the whole round, carry the successes forward, keep only the retryable failures, back off with jitter, and stop on a bound. Index bookkeeping is what makes the result order-independent, and a cancellable sleep is what makes "abort" mean abort.

## Process Many URLs With at Most Five Concurrent Requests

`Difficulty: Medium` `Probability: High`

### Problem

Implement `fetchWithLimit(urls, limit = 5)` that fetches `urls` with at most `limit` requests in flight at any moment and resolves with an array of payloads aligned to the input by index. The contract:

- At most `limit` calls to `fetchUrl` are unsettled at once, no matter how large `urls` is. With 100 URLs and `limit = 5`, the 6th request starts only after one of the first five settles.
- `results[i]` is the payload for `urls[i]` — input order, not completion order.
- The first rejection rejects the whole batch (like `Promise.all`). Late fulfillments are still handled, so there are no unhandled rejections.
- `limit` is validated up front; `fetchWithLimit([], 5)` resolves to `[]` without calling `fetchUrl`.

### Examples

```text
await fetchWithLimit(["a", "b", "c", "d", "e", "f"], 2)
// => [{url:"a",...}, {url:"b",...}, {url:"c",...}, {url:"d",...}, {url:"e",...}, {url:"f",...}]
// maxInFlight observed === 2, total requests === 6

await fetchWithLimit(["a", "b", "c"], 5)  // limit > input: 3 workers, 3 requests
// => [{url:"a",...}, {url:"b",...}, {url:"c",...}]

await fetchWithLimit([], 5)               // => []
await fetchWithLimit(["a", "bad", "c"], 2) // => rejects Error: GET bad failed
await fetchWithLimit(["a"], 0)            // => rejects RangeError: limit must be a positive integer
```

### Approach

`Promise.all(urls.map(fetchUrl))` starts all `n` requests in one tick, which is exactly what breaks with 100 URLs: the browser caps per-host connections (often 6), the server rate-limits, and one slow response holds nothing back but memory grows with `n` pending bodies. The fix is a **worker pool over a shared index counter**:

1. Preallocate `results` with `new Array(urls.length)` so slot `i` always belongs to `urls[i]`.
2. Keep one counter, `next`, pointing at the next unclaimed index. Spawn `min(limit, urls.length)` workers — each worker is an `async` loop, so there are never more than `limit` pending `await`s.
3. Inside the loop, claim synchronously (`const index = next; next += 1;`) and only then `await fetchUrl(urls[index])`. The claim happens before the first `await`, so two workers can never take the same index — JavaScript runs each synchronous stretch to completion.
4. `await Promise.all(workers)`. If any worker's `await` throws, that worker's promise rejects, `Promise.all` rejects, and the remaining workers' rejections are still handled by `Promise.all`.

Why this shape and not alternatives: a recursive "start next on settle" chain works but re-creates closures per request and is harder to bound; a semaphore with acquire/release is the same idea with more machinery. The counter is the smallest correct primitive. Note the pool bounds *concurrency*, not *attempts* — combine it with the previous problem's retry loop when failures are retryable.

### Implementation

```javascript
// Fake async helper: deterministic latency, fails on "bad".
async function fetchUrl(url) {
  await wait(30 + (url.length % 4) * 40);
  if (/bad|fail/.test(url)) throw new Error(`GET ${url} failed`);
  return { url, status: 200 };
}

async function fetchWithLimit(urls, limit = 5) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("limit must be a positive integer");
  }

  const results = new Array(urls.length); // slot i belongs to urls[i], always
  let next = 0;                           // shared counter, claimed synchronously

  async function worker() {
    while (next < urls.length) {
      const index = next; // claim before any await: no two workers share it
      next += 1;
      results[index] = await fetchUrl(urls[index]); // one in flight per worker
    }
  }

  // Exactly min(limit, n) workers, so at most `limit` requests are unsettled.
  const workers = Array.from({ length: Math.min(limit, urls.length) }, () => worker());
  await Promise.all(workers); // first rejection wins; siblings stay handled
  return results;
}

// ---- Measuring concurrency in a test ----
let inFlight = 0;
let maxInFlight = 0;
async function trackedFetch(url) {
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  try {
    return await fetchUrl(url);
  } finally {
    inFlight -= 1;
  }
}
```

### Walkthrough

`fetchWithLimit(["a", "b", "c", "d"], 2)` (latencies vary by URL length, but order the claims):

1. `results = [<empty> × 4]`, `next = 0`. Two workers start: worker A claims index `0` (`next` becomes `1`), worker B claims index `1` (`next` becomes `2`). Both `await` their `fetchUrl` — two in flight.
2. Suppose A's request settles first. A writes `results[0]`, loops, claims index `2` (`next` becomes `3`), and awaits — still two in flight (B on index `1`, A on index `2`).
3. B settles, writes `results[1]`, claims index `3` (`next` becomes `4`). A settles, writes `results[2]`, loops, sees `next (4) < 4` is false, and returns.
4. B settles on index `3`, writes `results[3]`, loop condition fails, returns. `Promise.all([workerA, workerB])` resolves; the function returns `results` in input order even though index `1` finished after index `2`.

### Complexity

Time: `O(ceil(n / limit) × slowestBatch)` — each worker processes roughly `n / limit` requests in sequence, and the total is bounded by the slowest chain. Space: `O(n)` for `results` plus `O(limit)` worker promises; only `limit` response bodies are pending at once.

### Edge Cases

- **Empty input:** no workers are spawned, `Promise.all([])` resolves, returns `[]`.
- **`limit >= urls.length`:** one worker per URL; degenerates to plain `Promise.all` with no extra cost.
- **`limit <= 0` or non-integer:** throws `RangeError` before any request starts.
- **One URL rejects:** the batch rejects with that error; sibling workers keep running to completion (their rejections are handled, not unhandled) unless you add an abort signal.
- **Duplicate URLs:** each index is fetched independently, so `["a", "a"]` issues two requests and fills both slots.
- **Synchronous throw inside `fetchUrl`:** inside an `async` worker it becomes a rejection, so the batch still rejects cleanly.
- **`urls` mutated during the run:** `urls.length` is re-read per loop check; snapshot it (`const n = urls.length`) if the caller may push mid-flight.

### Interview Follow-ups

- **Abort the pool:** pass a shared `signal` to each `fetchUrl` and check `signal.aborted` at the top of the loop so idle workers stop claiming.
- **Tolerate partial failure:** settle each slot (`try/catch` around the `await`, or `allSettled` per batch) and return `{ results, errors }` as in the widgets problem.
- **Add retries without breaking the cap:** retry inside the worker (`for attempt = 1..k`) so a retry still occupies that worker's single slot.
- **Report progress:** call `onProgress(done += 1, urls.length)` after each write; the counter makes it trivial.
- **Production:** use `p-limit` / `p-map` rather than hand-rolling; the interview still wants the counter mechanics.

### Common Mistakes

- `await` inside `urls.map(...)` or a `for...of` loop — either unbounded fan-out or fully serial execution, the two extremes the limit sits between.
- Claiming the index *after* an `await` (`next += 1` on the next line past the fetch), so every worker reads the same `next` and fetches the same URL.
- `results.push(await fetchUrl(...))` inside workers, which records completion order instead of input order.
- Swallowing the rejection with a per-worker `.catch(() => null)`, turning a failed batch into silent `null` slots.
- Creating `urls.length` workers ("pool" in name only) instead of `min(limit, urls.length)`.

### Takeaway

Bounded concurrency is `min(limit, n)` workers sharing one synchronously-claimed index counter, with each worker holding at most one pending request and writing to its claimed slot. The counter bounds the fan-out; the slot preserves the order.

## Return Async Results in Input Order Despite Different Completion Times

`Difficulty: Easy` `Probability: High`

### Problem

Implement `fetchOrdered(urls)` that starts all `fetchUrl` requests together but resolves with payloads in **input order**, even when a later URL finishes first. The contract:

- All requests are in flight concurrently; total time is `max(tᵢ)`, not the sum.
- `results[i]` corresponds to `urls[i]` regardless of settle order. A fast `urls[2]` must not shift into slot `0`.
- The first rejection rejects the returned promise (matching `Promise.all`); fulfilled siblings are still handled.
- Empty input resolves to `[]`. Duplicate URLs are fetched once per occurrence and each slot is filled.

### Examples

```text
// fetchUrl latencies: "slow-a" => 120ms, "b" => 10ms, "mid-c" => 50ms
await fetchOrdered(["slow-a", "b", "mid-c"])
// => [{url:"slow-a",...}, {url:"b",...}, {url:"mid-c",...}]
// completes in ~120ms even though "b" finished at ~10ms

await fetchOrdered([])                    // => []
await fetchOrdered(["a", "a"])            // => [{url:"a",...}, {url:"a",...}], two requests
await fetchOrdered(["a", "bad", "c"])     // => rejects Error: GET bad failed
await Promise.all(["slow-a", "b"].map(fetchUrl)) // the built-in equivalent: also input-ordered
```

### Approach

Order comes from **where you write, not when you finish**. The plan:

1. Preallocate `results = new Array(urls.length)` — one slot per input, so there is somewhere correct to put each late arrival.
2. Keep a `completed` counter. Each request's fulfillment handler writes `results[index] = value`, increments `completed`, and resolves the outer promise when `completed === urls.length`.
3. Capture `index` per request with `forEach((url, index) => ...)` or `map`. A `for (var i = ...)` loop shares one binding and every callback writes to the final `i` — the classic ordering bug, now forbidden by `let`/`forEach`.
4. On the first rejection, reject the outer promise immediately. The remaining handlers still run and write their slots, but the outer promise is already settled so those writes are harmless.

`Promise.all(urls.map(fetchUrl))` is exactly this pattern prebuilt — it also preserves input order — so the manual version is how you prove you know *why* it works. The one thing `push` can never give you is order: `results.push(value)` in a `.then` records arrival order, and a fast later request permanently displaces a slow earlier one.

### Implementation

```javascript
// Same fake helper as the previous problem.
async function fetchUrl(url) {
  await wait(30 + (url.length % 4) * 40);
  if (/bad|fail/.test(url)) throw new Error(`GET ${url} failed`);
  return { url, status: 200 };
}

// ---- Manual version: the interview answer ----
function fetchOrdered(urls) {
  if (urls.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const results = new Array(urls.length); // slot i belongs to urls[i]
    let completed = 0;

    urls.forEach((url, index) => { // forEach binds a fresh `index` per callback
      Promise.resolve()
        .then(() => fetchUrl(url))
        .then(
          (value) => {
            results[index] = value; // assign by index, never push
            completed += 1;
            if (completed === urls.length) resolve(results);
          },
          (error) => reject(error), // first rejection wins, like Promise.all
        );
    });
  });
}

// ---- The production one-liner this reimplements ----
function fetchOrderedBuiltIn(urls) {
  return Promise.all(urls.map((url) => fetchUrl(url))); // input order, concurrent
}
```

### Walkthrough

`fetchOrdered(["slow-a", "b", "mid-c"])` with latencies 120ms / 10ms / 50ms:

1. `results = [<empty> × 3]`, `completed = 0`. `forEach` starts all three requests in the same tick with indices `0`, `1`, `2` bound separately.
2. At ~10ms `"b"` fulfills. Its handler writes `results[1] = { url: "b", ... }` — slot `1`, not slot `0` — and `completed` becomes `1`. `1 !== 3`, so nothing resolves.
3. At ~50ms `"mid-c"` fulfills → `results[2] = {...}`, `completed = 2`. Still not done.
4. At ~120ms `"slow-a"` fulfills → `results[0] = {...}`, `completed = 3 === urls.length`, so `resolve(results)`. The caller sees `[slow-a, b, mid-c]` — input order — after `max` latency. A `push`-based version would have returned `[b, mid-c, slow-a]`.

### Complexity

Time: `O(max(tᵢ))` — one concurrent batch bounded by the slowest request. Space: `O(n)` for the `results` array plus `O(n)` pending promises; no sorting pass is needed because placement is `O(1)` per settlement.

### Edge Cases

- **Empty input:** resolves to `[]` without starting anything (the early return matters: otherwise `completed === urls.length` is `0 === 0` and the promise never resolves).
- **All settle at once:** every handler writes a distinct slot, so simultaneous writes never collide.
- **Duplicate URLs:** `["a", "a"]` starts two identical requests; slots `0` and `1` each get their own payload.
- **Synchronous throw from `fetchUrl`:** wrapped in `Promise.resolve().then(...)` so it becomes a rejection routed to `reject`, not an exception thrown out of `forEach`.
- **Rejection after partial completion:** `reject` settles the outer promise; late fulfillments still write their slots harmlessly.
- **`urls` mutated mid-flight:** handlers close over the original `index` and `url` value, so pushes to `urls` during the run do not shift assignments.

### Interview Follow-ups

- **Bound the fan-out:** this starts all `n` requests; with 100 URLs, run it through the five-at-a-time pool from the previous problem.
- **Stream in completion order instead:** use `push` plus resolve-per-settlement, or an async generator that yields each value as it arrives.
- **Tolerate failures:** switch the handlers to record `{ status, value/reason }` per slot — that is `Promise.allSettled`, covered earlier.
- **Timeout the slowest:** race each request against an abort-aware delay so one hung URL becomes a rejection instead of holding the batch open.
- **Cancel the stragglers:** on first rejection, abort the shared signal so the remaining requests stop rather than running to completion unseen.

### Common Mistakes

- `results.push(value)` inside `.then` — correct values, arrival order, wrong contract.
- `for (var i = 0; ...)` with `.then(() => results[i] = ...)` — every callback shares the final `i` and writes past the end.
- `await`ing each fetch in a loop, turning `max(tᵢ)` concurrency into `Σtᵢ` serial time.
- Forgetting the empty-input guard, leaving a promise that never settles.
- Assuming `Promise.all` returns completion order and "fixing" it with a sort.

### Takeaway

Concurrent start with ordered collection means preallocate one slot per input, write `results[index]` from each settlement handler, and count completions to know when every slot is filled. Order is a property of the slot, never of arrival time.

## Stop Processing a Batch When One Request Fails (Fail-Fast)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `runFailFast(taskFns, { concurrency = 4, signal } = {})`:

- `taskFns` is an array of functions returning promises, each called as `task(ctx)` with `ctx = { index, signal }`.
- Run them with at most `concurrency` in flight at any time.
- **As soon as one rejects, stop launching new tasks** and reject the returned promise with that error.
- On success, resolve to an array of results **in input order**, regardless of completion order.
- Already-started tasks are **not cancelled** — promises are not cancellable. A supplied `signal` is forwarded so each task *can* observe cancellation, but cancelling in-flight work is the caller's job, not the runner's.
- The runner must never leak an unhandled rejection.

### Examples

```text
runFailFast([ok(1), ok(2), ok(3)], { concurrency: 2 })   // => [1, 2, 3]

// concurrency 1: strictly sequential, so nothing after the failure runs
runFailFast([ok(1), boom("x"), spy(3)], { concurrency: 1 })
// => rejects with "x"; spy was NEVER called

// concurrency 4: all four are claimed before the failure lands
runFailFast([ok(1), ok(2), boom("x"), ok(4)], { concurrency: 4 })
// => rejects with "x"; ok(4) already started and still runs to completion

runFailFast([])                                          // => []
runFailFast([ok(1)], { concurrency: 100 })               // => [1]  (capped to length)
```

### Approach

The whole problem is *who owns the rejection*. Three implementations people reach for, and
why two of them are wrong:

1. **`Promise.all(tasks.map(fn))`.** Starts every task immediately, so there is no concurrency
   limit and no fail-fast — a "stop" is impossible because all work has already been launched.
   It does reject with the first rejection, but that is luck, not control.
2. **A worker pool where each worker rejects.** If a worker's promise rejects and you `await
   Promise.all(workers)`, that surface rejects early while the *other* workers keep pulling
   indices off the queue. You stop nothing, and your returned promise settles before the pool
   is actually idle.
3. **A worker pool with a shared `failed` flag (correct).** Each worker claims the next index,
   awaits, and on failure sets a shared flag, records the first error, and **returns normally**.
   The flag is checked at the top of the claim loop, so no worker claims new work after a
   failure. `Promise.all(workers)` then resolves only when the pool is genuinely drained, and
   *we* throw the error we chose.

Two invariants make it correct:

- **Claiming is atomic.** `const index = next++` has no `await` between read and write, so two
  workers can never claim the same index. Results are written as `results[index] = value`
  rather than pushed, which is what preserves **input order** when tasks finish out of order.
- **Swallowed rejections.** The `catch` returns instead of rethrowing. Every worker promise
  therefore fulfils, so `Promise.all` cannot reject behind our back, and a task that rejects
  *after* the first failure can never become an unhandled rejection or overwrite `firstError`
  (`firstError ??= error` keeps the first write).

`ctx = { index, signal }` matters for a second reason: fail-fast without a signal only stops
*launching*, it cannot stop work already in flight. Forwarding the signal is what turns
"stop the batch" into "cancel the batch" in real code.

### Implementation

```javascript
async function runFailFast(taskFns, { concurrency = 4, signal } = {}) {
  if (!Array.isArray(taskFns)) throw new TypeError("taskFns must be an array");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }
  signal?.throwIfAborted(); // already aborted: reject before starting anything

  const results = new Array(taskFns.length);
  let next = 0;
  let failed = false;
  let firstError;

  async function worker() {
    // `failed` is checked before EVERY claim: that check is the fail-fast contract.
    while (!failed && next < taskFns.length) {
      const index = next++; // claim is atomic: no await between read and write
      try {
        results[index] = await taskFns[index]({ index, signal });
      } catch (error) {
        failed = true;        // other workers will see this on their next claim
        firstError ??= error; // keep the FIRST failure; later ones are ignored
        return;               // return, do not rethrow: only one rejection is reported
      }
    }
  }

  const workerCount = Math.min(concurrency, taskFns.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (failed) throw firstError; // the pool is idle now, so nothing is still running
  return results;
}
```

Note that `await Promise.all(...)` attaches a handler to every worker promise the moment it is
created. That is why no in-flight rejection escapes as unhandled.

### Walkthrough

Take `taskFns = [t0, t1, t2, t3]` with timings: `t0` resolves at 30 ms, `t1` rejects with `"x"`
at 10 ms, `t2` resolves at 5 ms, `t3` resolves at 1 ms, and `concurrency = 2`.

1. Two workers start. Worker A claims `0`, worker B claims `1`. `next` is `2`.
2. At 10 ms, `t1` rejects. Worker B sets `failed = true`, `firstError = "x"`, and returns. B is
   **not** rethrown — its promise fulfils.
3. Worker A is still awaiting `t0`. It cannot see `failed` until its own `await` settles, so
   `t0` completes at 30 ms and `results[0]` is written.
4. Worker A loops back to the claim check. `failed` is `true`, so the loop exits **before**
   claiming `2` or `3`. `t2` and `t3` are never called.
5. `Promise.all([A, B])` resolves at ~30 ms. `failed` is true, so the function throws `"x"`.

Now set `concurrency = 4`: A, B, C, D claim `0,1,2,3` before any rejection happens, so `t2` and
`t3` do run. The batch still rejects with `"x"`, but the difference between "not launched" and
"launched but ignored" is exactly the point interviewers probe.

With `concurrency = 1`, there is a single worker; the failure at step 2 exits the loop with
`next === 2`, so `t2`/`t3` never run — the deterministic, easy-to-reason-about case.

### Complexity

Time: `O(n)` task invocations in total (wall-clock is bounded by the slowest in-flight batch).
Space: `O(n)` for `results` plus `O(c)` for the `c` concurrent worker promises and their stacks.

### Edge Cases

- **Empty array** → `workerCount` is `0`, `Promise.all([])` resolves, returns `[]`.
- **`concurrency > taskFns.length`** → capped, so workers do not spin on an exhausted queue.
- **Synchronous throw** inside a task counts as a failure: the call sits inside the `try`, so a
  plain `throw` is caught by the same `catch` as a rejected promise.
- **Non-function entries** (`null`, a value) throw `TypeError` when invoked and are treated as a
  task failure — validate up front if you want developer errors to escape instead.
- **First error wins, not lowest index.** `firstError ??= error` keeps whichever rejection lands
  first in time. With `concurrency: 1` those coincide; with higher concurrency they may not.
- **Partial results are lost** on the failure path, because we throw instead of returning. Attach
  them (`error.results = results`) if the caller needs to know what succeeded.
- **Aborting `signal` does not reject by itself.** It only becomes a rejection if a task checks
  it. Chain an internal controller (see follow-ups) to make abort authoritative.
- **Runtimes without `throwIfAborted`** need `if (signal?.aborted) throw signal.reason;`.

### Interview Follow-ups

- **Return partial results with the error:** set `error.partialResults = results.slice()` before
  throwing — useful for resumable batch jobs.
- **Cancel in-flight work:** create an internal `AbortController`, merge it with the caller's
  signal via `AbortSignal.any([signal, internal.signal])`, and call `internal.abort()` in the
  `catch`. Now "fail-fast" also stops the network.
- **Retry just the failed index:** wrap `taskFns[index]` in a retry helper; the pool shape does
  not change, only the per-task call.
- **`Promise.all` vs this:** `Promise.all` gives you "reject on first failure" but starts
  everything and cannot stop; explain that the difference is *launch control*.
- **State-free fairness:** the shared `next` counter is a work-stealing queue; a real system
  would swap it for a channel or `Atomics`-based queue.

### Common Mistakes

- Using `Promise.all` for "fail-fast" and claiming it stops other work — it only stops *waiting*.
- Letting a worker reject so `Promise.all` short-circuits while other workers still run, so the
  returned promise settles before the pool is idle.
- Pushing results (`results.push`) instead of indexing, so order follows completion, not input.
- Forgetting the `failed` check before the claim, so one more task launches after the failure.
- Rethrowing in the `catch`, which produces a second rejection and can surface as unhandled.
- Assuming the rejection comes from the lowest-index task when several run concurrently.

### Takeaway

Fail-fast is not `Promise.all` — it is a worker pool with one shared flag that is checked before
every claim. Swallow worker rejections so the pool drains cleanly, then throw the single error
you deliberately kept. Without a signal you stop *launching*; only a signal lets you stop
*work already in flight*.

## Continue Processing Despite Individual Failures (Best-Effort Batch)

`Difficulty: Easy` `Probability: High`

### Problem

Implement `runSettled(taskFns, { concurrency = 4, onError } = {})`:

- `taskFns` is an array of functions returning promises, each called as `task({ index })`.
- Run them with at most `concurrency` in flight.
- **Never reject because a task failed.** Resolve to an array aligned with the input, one entry
  per index: `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`.
- Preserve **input order**, not completion order.
- `onError(reason, index)` is invoked for each failure, after the entry is recorded.
- Only invalid arguments (`taskFns` not an array, bad `concurrency`) reject.

### Examples

```text
const ok   = (v) => () => Promise.resolve(v);
const fail = (r) => () => Promise.reject(r);

await runSettled([ok("a"), fail(new Error("x")), ok("c")], { concurrency: 2 })
// => [
//   { status: "fulfilled", value: "a" },
//   { status: "rejected",  reason: Error("x") },
//   { status: "fulfilled", value: "c" },
// ]

await runSettled([fail("a"), fail("b")])
// => [{ status: "rejected", reason: "a" }, { status: "rejected", reason: "b" }]
//    (still resolves; both failures recorded)

await runSettled([])                 // => []
await runSettled([ok(1)], { concurrency: Infinity })  // => [{ status: "fulfilled", value: 1 }]
await runSettled("nope")             // => rejects with TypeError
```

Notice the returned promise **fulfils** in every task-failure case. The only rejections are for
bad arguments, so callers can `await` without a `try/catch` for expected failures.

### Approach

This is the same worker pool as fail-fast with the `failed` flag deleted. That is the entire
distinction: fail-fast is best-effort plus a stop condition.

- **Indexed writes, not pushes.** `results[index] = entry` is what makes the output order match
  the input order even when the last task finishes first. A `push` inside `.then` would order by
  completion time.
- **One `catch` per task, inside the worker.** Each worker fulfils, so `Promise.all(workers)` cannot
  reject and no task rejection is ever unhandled. This is the same trick as fail-fast, minus the
  flag.
- **`reason` is passed through untouched.** Failures are not always `Error`s: promises can reject
  with strings, `undefined`, or DOMExceptions. Do not wrap or coerce — the caller may be matching
  on `AbortError` by name.
- **Dense array.** Every index from `0` to `length - 1` is assigned exactly once by exactly one
  worker's claim, so there are no holes to guard against.

Why not just `Promise.allSettled(taskFns.map((fn) => fn()))`? Because it launches every task
immediately: no concurrency ceiling, no backpressure, and a thousand-item list opens a thousand
sockets. `allSettled` also takes an iterable, not a queue, so you cannot build a pool out of it
without chunking. Use `allSettled` for a handful of independent promises; use a pool when the
list is large or the limiter is required.

The `onError` hook is deliberately called *after* the entry is recorded, so a hook that throws
cannot leave the results array half-built. If the hook itself throws, that propagates — document
it, or wrap the call in a `try/catch` if the hook is user-supplied.

### Implementation

```javascript
async function runSettled(taskFns, { concurrency = 4, onError } = {}) {
  if (!Array.isArray(taskFns)) throw new TypeError("taskFns must be an array");
  if (concurrency !== Infinity && (!Number.isInteger(concurrency) || concurrency < 1)) {
    throw new RangeError("concurrency must be a positive integer or Infinity");
  }
  if (onError !== undefined && typeof onError !== "function") {
    throw new TypeError("onError must be a function");
  }

  const results = new Array(taskFns.length);
  let next = 0;

  async function worker() {
    while (next < taskFns.length) {
      const index = next++; // atomic claim; indices are handed out exactly once
      try {
        const value = await taskFns[index]({ index });
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason }; // pass the reason through as-is
        onError?.(reason, index);                        // observe, then keep going
      }
    }
  }

  // Infinity means "no ceiling": one worker per task, everything at once.
  const workerCount = Math.min(concurrency, taskFns.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results; // dense, input-ordered, one entry per index
}
```

### Walkthrough

`runSettled([A, B, C, D], { concurrency: 2 })` where `A` resolves at 30 ms, `B` rejects `"x"` at
10 ms, `C` resolves at 5 ms, and `D` rejects `"y"` at 1 ms:

1. Workers A and B claim `0` and `1`; `next` is `2`.
2. At 1 ms, D has not started — it is still behind the queue. Only A and B are in flight.
3. At 10 ms, B rejects. Its worker writes `results[1] = { status: "rejected", reason: "x" }`,
   calls `onError("x", 1)`, and loops. `next` is `2`, so it claims `2` and starts `C`.
4. At 5 ms, C resolves and the worker writes `results[2] = { status: "fulfilled", value: ... }`;
   it claims `3` and starts `D`.
5. At 1 ms... (in real time D now runs) D rejects `"y"` and writes `results[3]`, calls
   `onError("y", 3)`. Both workers exit; `Promise.all` resolves.
6. The caller receives a **4-element, input-ordered** array even though completion order was
   `B, C, A, D`. No rejection ever reached the caller.

The key contrast with the previous problem: `B`'s failure consumed no shared flag, so `C` and
`D` were still launched. That is the definition of best-effort.

### Complexity

Time: `O(n)` task invocations; wall-clock is roughly `ceil(n / c)` sequential waves. Space:
`O(n)` for the results array plus `O(c)` for concurrent worker state.

### Edge Cases

- **All tasks fail** → still resolves, with every entry `"rejected"`. Callers must inspect entries.
- **Empty array** → `workerCount = 0`, `Promise.all([])` resolves, `[]` is returned.
- **Synchronous throw** → caught by the same `catch`, because the invocation is inside the `try`.
- **Non-`Error` rejection** → stored verbatim; never assume `reason.message` exists.
- **`concurrency: Infinity`** → `Math.min(Infinity, n) === n`, so every task starts at once.
  Validate it explicitly, since `Number.isInteger(Infinity)` is `false`.
- **`onError` throws** → propagates out of the worker, rejecting the returned promise. That is a
  hook bug, not a task failure; keep hooks defensive if the caller supplies them.
- **Duplicate task functions in the array** are treated as separate entries — the pool keys on
  index, not on identity.
- **Very large `n`** → the pool keeps memory bounded to `c` in-flight promises, but `results`
  itself is `O(n)`.

### Interview Follow-ups

- **Partial retry:** collect the failed indices, then call `runSettled` again with just those
  tasks mapped back to their original positions, and merge by index.
- **Per-task timeout:** wrap each call as `task({ index, signal: AbortSignal.timeout(ms) })`; a
  timeout becomes just another `"rejected"` entry, so the batch keeps going.
- **Aggregate summary:** return `{ results, failures }` where `failures` is
  `results.flatMap((r, i) => (r.status === "rejected" ? [{ index: i, reason: r.reason }] : []))`.
- **`Promise.allSettled` comparison:** same shape, no concurrency limit, no backpressure; explain
  when each is appropriate and that `allSettled` predates `Array.prototype.flatMap` ergonomics.
- **Turn the pool into a reusable `TaskPool` class** that holds `concurrency` and exposes
  `add(task)` — the shape used by `p-limit` and by `DataLoader` under the hood.

### Common Mistakes

- Using `Promise.all` and being surprised that one failure discards every other result.
- Pushing fulfilled values into an array inside `.then`, losing input order.
- Assuming `Promise.allSettled` limits concurrency — it starts everything immediately.
- Reading `reason.message` when `reason` may be a string, `null`, or a DOMException.
- Wrapping failures in a new `Error`, which destroys `name`/`code`/`AbortError` checks upstream.
- Forgetting that a rejected entry still counts as a *result*: the returned promise resolves.

### Takeaway

Best-effort batching is the fail-fast pool with the stop flag removed and a per-index result
recorded in the `catch`. Index your writes to preserve input order, pass `reason` through
untouched, and let the returned promise resolve — the failures live in the data, not in the
control flow.

## Implement a Cancellable Async Operation with `AbortController`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement cancellation for promise-based work with the `AbortController` / `AbortSignal` pair:

- `delay(ms, { signal })` — resolve after `ms`, or reject as soon as `signal` aborts.
- `fetchJSON(url, { signal, timeoutMs, ...init })` — `fetch` that honours an external signal and
  an optional timeout, checks the response status, and parses JSON.

The contract, which is where all the marks are:

- **Reject with `signal.reason`**, not a fresh error. `AbortController.abort(reason)` and
  `AbortSignal.timeout(ms)` produce `DOMException`s whose `name` (`"AbortError"`,
  `"TimeoutError"`) callers match on. Replacing the reason destroys that.
- **Pre-aborted signals reject before any work starts** — `signal.throwIfAborted()` is the idiom,
  and it must run before `setTimeout` or `fetch` is called.
- **Remove the `abort` listener on every settle path.** A listener left behind keeps the closure
  (and the pending timer) alive for the lifetime of the controller.
- **Pass the signal into `fetch`** so the request is actually torn down, not merely ignored.
- **Combining signals:** merge the caller's signal with a timeout signal via `AbortSignal.any`.

### Examples

```text
const ac = new AbortController();
const p = delay(1000, { signal: ac.signal });
ac.abort();
await p                          // => rejects: DOMException { name: "AbortError" }

await delay(10)                  // => resolves after ~10 ms (no signal needed)

const ac2 = new AbortController();
ac2.abort(new Error("user navigated"));
await delay(1000, { signal: ac2.signal })  // => rejects with that exact Error instance

// timeout wins over a signal that never aborts
await fetchJSON("/slow", { timeoutMs: 50 })
// => rejects: DOMException { name: "TimeoutError" }

// caller aborts first
const ac3 = new AbortController();
const q = fetchJSON("/slow", { signal: ac3.signal });
ac3.abort();
await q                          // => rejects: DOMException { name: "AbortError" }
```

```text
// after ac.abort(), the pending setTimeout is cleared:
delay(10_000, { signal: ac.signal });
ac.abort();
// the Node/browser process exits immediately — no 10 s timer holding the event loop
```

### Approach

`AbortController` is an event source, not a cancellation mechanism the runtime applies for you.
The pattern is always the same three moves, and every bug in this question is a missing one:

1. **Pre-check.** If `signal.aborted` is already true, reject immediately with `signal.reason`
   and do not schedule or call anything. `throwIfAborted()` also throws the *original* reason if
   one was supplied, which an `if (signal.aborted) throw new Error()` would lose.
2. **Subscribe with `{ once: true }`, and clean up.** `abort` fires at most once per controller,
   so `{ once: true }` prevents duplicate invocations; then the success path must
   `removeEventListener` so the closure is not retained after the operation settles.
3. **Delegate to the platform.** For `fetch`, pass `{ signal }` through. The browser aborts the
   underlying request, and the promise rejects with the signal's reason (modern spec; older
   runtimes reject with a generic `AbortError` — mention that if asked). Cancelling also frees
   the socket and stops body parsing, which is the entire reason to prefer it over an
   "ignore the result" guard.

For **timeouts**, `AbortSignal.timeout(ms)` is the built-in, and it rejects with a `TimeoutError`
`DOMException` distinctly from `AbortError` — useful for retry logic. To honour both a caller's
signal and the timeout, merge them: `AbortSignal.any([signal, AbortSignal.timeout(ms)])`. The
merged signal aborts when either input does, and its reason is that input's reason.

Two honest limitations to state:

- **No rollback.** Aborting rejects the promise; it does not undo a `POST` the server already
  processed. Any state you mutated before the `await` stays mutated.
- **The listener is not enough for user code.** `delay` can clear its timer, but arbitrary async
  work only stops if it *checks* the signal. That is why the signal has to be threaded through
  the call, not just held by the caller.
- **`AbortSignal.any` availability:** supported in modern browsers and Node 20+; the fallback is
  to add an `abort` listener to the caller's signal that aborts your own controller.

### Implementation

```javascript
// Preserve the caller's reason; fall back only if none was supplied.
function abortReason(signal) {
  return signal?.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function delay(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted(); // pre-aborted: nothing is scheduled, no timer leak

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort); // clean up on the success path
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);          // do not leave the timer running after abort
      reject(abortReason(signal));  // reject with the signal's own reason
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchJSON(url, { signal, timeoutMs = 0, ...init } = {}) {
  // Merge the caller's signal with a timeout signal; either one can abort the request.
  const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
  const merged = timeout ? AbortSignal.any([signal, timeout].filter(Boolean)) : signal;

  merged?.throwIfAborted(); // fail fast, before the network is touched

  let response;
  try {
    response = await fetch(url, { ...init, signal: merged }); // signal MUST reach fetch
  } catch (error) {
    // Normalise the reason so callers can match on name === "TimeoutError".
    throw merged?.aborted ? abortReason(merged) : error;
  }

  if (!response.ok) {
    // Cancellation on error keeps the connection from lingering on an unconsumed body.
    throw new Error(`HTTP ${response.status} for ${url}`, { cause: response });
  }

  try {
    return await response.json(); // still cancellable: abort rejects body parsing too
  } catch (error) {
    throw merged?.aborted ? abortReason(merged) : error;
  }
}
```

### Walkthrough

`const ac = new AbortController(); const p = delay(1000, { signal: ac.signal }); ac.abort();`

1. `delay` builds a promise executor that runs synchronously. `signal.throwIfAborted()` is a
   no-op because `ac.signal.aborted` is still `false`.
2. `setTimeout` is scheduled and returns a timer id; the `abort` listener is registered with
   `{ once: true }`.
3. `ac.abort()` sets `ac.signal.aborted = true`, stores `signal.reason` as a fresh
   `DOMException("... aborted", "AbortError")`, then dispatches the `abort` event synchronously.
4. `onAbort` runs: `clearTimeout` cancels the pending timer (so the process can exit), and the
   promise rejects with `signal.reason`. Because the listener was `{ once: true }`, it is gone.
5. `await p` throws the `DOMException`; `error.name === "AbortError"`.

Now the timeout path: `fetchJSON("/slow", { timeoutMs: 50 })` with no caller signal.

1. `AbortSignal.timeout(50)` creates a signal that fires at 50 ms with a `TimeoutError`.
2. `timeout` is truthy and `signal` is `undefined`, so `AbortSignal.any([timeout])` yields a
   merged signal that aborts exactly when the timeout does.
3. `fetch(url, { signal: merged })` starts the request; at 50 ms the browser aborts it and the
   promise rejects.
4. The `catch` sees `merged.aborted === true` and rethrows `abortReason(merged)` — which is the
   `TimeoutError`, not a generic `Error`. Callers can therefore distinguish retryable timeouts
   from user-initiated cancellations.

### Complexity

Time: `O(1)` plus the platform's own work; abort propagates in constant time. Space: `O(1)` —
two closures (timer callback, abort handler) that are both released when the operation settles.

### Edge Cases

- **Pre-aborted signal** → `throwIfAborted()` rejects synchronously inside the executor; no timer
  or request is created.
- **Abort after settle** → inert: the promise is already settled, so a later `abort()` cannot
  change the outcome; only ordering before the resolution matters.
- **Double abort** → `abort()` is idempotent; `{ once: true }` and the settled promise make the
  second call inert.
- **`abort(reason)`** → any value is allowed (an `Error`, a string, `undefined`); forward it
  verbatim. `abort()` with no argument is what produces the default `AbortError`.
- **No consumer for the reason** → `signal.reason` defaults to a `DOMException` only for real
  signals; a plain `{ aborted: true }` stub will not have one, hence the `??` fallback.
- **`fetch` already completed** → aborting after the headers arrive rejects `response.json()`;
  aborting after the body is fully read does nothing.
- **Response body left unread on `!response.ok`** → fine here because `fetch` closes it, but in
  general call `response.body?.cancel()` before throwing a non-network error.
- **`AbortSignal.timeout` vs `AbortSignal.abort(reason)`** → use the former for deadlines and the
  latter for pre-aborted constants in tests.
- **Removing the listener is not optional** in long-lived controllers (a page-wide controller
  reused across many requests) — otherwise memory grows with every call.

### Interview Follow-ups

- **Cancellable retry:** loop with the same signal, but give each attempt its own
  `AbortSignal.timeout(ms)` merged with the caller's so one slow attempt cannot eat the budget.
- **`AbortSignal.any` fallback:** add an `abort` listener to the source signal that calls
  `internal.abort(event.target.reason)`, and remember to remove it when you are done.
- **Cancel a whole tree of work:** pass the same signal to every child request; one `abort()`
  takes them all down. This is how request-scoped cancellation works on the server.
- **Distinguish cancellation from failure:** `error.name === "AbortError"` should never be
  reported to the user or retried blindly; `TimeoutError` usually should be retried.
- **`Promise.race` with a timeout** as the old idiom: it rejects but leaves the original request
  running, leaking a connection and a promise — explain why `AbortController` replaced it.
- **React cleanup:** return a function from `useEffect` that calls `controller.abort()` so
  unmount cancels in-flight work; the same shape works for route navigation.

### Common Mistakes

- Rejecting with a fresh `new Error("aborted")` instead of `signal.reason`, breaking
  `AbortError`/`TimeoutError` checks and the caller's custom reason.
- Creating the timer before the `throwIfAborted()` check, leaving a timer to fire later.
- Forgetting `removeEventListener`, so every cancelled call pins a closure until the controller is
  garbage-collected.
- Not passing `signal` into `fetch` and instead only guarding the result — the request still runs,
  and its body still downloads.
- Registering with `{ once: true }` but never cleaning up on the *success* path.
- Treating `Promise.race([work, timeout])` as cancellation when it only stops waiting.
- Assuming abort undoes side effects the server already applied.

### Takeaway

Cancellation is not a property of a promise; it is a signal you must check, thread through, and
clean up after. The three moves are: `throwIfAborted()` first, `{ once: true }` plus
`removeEventListener`, and hand the signal to the platform API so it can tear the work down.

## Prevent Stale Search Results From Overwriting Newer Ones

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `createLatestSearch(fetcher)` for a type-ahead/search box. `fetcher(query, { signal })`
resolves to results. The returned `search(query)` must guarantee that **a response can only be
used if it belongs to the most recent call** — later calls win, always, no matter how the
network interleaves.

- Each `search(query)` returns a promise resolving to a discriminated result:
  `{ status: "ok" | "stale" | "error", query, results?, reason? }`. It never rejects for ordinary
  failures or supersession — the caller renders state, it does not catch.
- Any in-flight call is superseded and cancelled when a newer one starts.
- `search.dispose()` invalidates everything in flight (navigation/unmount), so nothing can update
  state after teardown.

### Examples

```text
const search = createLatestSearch(fetchResults);

const a = search("re");    // starts request #1
const b = search("react"); // supersedes #1, starts request #2

await b   // => { status: "ok",    query: "react", results: [...] }
await a   // => { status: "stale", query: "re" }        // even if #1 resolved AFTER #2

// Timeline where the stale response is slower:
//   t=0ms   search("re")     -> #1
//   t=5ms   search("react")  -> #2 (aborts #1)
//   t=20ms  #1 would have resolved: discarded, a resolves { status: "stale" }
//   t=30ms  #2 resolves:          b resolves { status: "ok" }

// Real failures are not confused with supersession:
await search("boom")     // => { status: "error", query: "boom", reason: Error("500") }

// Teardown:
const pending = search("late");
search.dispose();
await pending             // => { status: "stale", query: "late" }
```

### Approach

There are two complementary guards, and a senior answer names both because they solve different
problems:

1. **A monotonic request id — the correctness guard.** Increment a counter per call and capture it
   in a local. After *every* `await`, compare the captured id with the current counter. If they
   differ, a newer call has started, so discard this response. This guard is sufficient on its
   own: it is pure bookkeeping, works even when the transport cannot be cancelled, and it also
   covers the case where the old request **already completed** before the new one began.
2. **An `AbortController` per request — the efficiency guard.** Abort the previous controller
   when a new call starts. This does not make the previous response "safe"; it makes it *not get
   requested*. It frees the socket, stops body parsing, and avoids competing for one of the
   browser's ~6 connections per origin during fast typing.

Neither alone is complete. Abort-only fails when the response has already been delivered (a
promise that already resolved cannot be un-resolved), and it silently depends on `fetch`
honouring the signal. Id-only works but wastes bandwidth and lets the server do the work. Use
both, and let the id be the thing that decides.

The critical implementation detail: **the id must be captured in a `const` before the `await` and
compared after it**, reading only that captured value. Comparing a re-read of the mutable counter
at the top of the function is a no-op — by then it has already been incremented. In React, this is
the `requestIdRef.current !== requestId` pattern; the ref survives re-renders, while a local would
be re-created.

`dispose()` needs both halves too: bump the counter (so any response still in the air is stale
by definition) *and* abort the controller (so nothing is left consuming the network). Bumping the
counter is the one that guarantees no state update after unmount; abort is the cleanup.

Returning a discriminated union instead of throwing matters for the caller's ergonomics: in a
search box, "superseded" is a normal event, and a rejection would force a `try/catch` at every
call site and risk surfacing a spurious error toast. Failures are data.

### Implementation

```javascript
function createLatestSearch(fetcher) {
  if (typeof fetcher !== "function") throw new TypeError("fetcher must be a function");

  let sequence = 0;          // monotonically increasing; never reused or reset
  let controller = null;     // controller of the most recent in-flight request

  async function search(query, options = {}) {
    const requestId = ++sequence;        // capture BEFORE any await (this is the guard)
    controller?.abort();                 // supersede: stop the previous request
    controller = new AbortController();
    const { signal } = controller;

    try {
      const results = await fetcher(query, { ...options, signal });
      // A newer search started while we were waiting: this answer is obsolete.
      if (requestId !== sequence) return { status: "stale", query };
      return { status: "ok", query, results };
    } catch (reason) {
      // Both "superseded" and "disposed" land here because the abort surfaced as a rejection.
      if (requestId !== sequence || signal.aborted) return { status: "stale", query, reason };
      return { status: "error", query, reason };
    }
  }

  // Invalidate everything in flight; call from a cleanup function (unmount, navigation).
  search.dispose = () => {
    sequence += 1;          // any in-flight response is now stale by definition
    controller?.abort();    // and free the network resources too
    controller = null;
  };

  return search;
}
```

Note the two conditions in the `catch`. Checking `signal.aborted` catches the case where the
fetcher aborted for a reason other than supersession (a timeout, an unmount race), and the id
check catches the case where the request resolved *before* the abort — the abort then has no
effect on an already-settled promise, so the id is the only thing that saves you.

### Walkthrough

Trace the classic interleaving where the **older** request is the **slower** one:

1. `search("re")` → `requestId = 1`, `sequence = 1`, controller C1, `fetch("re", C1.signal)`.
2. 5 ms later `search("react")` → `requestId = 2`, `sequence = 2`; `controller?.abort()` aborts
   C1, so request #1 is torn down; C2 is created and request #2 starts.
3. Request #1's `fetch` rejects with C1's `AbortError`. Its `catch` runs with
   `requestId (1) !== sequence (2)` → resolves `{ status: "stale", query: "re" }`. The caller's
   `await a` fulfils with a stale marker, so a naive `.then((r) => setResults(r.results))` would
   still be dangerous — the caller must check `status`.
4. At 30 ms, request #2 resolves. Its `requestId (2) === sequence (2)`, so it returns
   `{ status: "ok", query: "react", results }`. Only this one may be rendered.

Now the nastier variant, where the abort arrives **too late** — response #1 already resolved:

1. `search("re")` → request #1 resolves at 1 ms and its continuation is queued as a microtask
   that returns `{ status: "ok" }` because `sequence` is still `1`.
2. At 5 ms, `search("react")` increments `sequence` to `2`. It cannot retroactively change the
   already-delivered result of #1.
3. This is why "abort the previous request" is *not* the guarantee. The guarantee is that the
   caller renders only the result whose `status === "ok"`, and the search function marks #1 as
   `stale` **at the moment #2 starts** — so the fix for this variant is to also invalidate on the
   caller's side by tracking "latest query wins". The robust pattern inside a component is to
   store results keyed by id: `search()` results carry the id, and the setter ignores anything
   whose id is not the current one. The **id**, not abort, is the source of truth.

`dispose()`: `sequence` becomes `3` (nothing can match it again), C2 is aborted, `controller` is
nulled. Any `pending` promise from step 4 now fails its id check and resolves `stale`.

### Complexity

Time: `O(1)` bookkeeping per call plus the fetcher's own cost. Space: `O(1)` — one integer, one
controller, and one closure. The client-side guarantee is constant-time regardless of how many
requests are in flight, because only the newest can pass the id check.

### Edge Cases

- **Identical consecutive queries** (`"re"`, `"re"`) still produce two requests and the first is
  marked stale. Deduplicate at the call site (see the batching problem) if that matters.
- **Out-of-order completion both ways** — older slow, older fast — is handled by the same check;
  the id does not depend on timing.
- **Abort errors must not surface as errors.** Because `signal.aborted` is checked in the `catch`
  before the generic error branch, an `AbortError` becomes `stale`, never `error`.
- **`fetcher` ignoring the signal** → no real cancellation, but correctness is unaffected; the
  response is still discarded by the id check.
- **`dispose()` during an await** → `sequence` is bumped, so the pending call resolves `stale`;
  also safe to call twice (abort is idempotent).
- **Non-`Error` rejection reasons** are forwarded untouched, so `AbortError` names remain visible
  to callers who want to distinguish them.
- **`sequence` overflow** is not a practical concern (`Number.MAX_SAFE_INTEGER` calls), but a
  monotonically increasing counter with no reset is the intent — do not reset it in `dispose`.
- **Caller must key off `status`.** Returning results on the promise is not enough in a UI if a
  stale result is still assigned to state.
- **Server work is unaffected.** The request may already be in flight; abort only stops the
  client from consuming the response.

### Interview Follow-ups

- **Debounce + latest-wins:** debouncing reduces the number of requests, the id guard makes the
  remaining ones safe. They compose but are not substitutes — say why both are needed.
- **Cache results per query:** wrap `fetcher` in a `Map` keyed by query; still bump `sequence`,
  because a cached result for an old query must not win.
- **`useDeferredValue` / Suspense in React 18** provide a similar "latest wins" UX declaratively;
  explain that the framework is doing the same id comparison for you.
- **Axios alternative:** `CancelToken` is the legacy API and is deprecated; `AbortController` is
  the shared standard across `fetch`, Axios, and Node's `http`.
- **Per-request controller vs one shared controller:** one controller per request is necessary to
  abort only the superseded call; a shared controller would abort them all, including the new one.

### Common Mistakes

- Comparing a **freshly read** counter after the `await` instead of the captured `requestId`.
- Using `AbortController` alone and assuming an already-resolved response can be cancelled.
- Treating `AbortError` as a user-visible failure, producing an error toast on every keystroke.
- Forgetting `dispose()` on unmount, so a late response triggers a state update on an unmounted
  component (or a navigation to a dead route).
- Resetting the counter, which lets an old response masquerade as current.
- Assuming the browser serialises requests — it does not; two requests complete in either order.
- Guarding only the success path and forgetting that a stale *rejection* can also clobber state.

### Takeaway

Cancellation is an optimisation; **identity is the correctness guarantee**. Give every call a
monotonic id, capture it before the `await`, compare after, and let only the newest id write.
Abort the superseded request to save the network, and bump the id in `dispose()` so nothing can
write after teardown.

## Implement Async Batching (Collect Calls in a Tick and Run Once)

`Difficulty: Hard` `Probability: High`

### Problem

Implement `createBatcher(batchFn, { delay = 0, maxSize = Infinity })` — the DataLoader shape.
It returns a `load(key)` function where:

- `load(key)` returns a promise for that key's value.
- Every `load` that happens inside the same window is collected into **one** `batchFn(keys)` call,
  where `keys` is the de-duplicated keys in first-requested order.
- `batchFn(keys)` must return (or resolve to) an array of values **aligned by index** with `keys`.
- Two `load` calls for the same key in the same window return **the identical promise** (single
  flight), and the key appears once in `keys`.
- `delay = 0` flushes on the next **microtask** (batches one synchronous tick); `delay > 0` flushes
  after that many milliseconds; `maxSize` flushes immediately once the pending count reaches it.
- If `batchFn` fails, every promise in that batch rejects with the same reason. An `Error` in the
  results array rejects **only** that key (per-key failure).

### Examples

```text
const load = createBatcher(async (keys) => {
  console.log("batch:", keys);
  return keys.map((k) => `user-${k}`);
});

const a = load(1);
const b = load(2);
const c = load(1);            // same key, same tick
a === c                       // => true   (identical promise: dedupe, not a second call)

await a                       // => "user-1"
await b                       // => "user-2"
// console shows ONE line: "batch: [1, 2]"
```

```text
const load = createBatcher(fetchUsers, { delay: 10, maxSize: 3 });

load(1); load(2); load(3);    // pending hits maxSize -> flush immediately (0 ms wait)
load(4); load(5);             // a NEW 10 ms window starts
// batch: [1, 2, 3]              <- synchronous
// batch: [4, 5]                 <- ~10 ms later
```

```text
// Whole-batch failure: every key rejects with the same reason.
const load = createBatcher(async () => { throw new Error("db down"); });
const settled = await Promise.allSettled([load(1), load(2)]);
settled.map((s) => s.status)     // => ["rejected", "rejected"]

// Per-key failure: an Error in the aligned result rejects only that key.
const load2 = createBatcher(async (keys) =>
  keys.map((k) => (k === 2 ? new Error("missing") : `ok-${k}`)));
await load2(1)                   // => "ok-1"
await load2(2)                   // => rejects: Error("missing")
```

### Approach

A batcher is three pieces of state and one scheduling decision.

- **A `Map` from key to a deferred** (`{ promise, resolve, reject }`). The `Map` gives
  **deduplication** for free with `SameValueZero` key semantics (`NaN` dedupes with `NaN`;
  `-0` and `+0` are one key; objects dedupe by reference) and it **preserves insertion order**,
  which is what makes "aligned by index" well defined: `keys = [...pending.keys()]` and the result
  at index `i` belongs to `keys[i]`.
- **A `load` function** that checks the map first. If the key is already pending, return
  `entry.promise` **itself** — not a `.then()` wrapper, not a new promise. Identity is part of the
  contract; callers compare promises and React keys off them.
- **A scheduler** that flushes once per window. Two modes: `queueMicrotask` for "same tick"
  (`delay = 0`) and `setTimeout` for a real time window. `maxSize` flushes synchronously so a
  burst never waits, which is what protects the downstream service from a huge `IN (...)` query.

Three details separate a working batcher from a broken one:

1. **Swap `pending` before calling `batchFn`.** Re-entrant calls (from `batchFn` itself, or from
   a `.then` that runs before the batch resolves) must go into the *next* batch. If you iterate
   the same `Map` reference and clear it afterwards, you either lose those calls or resolve them
   twice. `const batch = pending; pending = new Map();` in that order is the invariant.
2. **Attach the rejection handler when you attach the success handler.** `batchFn` may return a
   rejected promise; without `Promise.resolve(output).then(onOk, onErr)` every pending promise
   hangs forever and you also get an unhandled rejection.
3. **Validate alignment.** `values.length !== keys.length` is a contract violation; reject the
   whole batch with a `TypeError` rather than resolving every key to `undefined`. Silent
   misalignment is the bug that ships.

`delay = 0` uses a **microtask**, not `setTimeout(0)`, for a reason: a microtask drains at the
end of the current task, so it batches every synchronous `load` in one tick, while a `0 ms`
macrotask can interleave with other timers and I/O and yield a smaller batch. Say this if asked
"why not `setTimeout(fn, 0)`" — both work, microtasks are more predictable in the same tick.

The per-key `Error` convention comes from DataLoader: a value that `instanceof Error` means "this
key failed" without poisoning the rest of the batch. Whole-batch rejection is for infrastructure
failure (the query itself failed); per-key rejection is for domain failure (one row is missing).
Being explicit about which is which is the mark of a real answer.

### Implementation

```javascript
function createBatcher(batchFn, { delay = 0, maxSize = Infinity } = {}) {
  if (typeof batchFn !== "function") throw new TypeError("batchFn must be a function");
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new RangeError("maxSize must be a positive integer");
  }

  let pending = new Map(); // key -> { promise, resolve, reject }
  let scheduled = null;    // null | "microtask" | timer handle

  function schedule() {
    if (scheduled !== null) return; // one flush per window, not one per load
    if (delay > 0) {
      scheduled = setTimeout(flush, delay);
    } else {
      scheduled = "microtask";
      queueMicrotask(flush);
    }
  }

  function cancel() {
    if (scheduled === null) return;
    if (scheduled !== "microtask") clearTimeout(scheduled); // a microtask cannot be cancelled
    scheduled = null;
  }

  function flush() {
    cancel();
    if (pending.size === 0) return;

    const batch = pending;   // capture the batch...
    pending = new Map();     // ...then swap: re-entrant load() calls form the NEXT batch
    const keys = [...batch.keys()]; // Map order === first-request order
    const settleAll = (fn) => { for (const entry of batch.values()) fn(entry); };

    let output;
    try {
      output = batchFn(keys); // a sync throw is an infrastructure failure
    } catch (error) {
      settleAll((entry) => entry.reject(error));
      return;
    }

    Promise.resolve(output).then(
      (values) => {
        if (!Array.isArray(values) || values.length !== keys.length) {
          settleAll((entry) => entry.reject(
            new TypeError("batchFn must return an array aligned with its keys"),
          ));
          return;
        }
        keys.forEach((key, index) => {
          const entry = batch.get(key);
          const value = values[index];
          if (value instanceof Error) entry.reject(value); // per-key failure
          else entry.resolve(value);                       // pass-through; thenables adopt here
        });
      },
      (error) => settleAll((entry) => entry.reject(error)), // whole-batch failure
    );
  }

  function load(key) {
    const existing = pending.get(key);
    if (existing) return existing.promise; // dedupe: the IDENTICAL promise

    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    pending.set(key, { promise, resolve, reject });

    schedule();
    if (pending.size >= maxSize) flush(); // size cap wins over the time window
    return promise;
  }

  load.flush = flush; // force a flush (tests, or "flush before navigating away")
  return load;
}
```

### Walkthrough

`createBatcher(fetchUsers, { delay: 10, maxSize: 3 })`, then a synchronous burst.

1. `load(1)` → `pending` is empty, so a deferred is created and stored under `1`;
   `schedule()` sets `scheduled = setTimeout(flush, 10)` (a timer handle). Returns `p1`.
2. `load(2)` → new deferred; `schedule()` sees `scheduled !== null` and returns, so there is
   still exactly **one** timer. Returns `p2`.
3. `load(3)` → new deferred; `pending.size` becomes `3`, which is `>= maxSize`, so `flush()` runs
   **synchronously**.
4. `flush()` calls `cancel()` — `scheduled` is a timer handle, so `clearTimeout` removes the
   pending 10 ms timer and `scheduled` becomes `null`. The old window is gone.
5. `batch = pending` (three entries), `pending = new Map()`, `keys = [1, 2, 3]` in insertion
   order. `batchFn([1, 2, 3])` is awaited.
6. `load(4)` arrives (say from a `.then` on `p1`). `pending` is the *new* map, so it misses and a
   fresh deferred is created; `schedule()` starts a **new** 10 ms timer. `load(5)` adds to the
   same new batch (no second timer).
7. `batchFn` resolves `["u1", "u2", "u3"]`; `values.length === keys.length`, so `p1`, `p2`, `p3`
   resolve to `"u1"`, `"u2"`, `"u3"` respectively.
8. ~10 ms later the second timer fires and flushes `[4, 5]` in a second `batchFn` call.

Now the dedupe path: `load(1)` then `load(1)` again before step 3.

- The second call finds `pending.get(1)` and returns `existing.promise`, so `a === c` is `true`
  and `batchFn` receives `[1, 2, 3]`, not `[1, 2, 3, 1]`. The `Map` is the dedupe.

And the re-entrancy path: if `batchFn` itself calls `load(9)` (some caches do this when priming),
that call lands in the **new** `pending` because the swap already happened. Had we iterated
`pending` and then called `pending.clear()`, that `load(9)` would either be dropped or resolved by
the current batch — a classic bug.

### Complexity

Time: `O(n)` per batch for key collection and result distribution, plus one `batchFn(keys)` call
that is `O(1)` in the number of *calls* (the win). Space: `O(n)` for the pending map and `O(n)` for
the captured batch; nothing is retained after the flush settles.

### Edge Cases

- **Dedupe semantics are `Map`'s (`SameValueZero`)**: `load(NaN)` twice yields one promise;
  `-0` and `+0` collide; two structurally equal objects do **not** (different references);
  a numeric `1` and a string `"1"` are distinct keys — unlike a plain object, which would coerce.
- **`delay = 0` batches only what is requested synchronously.** An `await` between two `load`
  calls lets the microtask flush run in between, producing two batches. That is correct and worth
  stating explicitly.
- **`maxSize = 1`** flushes after every single call — a degenerate "no batching" mode, useful as a
  test double.
- **Misaligned results** (`values.length !== keys.length`) reject the whole batch with a
  `TypeError`; silently resolving is the dangerous alternative.
- **`batchFn` resolving non-array** (a `Map`, a single object) → same `TypeError`. Decide the
  contract and enforce it; a `Map` return is a reasonable alternative design if documented.
- **Per-key `Error` values** reject only that key, but that rejection is only observed if the
  caller attached a handler; an unobserved key rejection becomes an unhandled rejection.
- **Thenable values** in the results array are passed to `resolve`, so they are adopted and
  awaited — useful for merging a per-key cache hit, surprising if unintended.
- **Keys that were cancelled or already resolved** are not in `pending`, so the batch cannot
  resolve them twice; `resolve`/`reject` on an already-settled promise is inert anyway.
- **A pending timer keeps the Node event loop alive**; a request-scoped batcher should expose
  `flush()` and be flushed (or discarded) at the end of the request.
- **Duplicate key after the flush started** gets a *separate* promise in the next batch. It cannot
  join the in-flight batch, because that batch already claimed the key.

### Interview Follow-ups

- **Add caching:** keep a `Map` of resolved key → value and check it in `load`. This is
  DataLoader's `cache` option and the reason `prime`/`clear` exist.
- **Cap the batch:** pass at most `N` keys to `batchFn` and immediately schedule the remainder as
  the next batch — protects against an unbounded `IN (...)`.
- **Priority queues:** two maps and two flushes, high priority first; explain how this avoids a
  latency spike for critical keys.
- **`load.cancel(key)`:** delete from `pending` and reject that deferred with an `AbortError`.
- **Compose with the latest-wins guard:** the batcher dedupes the *same* key; the sequence guard
  discards *old* keys. They solve different problems and are commonly needed together.
- **Production:** `dataloader` (used by GraphQL servers) is exactly this class; say so rather
  than hand-rolling it in a real codebase.

### Common Mistakes

- `await`-ing inside the loop before calling `load`, so each call becomes its own batch.
- Returning a wrapper like `load(key).then((v) => v)` for a duplicate key, breaking promise
  identity and dedupe.
- Calling `pending.clear()` instead of swapping the `Map`, losing or double-settling re-entrant
  calls.
- Forgetting the rejection handler on `batchFn`'s promise, so pending promises hang and the
  rejection goes unhandled.
- Assuming results arrive in completion order rather than the aligned `keys` order.
- Using a plain object as the key map, where `"__proto__"` and `1`/`"1"` collide.
- Letting one key's `Error` reject the whole batch (or vice versa) without documenting which
  convention the API uses.
- Expecting `setTimeout(fn, 0)` to batch everything in the current tick — it is a macrotask.

### Takeaway

A batcher is a `Map` of deferreds plus one scheduled flush. The `Map` gives dedupe and stable
ordering; the swap-before-call gives re-entrancy; the dual rejection handlers give whole-batch vs
per-key failure. Batching trades per-call latency for one round trip, so the window is the
contract.

## Deduplicate Concurrent Identical Requests (In-Flight Sharing)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `createDeduped(fetchFn, { keyOf } = {})` that returns a `load(...args)` function where
concurrent calls for the **same** request share one in-flight promise:

- `keyOf(...args)` derives the request key (default: serialised arguments). While a request for
  `key` is in flight, every `load` with an equal key returns **the identical promise** (`a === b`)
  and `fetchFn` is invoked **once**.
- The entry is deleted **on settle** (fulfil or reject). A call that starts after settlement
  refetches. Settled values are never retained — this is not a cache.
- Rejection is shared: every attached caller rejects with the same reason. A synchronous throw
  from `fetchFn` propagates without being stored.
- `load.clear(key?)` drops one entry (or all) so the next call refetches; `load.has(key)` reports
  whether a request is currently in flight.

### Examples

```text
let calls = 0;
const load = createDeduped(async (id) => { calls += 1; return `user-${id}`; });

const a = load(1);
const b = load(1);
a === b                  // => true (one fetch, two consumers)
await a                  // => "user-1"
calls                    // => 1
await load(1)            // => "user-1" (refetch: the first entry already settled)
calls                    // => 2
const bad = createDeduped(async () => { throw new Error("down"); });
(await Promise.allSettled([bad("x"), bad("x")])).map((s) => s.status)  // => ["rejected", "rejected"]
```

### Approach

Three decisions, and two contrasts the interviewer is listening for:

1. **A `Map` from key to the in-flight promise.** Check it *before* calling `fetchFn`, store
   the promise immediately after. `SameValueZero` covers primitive keys; `keyOf` is the contract
   for object arguments.
2. **Delete on settle, with a guarded cleanup.** `promise.then(cleanup, cleanup)` runs on both
   paths; the derived promise is discarded so callers keep the identical object. The guard
   `get(key) === promise` stops a `clear()`-then-refetch race from evicting the newer flight.
3. **Never store a synchronous throw.** `try/catch` around the call, `Promise.reject(error)`
   without touching the map; `Promise.resolve(...)` also adopts thenables.

The contrasts: **batching** (previous problem) groups *different* keys into one `batchFn(keys)`
call; dedupe shares the *same* key in one fetch. **Caching** retains *settled* values; dedupe
deletes on settle. Keeping the settled promise "for free caching" permanently caches rejections
and leaks memory per key.

### Implementation

```javascript
function createDeduped(fetchFn, { keyOf = (...args) => JSON.stringify(args) } = {}) {
  if (typeof fetchFn !== "function") throw new TypeError("fetchFn must be a function");

  const inflight = new Map(); // key -> in-flight promise (never settled values)

  function load(...args) {
    const key = keyOf(...args);
    const existing = inflight.get(key);
    if (existing) return existing; // the IDENTICAL promise

    let promise;
    try {
      promise = Promise.resolve(fetchFn(...args));
    } catch (error) {
      return Promise.reject(error); // no flight exists: nothing shared, nothing stored
    }

    inflight.set(key, promise);
    const cleanup = () => {
      if (inflight.get(key) === promise) inflight.delete(key); // guarded: keep a newer flight
    };
    // Two-arg form settles the discarded chain itself; the ORIGINAL promise still rejects for
    // callers without handlers, exactly as a raw fetch would.
    promise.then(cleanup, cleanup);
    return promise;
  }

  load.clear = (key) => {
    if (key === undefined) inflight.clear();
    else inflight.delete(key);
  };
  load.has = (key) => inflight.has(key);

  return load;
}
```

### Walkthrough

1. `load(1)` → key `"[1]"`, map miss, `fetchFn(1)` runs once, promise `p1` is stored and returned.
2. `load(1)` → same key, map hit, returns `p1` itself, so `a === b` is `true`. No second fetch.
3. `fetchFn` resolves `"user-1"` for both awaiters; the cleanup microtask deletes the entry. A
   late `load(1)` therefore misses and refetches (`calls === 2`).
4. The guard's race: `clear("[1]")` mid-flight, then `load(1)` stores newer `p2`. When `p1`
   settles, its cleanup sees `get("[1]") === p2` and keeps it.

### Complexity

Time: `O(1)` map work per call plus the single shared fetch. Space: `O(k)` for `k` in-flight
keys; entries are deleted on settle, so idle dedupers hold nothing.

### Edge Cases

- **Default key serialisation is naive** (`{ a: 1, b: 2 }` vs `{ b: 2, a: 1 }` stringify
  differently; cycles throw) — pass a domain key like `(id) => \`user:${id}\`` instead.
- **Clean up on one path only?** `promise.then(cleanup)` alone never evicts rejected keys, so every
  future call replays the same cached rejection. The two-arg form is required.
- **`clear(key)` mid-flight** detaches future callers but cannot cancel work already started; the
  old promise still settles and its cleanup is a guarded no-op.
- **Memory is bounded by concurrency**, not by key space — unlike a cache, settled keys leave no
  residue, so a hot loop over fresh ids cannot leak.

### Interview Follow-ups

- **Add a response cache with TTL on top:** keep a *separate* `Map` of settled key → value plus
  expiry; explain why merging it into `inflight` poisons retries with cached rejections.
- **Compose with the batcher:** dedupe same-key calls first, then batch the surviving distinct
  keys — the two layers solve different problems and stack cleanly.

### Common Mistakes

- Returning `promise.finally(cleanup)` instead of `promise` — callers get a *different* object
  and the `a === b` identity check fails.
- Keeping settled promises in the map, turning a deduper into an unbounded cache that also replays
  old rejections forever.
- Cleaning up only on fulfil, so one rejection pins the key to a dead promise.
- Calling `fetchFn` *before* checking the map, which fetches on every call and dedupes nothing.

### Takeaway

Dedupe shares the *flight*, not the *result*: store the promise before anyone can race you, hand
back the identical object, and delete it on settle with a guarded cleanup. Anything retained past
settlement is a cache, with a cache's invalidation problem.





