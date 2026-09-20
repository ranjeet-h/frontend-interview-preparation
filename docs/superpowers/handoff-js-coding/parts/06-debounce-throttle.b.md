## Implement Basic Throttle

`Difficulty: Easy` `Probability: Very High`

### Problem

Write `throttle(fn, wait)` that returns a function which runs `fn` **at most once per
`wait` milliseconds**. The window closes on the **leading edge**: the first call runs
immediately, and every call arriving before `wait` has elapsed is **dropped** — never
queued, never replayed.

Scope note: in this first problem `fn` is treated as a zero-argument callback and is
invoked as `fn()`. Forwarding `this` and arguments is the subject of the next problem, so
the two ideas stay separate.

Contract:

- The very first call runs synchronously.
- A call at time `t` runs **iff** `t - lastRun >= wait`.
- Dropped calls are lost; there is no trailing invocation.
- `wait` defaults to `0`, which is "no throttle" (every call runs).
- `lastRun` is the time of the last *invocation*, never of a dropped call.

### Examples

```text
const tick = throttle(() => console.log("tick"), 100);

tick(); // runs now        (leading edge)
tick(); // dropped
tick(); // dropped
// ... 100 ms pass ...
tick(); // runs now
```

```text
tick(); // => tick        (t = 0)
tick(); // => undefined   (t = 30, inside window)
tick(); // => undefined   (t = 60, inside window)
tick(); // => tick        (t = 100, window elapsed)
tick(); // => undefined   (t = 130, new window)
```

### Approach

Two mechanisms produce the same leading-edge / drop-the-rest contract:

1. **Timestamp check** (this implementation). Keep the time of the last invocation and
   compare `Date.now() - lastRun >= wait`. There is no timer at all, which is *why* the
   trailing call can never happen: nothing is scheduled.
2. **Timer (cooling flag).** Keep a boolean `cooling`. When a call runs, set
   `cooling = true` and `setTimeout(() => { cooling = false; }, wait)`. While `cooling` is
   true, calls are dropped.

They differ in ways an interviewer will probe:

- **Clock source.** The timestamp check reads the wall clock, so an NTP correction or a
  manual clock change moves the boundary (a backwards jump fires early, a forwards jump
  delays). The timer is driven by the event loop and ignores wall-clock changes.
- **Timer cost and drift.** Timers are clamped (a ~1–4 ms minimum) and can be delayed by a
  long task, so a timer window can exceed `wait`. The timestamp check is exact.
- **Trailing capability.** A timestamp check alone has nowhere to schedule a trailing
  call; a timer naturally can (the timeout callback is a place to invoke). That is why
  problems 4 and 5 are timer-based.
- **Sentinel.** `lastRun = 0` — the common textbook default — assumes `Date.now()` is far
  from zero. Under fake timers that start the clock at 0, the first call would be delayed
  a whole window. Use `-Infinity` (or `null`) instead.

### Implementation

```javascript
// "Timestamp check" throttle: leading edge, in-window calls dropped.
function throttle(fn, wait = 0) {
  if (typeof fn !== "function") throw new TypeError("throttle expects a function");

  let lastRun = -Infinity; // explicit sentinel: the first call always fires

  return function throttled() {
    const now = Date.now();
    if (now - lastRun >= wait) {
      lastRun = now;
      return fn(); // the basic version is called with no receiver and no arguments
    }
    // else: inside the window — drop the call. Nothing is scheduled.
    return undefined;
  };
}
```

The equivalent timer form, for comparison:

```javascript
function throttleTimer(fn, wait = 0) {
  let cooling = false;
  return function throttled() {
    if (cooling) return; // window still open — drop
    cooling = true;
    fn();
    setTimeout(() => { cooling = false; }, wait);
  };
}
```

### Walkthrough

`const tick = throttle(() => log("tick"), 100);` called at `t = 0, 30, 60, 100, 130`:

1. `t = 0`: `0 - (-Infinity)` is `Infinity >= 100` → `lastRun = 0`, `fn()` runs. ✅
2. `t = 30`: `30 - 0 = 30 >= 100`? No → dropped.
3. `t = 60`: `60 - 0 = 60 >= 100`? No → dropped.
4. `t = 100`: `100 - 0 = 100 >= 100`? Yes (inclusive) → `lastRun = 100`, runs. ✅
5. `t = 130`: `130 - 100 = 30 >= 100`? No → dropped.

Output:

```text
tick
tick
```

Only two of the five calls survive. The call at `t = 130` is gone forever — the defining
limitation of leading-only throttle, and the reason the later problems exist.

The timer form at the same timestamps behaves identically: `t = 0` runs and sets
`cooling = true`; `t = 30` and `t = 60` are dropped; the timeout flips `cooling = false`
around `t = 100`; `t = 130` runs. The observable contract is the same; only where the
boundary is measured differs.

### Complexity

Time: `O(1)` per call (one `Date.now()` plus a comparison), on top of whatever `fn` costs.
Space: `O(1)` — the closure holds `fn`, `wait`, and one number.

### Edge Cases

- `wait = 0`: every call runs, because `now - lastRun >= 0` is always true (`0 >= 0` still
  holds for two calls in the same millisecond). That is intended "no throttle" behavior.
- `wait = NaN`: every comparison is `false`, so only the first call ever runs — validate
  inputs rather than letting this pass silently.
- Negative `wait` behaves like `0`.
- `lastRun = 0` breaks under a clock that starts near 0 (fake timers); `-Infinity` avoids it.
- Clock jumps: a backwards `Date.now()` jump makes the next call fire early; a forwards
  jump delays it. `performance.now()` is monotonic and fixes the jump, but not mocks.
- `this` and arguments are swallowed — deliberately out of scope here; the next problem
  forwards them.
- Dropped calls' arguments are unrecoverable; if the last call matters, you need trailing.
- `fn` throwing propagates to the caller and `lastRun` is already updated, so the window is
  still honored — a throw does not roll back the throttle state.
- Each wrapper has its own `lastRun`; two throttled functions do not share a window.

### Interview Follow-ups

