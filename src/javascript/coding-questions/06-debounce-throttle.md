# Debounce & Throttle

Debounce and throttle are the two most important frontend JavaScript questions after Promises. They look similar and are implemented differently, and senior interviews push into leading/trailing edges, `this` and argument forwarding, and explicit `cancel`/`flush` control. If you only master two pages in this section, make it this one and Promises.

## Implement Basic Debounce

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `debounce(fn, wait)`, returning a new function that coalesces a burst of calls into a single invocation of `fn`. Each call restarts a `wait`-millisecond timer; `fn` runs only once the caller has been quiet for a full `wait` ms.

Contract:

- **Last-one-wins.** `debounced()` may be called any number of times; `fn` runs at most once per quiet period, and it runs `wait` ms after the *final* call of the burst.
- **Reset, don't queue.** Every call cancels the pending timer and schedules a fresh one. There is never more than one live timer, so there is never a backlog of pending invocations.
- **Returns `undefined`.** There is no result to return — the work has not happened yet. Later problems surface the last result instead.
- **`wait` is a floor, not a guarantee.** `setTimeout` can fire late under load; debounce is not a scheduler.
- In this first version `fn` receives no arguments and a meaningless `this`; problems 2 and 3 fix that.

### Examples

```text
// wait = 300ms, calls at these times:
t=0     debounced()   // schedules fn @ 300
t=100   debounced()   // cancels @300, schedules fn @ 400
t=200   debounced()   // cancels @400, schedules fn @ 500
t=500                 // timer fires: fn() runs ONCE
3 calls to debounced() => 1 call to fn()

// a single, isolated call
t=0     debounced()   // fn() at t=300

// calls separated by more than `wait`
t=0     debounced()   // fn() at t=300
t=400   debounced()   // window already closed; fn() again at t=700
2 calls => 2 invocations (nothing to coalesce)

// zero wait is still asynchronous
debounce(fn, 0)()     // fn() runs on a later macrotask, not synchronously
```

### Approach

Debounce is a closure holding one mutable slot: the id of the pending timer.

1. On every call, if a timer is pending, `clearTimeout` it. That is the "reset" — it erases the previously scheduled invocation.
2. Schedule a new timeout for `wait` ms whose callback runs `fn` and clears the slot.
3. Inside the callback, set `timerId = null` so the bookkeeping stays truthful: a non-null id means "an invocation is pending." Later problems (`cancel`, `flush`, leading edges) all read that slot as their state variable, so maintaining it now pays off.

Why not a queue of timers? Because the *only* invocation that can ever matter is the newest one. An earlier pending call is not merely superseded, it is cancelled — that is the entire semantic difference between debounce and throttle.

### Implementation

```javascript
function debounce(fn, wait) {
  let timerId = null; // the only pending invocation, or null for "none"

  return function () {
    // Reset the clock: drop the previously scheduled invocation.
    if (timerId !== null) clearTimeout(timerId);

    timerId = setTimeout(() => {
      timerId = null; // close the window BEFORE calling fn (see Edge Cases)
      fn();
    }, wait);
  };
}
```

### Walkthrough

A search box is the canonical case: fetch results only after the user stops typing. Here is a runnable demo (Node or browser console) that simulates five keystrokes, one every 100 ms, with `wait = 300`.

```javascript
let calls = 0;
const search = () => {
  calls += 1;
  console.log(`search() -> call #${calls}`);
};
const debouncedSearch = debounce(search, 300);

// one keystroke every 100ms for "react", then the user stops
"react".split("").forEach((_, i) => setTimeout(debouncedSearch, i * 100));
setTimeout(() => console.log(`total fn calls: ${calls}`), 1000);
```

```text
search() -> call #1
total fn calls: 1
```

Step by step:

```text
t (ms)  event                 timer after handling
------  --------------------  -------------------------
0       keystroke 1 ("r")     fire @ 300
100     keystroke 2 ("re")    fire @ 400   (300 cancelled)
200     keystroke 3 ("rea")   fire @ 500   (400 cancelled)
300     keystroke 4 ("reac")  fire @ 600   (500 cancelled)
400     keystroke 5 ("react") fire @ 700   (600 cancelled)
700     timer fires           fn() runs, timerId = null, calls === 1
```

Five calls to `debouncedSearch` produced exactly one call to `search`. Each keystroke cancelled the previous timer, so only the timer scheduled at `t=400` ever survived to fire — and it fired with the state of the world at `t=700`, which is why the coalesced operation happens "after the user stops."

### Complexity

Time: `O(1)` per call to `debounced` (`clearTimeout` plus `setTimeout`); `fn` itself runs at most once per quiet period, so its cost is amortised away. Space: `O(1)` for the closure (`fn`, `wait`, and one timer id). Timer scheduling inside the engine is heap-based, so both operations are `O(log t)` in the number of live timers.

### Edge Cases

- **Burst of N calls → 1 invocation.** Coalescing is total: earlier calls are cancelled, not deferred.
- **Gaps longer than `wait`** produce one invocation per gap; debounce does not merge across a closed window.
- **`wait = 0`** is still asynchronous. `setTimeout(fn, 0)` queues a macrotask; it is not a synchronous call. Don't "optimise" by special-casing it.
- **`fn` throws.** `timerId = null` is set *before* `fn()`, so an exception still leaves the slot clean and the next call works. Reversing those two lines wedges the debouncer permanently.
- **Two debouncers are independent.** Each call to `debounce` creates a fresh closure, so timers never collide.
- **One debouncer shared across callers shares its window.** The timer id is per-closure, not per-call-site; that is usually what you want, but it means cross-component coupling is possible.
- **No result to return.** `debounced()` returns `undefined`; the work has not run yet.

### Interview Follow-ups

- **Forward the arguments** (problem 2) and **preserve `this`** (problem 3) — the two fixes that make the naive version production-shaped.
- **Add `immediate`/leading execution** (problem 4) so the first call fires instantly and later calls are suppressed.
- **Add `cancel()` and `flush()`** (problems 6 and 7) for teardown and "run it now."
- **Debounce vs throttle:** debounce invokes once per *quiet period*; throttle invokes at most once per *interval*, so a long burst under throttle still fires repeatedly.
- **`requestAnimationFrame` debounce:** for scroll/resize, coalesce to one callback per frame, and note that rAF pauses in background tabs while timers keep running (throttled).

### Common Mistakes

- Calling `fn()` immediately instead of inside the timer — that is leading-edge execution, a different problem.
- Omitting `clearTimeout`, which converts debounce into "delay every call by `wait`" and preserves every invocation.
- Using `setInterval` with a stored id; an interval cannot reset its own phase, so bursts fire mid-stream.
- Nulling `timerId` *after* `fn()`, so a throwing callback poisons the state.
- Testing `if (timerId)` instead of `timerId !== null`. Browser ids start at `1` so it appears to work, but the explicit null check is the actual contract and survives Node's `Timeout` objects.
- Forgetting that `wait` is a minimum: writing logic that assumes exact millisecond timing.

### Takeaway

Debounce is a closure around a single timer slot: cancel the old timer, set a new one. Everything harder — arguments, `this`, leading edges, `cancel`/`flush` — is bookkeeping layered on that one slot.

## Implement Debounce with Argument Forwarding

`Difficulty: Easy` `Probability: Very High`

### Problem

Extend `debounce(fn, wait)` so the deferred invocation receives the arguments of the **most recent** call. The returned function is variadic; when the timer finally fires, `fn` is called with exactly the arguments the last call supplied, and with no others.

Contract:

- **Last call's arguments win, wholesale.** Not the first call's, not a union, not an accumulation. If call 1 passes `(1,2)` and call 2 passes `(3)`, `fn` receives `(3)`.
- Exactly one dispatch per quiet period, carrying exactly that one call's arguments.
- Arguments are forwarded **by reference**; objects and arrays are not cloned.
- Zero-argument calls forward zero arguments — `fn()` is invoked with no arguments, not with a single `undefined`.
- The return value is still `undefined`, and `fn`'s arity is unchanged.

### Examples

```text
const debounced = debounce((a, b, c) => console.log(a, b, c), 100);

