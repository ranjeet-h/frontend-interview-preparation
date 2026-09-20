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