- **Why not store the dropped arguments?** That is trailing-edge throttle; it requires a
  timer to fire later, which changes the mechanism (next-but-one problem).
- **Timestamp vs timer — which do you pick?** Timer when the last call must eventually run
  or the wall clock is unreliable; timestamp when you only need a maximum rate and can
  safely drop calls (analytics, scroll samples) without leaving pending timers.
- **How do you get an exact window with a trailing call?** Use the timestamp check for the
  decision and a timer only to wake up — the hybrid in the leading+trailing problem.
- **Production:** `requestAnimationFrame` for visual updates; lodash `throttle` for a
  battle-tested implementation with `leading`/`trailing`/`cancel` options.

### Common Mistakes

- Updating `lastRun` on **every** call instead of only when `fn` runs, which makes the
  throttle fire once and then never again within the window.
- Using `lastRun = 0` and assuming `Date.now()` is large.
- Adding an empty `setTimeout` to the timestamp version "just in case" — it schedules
  nothing useful and leaks timers.
- Initializing `lastRun = Date.now()`, which delays the first call by a full window.
- Using `>` instead of `>=`, which makes a call landing exactly on the boundary wait.
- Saving the dropped call somehow "to be safe", turning a throttle into a debounce.

### Takeaway

A basic throttle is one number — the timestamp of the last invocation — compared against
`wait`. Its entire personality is "leading edge, drop the rest", and the timestamp and
timer variants deliver that same contract through two different clocks.

## Implement Throttle Preserving Arguments and `this`

`Difficulty: Easy` `Probability: Very High`

### Problem

Upgrade the throttle so that when `fn` actually runs it is invoked with the receiver and
arguments of the call that triggered it. Signature: `throttle(fn, wait)`.

The point is that `this` and the argument list belong to the **call site**, not to the
wrapper. A naive wrapper calls `fn()`, silently discarding both. The contract:

- The invocation runs `fn.apply(this, args)`, where `this` and `args` are the ones from the
  call being honored.
- The throttled function returns whatever `fn` returned when it ran, and `undefined` when
  the call was dropped.
- `this` is *not* the wrapper's saved receiver — it is whatever the caller used, exactly
  as a normal function receives it.
- Arguments are captured with a rest parameter (a fresh array), so a zero-argument call is
  a legitimate call, not an "empty" one.

### Examples

```text
function log(...args) { console.log(this.tag, args.join(",")); }

const t = throttle(log, 100);

t.call({ tag: "A" }, 1, 2); // => A 1,2   (runs now)
t.call({ tag: "B" }, 3, 4); // => undefined (dropped — args and receiver are gone)
```

```text
const counter = {
  n: 0,
  bump(step) { this.n += step; return this.n; },
};

const bump = throttle(counter.bump, 100);
bump.call(counter, 2); // => 2           (this is counter)
bump.call(counter, 5); // => undefined   (dropped)
counter.n;             // => 2
```

### Approach

Forward the call with `fn.apply(this, args)` instead of `fn()`, and capture the arguments
with a rest parameter:

- `return function (...args) { return fn.apply(this, args); }` — `this` inside the wrapper
  is the call-site receiver (because the wrapper is a normal `function`, not an arrow), and
  `apply` forwards it verbatim. `fn.call(this, ...args)` is equivalent.
- The `cooling` flag still decides *whether* to run, but it no longer affects *how* `fn`
  runs. This separation — admission vs. invocation — is what keeps the two concerns clean.

Two traps:

1. **Do not use an arrow for the wrapper.** An arrow has no own `this`, so it would capture
   whatever `this` was where `throttle` was defined and forward that instead.
2. **Do not write `fn(...args)`.** It forwards the arguments but calls `fn` as a plain
   function, so a method loses its receiver (`this` becomes `undefined` in strict mode or
   `globalThis` in sloppy mode).

Because this problem still defers nothing (the honored call is synchronous), the
`this`/args forward is trivial. It becomes the hard part in the trailing problem, where the
call is replayed later from a timeout callback: a closure does not preserve `this`, so you
must save it (`const self = this`) at call time — which is exactly why the rest/`apply`
capture is established here.

Also wrap the reset in `try/finally` so a throwing `fn` still reopens the window and the
throttle cannot wedge shut.

### Implementation

```javascript
function throttle(fn, wait = 0) {
  if (typeof fn !== "function") throw new TypeError("throttle expects a function");

  let cooling = false;

  return function throttled(...args) {
    if (cooling) return undefined; // inside the window — drop, args and all

    cooling = true;
    try {
      // Forward BOTH: the call-site receiver (`this`) and the arguments.
      return fn.apply(this, args);
    } finally {
      // Reopen the window even if fn threw, so the wrapper cannot stay stuck.
      setTimeout(() => { cooling = false; }, wait);
    }
  };
}
```

The two broken shapes this replaces:

```javascript
// BUG 1: no receiver, no arguments.
function throttleNaive(fn, wait) {
  let cooling = false;
  return function () {                 // ignores the caller's arguments
    if (cooling) return;
    cooling = true;
    fn();                              // `this` and args are lost
    setTimeout(() => { cooling = false; }, wait);
  };
}

// BUG 2: forwards arguments but drops the receiver.
// fn(...args) calls fn as a plain function, so `this` is not the caller's receiver.
```

### Walkthrough

`const counter = { n: 0, bump(step) { this.n += step; return this.n; } };` then
`const bump = throttle(counter.bump, 100);`

1. `bump.call(counter, 2)` → the wrapper runs with `this = counter`, `args = [2]`.
   `cooling` is `false`, so it sets `cooling = true` and evaluates
   `fn.apply(counter, [2])`, i.e. `counter.bump(2)`.
2. Inside `bump`, `this.n += 2` makes `counter.n === 2`, and it returns `2`. The wrapper
   returns `2` unchanged.
3. `finally` schedules `cooling = false` after 100 ms.
4. `bump.call(counter, 5)` runs with `this = counter`, `args = [5]`, but `cooling` is
   `true`, so it returns `undefined` and `counter.n` stays `2`.

Now suppose the wrapper were `return function () { ... fn(); }` and called as
`bump.call(counter, 2)`: `fn()` would run `bump` with `this === undefined`, and `this.n`
would throw. That is the exact failure this problem is designed to expose.