debounced(1, 2, 3);            // after 100ms => 1 2 3

debounced("a");
debounced("b", "extra");
debounced("c");                // after 100ms => c undefined undefined
// NOT a b extra c: only the last call's arguments survive

debounced();                   // after 100ms => fn() with zero arguments

const payload = { id: 7 };
debounced(payload);            // after 100ms => fn receives the SAME object
// (fn's parameter === payload is true; nothing was copied)

// a batch-style mistake, shown for contrast:
// accumulating would give => r re rea reac react  <-- wrong for debounce
```

### Approach

Use a **rest parameter** (`...args`) in the wrapper. That creates a real array holding this call's arguments, and the timeout callback — an arrow function — closes over that specific `args` binding lexically.

Because each call cancels the previous timer and schedules a new callback, only the newest `args` array is ever reachable. You could instead keep a `pendingArgs` variable in the closure and overwrite it each call; the lexical capture is equivalent and removes a mutable slot. Either way, the invariant is: *there is exactly one pending argument list, and it always belongs to the most recent call.*

Why the last call's arguments rather than the first? Because debounce's promise is "act on the final state." For a search box, the last keystroke carries the complete query; the first carries `"r"`. If you genuinely want the first call's payload, that is leading-edge execution (problem 4).

Note what is deliberately still missing: inside the arrow, `fn(...args)` is a **bare call**, so `fn` sees `this === undefined` in strict mode. Forwarding `this` is problem 3.

### Implementation

```javascript
function debounce(fn, wait) {
  let timerId = null;

  return function (...args) {
    if (timerId !== null) clearTimeout(timerId);

    timerId = setTimeout(() => {
      timerId = null;
      fn(...args); // this invocation's args, captured lexically by the arrow
    }, wait);
  };
}
```

The same thing spelled with an explicit captured variable — useful when the callback must be a classic `function` for some other reason:

```javascript
function debounce(fn, wait) {
  let timerId = null;
  return function (...args) {
    const pendingArgs = args; // freeze this call's arguments now
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(null, pendingArgs);
    }, wait);
  };
}
```

### Walkthrough

Ranked search-as-you-type, this time actually sending the query string:

```javascript
const results = [];
const search = (query) => results.push(query);
const debouncedSearch = debounce(search, 300);

// type "react", one character every 100ms
["r", "re", "rea", "reac", "react"].forEach(
  (q, i) => setTimeout(() => debouncedSearch(q), i * 100),
);
setTimeout(() => console.log(results), 1000);
```

```text
[ 'react' ]
```

Step by step:

```text
t=0    call("r")     args=["r"]      timer -> 300
t=100  call("re")    args=["re"]     clear 300, timer -> 400
t=200  call("rea")   args=["rea"]    clear 400, timer -> 500
t=300  call("reac")  args=["reac"]   clear 500, timer -> 600
t=400  call("react") args=["react"]  clear 600, timer -> 700
t=700  timer fires   fn("react")     results === ["react"]
```

Each call builds a fresh `args` array. Every earlier array becomes unreachable the moment its timer is cleared — that is why nothing accumulates. The survivor closes over `["react"]` and forwards exactly it.

### Complexity

Time: `O(1)` per call plus `O(k)` to build and spread the argument list (`k` = arguments in the pending call). Space: `O(k)` for the pending array, retained only until the timer fires or is cancelled. `fn`'s own runtime is charged to whatever it does.

### Edge Cases

- **Zero arguments:** the rest array is empty, so `fn(...args)` spreads to a call with no arguments rather than one `undefined`.
- **Shrinking argument lists:** the last call wins outright. The debouncer does not remember that earlier calls passed more values.
- **References are shared:** mutating an object argument after the call is visible inside `fn`. If the deferred function needs the value *as of call time*, snapshot it with `structuredClone` or capture a copy.
- **Rest parameters are real arrays**, unlike `arguments`; they work directly with spread and have `Array.prototype` methods.
- **No arity limits:** rest plus spread is engine-managed, so very long argument lists do not hit `Function.prototype.apply`'s argument-count ceiling (an older concern, still worth naming).
- **Cancelled calls leak nothing:** the `args` array is freed along with the cleared timer's closure.

### Interview Follow-ups

- **Preserve `this`** — call `fn.apply(this, args)` and capture the receiver; that is the next problem, and it is where the bare-call bug bites.
- **Surface `fn`'s return value.** Only the *deferred* call has a result, so you must cache it in the closure (`result = fn(...)`), return it from `debounced`, and accept that most calls return `undefined` or a stale value.
- **Reject stale async results.** Forwarding the latest query is only half the problem; a slow response for `"re"` can still land after `"react"`. Discuss an `AbortController` or a request-sequence token.
- **Batch instead of drop.** If every call's payload matters, you want coalescing/batching (`fn(...allArgs)`), not debounce — and you should say so.

### Common Mistakes

- Accumulating arguments across calls and forwarding them together, turning the debouncer into a batcher.
- Capturing the **first** call's arguments and never updating them.
- `fn(args)` instead of `fn(...args)`, which passes one array where `fn` expects separate values.
- Using `arguments` inside an arrow wrapper — arrows have no own `arguments`, so it resolves to the enclosing scope (or throws). The rest parameter is the fix.
- Assuming arguments are snapshotted; they are forwarded by reference.

### Takeaway

A rest parameter plus an arrow callback gives you the last call's arguments for free: the closure owns the newest array and every earlier one is cancelled with its timer. Debounce forwards the *last* call's arguments — never a merge.

## Implement Debounce That Preserves `this`

`Difficulty: Medium` `Probability: Very High`

### Problem

Make the debounced function forward the **receiver** of the most recent call to `fn`, so debouncing an object method (or a class method) does not silently break `this`.

Signature is unchanged, `debounce(fn, wait)`, but the returned wrapper must be a normal function and `fn` must be invoked with an explicit receiver.

Contract:

- The receiver of the **last** call in the burst wins, exactly like the arguments.
- The receiver is captured at *call* time and reattached at *fire* time. After `wait` ms the original call site is gone, so `this` cannot be recovered from the environment; it must have been saved.
- A detached call (`const f = obj.method; f()`) passes `undefined` in strict mode, and that is correct behaviour, not a bug in the debouncer.
- An **arrow** `fn` ignores the receiver entirely; no implementation can inject a `this` into an arrow.

### Examples

```text
const counter = {
  count: 0,
  increment: debounce(function () { this.count += 1; }, 50),
};
counter.increment();
counter.increment();
counter.increment();
// after 50ms => counter.count === 1   (three calls, one increment)

