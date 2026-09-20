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