### Complexity

Time: `O(1)` overhead per call plus `O(n)` to spread `n` arguments (`O(n)` extra to build the
rest array). Space: `O(n)` per accepted call for the argument array; the closure holds only
`fn`, `wait`, and the flag.

### Edge Cases

- **Detached method:** `const f = obj.method; throttle(f)` cannot recover `obj`; `this` is
  `undefined`. Throttle exactly the bound value (`throttle(obj.method.bind(obj))`).
- **Arrow `fn`:** arrows ignore `this`, so the forwarded receiver is inert — arguments still
  work normally.
- **Strict vs sloppy:** the wrapper's `this` follows the usual rules; `apply` passes it on
  unchanged for the callee's own strictness to interpret.
- **Zero arguments:** `args` becomes `[]`, a legitimate call; do not test "did the caller
  pass anything" by length.
- **Return value of a dropped call** is always `undefined`; callers must not depend on a
  per-call result.
- **`fn` throws:** the exception propagates to the caller and `finally` still starts the
  cooldown timer, so state stays consistent.
- **Timer id type:** in Node `setTimeout` returns an object, in browsers a number; never
  compare ids to numbers.
- **No trailing yet:** the last dropped call's `this`/args are still discarded, because
  nothing replays them.

### Interview Follow-ups

- **When do you need the *last* call's arguments?** Trailing throttle: keep only the most
  recent `args`/`this` and replay them in the timer callback (next-but-one problem).
- **Why `fn.apply(this, args)` and not `fn.call(this, ...args)`?** Equivalent; `apply` avoids
  re-spreading and reads more clearly with a stored array.
- **How do you return the trailing result?** You cannot, synchronously — the value does not
  exist yet. Return a `Promise` resolved with `fn`'s result (a common follow-up).
- **Does `throttle` change `this` for an event handler?** No: the browser calls the handler
  with `this === element`, and the wrapper forwards it.

### Common Mistakes

- Calling `fn()` and losing both `this` and arguments — the canonical bug.
- Making the wrapper an arrow, so `this` is lexically captured from where `throttle` was
  written rather than from the call site.
- Writing `fn(...args)`, which forwards arguments but drops the receiver.
- Forgetting `return`, so even an honored call reports `undefined`.
- Setting `cooling = false` only on the success path, leaving the throttle stuck after a
  throw.
- Capturing `const self = this` *outside* the returned function, which captures `throttle`'s
  own receiver (usually `undefined`) instead of the call site's.

### Takeaway

`this` and arguments are properties of the call, so capture them at the call site and replay
them with `apply`. A closure preserves neither for you, and that difference is the whole
problem the moment an invocation becomes deferred.

## Implement Leading Throttle

`Difficulty: Medium` `Probability: High`

### Problem

Write `throttleLeading(fn, wait)` so that `fn` runs on the **leading edge only**. The first
call of a burst runs immediately; every call inside the following `wait` window is
swallowed and never replayed. When the window ends, the window is not "restarted by time" —
it restarts on the *next call*, which then runs immediately as a new leading edge.

Contract:

- Calls run synchronously, in the caller's stack; `this`/arguments come from that call.
- `lastInvoke` is anchored to the last **invocation**, so the next eligible time is
  `lastInvoke + wait`, and the boundary is inclusive (`>=`).
- Dropped calls produce no invocation and are forgotten.
- The first call ever always runs, regardless of `wait`.

Leading throttle is the latency-optimal choice: the first event in any burst is handled
instantly, and the cost is that the *last* event (often the most meaningful, e.g. the final
scroll position) is lost.

### Examples

```text
const ping = throttleLeading((id) => { log("ping", id); return id; }, 100);

ping(1); // runs immediately, returns 1
ping(2); // dropped, returns undefined
ping(3); // dropped, returns undefined
// ... 100 ms after ping(1) ...
ping(4); // runs immediately, returns 4
```

```text
const throttleLeading = require("./throttle");
const ping = throttleLeading((id) => id, 100);

ping(1) // => 1
ping(2) // => undefined
ping(3) // => undefined
ping(4) // => 4          (after the window)
```

Calls made during the drop window leave no trace in the output:

```text
ping 1
ping 4
```

### Approach

Leading throttle is the pure **timestamp check** from the basic problem, generalized to
forward arguments and exposing the operation counter:

- Keep a single number, `lastInvoke`. If it is `null` (never run) or `now - lastInvoke >= wait`,
  this call is the leading edge: update `lastInvoke = now` and invoke.
- Otherwise return immediately. There is no timer, so nothing can be deferred — dropping is
  structural, not a policy you have to enforce.
- Anchor the window to the **invocation** time, not to the previous *attempt*. Updating
  `lastInvoke` on a dropped call would push the boundary out forever and starve the function.

The timer form (`cooling` boolean) is observably equivalent for this contract. Choose the
timestamp check when the wall clock is trustworthy and you want zero pending timers (fewer
allocations, nothing to clear on teardown); choose the timer when the window must survive
`Date.now()` moving. Note that a timer-based leading edge reopens only when the timeout
callback runs — which can be late under a long task — so its window can exceed `wait`.

Use `null` as the "never invoked" sentinel rather than `0`: `Date.now()` is huge in real
browsers, but fake timers commonly start at `0`, and then `now - 0 >= wait` would wrongly
delay the first call.

### Implementation

```javascript
// Leading-edge throttle: run now, swallow the rest of the window.
function throttleLeading(fn, wait = 0) {
  if (typeof fn !== "function") throw new TypeError("throttle expects a function");

  let lastInvoke = null; // null = never run; avoids the Date.now() === 0 sentinel bug

  return function throttled(...args) {
    const now = Date.now(); // performance.now() would be monotonic
    if (lastInvoke === null || now - lastInvoke >= wait) {
      lastInvoke = now;
      return fn.apply(this, args); // invoked from the caller's stack, with its this/args
    }
    return undefined; // inside the window: swallowed, never replayed
  };
}
```

The equivalent timer form, which is the better starting point once trailing is added:

```javascript
function throttleLeadingTimer(fn, wait = 0) {
  let cooling = false;
  return function throttled(...args) {
    if (cooling) return undefined;
    cooling = true;
    setTimeout(() => { cooling = false; }, wait);
    return fn.apply(this, args);
  };
}
```

### Walkthrough

`const ping = throttleLeading(fn, 100);` called at `t = 0, 40, 80, 100, 150`:

1. `t = 0`: `lastInvoke` is `null` → run. `lastInvoke = 0`. ✅
2. `t = 40`: `40 - 0 = 40 >= 100`? No → dropped.
3. `t = 80`: `80 - 0 = 80 >= 100`? No → dropped.
4. `t = 100`: `100 - 0 = 100 >= 100`? Yes → run. `lastInvoke = 100`. ✅
5. `t = 150`: `150 - 100 = 50 >= 100`? No → dropped.

Output:

```text
ping 1
ping 4
```

The burst at `0/40/80` collapses to one leading call at `0`; the calls at `100` and `150`
form the next burst, whose only surviving call is the leading one at `100`. The window is
anchored at an invocation (`0`, then `100`), never at a dropped attempt.

With `throttleLeadingTimer`, `t = 0` runs and sets `cooling = true`; `t = 40`/`t = 80` are
dropped; the timeout flips the flag around `t = 100`, so `t = 100` (once the callback has
run) and `t = 150` behave the same way.

### Complexity

Time: `O(1)` per call plus `O(n)` for spreading `n` arguments. Space: `O(n)` transient for the
argument array; `O(1)` retained state (`fn`, `wait`, `lastInvoke`).

### Edge Cases

- **Boundary is inclusive:** a call at exactly `lastInvoke + wait` runs (the `>=`).
- **`wait = 0`:** every call runs; the throttle degenerates to a pass-through.
- **`wait = NaN`:** every comparison is `false`, so only the first call ever runs.
- **Clock jumps:** a backwards `Date.now()` jump fires the next call early; `performance.now()`
  is monotonic and removes that class of bug (but is also mocked under fake timers).
- **`lastInvoke = 0` sentinel:** breaks when the clock starts at `0`; `null` is correct.
- **Long idle:** no timer is pending, so a call an hour later runs immediately — desired.
- **Dropped arguments:** the defining loss. The last call's receiver/args are not retained;
  if the final value matters, use trailing.
- **Re-entrancy:** if `fn` itself calls the wrapper, the inner call sees `lastInvoke` already
  updated and is dropped; that is the intended rate limit.
- **`fn` throwing:** the timestamp was already committed, so the window still holds.

### Interview Follow-ups

- **Difference from trailing:** leading reports the *first* call of a burst with zero delay;
  trailing reports the *last* call after `wait`, so it never loses data but always lags.
- **Implement both edges:** the leading+trailing problem — you need one window and one
  shared notion of "a call is pending", or you fire twice.
- **Why is `leading: true` the default in most libraries?** Immediate feedback on the first
  event is what UI users perceive as responsiveness.