const a = { n: "A", log: debounce(function () { return this.n; }, 50) };
const b = { n: "B", log: a.log };
a.log();   // receiver is a
b.log();   // receiver is b, and it was the LAST call
// after 50ms => fn runs with this === b => "B"

const detached = counter.increment;
detached();
// after 50ms => this === undefined (strict) => TypeError reading this.count
```

### Approach

Capture `const context = this` at the top of each wrapper invocation, then call `fn.apply(context, args)` when the timer fires. The last-one-wins rule is identical to arguments: each invocation captures its own `context` in the arrow's lexical scope, and every earlier capture becomes unreachable when its timer is cleared. The surviving closure holds the last call's receiver and the last call's arguments, together.

Two precision points interviewers probe:

1. **The wrapper must be a `function` expression, never an arrow.** An arrow's `this` is lexical — fixed where it was written — so it can never observe the caller's receiver.
2. **The timeout callback may be either**, with a subtle difference:
   - an **arrow** callback inherits the wrapper's `this` lexically, so `fn.apply(this, args)` would work without a `context` variable at all;
   - a **classic `function`** callback gets its own `this` (the timer's, i.e. `undefined` in strict mode), so it *must* use the captured `context`.

Declaring `context` explicitly works in both cases and states the intent. That is the version to write in an interview.

Why `apply` rather than `call`: `args` is already a real array, and `apply` consumes an array directly. `fn.call(context, ...args)` is equivalent but adds a spread. Why not `fn.bind(context)`: it allocates a fresh bound function on every call and still needs the arguments spliced in.

### Implementation

```javascript
function debounce(fn, wait) {
  let timerId = null;

  // A normal function, NOT an arrow: only a normal function reads `this`
  // from its call site.
  return function (...args) {
    const context = this; // receiver of THIS call; the last one to survive

    if (timerId !== null) clearTimeout(timerId);

    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(context, args); // reattach BOTH the receiver and the arguments
    }, wait);
  };
}
```

The same behaviour with a classic callback, where the explicit capture is mandatory:

```javascript
// Classic `function` callback: `this` here is NOT the wrapper's `this`.
timerId = setTimeout(function () {
  timerId = null;
  fn.apply(context, args); // works only because `context` was captured
}, wait);
```

And the trap, for contrast:

```javascript
// Broken: the arrow wrapper freezes `this` at definition time.
const broken = (fn, wait) => {
  let timerId = null;
  return (...args) => {
    timerId = setTimeout(() => fn.apply(this, args), wait); // `this` is the outer scope
  };
};
```

### Walkthrough

```javascript
const counter = {
  count: 0,
  increment: debounce(function () {
    this.count += 1;
    return this.count;
  }, 100),
};

counter.increment();
counter.increment();
counter.increment();
setTimeout(() => console.log(counter.count), 250);
```

```text
1
```

The trace:

```text
t=0    counter.increment()  context = counter  timer -> 100
t=0    counter.increment()  context = counter  clear, timer -> 100
t=0    counter.increment()  context = counter  clear, timer -> 100
t=100  timer fires          fn.apply(counter, []) => count goes 0 -> 1
```

Now mix the receivers, which is where "the last one wins" becomes visible:

```text
a.log()   context = a   timer -> 50
b.log()   context = b   clear, timer -> 50
t=50      fn.apply(b, []) => "B"
```

Then the detached call:

```text
const f = counter.increment; f();
// wrapper runs in strict mode: this === undefined
// fn.apply(undefined, []) => `this.count` throws TypeError
```

This is faithful. Detaching a method loses its receiver whether or not it is debounced; the debouncer simply relays `undefined` as it received it, without boxing it into `globalThis` (that boxing would happen inside a sloppy-mode `fn`, not here).

### Complexity

Time: `O(1)` per call. Space: `O(1)` additional per pending call — `context` is a single reference; the arguments were already accounted for. The receiver is retained by the closure until the timer fires or is cancelled.

### Edge Cases

- **Last receiver wins.** If two objects share one debounced function, the last caller's object is the one `fn` sees. Pair `context` and `args` from the same call or you leak arguments across receivers.
- **`null`/`undefined` receiver:** forwarded unchanged; a strict `fn` sees `undefined`, a sloppy `fn` sees `globalThis`. No boxing happens in the debouncer.
- **Primitive receiver:** by the time the wrapper runs, the language has already boxed it (`"abc".toUpperCase()` passes a `String` object), so `this` arrives boxed.
- **Class instances:** works; the instance stays alive in the closure for up to `wait` ms after the last call.
- **Arrow `fn`:** ignores `context` entirely. Harmless but inert — do not "fix" it.
- **Receiver garbage-collected?** It cannot be collected while a timer is pending; that retention is the price of deferral.

### Interview Follow-ups

- **Why must the wrapper be a normal function?** `this` is a property of the call, not of the function; arrows replace it with a lexical binding at definition time.
- **Would `fn.bind(this)` work?** For a one-off, yes — but it allocates per call, and you still have to pass `args`. `apply` is the direct primitive.
- **Combine all three** (args + `this` + return value) to get the production shape used by the remaining problems.
- **Class fields:** `this.onResize = debounce(this.onResize, 200)` in a constructor hard-captures the instance and is a common React/vanilla pattern; note that it makes the debouncer instance-specific and harder to share.

### Common Mistakes

- Making the returned wrapper an arrow, so `this` is the defining scope's and every method call breaks silently.
- Calling `fn(...args)` without `.apply`/`.call`, discarding the receiver.
- Reading `this` inside a classic `function` timeout callback instead of in the wrapper, so `context` becomes `undefined` at fire time.
- Storing the receiver separately from the arguments and ending up with the latest `this` but a stale `args`.
- Testing only with an arrow `fn`, which ignores `this`, and concluding the forwarding works.

### Takeaway

`this` obeys the same rule as the arguments: capture the newest call's receiver in the wrapper and reattach it with `fn.apply(context, args)`. The wrapper must be a normal function, because only a normal function takes `this` from its call site.

## Implement Debounce with Immediate (Leading) Execution

`Difficulty: Medium` `Probability: Very High`

### Problem

Add **leading-edge** ("immediate") execution: the first call of a burst invokes `fn` right away, and every call during the following `wait` ms is suppressed. Also called *immediate mode*, and the mode you want for "act once per gesture" rather than "act on the settled value."

Contract:

- The **first** call of a burst invokes `fn` synchronously, before `debounced` returns.
- Calls inside the cooldown window do not invoke `fn`. They do **not** queue a deferred call either — this is leading-*only*, so the trailing edge is silent.
- Every suppressed call re-arms the cooldown, so the window measures time since the *last* call. A continuous stream therefore keeps postponing the next allowed invocation.
- Once `wait` ms pass with no calls, the next call is a "first" call again and fires immediately.
- Because `fn` runs synchronously on the leading call, that call can **return `fn`'s result**. This is the one mode where debounce can hand back a useful value at call time.

### Examples

```text
wait = 300ms, leading-only

t=0     debounced("a")   // fn("a") runs NOW
t=100   debounced("b")   // suppressed; cooldown extends to 400
t=200   debounced("c")   // suppressed; cooldown extends to 500
t=600   debounced("d")   // cooldown expired => fn("d") runs NOW
t=700   debounced("e")   // suppressed; cooldown extends to 1000
5 calls to debounced() => 2 calls to fn()

// the search-box contrast: type "react" at 100ms intervals
t=0     debounced("r")     // fn("r") NOW
t=100..400 debounced(...)  // all suppressed
// fn was called once, with "r" — the LEAST complete query
```

### Approach

The timer changes job. In trailing debounce the timer *causes* the invocation; in leading-only it never calls `fn` at all — it is a **cooldown gate** that expires.

1. Read `const callNow = timerId === null` **before** touching the timer. This is the whole trick: a null slot means no cooldown is active, i.e. this is the first call of a burst.
2. Clear the old timer and arm a fresh one. The callback does nothing but `timerId = null`, marking the cooldown over. Re-arming on every call is what makes the window slide forward.
3. If `callNow`, invoke `fn` synchronously with this call's receiver and arguments and return its result. Otherwise return nothing.

The ordering in step 1 is load-bearing. Re-arming in step 2 sets `timerId` non-null, so a check placed afterwards would always report "not first" and `fn` would never run.

On the sliding window: because suppressed calls reset the timer, a burst that never goes quiet never produces a second leading call. That is debounce semantics. If instead you leave the timer alone on suppressed calls, you get "at most one invocation per `wait` ms," which is throttle semantics — a good thing to point out when an interviewer asks you to distinguish them.

### Implementation

```javascript
function debounce(fn, wait) {
  let timerId = null;

  return function (...args) {
    const context = this;

    // Read the gate BEFORE re-arming it, or this is always false.
    const callNow = timerId === null;

    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null; // the cooldown expired; the next call may fire immediately
    }, wait);

    if (callNow) return fn.apply(context, args); // synchronous leading invocation
  };
}
```

Folding it into the classic `immediate` flag so trailing and leading share one function:

```javascript
function debounce(fn, wait = 0, immediate = false) {
  let timerId = null;

  return function (...args) {
    const context = this;

    if (!immediate) {
      // Trailing mode (problems 1-3): the timer performs the invocation.
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        fn.apply(context, args);
      }, wait);
      return undefined;
    }

    // Leading mode: the timer only gates; it never invokes fn.
    const callNow = timerId === null;
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => { timerId = null; }, wait);
    if (callNow) return fn.apply(context, args);
  };
}
```

### Walkthrough

Leading-only search, the same input that trailing debounce handled so well:

```javascript
let calls = 0;
const search = debounce((q) => {
  calls += 1;
  console.log(`search(${q}) -> call #${calls}`);
}, 300);

["r", "re", "rea", "reac", "react"].forEach(
  (q, i) => setTimeout(() => search(q), i * 100),
);
setTimeout(() => console.log(`total: ${calls}`), 1200);
```

```text
search(r) -> call #1
total: 1
```

```text
t (ms)  call             timerId before  result
------  ---------------  --------------  ---------------------------
0       search("r")      null            callNow -> fn("r") NOW; gate -> 300
100     search("re")     set             suppressed; clear 300, gate -> 400
200     search("rea")    set             suppressed; gate -> 500
300     search("reac")   set             suppressed; gate -> 600
400     search("react")  set             suppressed; gate -> 700
700     --               cleared         cooldown over
```

One invocation in five calls — the same *count* as trailing debounce, but it fired at `t=0` with `"r"`, the least useful query, and `"react"` is never sent. That is the trade: leading gives instant feedback but loses the final value; trailing gives the final value but with `wait` ms of latency.

Now show a fresh burst after the cooldown, which is where leading differs visibly from "once and done":

```text
t=900   search("vue")   timerId null => callNow -> fn("vue") NOW
t=950   search("vu")    suppressed; gate -> 1250
```

### Complexity

Time: `O(1)` per call; `fn` runs synchronously at most once per burst. Space: `O(1)` per closure, and suppressed calls' arguments are discarded immediately, so there is no retention.

### Edge Cases

- **Return value:** the leading call returns `fn`'s result. Suppressed calls return `undefined` unless you cache and replay the last result.
- **A continuous stream never fires twice.** Each suppressed call slides the gate forward; if calls never stop, the second leading invocation never comes. This is intended debounce behaviour, not a bug.
- **`fn` throws:** the exception propagates synchronously to the caller of `debounced`. In trailing mode the same throw happens later, inside a timer task, so the two modes differ observably in error handling.
- **`wait = 0`:** the first of two synchronous calls fires and the second is suppressed, because `setTimeout(..., 0)` still sets `timerId` for a macrotask. Counterintuitive but correct.
- **Arguments of suppressed calls are dropped**, not deferred. Leading mode uses the *first* call's payload, the opposite of trailing mode.
- **`this`** comes from the leading call only.
- **No retention:** nothing is captured across the window, so a leading-only debouncer cannot keep objects alive.

### Interview Follow-ups

- **Combine leading and trailing** (the next problem) so a burst gets an immediate call *and* a final call, with a rule for when the trailing call is redundant.
- **Why compute `callNow` first?** Re-arming the timer makes the slot non-null, so a later check would always be false.
- **What if suppressed calls did not reset the gate?** Then it is "at most one call per `wait`," which is throttling. Explain when each is appropriate.
- **Where does leading fit in UI work?** Submit/like button double-click suppression, starting a drag, kicking off a fetch on first keystroke, firing analytics once per gesture. Trailing fits search, autosave, form validation, and resize-end.

### Common Mistakes

- Reading `timerId === null` *after* scheduling the timeout, so `callNow` is always false and nothing ever fires.
- Letting the timer callback call `fn` — that is trailing behaviour and produces a double invocation when combined with the leading call.
- Assuming the last call's arguments are used; leading mode uses the first.
- Forgetting that suppressed calls extend the window, then being surprised a long burst fires only once.
- Dropping `fn`'s return value, giving up the one advantage leading mode offers.

### Takeaway

In leading mode the timer stops invoking `fn` and becomes a cooldown gate. Read `timerId === null` before re-arming, invoke `fn` synchronously when it was null, and let the timer only expire.

## Implement Debounce with Leading and Trailing Execution

`Difficulty: Hard` `Probability: Very High`

### Problem

Generalise to `debounce(fn, wait, { leading = false, trailing = true })` and support all four combinations with one implementation. This is the version production libraries ship and the one where senior interviews push hardest: the difference between "leading and trailing are both enabled" and "`fn` always runs twice" is the whole question.

Contract:

- `{ leading: false, trailing: true }` — classic debounce: invoke once, `wait` ms after the **last** call, with the last call's arguments.
- `{ leading: true, trailing: false }` — immediate-only: invoke once on the **first** call, with the first call's arguments.
- `{ leading: true, trailing: true }` — invoke on the leading edge, **and on the trailing edge only if the debounced function was called again during the window**. An isolated call invokes `fn` exactly once (leading); a burst of two or more invokes it at the start and once more at the end.
- `{ leading: false, trailing: false }` — the debouncer is inert: it swallows every call. Confirm the options before accepting them from a config object.
- `debounced` returns the most recent value `fn` returned.

The invariant that makes the middle two cases work: **every invocation consumes the pending argument list.** If the leading call consumed it and nothing new arrived, there is nothing to deliver at the trailing edge, so it stays silent.

### Examples

```text
wait = 300ms