- **Where would you deliberately choose leading-only?** Button click guards ("submit once
  per second"), analytics sampling, and search-as-you-type triggers where the final keystroke
  is handled by the next burst anyway.

### Common Mistakes

- Using `>` instead of `>=`, so a call exactly on the boundary waits a full extra window.
- Updating `lastInvoke` on dropped calls, which starves the function.
- Resetting a timer-based flag *before* invoking `fn`, leaving a gap where a call slips
  through unprotected.
- Forgetting the never-invoked sentinel, delaying the first call by a whole window.
- Assuming the window "ticks" on its own — it only advances when a call actually runs.
- Reaching for debounce when the requirement is "first call immediately" — the opposite edge.

### Takeaway

Leading throttle is one number: the timestamp of the last invocation. It is the
latency-optimal choice, and its one real limitation — the trailing call is lost — is exactly
what the next problem fixes.

## Implement Trailing Throttle

`Difficulty: Medium` `Probability: High`

### Problem

Write `throttleTrailing(fn, wait)` so `fn` runs on the **trailing edge only**. The first call
does **not** run immediately: it opens a window. Every call during the window overwrites a
single cached "most recent call". When the window ends, `fn` runs once, with the `this` and
arguments of the **latest** call in that window.

Contract:

- The first call of a burst starts the timer but does not invoke `fn`.
- Subsequent calls during the window **do not reset the timer** — they only replace the
  cached arguments. (Resetting the timer on every call is debounce, not throttle; see the
  Takeaway.)
- At the end of the window, `fn` runs exactly once, with the receiver and arguments of the
  last call seen.
- A single isolated call is invoked after `wait` milliseconds, not immediately.
- The return value is always `undefined`: the result does not exist when the wrapper
  returns.

Trailing throttle is the data-preserving choice — the final event is never lost — at the
cost of always lagging by `wait`.

### Examples

```text
const save = throttleTrailing((value) => console.log("saving", value), 100);

save("a"); // returns undefined, logs nothing yet
save("b"); // returns undefined
save("c"); // returns undefined
// 100 ms after save("a") — the window closes:
// => saving c
```

```text
const calls = [];
const record = throttleTrailing((x) => calls.push(x), 100);

record(1); record(2); record(3);
// after 100 ms
calls; // => [3]      (not [1, 2, 3], and not [1])
```

### Approach

Trailing throttle is a **timer plus a cache**:

- On the first call of a window, `timerId === null`, so start a `setTimeout(wait)` and return.
  The first call is remembered, not invoked.
- On every call, overwrite `pendingArgs`/`pendingThis` with the newest values. This is what
  "the latest arguments win" means; older calls simply become unreachable.
- Do **not** call `clearTimeout`/re-arm on subsequent calls. Keeping the original timer is
  what makes this a throttle. Re-arming it on every call produces a debounce that fires
  `wait` after the *last* call, and the burst issues a different number of invocations.
- When the timeout fires: clear `timerId` first (so the next call starts a fresh window),
  snapshot and null out the cache, then `fn.apply(cachedThis, cachedArgs)`. Nulling the cache
  before invoking prevents the same call from ever being replayed.

Why the cache is mandatory: the timeout callback runs later, in a different stack. The
`this` and `args` that were current at call time are not in scope there, so they must be
saved. A `const self = this` at call time (or the `pendingThis` variable here) is the fix;
calling a bare `fn()` inside the callback would run `fn` with `this === undefined` and no
arguments.

### Implementation

```javascript
// Trailing-edge throttle: coalesce a burst, then run once with the last call's this/args.
function throttleTrailing(fn, wait = 0) {
  if (typeof fn !== "function") throw new TypeError("throttle expects a function");

  let timerId = null;      // non-null while a window is open
  let pendingArgs = null;  // latest call not yet invoked (null = nothing pending)
  let pendingThis = null;

  return function throttled(...args) {
    // Every call updates the cache; only the last one will be replayed.
    pendingArgs = args;
    pendingThis = this;

    if (timerId !== null) return undefined; // window open — coalesce, do not re-arm

    // First call of the window: start the clock, do NOT invoke now.
    timerId = setTimeout(() => {
      timerId = null; // window closed: the next call starts a new one

      const argsToUse = pendingArgs;
      const thisToUse = pendingThis;
      pendingArgs = pendingThis = null; // consume before invoking

      fn.apply(thisToUse, argsToUse);
    }, wait);

    return undefined;
  };
}
```

The debounce-ish bug this avoids, shown deliberately inside a comment so it is not mistaken
for the answer:

```javascript
// WRONG for throttle: clearing and re-arming on every call makes it a debounce.
// if (timerId !== null) clearTimeout(timerId);
// timerId = setTimeout(fire, wait); // fires `wait` after the LAST call, not the first
```

### Walkthrough

`const record = throttleTrailing(fn, 100);` called at `t = 0 ("a"), 30 ("b"), 60 ("c"), 110, 120`:

1. `t = 0`: `pendingArgs = ["a"]`, `timerId` is `null`, so schedule a timeout for `t = 100`.
2. `t = 30`: `pendingArgs = ["b"]` — cache replaced; `timerId` is set, so nothing else happens.
3. `t = 60`: `pendingArgs = ["c"]` — cache replaced again.
4. `t = 100`: the timeout fires. `timerId = null`; `argsToUse = ["c"]`; the cache is cleared;
   `fn` runs once with `"c"`. ✅
5. `t = 110`: `pendingArgs = [110]`, `timerId` is `null` → schedule a timeout for `t = 210`.
6. `t = 120`: cache becomes `[120]`; timer already armed.
7. `t = 210`: `fn` runs with `120`. ✅

Output:

```text
saving c
saving 120
```

Three calls in the first burst produced one invocation with the *last* arguments; a single
isolated call (`110`) still waits a full window and is then invoked. The window never
restarts on `30`/`60` — that would have pushed the invocation to `t = 160`.

### Complexity

Time: `O(1)` per call plus `O(n)` argument spreading; one invocation per window. Space:
`O(n)` for the cached argument array, plus `O(1)` for the timer handle and receiver.

### Edge Cases

- **Single call:** invoked after `wait`, never immediately — the mirror image of leading.
- **`wait = 0`:** `setTimeout(..., 0)` still defers to the next macrotask, so calls in the
  same synchronous batch coalesce into one invocation.
- **Empty arguments:** `pendingArgs` is `[]`, which is truthy; test `pendingArgs !== null`,
  not `pendingArgs.length`, so a zero-argument call still counts as pending.
- **Cache and receiver are per wrapper:** two throttled functions do not share state.
- **`fn` throws:** `timerId` and the cache were already reset, so the wrapper is not wedged;
  the exception surfaces as an uncaught error from the timer callback (it cannot propagate
  to the original caller).
- **No synchronous return value:** because the invocation is deferred, the wrapper must
  return `undefined`; a caller cannot observe `fn`'s result.
- **Unmount/teardown:** the pending timer keeps running after you stop using the wrapper —
  `cancel` (a later problem) is required.
- **Blocked event loop:** the timeout fires late, so the invocation can land after
  `firstCall + wait`; the window is timer-driven, not clock-driven.
- **`Date.now()` irrelevant:** this implementation never reads the wall clock, so it is
  immune to clock jumps.

### Interview Follow-ups

- **How does this differ from debounce?** Trailing throttle keeps the first timer and fires
  `wait` after the *first* call, giving at most one call per window; debounce resets the
  timer on every call and fires `wait` after the *last* call. A continuous event stream
  throttles at a steady rate but debounces forever.
- **Get immediate feedback too:** add the leading edge — the leading+trailing problem.
- **Return the trailing result:** return a `Promise` that the timer resolves; the caller
  awaits the deferred value.
- **Flush early:** expose a method that clears the timer and invokes the pending call now
  (`flush`), which pairs with `cancel`.

### Common Mistakes

- Calling `clearTimeout` and re-arming on every call — that silently becomes a debounce.
- Invoking on the first call, which makes it leading, not trailing.
- Calling a bare `fn()` inside the timeout, losing `this` and arguments.
- Forgetting to set `timerId = null` before invoking, so no later window can ever open.
- Checking `if (pendingArgs)` by length and dropping legitimate zero-argument calls.
- Reading the cache after clearing it, or clearing it before the invocation reads it.
- Expecting `record(...)` to return `fn`'s value; a deferred call cannot return it.

### Takeaway

Trailing throttle starts a window on the first call, keeps it open, and replays only the
latest call when it closes. It is the "never lose the final event" edge, and the single
detail separating it from debounce is whether the timer resets.

## Implement Leading + Trailing Throttle

`Difficulty: Hard` `Probability: Very High`

### Problem

Write `throttle(fn, wait, { leading = true, trailing = true })` that supports both edges in
one window:

- `leading: true, trailing: true` — the first call of a burst runs **immediately**; if any
  further calls arrived during the window, the **last** of them runs when the window closes.
  If no further call arrived, `fn` runs exactly once (no synthetic duplicate).
- `leading: true, trailing: false` — leading only (previous-but-one problem).
- `leading: false, trailing: true` — trailing only (previous problem).
- `leading: false, trailing: false` — degenerate; `fn` never runs (validate and reject).

The hard part is correctness at the seam: a single call must never be invoked twice, and the
two edges must share one window rather than each keeping its own clock.

Invariants:

- `timerId !== null` **iff** a window is open. The window opens when a call is processed and
  there is no open window; it closes `wait` ms later when the timer fires.
- `pendingArgs !== null` **iff** there is a call that has not yet been invoked.
- An invocation **consumes** the pending slot (sets it to `null`). No invocation ever fires
  from a slot it did not consume.

### Examples

```text
const t = throttle(fn, 100); // leading + trailing

t(1); // => fn(1) immediately            (leading)
t(2); // coalesced
t(3); // coalesced
// 100 ms after t(1):
// => fn(3)                              (trailing, latest args)
```

```text
const t = throttle(fn, 100);

t("only"); // => fn("only") immediately, and NO second call 100 ms later
```

```text
const t = throttle(fn, 100, { leading: false });

t("a"); t("b");
// 100 ms later
// => fn("b")            (no leading invocation)
```

### Approach

Combine the two edges with **one timer and one pending-call slot**, and make the timer the
single source of truth for whether a window is open:

1. On every call, store `pendingArgs = args` / `pendingThis = this` (the newest call always
   wins).
2. If a window is already open (`timerId !== null`), return — the stored call will be
   replayed by the trailing edge if there is one.
3. If no window is open and `leading` is true, **consume** the pending slot and invoke now,
   then open the window.
4. Open the window with `setTimeout(wait)`. When it fires: set `timerId = null`, and if
   `trailing` is true **and** a pending call exists, consume and invoke it. Either way, clear
   the slot so the next window starts clean.

The double-fire trap: after step 3, `pendingArgs` still holds the very same call's arguments.
If the trailing timer then sees a non-null slot and invokes, the *first* call runs twice. The
fix is the consume in step 3 — the leading edge spends the pending call, so the trailing edge
can only fire for a call that arrived afterwards. That single line is the whole exercise.

A second, subtler bug is mixing two clocks: a `Date.now()` check for the leading edge plus a
timer for the trailing edge. Their boundaries disagree (timers can fire late), so a call can
slip through the gap and fire on both edges, or the trailing window can be skipped entirely.
Never mix; use the timer for both.

### Implementation

```javascript
function throttle(fn, wait = 0, { leading = true, trailing = true } = {}) {
  if (typeof fn !== "function") throw new TypeError("throttle expects a function");
  if (!leading && !trailing) throw new TypeError("leading and trailing cannot both be false");

  let timerId = null;      // non-null while a window is open
  let pendingArgs = null;  // newest call not yet invoked (null = nothing pending)
  let pendingThis = null;

  function invoke(args, thisArg) {
    fn.apply(thisArg, args); // args/this were captured at the call site
  }

  return function throttled(...args) {
    // The newest call always wins the pending slot.
    pendingArgs = args;
    pendingThis = this;

    if (timerId !== null) return undefined; // window open: coalesce into the slot

    if (leading) {
      // CONSUME the slot so the trailing edge cannot replay this same call.
      const callArgs = pendingArgs;
      const callThis = pendingThis;
      pendingArgs = pendingThis = null;
      invoke(callArgs, callThis);
    }

    timerId = setTimeout(() => {
      timerId = null; // window closed: the next call opens a new one

      if (trailing && pendingArgs !== null) {
        const callArgs = pendingArgs;
        const callThis = pendingThis;
        pendingArgs = pendingThis = null;
        invoke(callArgs, callThis);
      } else {
        // trailing off, or nothing new arrived: drop any coalesced call.
        pendingArgs = pendingThis = null;
      }
    }, wait);

    return undefined;
  };
}
```

The broken merge, annotated — it double-fires for exactly one reason:

```javascript
// ILLUSTRATIVE ONLY: two clocks plus a shared slot that is never consumed.
function throttleBroken(fn, wait) {
  let lastInvoke = 0;
  let timer = null;
  let lastArgs = null;
  let lastThis = null;

  return function (...args) {
    const now = Date.now();
    lastArgs = args;
    lastThis = this;

    if (now - lastInvoke >= wait) {
      lastInvoke = now;
      fn.apply(this, args);              // leading
      // BUG A: any timer from the previous window is still armed, so it will
      //        fire later and replay these same args. BUG B: lastArgs is not
      //        cleared, so even a freshly scheduled trailing sees a pending
      //        call and invokes the identical arguments a second time.
    } else if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        lastInvoke = Date.now();
        fn.apply(lastThis, lastArgs);    // may be the SAME call as the leading one
      }, wait - (now - lastInvoke));
    }
  };
}
```

### Walkthrough

`const t = throttle(fn, 100);` called at `t = 0 (1), 30 (2), 60 (3)`:

1. `t = 0 (1)`: pending = `(1)`. `timerId` is `null`. `leading` is true → consume the slot
   (pending becomes `null`) and `fn(1)` runs. Then arm the timer for `t = 100`.
2. `t = 30 (2)`: pending = `(2)`. `timerId` is set → return. `fn` not called.
3. `t = 60 (3)`: pending = `(3)`. Return.
4. `t = 100`: timer fires. `timerId = null`. `trailing` is true and pending is `(3)` →
   consume and `fn(3)` runs. Slot cleared.

Result: `fn(1)` at `0`, `fn(3)` at `100`. Two invocations, no duplicate.

Now the single-call case, `t = 0 ("only")` with no follow-up:

1. Consume and `fn("only")` runs; arm the timer.
2. At `t = 100` the timer fires; `timerId = null`, but `pendingArgs === null`, so no trailing
   invocation. Exactly one call — the consume from step 1 is what prevents a phantom second
   call here.

With `{ leading: false }`, `t = 0 ("a")` skips the leading block, so pending stays `("a")` and
only the timer is armed; `t = 20 ("b")` overwrites it; at `t = 100` the trailing edge consumes
and runs `fn("b")`.

### Complexity

Time: `O(1)` per call plus `O(n)` argument spreading; at most two `fn` invocations per window
(one per edge). Space: `O(n)` for the pending argument array, `O(1)` for the timer handle and
the receiver.

### Edge Cases

- **Single call, both edges:** exactly one invocation (leading), never a duplicate — the
  consume invariant.
- **`{ leading: false }`:** the first call is delayed by `wait`; latency is the price.
- **`{ trailing: false }`:** the last call of a burst is dropped, like plain leading throttle.
- **`{ leading: false, trailing: false }`:** rejected up front; otherwise timers would
  accumulate with no invocation.
- **Zero-argument calls:** `pendingArgs` becomes `[]`; test `!== null`, not falsiness.
- **`wait = 0`:** leading runs synchronously and the timer defers the trailing edge to the
  next macrotask; within one synchronous burst there is no trailing call unless a later call
  arrives before the timer runs.
- **Timer id type:** Node returns an object, browsers a number; keep using a `null` sentinel
  and `clearTimeout`.
- **Blocked event loop:** the trailing edge fires late, so the effective window exceeds
  `wait`. This is inherent to timer-driven throttling; a timestamp check would be exact but
  cannot schedule a trailing call.
- **`fn` throwing in the leading edge:** the timer was not yet armed (the invoke happens
  before `setTimeout`), so the window never opens. Arm the timer *before* invoking if you
  want the window to survive a throw — a real design decision worth naming.
- **Teardown:** a pending trailing call outlives "unmount" until `cancel` is added.

### Interview Follow-ups

- **Why not just run a timestamp throttle and a trailing timer?** Two clocks whose boundaries
  disagree; a call can fire on both edges. One timer is the single source of truth.
- **Add `cancel` and `flush`:** `cancel` clears the timer and the slot; `flush` invokes the
  pending call immediately and closes the window (next problem).
- **Make `throttle` return a Promise:** resolve it with the trailing invocation's result so
  callers can await the value that the synchronous return cannot provide.
- **How does lodash do it?** Same shape: `lastArgs`/`lastThis`/`timerId`, with
  `lastInvokeTime` used only to decide the delay. Compare rather than memorize.
- **Why must the leading edge consume the slot?** Otherwise the trailing edge replays the
  identical call — the single most common throttle bug.

### Common Mistakes

- Not clearing the pending slot after the leading invocation, so a lone call fires twice.
- Leaving a previous window's timer armed when the leading edge starts a new one.
- Mixing a `Date.now()` decision with a `setTimeout` decision, creating a boundary gap.
- Scheduling the trailing timer unconditionally, so `trailing: false` still invokes.
- Using `pendingArgs` truthiness, which treats `[]` as "nothing pending".
- Forgetting `timerId = null` inside the callback, permanently locking the throttle.
- Arming the timer before `fn` runs (or after) without deciding what a throwing `fn` should do.

### Takeaway

Leading + trailing throttle is one window, one timer, and one pending slot. The leading edge
consumes the slot so the trailing edge can only ever fire for a genuinely newer call — that
consume, not the timer, is what prevents double-firing.

## Add Cancellation Support to Throttle

`Difficulty: Medium` `Probability: High`

### Problem

Extend the leading+trailing throttle with a `cancel()` method that aborts everything still
pending, and a `flush()` method that forces the pending call to run immediately. Both are
attached to the returned function.

Contract for `cancel()`:

- Clears any pending trailing timer.
- Discards the cached call (arguments and receiver), so it will never be replayed.
- Resets the wrapper to "no window open", so the **next** call is treated as a fresh leading
  edge (subject to the `leading` option).
- Idempotent: calling it when nothing is pending is a no-op.
- Does **not** undo or interrupt an `fn` invocation that already happened; it only affects
  future work.
- Returns `undefined`.

Contract for `flush()`:

- If no window is open, returns `undefined` and does nothing.
- Otherwise clears the timer, closes the window, and invokes the pending call (if any) **now**,
  returning `fn`'s return value.
- After a flush the wrapper is reset, exactly as after `cancel`.

`cancel` is what makes a throttle safe to use in code with a lifecycle: unmounted components,
aborted requests, closed connections, and cancelled route transitions.

### Examples

```text
const t = throttle(fn, 100);
t(1);        // => fn(1) immediately (leading)
t(2);        // coalesced into the pending slot

t.cancel();  // timer cleared, pending call discarded
// at t = 100: nothing happens — fn(2) never runs

t(3);        // => fn(3) immediately (cancel reset the window)
```

```text
const t = throttle(fn, 100, { leading: false });
t("x");      // pending, window open, fn not called yet
t.flush();   // => fn("x") runs now; returns fn's return value

t.flush();   // => undefined (idle after the flush)
```

### Approach

Cancellation is pure state reset. The throttle keeps exactly three pieces of state — the timer
handle, the pending arguments, and the pending receiver — so `cancel` clears all three:

```
if (timerId !== null) { clearTimeout(timerId); timerId = null; }
pendingArgs = pendingThis = null;
```

Because `timerId === null` means "no window is open", the next call after `cancel` is a
leading edge again for free. There is nothing else to unwind.

`flush` is `cancel` plus an eager invocation: clear the timer, close the window, and if a
pending call exists, consume and invoke it, returning the result. Note that `flush` ignores
the `trailing` option: it is an explicit "run it now", and the pending slot only ever
contains calls that have not run. If `leading` already consumed the only call of the window,
the slot is `null` and `flush` simply closes the window.

Design note on ordering: in the leading+trailing implementation the trailing timer is armed
*after* the leading `invoke`. If `fn` itself calls `cancel()` during a leading invocation, the
timer does not exist yet, so the cancel is a no-op and the window is then armed anyway. If you
need that case to work, arm the timer before invoking `fn` (and let `fn` throwing be caught),
or add a generation counter that `cancel` bumps and the timer callback checks.

Also worth stating: nothing here can stop an invocation that is already in flight, and
`clearTimeout` does not run the callback. Cancellation is cooperative and only about the
future.

### Implementation

```javascript
function throttle(fn, wait = 0, { leading = true, trailing = true } = {}) {
  if (typeof fn !== "function") throw new TypeError("throttle expects a function");
  if (!leading && !trailing) throw new TypeError("leading and trailing cannot both be false");

  let timerId = null;      // non-null while a window is open
  let pendingArgs = null;  // newest call not yet invoked (null = nothing pending)
  let pendingThis = null;

  function invoke(args, thisArg) {
    return fn.apply(thisArg, args);
  }

  function throttled(...args) {
    pendingArgs = args;
    pendingThis = this;

    if (timerId !== null) return undefined; // window open: coalesce

    if (leading) {
      const callArgs = pendingArgs;
      const callThis = pendingThis;
      pendingArgs = pendingThis = null;     // consume: no double fire at the trailing edge
      invoke(callArgs, callThis);
    }

    timerId = setTimeout(() => {
      timerId = null;
      if (trailing && pendingArgs !== null) {
        const callArgs = pendingArgs;
        const callThis = pendingThis;
        pendingArgs = pendingThis = null;
        invoke(callArgs, callThis);
      } else {
        pendingArgs = pendingThis = null;   // drop the coalesced call
      }
    }, wait);

    return undefined;
  }

  // Abort all pending work and reset the window. Idempotent.
  throttled.cancel = function cancel() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    pendingArgs = pendingThis = null;
  };

  // Force the pending call to run now and close the window. Returns fn's result.
  throttled.flush = function flush() {
    if (timerId === null) return undefined; // no window open — nothing to flush
    clearTimeout(timerId);
    timerId = null;
    if (pendingArgs === null) return undefined; // leading already consumed the only call
    const callArgs = pendingArgs;
    const callThis = pendingThis;
    pendingArgs = pendingThis = null;
    return invoke(callArgs, callThis);
  };

  return throttled;
}
```

### Walkthrough

`const t = throttle(fn, 100);` with `leading: true, trailing: true`:

1. `t(1)`: pending = `(1)`, no window open, leading → consume and `fn(1)` runs. Arm the timer.
2. `t(2)`: pending = `(2)`; window is open → return.
3. `t.cancel()`: `clearTimeout` kills the pending timer, `timerId = null`, and the slot is
   cleared. `fn(2)` can never run. Nothing fires at `t = 100`.
4. `t(3)`: no window open → leading edge again → `fn(3)` runs immediately.

For `flush`, with `{ leading: false }`:

1. `t("x")`: pending = `("x")`, no window open, `leading` is false so no invocation; arm the
   timer for `t = 100`.
2. `t.flush()` at `t = 20`: the timer is cleared, `timerId = null`, pending is `("x")` →
   consume and `fn("x")` runs now; `flush` returns `fn`'s result.
3. `t.flush()` again: `timerId === null` → returns `undefined`.
4. `t("y")` opens a fresh window; the trailing edge would run it at `t + 100`.

Now the degenerate case: `t(1); t.flush()` with leading on. The leading call already consumed
the slot, so the slot is `null`; `flush` closes the window and returns `undefined` — no
duplicate invocation. That is the consume invariant doing its job.

### Complexity

Time: `O(1)` for `cancel` and `O(1)` plus `fn`'s cost for `flush`. Space: `O(1)` retained once
the slot is cleared; clearing the slot is what releases the captured arguments and receiver.

### Edge Cases

- `cancel()` while idle: no timer, slot already `null` — a harmless no-op.
- **`cancel()` inside a leading `fn`:** with the timer armed after `invoke`, the cancel is
  lost. Arm the timer first or use a generation counter if this must work.
- **`flush()` with nothing pending:** closes the window and returns `undefined`; it does not
  fabricate a call.
- **`flush()` with `trailing: false`:** still invokes the pending call, because `flush` is an
  explicit request and the slot only holds uninvoked calls. Document this if it surprises
  callers.
- **`flush()` propagates `fn`'s exception** synchronously, unlike the trailing edge, whose
  exceptions surface as uncaught errors from the timer callback.
- **Memory:** a pending timer retains `fn`, the arguments, and the receiver. On teardown,
  `cancel()` is what releases them; forgetting it is a common SPA leak.
- **In-flight invocation:** `cancel` cannot and does not stop `fn` once it has started.
- **`clearTimeout` does not run the callback**, so `cancel` never triggers `fn`.
- **Double cancel / cancel-then-flush:** both safe; `flush` after `cancel` returns `undefined`.
- **Detached method (`const c = t.cancel; c()`):** the closured state is captured, not `this`,
  so it still works — no receiver needed.

### Interview Follow-ups

- **Cancel on unmount:** call `cancel` in the cleanup path (e.g. an effect's teardown) so no
  trailing invocation outlives the component.
- **Tie into `AbortSignal`:** accept `{ signal }` and do
  `signal.addEventListener("abort", throttled.cancel, { once: true })`, so cancellation uses
  the platform's standard mechanism.
- **Promise-returning throttle:** have each call return a promise that the matching
  invocation resolves, so callers can await the deferred trailing result across `cancel`
  (rejected) too.
- **How does `cancel` differ from `flush`?** `cancel` throws the pending call away; `flush`
  spends it early. Both reset the window; only `flush` runs `fn`.
- **Why is `cancel` more important for debounce than for throttle?** A debounce always holds
  a pending timer while the user types; a throttle usually has nothing pending once the
  window closes, so it leaks less — but a trailing-enabled throttle still must be cancelled.

### Common Mistakes

- Clearing the timer but leaving the pending slot populated, so a later window replays stale
  arguments.
- Resetting only `pendingArgs` and forgetting `pendingThis`, replaying with the wrong receiver.
- Forgetting `timerId = null` in `cancel`, leaving the throttle permanently "open" so no
  call ever leads again.
- Assuming `cancel` aborts an invocation already running — it cannot.
- Implementing `flush` with `return fn()` but forgetting to clear the timer, so the flush runs
  and the timer then runs a second time (double fire).
- Not exposing `cancel` at all, so every consumer reimplements teardown and forgets it.

### Takeaway

`cancel` is a three-line state reset: clear the timer, clear the pending slot, and the window
is closed so the next call is a fresh leading edge. `flush` is the same reset plus one eager,
value-returning invocation — and this is the difference between a utility that leaks timers
in a single-page app and one that is safe to mount and unmount.