// leading + trailing, an ISOLATED call -> ONE invocation
debounced("solo");          // leading: fn("solo") now
// ...300ms of silence...   // lastArgs is null => no trailing call

// leading + trailing, a BURST -> TWO invocations
t=0     debounced("r")      // leading: fn("r")
t=100   debounced("re")
t=200   debounced("rea")
t=300   debounced("reac")
t=400   debounced("react")
t=700   --                  // trailing: fn("react")

// the four modes applied to a three-call burst ("a","b","c")
leading  trailing   invocations
-------  ---------  ------------------------------------------
false    true       fn("c")                 once, at the end
true     false      fn("a")                 once, at the start
true     true       fn("a"), then fn("c")   twice
false    false      (none)                  every call is dropped
```

### Approach

Model it as a small state machine with three closure slots and a result cache:

- `timerId` — non-null while a window is open. It is the single source of truth for "is this the first call of the burst?"
- `lastArgs` / `lastThis` — the pending trailing payload. `null` means "nothing to deliver." This is the clever part: instead of a separate `leadingFired` boolean, the **presence of the payload** encodes "has anything happened since the last invocation?"
- `result` — the last value `fn` returned, so `debounced` can hand back something useful.

`invoke()` calls `fn.apply(lastThis, lastArgs)` and then **clears** both slots. Consuming the payload is what links the two edges: after a leading call the payload is empty, so a trailing call with nothing new in between is automatically suppressed.

`onTimeout()` runs when the window closes: set `timerId = null`, then invoke if `trailing && lastArgs !== null`; otherwise discard the pending slots so their argument objects can be collected.

`debounced(...args)` is then five lines:
1. store `lastArgs = args`, `lastThis = this`;
2. `const isFirst = timerId === null` — read the gate before re-arming it;
3. if `isFirst && leading`, `invoke()` — this consumes the payload and fires the leading edge;
4. clear and re-arm the timer (the sliding window);
5. return `result`.

Trace the four modes through it:

```text
mode                     what happens
-----------------------  ----------------------------------------------------
leading:false,           step 3 skipped, lastArgs holds the last call;
trailing:true            timeout invokes it. One call, at the end.

leading:true,            step 3 consumes the first call's args; later calls
trailing:false           refill lastArgs but `trailing` is false, so the
                         timeout discards them. One call, at the start.

leading:true,            step 3 consumes call 1; calls 2..n refill lastArgs;
trailing:true            timeout invokes the refill. Isolated call => one
                         invocation; burst => two.

leading:false,           every call is stored and then discarded.
trailing:false           Nothing ever fires.
```

Why derive "anything new?" from `lastArgs` rather than a boolean: a boolean must be reset in at least two places (the timeout and any future `cancel`), and every missed reset turns into a spurious or missing invocation. A payload that is consumed by the same function that uses it cannot desynchronise.

One naming trap: `isFirst` means "no window is currently open," not "the first call ever." After `onTimeout` sets `timerId = null`, the next call is a leading call again.

### Implementation

```javascript
function debounce(fn, wait = 0, { leading = false, trailing = true } = {}) {
  let timerId = null;  // non-null while a window is open
  let lastArgs = null; // pending trailing payload; null => nothing to deliver
  let lastThis = null; // receiver for the pending trailing call
  let result;          // last value returned by fn

  function invoke() {
    const args = lastArgs;
    const context = lastThis;
    lastArgs = null;   // CONSUME: this is what suppresses a redundant trailing call
    lastThis = null;
    result = fn.apply(context, args);
    return result;
  }

  function onTimeout() {
    timerId = null; // the window has closed
    if (trailing && lastArgs !== null) {
      invoke(); // deliver the pending call, if the leading edge did not already
    } else {
      lastArgs = null; // release references we are not going to use
      lastThis = null;
    }
  }

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;

    const isFirst = timerId === null;   // read the gate BEFORE re-arming it
    if (isFirst && leading) invoke();   // leading edge consumes the payload

    if (timerId !== null) clearTimeout(timerId); // sliding window
    timerId = setTimeout(onTimeout, wait);

    return result;
  }

  return debounced;
}
```

### Walkthrough

Leading plus trailing on the search box, with the real call counts:

```javascript
let calls = 0;
const search = debounce(
  (q) => { calls += 1; console.log(`search(${q}) -> call #${calls}`); return q; },
  300,
  { leading: true, trailing: true },
);

["r", "re", "rea", "reac", "react"].forEach(
  (q, i) => setTimeout(() => search(q), i * 100),
);
setTimeout(() => console.log(`total: ${calls}`), 1200);
```

```text
search(r) -> call #1
search(react) -> call #2
total: 2
```

```text
t (ms)  call      lastArgs before  isFirst  effect
------  --------  ---------------  -------  ------------------------------------
0       "r"       null             true     leading invoke -> fn("r"); lastArgs = null
                                            timer -> 300
100     "re"      null             false    lastArgs = ["re"];  timer -> 400
200     "rea"     ["re"]           false    lastArgs = ["rea"]; timer -> 500
300     "reac"    ["rea"]          false    lastArgs = ["reac"]; timer -> 600
400     "react"   ["reac"]         false    lastArgs = ["react"]; timer -> 700
700     timeout   ["react"]        --       trailing invoke -> fn("react")
```

Two invocations: the immediate `"r"` for responsiveness, and the settled `"react"` for correctness.

Now the rule that trips people up — an isolated call:

```text
t=0     call("solo")  lastArgs = ["solo"]; isFirst -> leading invoke consumes it,
                      lastArgs = null; timer -> 300
t=300   timeout       lastArgs is null => NO trailing invoke
total: 1 invocation
```

Leading + trailing does **not** mean "always two calls." It means "call at the start, and call again at the end only if more input arrived after the first call." The `lastArgs = null` inside `invoke()` is precisely the mechanism that expresses "nothing new arrived."

For completeness, the same burst in trailing-only mode calls `fn` once, at `t=700`, with `"react"`; leading-only calls it once, at `t=0`, with `"r"`.

### Complexity

Time: `O(1)` per call plus `O(k)` for the pending argument list. Space: `O(1)` plus the pending arguments; at most two `fn` invocations per window, and the argument array is released as soon as it is consumed or discarded.

### Edge Cases

- **Single isolated call with both edges enabled fires once, not twice.** This is the defining test and the most common bug.
- **`{ leading: false, trailing: false }`** makes the debouncer inert; every call is swallowed. Validate options if they come from user config.
- **`trailing: false`** leaves `lastArgs` populated between invocations; `onTimeout` clears it so argument objects are not retained for the lifetime of the debouncer.
- **Re-entrancy:** if `fn` calls `debounced` during the leading invocation, `lastArgs` is refilled and a trailing call follows. Verified behaviour: two invocations.
- **Window boundary race:** a call landing at exactly `wait` ms races the timer task; the outcome depends on task order. Never build logic on `wait ± 0`.
- **`wait = 0`** with both edges enabled: the leading call fires, and a second synchronous call within the same macrotask can produce a trailing call on the next task. Test it rather than assuming.
- **Async `fn`:** `invoke` does not await; a rejected promise is unhandled unless you attach a `.catch` inside your own `fn`.
- **Stale `result`:** in trailing mode `debounced` returns the *previous* window's result until the current one fires. If callers depend on the return value, say so explicitly.

### Interview Follow-ups

- **Add `cancel()` and `flush()`** — the next two problems. Once `timerId` and `lastArgs` are the state, both are a handful of lines.
- **Implement `throttle` on top of `debounce`** with lodash's `maxWait`: a debouncer that is called continuously still fires at least every `maxWait` ms. That is the formal relationship between the two utilities.
- **Why track "anything new?" with `lastArgs` instead of a boolean?** One source of truth, consumed by the function that uses it, so it cannot drift out of sync across leading calls, timeouts, cancels, and re-entrant calls.
- **Produce the truth table** for `{ leading, trailing }` × (isolated call | burst). That table is the clearest possible interview answer.

### Common Mistakes

- Invoking on the trailing edge unconditionally under `leading: true`, so isolated calls run `fn` twice.
- Using a `leadingFired` boolean and forgetting to reset it in `onTimeout`, which makes the *next* burst silently skip its leading call.
- Reading `isFirst` after arming the timer, so it is always false and the leading edge never fires.
- Not clearing `lastArgs` in `onTimeout` when `trailing` is false, retaining argument objects indefinitely.
- Believing "leading and trailing" means "always two invocations" — it means "two only if the burst is longer than one call."
- Forgetting that the leading and trailing calls carry different arguments (`"r"` versus `"react"`) whenever the burst has more than one call.

### Takeaway

Leading plus trailing is a three-slot state machine: `timerId` says whether a window is open, `lastArgs` says whether anything is pending, and `invoke()` clears `lastArgs` so a leading call automatically cancels a redundant trailing one. That single consume-on-invoke rule is what makes an isolated call fire once while a burst fires twice.

## Add `debounced.cancel()`

`Difficulty: Medium` `Probability: High`

### Problem

Add `debounced.cancel()` so a caller can discard a pending invocation: the timer is cleared, `fn` will not be called for it, and the stored arguments and receiver are released.

```javascript
const debounced = debounce(fn, wait, options);
debounced.cancel(); // => undefined
```

Contract:

- The pending invocation is **dropped**, not merely delayed. `fn` is never called for it.
- The pending argument list and receiver are released so they can be garbage-collected.
- `cancel()` is **idempotent**: calling it with nothing pending is a no-op, never a throw.
- After `cancel()`, the debouncer is in its pristine state. The next call is treated as the first call of a new burst, so with `leading: true` it fires **immediately**.
- `cancel()` never undoes an invocation that already happened — it only affects the future.
- Our implementation preserves the cached `result` (the last successful value remains valid). Some implementations reset it; pick one and document it.

### Examples

```text
const d = debounce(fn, 100, { leading: true, trailing: true });

d("a");         // leading edge -> fn("a") runs now
d("b");         // pending trailing call stored
d.cancel();     // pending trailing call dropped
// after 100ms => fn was called exactly once, with "a"

d.cancel();     // no-op: nothing pending, no throw

d("c");         // pristine state => leading edge -> fn("c") runs now
// total invocations: fn("a"), fn("c")

// the real-world shape: teardown
function mount(input) {
  const save = debounce(() => persist(input.value), 500);
  input.addEventListener("input", save);
  return () => {
    save.cancel();                          // drop any in-flight save
    input.removeEventListener("input", save);
  };
}
```

### Approach

`cancel` is closure surgery, not a new algorithm. Three slots define the pending invocation, and all three must be reset:

1. `clearTimeout(timerId)` — remove the scheduled callback so it can never run.
2. `timerId = null` — close the window. This is what restores the "first call" behaviour: with `leading: true`, the next call sees `timerId === null` and invokes immediately.
3. `lastArgs = null; lastThis = null` — drop the payload and the receiver reference. Clearing the timer alone would leave arguments captive in the closure for the debouncer's lifetime, and would leave the payload inconsistent with the gate.

Because `clearTimeout(null)` is harmless, the `if (timerId !== null)` guard is optional; the explicit check is kept because it states the intent and mirrors the gate logic used elsewhere.

The one place `cancel` is genuinely *not* in control: if the timer callback has already been dequeued and is executing, `cancel()` cannot interrupt it. Timers are single-threaded tasks; by the time `cancel` runs, the invocation has happened. So `cancel` is best-effort against an already-fired timer, and exactly reliable against a pending one.

### Implementation

```javascript
function debounce(fn, wait = 0, { leading = false, trailing = true } = {}) {
  let timerId = null;
  let lastArgs = null;
  let lastThis = null;
  let result;

  function invoke() {
    const args = lastArgs;
    const context = lastThis;
    lastArgs = null;
    lastThis = null;
    result = fn.apply(context, args);
    return result;
  }

  function onTimeout() {
    timerId = null;
    if (trailing && lastArgs !== null) invoke();
    else { lastArgs = null; lastThis = null; }
  }

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    const isFirst = timerId === null;
    if (isFirst && leading) invoke();
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(onTimeout, wait);
    return result;
  }

  // NEW: discard the pending invocation and return to a pristine state.
  debounced.cancel = function () {
    if (timerId !== null) clearTimeout(timerId);
    timerId = null;  // window closed => the next call is a leading call again
    lastArgs = null; // drop the payload and everything it references
    lastThis = null;
    // `result` is deliberately kept: the last successful value is still valid.
  };

  return debounced;
}
```

### Walkthrough

The verified trace: a leading call, a pending trailing call that gets cancelled, then a fresh call that leads again.

```javascript
const fires = [];
const d = debounce((q) => fires.push(q), 60, { leading: true, trailing: true });

d("x");       // leading edge -> fn("x") -> fires = ["x"]
d("y");       // stored as the pending trailing call
d.cancel();   // drop it

setTimeout(() => {
  console.log(fires); // nothing new happened while we were cancelled
  d("z");             // pristine state -> leading edge -> fn("z")
}, 150);

setTimeout(() => console.log(fires), 300);
```

```text
[ 'x' ]
[ 'x', 'z' ]
```

```text
step          timerId   lastArgs    result   effect
------------  --------  ----------  -------  -------------------------------
d("x")        set(60)   null        "x"      leading invoke consumed the payload
d("y")        set(60)   ["y"]                pending trailing call stored
d.cancel()    null      null        "x"      timer cleared, payload dropped
t=150         null      null        "x"      fires === ["x"]  (no "y", ever)
d("z")        set(60)   null        "z"      isFirst true -> leading invoke
t=210         null      null        "z"      no further calls -> nothing
```

`"y"` never reaches `fn`, and because `cancel` set `timerId = null` the very next call at `t=150` was treated as a leading call rather than as a continuation of the cancelled burst.

### Complexity

Time: `O(1)`. Space: `O(1)`, and it actively *frees* the pending argument array and the receiver reference that the closure was holding.

### Edge Cases

- **Idempotent:** `cancel()` on a clean debouncer does nothing and returns `undefined`.
- **Fresh-start semantics:** after cancelling, an immediate next call leads again. The window was closed, not paused.
- **Already-fired invocation:** cancel cannot retract a call that already ran. If the timer fired in the same turn, `timerId` is already `null` and `cancel` is a no-op.
- **Race at the boundary:** a call arriving at exactly `wait` ms races the timer task. Whichever is dequeued first wins; `cancel` cannot change that.
- **Teardown leaks:** skipping `cancel` in effect cleanup leaves a live timer, delays teardown, and can fire fetches after a component unmounts.
- **Reference retention:** clearing `lastThis` matters when the receiver is a large component instance or DOM node; without it the closure pins the object until the timer fires or the debouncer is collected.
- **`result` policy:** ours survives a cancel. If you want a hard reset, also assign `result = undefined`; just be explicit about which contract you implement.
- **Attached property:** `cancel` lives on the returned function object, so it disappears if someone wraps or spreads it (`{ ...debounced }` loses it). Pass the function itself around.

### Interview Follow-ups

- **Add `flush()`** (next problem). `cancel` and `flush` are the two halves of the control surface: drop the pending call, or run it now.
- **Should `cancel` reset the leading gate?** Yes — clearing `timerId` is what lets the next call lead again, which is exactly what teardown-then-reuse needs.
- **Where do you call `cancel` in practice?** `useEffect` cleanup, router navigation guards, store subscription teardown, `AbortController` abort handlers, `visibilitychange`/`pagehide` handlers.
- **Alternative API:** return `{ run, cancel, flush }` instead of hanging methods off the function. Discuss the trade: a callable object is more ergonomic; a plain object is more discoverable and easier to fake in tests.

### Common Mistakes

- Clearing the timer but leaving `lastArgs`/`lastThis` set, retaining references and leaving the payload inconsistent with the gate.
- Forgetting `timerId = null`, so the next call is seen as "not first" and the leading edge stops firing for good.
- Assuming `cancel` can stop an invocation that already happened.
- Cancelling without removing the event listener, so the next event immediately re-creates the pending call.
- Throwing when nothing is pending, which makes cleanup callbacks noisy and forces defensive `try`/`catch`.

### Takeaway

`cancel` closes the window and drops the payload: `clearTimeout`, `timerId = null`, `lastArgs = null`, `lastThis = null`. Clearing the timer id restores pristine "first call" behaviour; clearing the payload makes the drop complete, leak-free, and unambiguous for any later `flush`.

## Add `debounced.flush()`

`Difficulty: Medium` `Probability: High`

### Problem

Add `debounced.flush()`: if a trailing invocation is pending, run it **now**, synchronously, and return `fn`'s result. If nothing is pending, return the last known result without calling `fn`.

```javascript
const debounced = debounce(fn, wait, options);
debounced.flush(); // => the pending (or last) result from fn
```

Contract:

- If a pending trailing payload exists, `flush()` invokes `fn` immediately with the stored arguments and receiver, cancels the timer, closes the window, and returns `fn`'s result.
- If nothing is pending, `flush()` does not call `fn`; it returns the last cached `result`, which is `undefined` if `fn` has never run.
- After `flush()` the window is closed, so the next call is a fresh first call (leading applies again).
- `flush()` does not re-run a leading invocation that already happened; it only delivers a pending trailing one.
- `flush()` is idempotent: a second consecutive call runs `fn` once in total and returns the same result.
- It is **synchronous**. That is the point: it exists for moments when the event loop will not get another turn — an assertion in a test, a navigation, a page being unloaded.

### Examples

```text
const d = debounce(fn, 100, { leading: false, trailing: true });

d("x");
d("y");
d.flush();      // fn("y") runs NOW, synchronously; returns fn's result
d.flush();      // no-op, returns the same last result

// leading + trailing, an isolated call -> nothing is pending
const d2 = debounce(fn, 100, { leading: true, trailing: true });
d2("solo");     // leading call already consumed the payload
d2.flush();     // does NOT call fn again; returns the leading result

// cancel then flush: flush is a harmless no-op
d.cancel();
d.flush();      // returns the last result; fn is not called

// flush before the page goes away
window.addEventListener("pagehide", () => save.flush());
```

### Approach

`flush` reuses the exact `invoke()` the timeout uses — there is only one code path that calls `fn`, which is the reason the state machine was built this way. The logic is a two-step guard:

1. If `timerId === null`, no window is open, so nothing can be pending: return the cached `result`.
2. Otherwise clear the timer and set `timerId = null`.
3. If `trailing && lastArgs !== null`, `return invoke()`. Otherwise clear both slots and return `result`.

Both guards earn their place:

- `timerId === null` makes `flush` compose with `cancel` for free. `cancel` already cleared the timer id, so a subsequent `flush` cannot resurrect a dropped call — no extra coordination needed between the two methods.
- `lastArgs !== null` covers `trailing: false` (nothing is ever pending) and the case where a leading invocation already consumed the payload. Without it, `flush` after a leading call would fire `fn` a second time with `null` arguments.

Contrast `flush` with simply calling `debounced` again: that would *restart* the window and defer the work, which is the opposite of what a flush is for. `flush` delivers the stored invocation and tears the window down.

### Implementation

```javascript
function debounce(fn, wait = 0, { leading = false, trailing = true } = {}) {
  let timerId = null;
  let lastArgs = null;
  let lastThis = null;
  let result;

  function invoke() {
    const args = lastArgs;
    const context = lastThis;
    lastArgs = null;
    lastThis = null;
    result = fn.apply(context, args);
    return result;
  }

  function onTimeout() {
    timerId = null;
    if (trailing && lastArgs !== null) invoke();
    else { lastArgs = null; lastThis = null; }
  }

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    const isFirst = timerId === null;
    if (isFirst && leading) invoke();
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(onTimeout, wait);
    return result;
  }

  debounced.cancel = function () {
    if (timerId !== null) clearTimeout(timerId);
    timerId = null;
    lastArgs = null;
    lastThis = null;
  };

  // NEW: deliver the pending trailing call right now, synchronously.
  debounced.flush = function () {
    if (timerId === null) return result; // no window open => nothing pending

    clearTimeout(timerId); // the timeout must not also fire
    timerId = null;        // close the window

    if (trailing && lastArgs !== null) return invoke();
    lastArgs = null;
    lastThis = null;
    return result;
  };

  return debounced;
}
```

### Walkthrough

The verified trace: trailing-only, two calls, flushed before the timer fires.

```javascript
const d = debounce(
  (q) => { console.log(`fn(${q})`); return `handled:${q}`; },
  100,
  { leading: false, trailing: true },
);

d("x");
d("y");
console.log(d.flush()); // fn("y") runs synchronously inside this call
console.log(d.flush()); // nothing pending: no fn call
setTimeout(() => console.log("done"), 200);
```

```text
fn(y)
handled:y
handled:y
done
```

```text
step                  timerId   lastArgs   output
--------------------  --------  ---------  ---------------------------------
d("x")                set(100)  ["x"]      --
d("y")                set(100)  ["y"]      --
console.log(d.flush)  null      null       fn(y) then "handled:y"
console.log(d.flush)  null      null       "handled:y"   (no second fn call)
t=200                 null      null       "done"        (no pending timer)
```

Note what did *not* happen at `t=100`: `flush` cleared the timer, so the `onTimeout` callback never ran and `fn` was called exactly once, with `"y"` — the latest arguments.

Now the leading case, where the payload was already consumed:

```text
const d2 = debounce(fn, 100, { leading: true, trailing: true });
d2("solo")   // leading: fn("solo"); lastArgs = null; timerId set
d2.flush()   // timerId set, but lastArgs === null => no invoke; returns fn's result
d2.flush()   // timerId null => returns the cached result
```

`fn` ran once — the leading invocation — and neither flush produced a duplicate. That is the `lastArgs !== null` guard doing its job.

### Complexity

Time: `O(1)`; `fn` runs at most once. Space: `O(1)`, and a flush releases the pending argument array and receiver just like the timeout does.

### Edge Cases

- **Nothing pending:** returns the cached `result` (`undefined` if `fn` never ran) and calls nothing.
- **After `cancel()`:** `timerId` is already `null`, so flush is a no-op. The two methods compose without extra bookkeeping.
- **`trailing: false`:** no trailing payload is ever stored, so flush never invokes; it returns `result`. (With leading-only, `result` is the last leading call's value.)
- **Leading + trailing, isolated call:** the leading call consumed the payload, so flush does not double-invoke.
- **Idempotent:** a second flush finds `timerId === null` and returns immediately.
- **`fn` throws during flush:** the exception propagates synchronously to the flush caller, and because the window was closed first, the debouncer is left in a consistent state.
- **Async `fn`:** flush returns the promise but does not await it. A flush on page unload cannot wait for network I/O; you need `fetch(..., { keepalive: true })` or `navigator.sendBeacon`.
- **Unload events:** prefer `pagehide`/`visibilitychange` over `beforeunload`; browsers may tear the page down regardless.
- **Deterministic tests:** `d("q"); d.flush(); expect(fn).toHaveBeenCalledOnce()` needs no fake timers — the main practical reason to ship `flush` at all.

### Interview Follow-ups

- **`cancel` vs `flush`:** `cancel` drops the pending call; `flush` delivers it. Both close the window and both leave the debouncer ready to lead again.
- **Why guard on `timerId` before `lastArgs`?** It makes `cancel` + `flush` compose with no shared flags, and it short-circuits the common "nothing in flight" case.
- **Where does `flush` matter in production?** Persisting an autosave before navigation, committing a draft on `pagehide`, forcing pending validation before submit, and making unit tests deterministic.
- **Testing strategy:** use `flush` to test the debouncer's logic and fake timers only to test the timing itself; mixing the two usually means the test is asserting scheduler behaviour rather than your code.

### Common Mistakes

- Implementing flush as another call to `debounced`, which restarts the timer instead of delivering the pending work.
- Invoking unconditionally, so a flush after a leading call fires `fn` twice.
- Forgetting to `clearTimeout`, so the original timer fires later and duplicates the invocation.
- Not setting `timerId = null`, so the next call is mistakenly treated as non-first and the leading edge stops working.
- Assuming flush awaits an async `fn`, then losing the request when the page navigates away.
- Relying on `beforeunload` alone to flush network requests.

### Takeaway

`flush` is the synchronous twin of the timeout: close the window, then run `invoke()` if and only if a trailing payload is pending. Guarding on `timerId === null` makes it compose with `cancel` for free, and guarding on `lastArgs !== null` is what prevents a duplicate invocation after a leading call.

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

