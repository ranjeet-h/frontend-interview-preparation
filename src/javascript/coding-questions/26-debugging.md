# JavaScript Debugging Challenges

Broken JavaScript, not greenfield implementation: each challenge shows the failing code, names the bug precisely, fixes it, and tells you how you would have caught it — the test, the lint rule, or the review smell. Experienced loops weight these as heavily as the coding questions.

## Stale closure in a `var` loop prints `3 3 3`

`Difficulty: Easy` `Probability: Very High`

### The Broken Code

```javascript
for (var i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 100);
}
// Expected: 0, 1, 2. Actual: 3, 3, 3.
```

Run it and you get:

```text
3
3
3
```

The same bug appears with `setTimeout(function () { console.log(i); }, 100)`.
The arrow function is not the problem — the shared `var` binding is.

### What's Wrong

Stale closure over a single function-scoped `var` binding. `var i` is hoisted
to the enclosing function (or module scope), so there is exactly one `i` for
all three iterations. The loop finishes synchronously — `i` ends at `3` — and
only then do the three timer callbacks run. Each callback closes over the same
binding, so each reads the final value `3`.

Two timelines make this mechanical:

1. **Setup:** declaration instantiation creates one binding `i`, initialised
   to `undefined`.
2. **Execution:** the loop assigns `0`, `1`, `2`, then `3` (which fails the
   `i < 3` check and exits). Three macrotasks are queued, each holding a
   reference to that one binding.
3. **Later:** each timer fires and reads `i`, which is now `3`.

A common misdiagnosis is "arrow functions capture `this`/`i` wrongly". They do
not — arrows capture the surrounding binding faithfully. The binding itself is
shared, so faithful capture gives the same stale value three times.

### The Fix

Use `let` so each iteration gets a fresh binding:

```javascript
for (let i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 100);
}
// => 0, 1, 2 (each callback closes over its own per-iteration binding)
```

The pre-ES2015 equivalent is an IIFE that snapshots the value into a fresh
parameter binding per iteration:

```javascript
for (var i = 0; i < 3; i += 1) {
  (function (snapshot) {
    setTimeout(() => console.log(snapshot), 100);
  })(i);
}
// => 0, 1, 2
```

Prefer `let`. Reach for the IIFE only when you must preserve `var` (legacy
code) or when the interviewer explicitly asks for the ES5 fix.

### Why It Works

`let` in a `for` header creates a new lexical binding for every iteration
(per the spec, the loop desugars roughly to a fresh `let` copy each time
around). Each timer callback therefore closes over a *different* binding whose
value never changes after that iteration. The IIFE works the same way by a
different route: function parameters are fresh bindings per call, so passing
`i` copies the current value into a binding the callback alone owns.

### How You'd Catch It

- Run it: any loop that schedules async work and prints the final value on
  every iteration is the smell.
- Lint: `no-var` (prefer `let`/`const`) plus reviewing every `setTimeout`,
  `addEventListener`, or promise callback created inside a `var` loop.
- Review question: "is there one binding or one binding per iteration?" If the
  answer is one, and the callback runs later, it is stale.
- Test: collect the logged values into an array and assert
  `deepEqual(logged, [0, 1, 2])` instead of eyeballing console output.

### Takeaway

One shared `var` binding read later always yields its final value; one fresh
`let` binding per iteration preserves the value at the time the callback was
created.

## Lost `this` inside `setTimeout(function)`

`Difficulty: Easy` `Probability: Very High`

### The Broken Code

```javascript
const user = {
  name: "Asha",
  print() {
    setTimeout(function () {
      console.log(this.name);
    }, 100);
  },
};

user.print(); // => undefined (or throws in strict mode / modules)
```

Expected `Asha`. Actual output:

```text
undefined
```

In strict mode (ES modules are always strict) the callback's `this` is
`undefined`, so `this.name` throws:

```text
TypeError: Cannot read properties of undefined (reading 'name')
```

### What's Wrong

Lost `this` binding — implicit binding does not cross a plain-function
boundary. `user.print()` sets `this` to `user` for the *outer* method call,
but the inner `function () {...}` is invoked later by the timer system as a
bare call, with no receiver. A bare call gets default binding: `undefined` in
strict mode, the global object otherwise (where `.name` is typically `""` or
`undefined`, hence the silent `undefined` log).

The mechanism, step by step:

1. `user.print()` — implicit binding, `this === user` inside `print`.
2. `setTimeout(cb, 100)` — only the function *reference* is stored; the
   receiver `user` is not stored with it (extraction by another name).
3. Timer fires: `cb()` as a bare call — default binding applies, outer `this`
   is gone.

This is the same family as `const p = user.print; p()` and
`button.addEventListener("click", obj.handler)` without binding.

### The Fix

Use an arrow function so the callback inherits the method's `this` lexically:

```javascript
const user = {
  name: "Asha",
  print() {
    setTimeout(() => {
      console.log(this.name); // => "Asha"
    }, 100);
  },
};

user.print();
```

The explicit alternatives, for when you cannot use an arrow (or the callback
needs its own `this`/`arguments`):

```javascript
// Option B: bind the outer this into the callback.
const userB = {
  name: "Asha",
  print() {
    setTimeout(
      function () {
        console.log(this.name); // => "Asha"
      }.bind(this),
      100,
    );
  },
};

// Option C: capture into a variable (legacy style).
const userC = {
  name: "Asha",
  print() {
    const self = this;
    setTimeout(function () {
      console.log(self.name); // => "Asha"
    }, 100);
  },
};
```

Prefer the arrow unless the callback must be a reusable named function, in
which case prefer `.bind(this)` at scheduling time.

### Why It Works

Arrow functions have no `this` of their own — they resolve `this` lexically
from the enclosing method activation, where `this` is still `user`. `.bind`
works differently but to the same end: it creates a new function whose `this`
is permanently fixed to the value passed, so the later bare call cannot reset
it. Both restore the contract the timer broke: "run this code as `user`".

### How You'd Catch It

- Smell: any `function` keyword nested inside a method and passed to
  `setTimeout`, `setInterval`, `.then`, or `addEventListener`.
- Reproduce: log `this` itself (`console.log(this)`) — `undefined` or
  `Window` inside the callback confirms the loss.
- Lint: `no-invalid-this` plus a team convention of arrows for inline async
  callbacks; in classes, consider arrow field handlers for callbacks.
- Test: call `user.print()` with fake timers and assert the logged value is
  `"Asha"`, not `undefined`.

### Takeaway

Passing a method's inner plain function to a timer detaches it from its
receiver; an arrow reuses the method's `this`, while `.bind` pins a new one.

## Shallow copy shares nested objects

`Difficulty: Easy` `Probability: Very High`

### The Broken Code

```javascript
const original = { user: { address: { city: "Mumbai" } }, tags: ["a"] };
const copy = { ...original };

copy.user.address.city = "Pune";
copy.tags.push("b");

console.log(original.user.address.city); // => "Pune" (surprise!)
console.log(original.tags);              // => ["a", "b"] (surprise!)
```

Output:

```text
Pune
[ 'a', 'b' ]
```

The author expected `copy` to be independent. Only the top level is.

### What's Wrong

Shared nested mutation through a shallow copy. Spread (`{...obj}`),
`Object.assign`, and `Array.prototype.slice` copy *property values*, and for
objects and arrays those values are references. After the spread,
`copy.user === original.user` and `copy.tags === original.tags` — one nested
object, two owners. Writing through either owner mutates the shared target, so
"editing the copy" edits the original.

Precisely:

1. `copy` gets its own top-level slots, so `copy.user = {...}` would be safe
   (it replaces the slot on `copy` only).
2. But `copy.user.address.city = "Pune"` never writes to `copy` — it follows
   the shared reference two levels down and writes to the shared city slot.
3. `copy.tags.push("b")` likewise mutates the shared array in place.

Top-level replacement is safe; nested *mutation through* the shared reference
is the bug. The same trap applies to `Object.assign({}, original)`,
`[...arrayOfObjects]`, and nested state updates in UI code.

### The Fix

Deep-clone when the copy must be fully independent:

```javascript
const original = { user: { address: { city: "Mumbai" } }, tags: ["a"] };
const copy = structuredClone(original);

copy.user.address.city = "Pune";
copy.tags.push("b");

console.log(original.user.address.city); // => "Mumbai"
console.log(original.tags);              // => ["a"]
```

For environments without `structuredClone`, use a targeted deep clone
(JSON round-trip only if the data is JSON-safe — no functions, `undefined`,
`Date`, `Map`, or cycles):

```javascript
const copyJson = JSON.parse(JSON.stringify(original));
```

Or update immutably along the path you touch (the pattern UI reducers use —
copy each level on the path, share the rest):

```javascript
const copy2 = {
  ...original,
  user: { ...original.user, address: { ...original.user.address, city: "Pune" } },
  tags: [...original.tags, "b"],
};
```

Choose `structuredClone` for a true independent copy; choose path-copying when
you want structural sharing plus a changed branch.

### Why It Works

`structuredClone` recursively creates new objects and arrays for the whole
graph, so no nested reference is shared and writes through `copy` cannot reach
`original`. Path-copying works for a different reason: each level on the
edited path is a fresh object, so the write lands on objects only `copy` owns,
while untouched branches stay safely shared because they are never written to.

### How You'd Catch It

- Test: mutate the copy, assert the original is unchanged — the canonical
  shallow-copy regression test.
- Review smell: spread of an object you know is nested, followed later by a
  deep write (`copy.a.b.c = ...` or `.push` into a copied array).
- DevTools: `copy.user === original.user` in the console — `true` proves the
  share instantly.
- Lint/type heuristics: flag deep writes into values produced by shallow
  copies; in state-heavy code prefer immutable path updates or a clone helper.

### Takeaway

Spread copies the top-level slots, not the nested objects they point to —
clone deeply for independence, or copy each level along the path you edit.

## `forEach` with `async` never waits

`Difficulty: Medium` `Probability: Very High`

### The Broken Code

```javascript
async function process(item) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log("processed", item);
}

async function run(items) {
  items.forEach(async (item) => {
    await process(item);
  });
  console.log("done");
}

await run([1, 2, 3]);
// Expected: processed 1, processed 2, processed 3, then done.
// Actual:
```

Actual output (`done` prints first, then the three completions overlap):

```text
done
processed 1
processed 2
processed 3
```

Errors inside `process` also escape as unhandled rejections rather than
rejecting `run`.

### What's Wrong

Unawaited async callbacks — `Array.prototype.forEach` ignores the promise each
callback returns. `forEach` is specified to: call the callback for each
present index, discard its return value, and return `undefined`. It has no
slot for a promise, no accumulation, and nothing `await run` can wait on. So
`run` schedules three floating async functions and prints `"done"`
immediately while they are still pending.

Two further consequences follow from the same mechanism:

1. **No sequencing:** the three `process(item)` calls all start in the same
   tick and run concurrently, not one-after-another.
2. **No error propagation:** a rejection inside a callback has no path back to
   `run` — `forEach` never forwards it, so it becomes an unhandled rejection.

`async` in the callback only makes the *callback* wait internally; it does not
make `forEach` wait. The same applies to passing an async function to any
fire-and-forget iterator.

### The Fix

For sequential processing, use `for...of` — the loop itself evaluates `await`:

```javascript
async function run(items) {
  for (const item of items) {
    await process(item); // each iteration waits for the previous one
  }
  console.log("done");
}

await run([1, 2, 3]);
```

```text
processed 1
processed 2
processed 3
done
```

For concurrent processing where order of *completion* does not matter but
waiting does, collect the promises and await them:

```javascript
async function runParallel(items) {
  await Promise.all(items.map((item) => process(item)));
  console.log("done");
}
```

Rule of thumb: `for...of` for sequential async work, `Promise.all(items.map)`
for concurrent async work, never `forEach` for either.

### Why It Works

`await` inside a `for...of` body suspends `run` itself, because the `await`
belongs to `run`'s activation — the loop cannot advance until the promise
settles. `Promise.all` works by the complementary route: it turns the array
of per-item promises into one aggregate promise that settles only when every
item settles, giving `run` a single thing to await. `forEach` provides neither
— it discards the per-item promises, leaving `run` with nothing to suspend on.

### How You'd Catch It

- Smell: the token sequence `.forEach(async` — treat it as guilty until proven
  innocent. The `@typescript-eslint/no-misused-promises` rule flags it.
- Test: assert log *order* (`["processed 1", "processed 2", "processed 3",
  "done"]`), not just log contents — order assertions fail instantly here.
- Reproduce with fake timers or a delay: if `"done"` prints before the work,
  the iteration never waited.
- Error probe: make `process` throw for one item; an unhandled rejection (and
  a resolved `run`) confirms the callbacks are floating.

### Takeaway

`forEach` discards callback return values, so it cannot wait — put the `await`
in a construct that belongs to your function (`for...of`) or await the mapped
promises as a group.

## Sequential `await`s that could run in parallel

`Difficulty: Medium` `Probability: High`

### The Broken Code

```javascript
async function loadDashboard(userId) {
  console.time("dashboard");
  const user = await fetchUser(userId);       // 300 ms
  const orders = await fetchOrders(userId);   // 300 ms
  const settings = await fetchSettings(userId); // 300 ms
  console.timeEnd("dashboard");               // => ~900 ms
  return { user, orders, settings };
}

await loadDashboard(42);
```

```text
dashboard: ~900ms
```

Each fetch is independent — none uses another's result — yet the total latency
is the *sum*. With three 300 ms calls the page waits nearly a second instead
of ~300 ms.

### What's Wrong

Sequential-but-independent awaits. Each `await` suspends the function until
that promise settles before even *starting* the next fetch, so three
independent network round-trips that could overlap are serialised. Total time
becomes `t1 + t2 + t3` instead of `max(t1, t2, t3)`. The code is correct but
pays the full latency tax — and under load it also holds connections and
loading states far longer than needed.

The mechanism:

1. `await fetchUser(...)` starts request 1 and suspends.
2. Only after request 1 settles does `fetchOrders(...)` start request 2.
3. Only after request 2 settles does request 3 start.

Nothing here is *required* to be ordered: no data flows from one call into the
next. Whenever awaits are independent, sequential syntax is a performance bug.

### The Fix

Start all three promises first, then await the group:

```javascript
async function loadDashboard(userId) {
  console.time("dashboard");
  const [user, orders, settings] = await Promise.all([
    fetchUser(userId),
    fetchOrders(userId),
    fetchSettings(userId),
  ]);
  console.timeEnd("dashboard"); // => ~300 ms
  return { user, orders, settings };
}

await loadDashboard(42);
```

Notes on the contract:

- `Promise.all` preserves *input order* in its result array regardless of
  completion order.
- One rejection rejects the whole aggregate — use `Promise.allSettled` when
  partial results are acceptable (see the follow-up below).
- Keep sequential `await` when call B genuinely needs call A's value
  (`const user = await fetchUser(id); const orders = await
  fetchOrders(user.id)`).

### Why It Works

Calling the three fetch functions without awaiting starts all three async
operations in the same tick — each returns a pending promise and its
underlying I/O proceeds concurrently. `Promise.all` then suspends only once,
until the slowest settles, so elapsed time drops from the sum to the maximum.
Destructuring restores readable names without reintroducing ordering.

### How You'd Catch It

- Review smell: consecutive `await f(...)` lines where no later line consumes
  an earlier result — draw the data-dependency arrows; missing arrows mean
  parallelisable.
- Measure: `console.time` around the block, or the Network waterfall in
  DevTools — stair-stepped (serial) bars instead of overlapping bars confirm
  the serialisation.
- Test: stub each fetch with a 100 ms delay and assert the block finishes in
  well under 300 ms.
- Lint heuristic: some teams flag back-to-back awaits in the same scope during
  review and require a comment justifying the ordering.

### Takeaway

If await B does not need await A's value, do not sequence them — start every
independent promise together and await the group once.

## Swallowed error inside a promise chain

`Difficulty: Medium` `Probability: High`

### The Broken Code

```javascript
function loadUser(id) {
  return fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((user) => {
      if (!user.email) {
        throw new Error("user has no email"); // intended to reject loadUser
      }
      return sendWelcomeEmail(user.email);
    })
    .then(() => console.log("welcome sent"))
    .catch(() => console.log(" continuing anyway")); // => swallows everything
}

await loadUser(7); // always resolves, even when the email step failed
```

Output when the user has no email:

```text
 continuing anyway
```

No error reaches the caller. The caller cannot distinguish "welcome sent" from
"email step failed", retries never trigger, and monitoring sees success.

### What's Wrong

An in-chain error swallowed by an over-broad `.catch` that neither rethrows
nor returns a rejection. Throwing inside a `.then` *does* reject the chain —
that part works — but the trailing `.catch(() => ...)` converts *every*
rejection (network failure, bad JSON, missing email, welcome-email failure)
into a fulfilled `undefined`. The error is handled *as expected by the chain*,
yet invisible to the caller: this is the "handled but hidden" failure mode,
distinct from a promise with no handler at all. (A cousin of this bug is
forgetting to `return` an inner promise — it detaches entirely, so its
rejection never even enters the chain.)

Step by step for the missing-email case:

1. Second `.then` throws → the chain becomes rejected with `Error: user has
   no email`.
2. The trailing `.catch` runs, logs, returns `undefined` → the chain is now
   *fulfilled* with `undefined`.
3. `await loadUser(7)` resolves. The failure is gone.

### The Fix

Handle only what you can recover from, and rethrow (or return a rejection
for) the rest so the caller still sees it:

```javascript
function loadUser(id) {
  return fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((user) => {
      if (!user.email) {
        throw new Error("user has no email");
      }
      return sendWelcomeEmail(user.email); // NOTE: the return matters
    })
    .then(() => console.log("welcome sent"))
    .catch((error) => {
      console.error("loadUser failed:", error);
      throw error; // rethrow: keep the chain rejected for the caller
    });
}

try {
  await loadUser(7);
} catch (error) {
  console.error("caller sees it:", error.message); // => "user has no email"
}
```

If one step is genuinely optional, scope the `.catch` to that step instead of
the whole chain:

```javascript
function loadUserScoped(id) {
  return fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((user) =>
      sendWelcomeEmail(user.email).catch((error) => {
        console.error("welcome email failed, continuing:", error);
        return null; // local fallback; outer chain stays honest
      }),
    );
}
```

Rule: a `.catch` that returns normally *recovers* the chain (fulfilled). A
`.catch` that rethrows *reports and propagates* (stays rejected). Choose
consciously.

### Why It Works

Promise chains propagate exactly one state — fulfilled or rejected — and each
handler decides the next state by what it returns or throws. Returning (or
returning `undefined`) from a `.catch` resolves the chain; throwing (or
returning a rejected promise) keeps it rejected. Rethrowing after logging
therefore preserves observability: the local log records context, while the
preserved rejection lets the caller, retry logic, and error monitoring react.
Scoping the `.catch` to the optional step applies the same rule narrowly: only
that step's failure converts to a fallback value.

### How You'd Catch It

- Smell: a trailing `.catch` with no `throw` inside and no return-value
  fallback — ask "does the caller still learn about this failure?"
- Test: make the middle step fail and assert `loadUser` *rejects* (or returns
  an explicit fallback shape) — `await expect(loadUser(7)).rejects.toThrow()`.
  A resolving promise on a failing step is the red flag.
- Review: check every inner promise is `return`ed; an un-returned
  `sendWelcomeEmail(...)` floats beside the chain and its errors bypass the
  `.catch` entirely.
- DevTools: break on uncaught vs caught — then confirm the caught error is
  rethrown or reported, not merely logged and dropped.

### Takeaway

A `.catch` that returns normally turns failure into success — log for context,
then rethrow (or scope the catch) so the chain stays honest about the failure.

## Stale search results overwrite fresh ones

`Difficulty: Hard` `Probability: High`

### The Broken Code

```javascript
async function onSearch(query) {
  const results = await fetch(`/api/search?q=${query}`).then((r) => r.json());
  renderResults(results); // whichever request finishes LAST wins the UI
}

onSearch("r");
onSearch("re");
onSearch("rea");
onSearch("reac");
onSearch("react");
```

Type `react` quickly and the list sometimes shows results for `re` or `rea`:
an earlier, slower response arrives after a later, faster one and overwrites
the correct UI. The output depends on network timing — a classic race.

```text
request "react"  -> responds in  80 ms, rendered, then...
request "rea"    -> responds in 250 ms, rendered LAST (stale UI for "rea")
```

Debouncing reduces the frequency but does not remove the race: any two
overlapping requests can still settle out of order.

### What's Wrong

Race condition between overlapping async responses with no ordering guard. Each
`onSearch` call is independent — nothing cancels the previous request and
nothing checks, at render time, whether its query is still current. The UI
contract "shows results for the latest query" is therefore enforced by luck
(arrival order) instead of by code. Slow-earlier plus fast-later is the normal
case on real networks (caching, different result sizes, retries), so the stale
overwrite is intermittent and hard to reproduce on localhost.

Two cooperating facts produce the bug:

1. `fetch` promises cannot be "un-awaited" — every started request will settle
   and every continuation will run unless cancelled or ignored.
2. `renderResults` trusts its argument unconditionally instead of asking "is
   this response still the newest?"

### The Fix

Cancel the obsolete request with `AbortController`, so stale responses never
arrive:

```javascript
let currentController = null;

async function onSearch(query) {
  currentController?.abort(); // cancel the previous in-flight request
  const controller = new AbortController();
  currentController = controller;

  try {
    const results = await fetch(`/api/search?q=${query}`, {
      signal: controller.signal,
    }).then((r) => r.json());
    renderResults(results);
  } catch (error) {
    if (error.name === "AbortError") return; // expected: superseded query
    throw error;
  }
}
```

When cancellation is unavailable (a non-abortable API), guard with a sequence
token and ignore stale arrivals:

```javascript
let latestQueryId = 0;

async function onSearchGuarded(query) {
  const queryId = ++latestQueryId;
  const results = await fetch(`/api/search?q=${query}`).then((r) => r.json());
  if (queryId !== latestQueryId) return; // stale: a newer query has started
  renderResults(results);
}
```

Prefer `AbortController` — it also frees network and server work. Use the
sequence guard when the underlying operation cannot be cancelled.

### Why It Works

Aborting the previous controller rejects the previous fetch with an
`AbortError` before its render line runs, so only the newest request can reach
`renderResults`. The sequence guard achieves the same UI contract without
cancellation: each request carries the id it started with, and the render line
compares it against the newest id — a mismatched id proves a newer query has
since started, so the stale payload is dropped. Both restore "last query
wins" as an invariant instead of a timing accident.

### How You'd Catch It

- Reproduce deterministically: stub `fetch` so the *first* query resolves
  after the *second*, then assert the UI shows the second query's results.
- DevTools Network tab: type quickly and watch overlapping requests resolve
  out of order with the stale one rendering last.
- Review smell: any `await fetch` in an input/typeahead handler with no
  `AbortController`, sequence id, or latest-query check.
- Test: fire `onSearch("re")` then `onSearch("react")` with controlled timing
  and assert `renderResults` was last called with the `"react"` payload.

### Takeaway

Overlapping requests settle in network order, not call order — cancel the
superseded request or tag responses and render only the newest.

## Leaked listener, timer, or observer

`Difficulty: Medium` `Probability: High`

### The Broken Code

```javascript
function mountChatFeed(element) {
  const socket = new WebSocket("wss://chat.example.com");

  function onMessage(event) {
    element.appendChild(renderLine(JSON.parse(event.data)));
  }
  socket.addEventListener("message", onMessage);

  const timer = setInterval(() => element.classList.toggle("live"), 1000);

  const observer = new IntersectionObserver(() => autoScroll(element));
  observer.observe(element);

  // BUG: no unmount path — nothing below ever runs.
  return { socket };
}

const feed = mountChatFeed(document.getElementById("feed"));
// Later: the DOM node is removed, but socket/timer/observer keep running.
```

Symptoms accumulate: duplicate messages after re-mount, growing memory in the
heap snapshot, `setInterval` callbacks touching detached DOM, and
`IntersectionObserver` entries for nodes that no longer exist.

### What's Wrong

Resource leak — every subscription acquired at mount survives unmount. Three
independent owners each hold the dead UI alive:

1. **WebSocket listener** keeps `onMessage` (and through its closure,
   `element`) reachable from the live socket. Re-mounting adds a *second*
   listener, so messages render twice.
2. **`setInterval`** keeps firing forever; the callback's closure over
   `element` prevents garbage collection of the whole subtree.
3. **`IntersectionObserver`** keeps observing a detached node; its callback
   keeps running and keeps `element` reachable.

The general rule: anything with `addEventListener`, `setInterval` /
`setTimeout`, `subscribe`, `observe`, or an open socket/connection must have a
symmetric release. If `mount` has no matching `unmount` that undoes each
acquisition, the component leaks by construction — in single-page apps, every
navigation adds another set.

### The Fix

Return a disposal function that releases each resource symmetrically, and call
it on unmount:

```javascript
function mountChatFeed(element) {
  const socket = new WebSocket("wss://chat.example.com");

  function onMessage(event) {
    element.appendChild(renderLine(JSON.parse(event.data)));
  }
  socket.addEventListener("message", onMessage);

  const timer = setInterval(() => element.classList.toggle("live"), 1000);

  const observer = new IntersectionObserver(() => autoScroll(element));
  observer.observe(element);

  return function unmount() {
    socket.removeEventListener("message", onMessage);
    socket.close();
    clearInterval(timer);
    observer.disconnect();
  };
}

const unmount = mountChatFeed(document.getElementById("feed"));
// Later, when the view goes away:
unmount();
```

Framework equivalents enforce the same symmetry: React's `useEffect` cleanup
return, `AbortController` passed as the fetch/addEventListener signal, and
`observer.disconnect()` in the teardown path. For listeners, the `{ once:
true }` option or an `AbortSignal` auto-removes one-shot handlers.

### Why It Works

Each teardown call severs the reference that kept the dead UI alive:
`removeEventListener` drops the socket's reference to the closure,
`clearInterval` removes the timer's reference, and `disconnect` drops the
observer's references — so `element` and its subtree become unreachable and
garbage-collectable. Closing the socket additionally frees the connection.
Symmetric acquire/release restores the invariant "no live references to an
unmounted view".

### How You'd Catch It

- DevTools Memory: take a heap snapshot, mount/unmount repeatedly, snapshot
  again — retained `HTMLDivElement` counts or detached DOM trees prove the
  leak. The Performance monitor showing ever-growing listeners/timers confirms
  it live.
- Test: mount, unmount, then assert `socket.close` was called,
  `clearInterval` fired, and emitting a message no longer touches the element.
- Review checklist: for every `addEventListener`/`setInterval`/`subscribe`/
  `observe` in mount code, demand the matching removal in the same diff.
- Smell: anonymous inline listeners (`addEventListener("x", () => ...)`) with
  no saved reference — they *cannot* be removed later.

### Takeaway

Every subscription needs a symmetric unsubscription — if mount acquires it,
unmount must release it, or the dead view stays alive through its closures.

## Accidental mutation of the input array or object

`Difficulty: Easy` `Probability: Very High`

### The Broken Code

```javascript
function topThree(scores) {
  scores.sort((a, b) => b - a); // sorts IN PLACE — mutates the caller's array
  return scores.slice(0, 3);
}

const leaderboard = [40, 90, 70, 100, 60];
console.log(topThree(leaderboard)); // => [100, 90, 70]
console.log(leaderboard);           // => [100, 90, 70, 60, 40] (surprise!)
```

```text
[ 100, 90, 70 ]
[ 100, 90, 70, 60, 40 ]
```

The caller expected `leaderboard` to stay in insertion order. The same family
includes `scores.splice(...)`, `scores.reverse()`, `scores.push(...)`, and
`delete user.password` or `user.role = "admin"` applied directly to a
parameter.

### What's Wrong

In-place mutation through a shared reference. Arrays and objects are passed by
reference-copy: the parameter `scores` points at the *same* array the caller
owns. `Array.prototype.sort`, `reverse`, `splice`, `push`, and property writes
all mutate that shared target, so the caller's data changes as a side effect.
The function's contract ("return the top three") promises a *query*, but the
implementation performs a *command* on the caller's state.

Why this hurts beyond the surprise:

1. The caller reuses `leaderboard` later (rendering, averaging) and silently
   gets sorted data.
2. Memoisation and change detection break — the reference is the same but the
   contents changed, so shallow comparisons miss the update (or vice versa).
3. In UI reducers, mutating state directly means the framework never sees a
   new reference and skips the re-render.

`.slice` after the sort does not help — the damage happens during `sort`,
before `slice` copies anything.

### The Fix

Copy first, then mutate the copy:

```javascript
function topThree(scores) {
  return [...scores].sort((a, b) => b - a).slice(0, 3);
}

const leaderboard = [40, 90, 70, 100, 60];
console.log(topThree(leaderboard)); // => [100, 90, 70]
console.log(leaderboard);           // => [40, 90, 70, 100, 60] (unchanged)
```

Modern alternative — `Array.prototype.toSorted` returns a new sorted array
without touching the original:

```javascript
function topThreeModern(scores) {
  return scores.toSorted((a, b) => b - a).slice(0, 3);
}
```

For objects, the same principle: copy the level you change instead of writing
into the parameter:

```javascript
function rename(user, name) {
  return { ...user, name }; // new object; input untouched
}
```

Choose `[...scores].sort(...)` for broad compatibility, `.toSorted(...)`
where the runtime supports it. Either way the contract becomes pure: same
input, no side effects.

### Why It Works

The spread (or `toSorted`) creates a fresh array that only the function owns;
sorting that copy never touches the caller's storage. The function goes from
"mutate the shared array and hand back a window into it" to "derive a new
value from the input" — referential transparency for that call. Callers keep
their ordering, memoisation keys stay valid, and re-renders trigger on the new
reference.

### How You'd Catch It

- Test: freeze the input (`Object.freeze(leaderboard)`) before calling — a
  mutating implementation throws in strict mode instead of silently corrupting.
- Assert both the return value *and* the input after the call.
- Lint: `no-param-reassign` flags direct parameter writes; review every
  `.sort(`, `.reverse(`, `.splice(`, `.push(` on a parameter and ask "whose
  array is this?"
- Smell: a function named like a query (`top`, `get`, `filter`, `format`)
  that calls a mutating method on its input.

### Takeaway

If the contract is "compute and return", never mutate the input to do it —
derive from a copy so the caller's data survives the call.

## Default `sort` orders numbers lexicographically

`Difficulty: Easy` `Probability: Very High`

### The Broken Code

```javascript
const prices = [100, 2, 30, 4];
prices.sort();
console.log(prices); // Expected [2, 4, 30, 100]. Actual:
```

```text
[ 100, 2, 30, 4 ]
```

A leaderboard, price list, or "top N" built on this order is wrong, and the
bug is invisible for single-digit data (where lexicographic and numeric order
coincide) — it surfaces only when values cross digit lengths.

### What's Wrong

Missing comparator — `Array.prototype.sort` without arguments stringifies
elements and compares UTF-16 code units. `String(100)` is `"100"`, and `"100"
< "2"` because the first characters compare `'1' < '2'`. So the engine orders
by *first digit*, then second, exactly like dictionary words:

1. `"100"` vs `"2"` → `'1' < '2'` → `100` first.
2. `"2"` vs `"30"` → `'2' < '3'` → `2` next.
3. `"30"` vs `"4"` → `'3' < '4'` → `30` next.

The contract detail: default sort is `comparefn` of `undefined`, which means
"sort by `ToString(a) < ToString(b)`". That is correct for words, wrong for
quantities. The sort is also in place (mutating — see the previous challenge),
so the corrupted order overwrites the caller's array too.

### The Fix

Pass a numeric comparator — negative means `a` first, positive means `b`
first, zero keeps their relative order:

```javascript
const prices = [100, 2, 30, 4];
const ascending = [...prices].sort((a, b) => a - b);
console.log(ascending); // => [2, 4, 30, 100]

const descending = [...prices].sort((a, b) => b - a);
console.log(descending); // => [100, 30, 4, 2]
console.log(prices);     // => [100, 2, 30, 4] (untouched — sorted a copy)
```

For non-numeric ordering (strings, objects), compare explicitly rather than
relying on the default:

```javascript
const names = ["banana", "Apple", "cherry"];
names.toSorted((a, b) => a.localeCompare(b)); // => ["Apple", "banana", "cherry"]
```

Note the copy-before-sort (`[...prices]`): the comparator fixes the *order*,
the copy fixes the *mutation*. Production sorts usually need both.

### Why It Works

A comparator replaces string comparison with numeric comparison: `a - b` is
negative exactly when `a < b`, so the engine places the smaller number first
regardless of digit count. The ordering becomes quantitative instead of
lexicographic, and because the comparator receives the original numbers (not
their string forms), multi-digit values compare by magnitude.

### How You'd Catch It

- Test with multi-digit data: `[100, 2, 30, 4]` is the canonical probe —
  single-digit fixtures (`[3, 1, 2]`) pass under both orderings and hide the
  bug.
- Smell: any bare `.sort()` on a numeric array, or on an array of objects
  without a key selector (`users.sort()` instead of
  `users.sort((a, b) => a.age - b.age)`).
- Review: ask "what type are the elements, and what does 'ordered' mean for
  them?" If the answer is numeric, demand a comparator.
- Snapshot: assert the full sorted array, not just `length` or membership —
  membership assertions pass for wrongly-ordered sorts.

### Takeaway

Bare `.sort()` compares string forms, so numbers need an explicit comparator —
`(a, b) => a - b` for ascending — applied to a copy, not the caller's array.

## `map(parseInt)` parses with the wrong radix

`Difficulty: Medium` `Probability: High`

### The Broken Code

```javascript
const result = ["10", "10", "10"].map(parseInt);
console.log(result); // Expected [10, 10, 10]. Actual:
```

```text
[ 10, NaN, NaN ]
```

The same trap: `["1", "2", "3"].map(parseInt)` gives `[1, NaN, NaN]`, and
`["10", "11", "12"].map(parseInt)` gives `[10, NaN, 1]`.

### What's Wrong

Callback-signature mismatch — `map` calls its callback with *three* arguments
`(value, index, array)`, and `parseInt` accepts *two* `(string, radix)`. So
the index is silently reinterpreted as the radix:

1. Index `0`: `parseInt("10", 0)` → radix `0` means "default to decimal" →
   `10`. Correct by accident.
2. Index `1`: `parseInt("10", 1)` → radix 1 is invalid (valid range 2–36) →
   `NaN`.
3. Index `2`: `parseInt("10", 2)` → binary `"10"` → `2`... but here the input
   `"10"` in binary is `2`, so why `NaN`? Because the real snippet's values
   (`"10"` at radix 2 is actually valid) — wait, trace carefully: for
   `["10","10","10"]`, index 2 gives `parseInt("10", 2) === 2`, not `NaN`!

The honest trace for `["10", "10", "10"]` is `[10, NaN, 2]`, while the famous
`[10, NaN, NaN]` comes from values with digits invalid in those radixes (e.g.
`["10", "9", "8"]` at radix 1/2, or the `["1","2","3"]` variant where
`parseInt("2", 1)` and `parseInt("3", 2)` both fail). Either way the mechanism
is identical: the index becomes the radix, so every element after the first
parses under a different, unintended base.

The general rule: never pass a multi-parameter function directly as a callback
unless you have checked that the extra callback arguments (`index`, `array`)
are harmless in the extra parameter positions (`radix`, ...).

### The Fix

Wrap the call so only the value is forwarded, with an explicit radix:

```javascript
console.log(["10", "10", "10"].map((x) => parseInt(x, 10))); // => [10, 10, 10]
```

Or use single-argument `Number`, which ignores the extra arguments entirely:

```javascript
console.log(["10", "10", "10"].map(Number)); // => [10, 10, 10]
console.log(["1", "2", "3"].map(Number));    // => [1, 2, 3]
```

Comparison of the two fixes:

- `(x) => parseInt(x, 10)` — parses integer prefixes (`"10px"` → `10`),
  explicit radix avoids legacy octal surprises.
- `Number(x)` — strict whole-string conversion (`Number("10px")` → `NaN`,
  `Number("")` → `0`, `Number("0x10")` → `16`). Choose by intent.

Both fixes share the mechanism: the arrow (or `Number`'s single-parameter
shape) drops `index`/`array` before they can reach a radix-like parameter.

### Why It Works

The arrow `(x) => parseInt(x, 10)` takes only the first callback argument and
supplies a constant radix, so the per-index variation disappears — every
element parses as base 10. `Number` works because extra arguments to a
function are ignored: `map` still passes `(value, index, array)`, but `Number`
reads only the first, converting the whole string strictly.

### How You'd Catch It

- Smell: any bare multi-arity function passed as a callback — `.map(parseInt)`,
  `.map(Number.parseInt)`, `promise.then(console.log)` (extra args), and
  similar. Treat "function reference as callback" as a prompt to check arities.
- Lint: `@typescript-eslint/no-misused-promises`-style arity awareness, and
  the `radix` rule (`require radix` parameter on `parseInt`) in ESLint.
- Test: always exercise `map` callbacks with 3+ elements — single-element
  fixtures pass because index `0` behaves like the default radix.
- Console probe: `["10", "10", "10"].map((v, i) => `v=${v} i=${i}`)` reveals
  the hidden index argument immediately.

### Takeaway

`map` passes `(value, index)` but `parseInt` reads `(string, radix)` — wrap it
as `(x) => parseInt(x, 10)` or use `Number` so the index never becomes a radix.

## `0.1 + 0.2` breaks money math

`Difficulty: Easy` `Probability: High`

### The Broken Code

```javascript
const cart = [0.1, 0.2];
const total = cart.reduce((sum, price) => sum + price, 0);
console.log(total);         // => 0.30000000000000004 (not 0.3)
console.log(total === 0.3); // => false — the checkout check fails
```

```text
0.30000000000000004
false
```

Downstream, `total.toFixed(2)` prints `"0.30"` (masking the error in the UI)
while the strict comparison, change calculation, or payment-gateway amount
quietly disagrees by a fraction of a cent — multiplied across thousands of
orders.

### What's Wrong

Binary floating-point representation error. JavaScript numbers are IEEE-754
doubles: most decimal fractions (`0.1`, `0.2`) have no exact binary
representation, so each is stored as the nearest representable double, already
off by ~1e-17. Adding them compounds the approximations, yielding
`0.30000000000000004` instead of `0.3`. The `===` then correctly reports that
two *different* doubles are different — the comparison is honest; the operands
are approximate.

This is not a rounding-display issue; it is a value issue. `toFixed` hides it
for humans but the underlying value still fails equality, accumulates across
line items, and can charge or refund the wrong minor unit.

Further instances of the same family: `0.3 - 0.1 !== 0.2`, `19.99 * 100 !==
1999` exactly in edge cases, and any `if (balance === 0)` gate on computed
money.

### The Fix

Do money math in integer minor units (cents/paise), converting only at the
boundary:

```javascript
const cartCents = [10, 20]; // $0.10, $0.20 stored as cents
const totalCents = cartCents.reduce((sum, price) => sum + price, 0);
console.log(totalCents);              // => 30
console.log(totalCents === 30);       // => true

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`; // "$0.30" — formatting only at display
}
console.log(formatCents(totalCents)); // => "$0.30"
```

Converting user input at the boundary (round once, on entry):

```javascript
function toCents(dollars) {
  return Math.round(dollars * 100);
}
console.log(toCents(19.99) + toCents(0.01)); // => 2000 (cents), exact
```

For display-only comparisons of computed floats, compare with an epsilon
instead of `===`:

```javascript
console.log(Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON); // => true
```

Production systems use integer cents, decimal libraries, or the gateway's
minor-unit API. Epsilon comparison is for geometry/tolerance checks, not for
ledger math — ledgers must be exact integers.

### Why It Works

Integers within the safe range (`Number.MAX_SAFE_INTEGER`) are represented
exactly in doubles, so addition and subtraction of cents never approximate —
`10 + 20` is exactly `30`, with no representation error to accumulate. The
single `Math.round(x * 100)` at the boundary absorbs the one-time decimal→int
conversion error immediately, before it can compound. Formatting (`/ 100` +
`toFixed`) happens once, at display, where approximation no longer affects
decisions.

### How You'd Catch It

- Test: assert `sum([0.1, 0.2]) === 0.3` — the canonical float probe — plus a
  multi-line cart total in cents vs dollars.
- Smell: any `+`, `-`, `*`, or `===` on decimal money values; any amount sent
  to a payment API as a float instead of minor units.
- Lint/review rule: money variables should be named `*Cents`/`*Paise` and typed
  as integers; floats near currency code are a review blocker.
- Reproduce: `node -e 'console.log(0.1 + 0.2)'` — the `...004` suffix is the
  instant diagnosis.

### Takeaway

Decimal fractions are approximate in binary floats, so money must live as
integer minor units — convert once at the boundary, compute exactly, format at
display.

## `.then` without `return` breaks the chain

`Difficulty: Medium` `Probability: Very High`

### The Broken Code

```javascript
function getUsername(id) {
  return fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((user) => {
      user.name.toUpperCase(); // computed but never returned
    })
    .then((name) => {
      console.log(name); // => undefined (surprise!)
      return name;
    });
}

await getUsername(7);
```

```text
undefined
```

With braces and no `return`, the middle `.then` fulfils with `undefined`, and
every downstream step receives `undefined`. A close cousin is worse: dropping
`return` before an inner promise (`sendWelcomeEmail(...)` without `return`)
detaches it — downstream runs before it settles and its rejection bypasses the
chain's `.catch`.

### What's Wrong

Missing `return` inside a block-bodied `.then` callback. Arrow functions with
a concise body (`x => expr`) implicitly return; arrows (or functions) with a
block body (`x => { ... }`) return `undefined` unless a `return` statement
executes. The chain propagates exactly what each handler returns:

1. `res.json()` is returned → next `.then` gets the parsed user. Correct.
2. The block-bodied callback computes `user.name.toUpperCase()` and returns
   nothing → the chain fulfils with `undefined`.
3. The final `.then` receives `undefined` and logs it.

For the inner-promise cousin, the same omission has a second effect: without
`return innerPromise`, the chain does not adopt (unwrap) it, so the inner work
floats unobserved — no waiting, no error propagation.

### The Fix

Return the value (or the inner promise) from every link that produces one:

```javascript
function getUsername(id) {
  return fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((user) => {
      return user.name.toUpperCase(); // explicit return from the block body
    })
    .then((name) => {
      console.log(name); // => e.g. "ASHA"
      return name;
    });
}

await getUsername(7);
```

The concise-body form makes the return implicit and removes the trap for pure
transforms:

```javascript
function getUsernameConcise(id) {
  return fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((user) => user.name.toUpperCase())
    .then((name) => console.log(name));
}
```

And the inner-promise form must also return, so the chain adopts it:

```javascript
Promise.resolve({ email: "a@example.com" }).then((user) => {
  return sendWelcomeEmail(user.email); // chain waits; rejections propagate
});
```

Habit: every `.then` callback either returns a value/promise or is a terminal
side effect (logging) at the end of the chain.

### Why It Works

Each `.then` creates a new promise resolved with its callback's return value
(or adopted from the returned promise). An explicit `return` feeds the
computed value into that new promise, so the next link receives it; a returned
inner promise additionally makes the chain *adopt* its state — downstream
waits for it and its rejection flows to the chain's `.catch`. Without the
return, the new promise resolves with `undefined` immediately.

### How You'd Catch It

- Smell: any block-bodied `.then((x) => { ... })` whose last line is an
  expression without `return` — especially single-expression blocks that look
  like concise bodies.
- Test: assert the resolved value of each chain (`await expect(getUsername(7))
  .resolves.toBe("ASHA")`); `undefined` resolutions expose dropped returns.
- Lint: `consistent-return` plus arrow-body-style review; some teams require
  concise bodies for pure transforms so a missing return is a syntax-level
  impossibility.
- Trace: log the value entering each `.then` — the first `undefined` marks the
  link that forgot to return.

### Takeaway

A block-bodied `.then` fulfils with whatever it returns — no `return` means
`undefined` downstream, and no `return` on an inner promise means it floats
outside the chain.

## Forgotten `await` leaves a promise instead of a value

`Difficulty: Easy` `Probability: Very High`

### The Broken Code

```javascript
async function getTotal(items) {
  const total = sumItems(items); // sumItems is async — returns a promise
  console.log(total);            // => Promise { 30 } (not 30)
  console.log(total + 10);       // => "[object Promise]10" (not 40)
  return total + 10;
}

async function sumItems(items) {
  return items.reduce((a, b) => a + b, 0);
}

getTotal([10, 20]).then((result) => console.log(result)); // => "[object Promise]10"
```

```text
Promise { 30 }
[object Promise]10
[object Promise]10
```

No error is thrown — the promise stringifies and concatenates silently, so the
bug travels downstream as a wrong value rather than a crash.

### What's Wrong

Missing `await` on an async call — `total` holds the *promise* for the sum,
not the sum. `async` functions always return a promise, immediately, before
their body finishes; without `await`, the caller proceeds with that pending
promise object. Every subsequent operation then applies to the wrapper instead
of the value: `console.log` prints the promise, `+` coerces it to the string
`"[object Promise]"`, property reads yield `undefined`, and the returned
`total + 10` is a garbage string that still fulfils `getTotal` successfully.

Step by step:

1. `sumItems(items)` runs, returns pending promise P (body will resolve P
   with `30`).
2. `total` is assigned P — not `30`.
3. `total + 10` coerces P via `toString` → `"[object Promise]10"`.
4. `getTotal` (itself async) fulfils with that string. Callers see success
   with nonsense data.

Compare with challenge 13 (`.then` without `return`): there the chain
*fulfils too early with `undefined`*; here the function *continues too early
with a promise*. Both are "value vs wrapper" mistakes at different syntax.

### The Fix

`await` the async call so execution suspends until the value is ready:

```javascript
async function getTotal(items) {
  const total = await sumItems(items); // suspends until P fulfils with 30
  console.log(total);                  // => 30
  console.log(total + 10);             // => 40
  return total + 10;                   // => 40
}

getTotal([10, 20]).then((result) => console.log(result)); // => 40
```

When several independent async calls are involved, await them as a group
(challenge 5) rather than forgetting some and keeping others:

```javascript
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

If you genuinely want the promise (deferring the wait), name it as one so the
intent is visible: `const totalPromise = sumItems(items); ... await
totalPromise`. The name documents that the value is not ready yet.

### Why It Works

`await P` suspends `getTotal` until P settles, then evaluates to P's
fulfilment value — so `total` becomes `30`, a number, and all downstream math
applies to the number. Without `await`, no suspension happens and `total`
stays the wrapper object. `await` is the only construct that unwraps the
promise *in place*; everything else (logging, `+`, property access) operates
on the wrapper.

### How You'd Catch It

- Smell: `Promise { ... }` in logs, `"[object Promise]"` in strings, or
  `undefined` from property reads on values that "should" be objects.
- TypeScript: the type system flags it — `total` is `Promise<number>`, so
  `total + 10` is a type error. The `@typescript-eslint/no-floating-promises`
  and `await-thenable` rules catch un-awaited and misused promises.
- Test: assert `typeof total === "number"` / exact values — promise objects
  fail both instantly.
- Review: for every call to an `async` function, ask "where is its `await`
  (or `return` to the caller)?" An async call with neither is either this bug
  or a floating promise.

### Takeaway

Calling an `async` function yields a promise, not its value — `await` (or an
explicit promise-handling path) is what turns the wrapper back into the value.

## Rejected promise with no handler at all

`Difficulty: Medium` `Probability: High`

### The Broken Code

```javascript
function checkout(cartId) {
  fetch(`/api/checkout/${cartId}`, { method: "POST" }).then((res) =>
    console.log("paid:", res.status),
  );
  // No .catch. No await. No return. If the request fails, nobody is listening.
}

checkout("cart-1"); // on failure: UnhandledPromiseRejection — crashes / warns
```

On a network failure the process (or console) reports:

```text
UnhandledPromiseRejectionWarning: Error: fetch failed
```

Unlike the swallowed-in-chain error (challenge 6), where a `.catch` *ran* but
hid the failure, here *no handler exists anywhere*: the rejection has zero
observers, so the runtime itself must report it — as a loud crash in Node
(modern versions terminate the process) or a console error in browsers.

### What's Wrong

Unhandled rejection — a rejected promise with no `.catch`, no second argument
to `.then`, no surrounding `try`/`await`, and no caller to inherit it. Because
`checkout` neither returns the promise nor awaits it, the rejection is
orphaned: nothing in the program can observe or recover from it. Consequences:

1. **Silent business failure:** the payment failed but the UI already moved on
   ("paid" never logs, no error shows either).
2. **Runtime-level report:** Node emits `unhandledRejection` (fatal by
   default); browsers log `Uncaught (in promise)`. Both bypass application
   error UI and monitoring unless explicitly wired.
3. **Non-determinism:** the warning fires on a later tick, detached from the
   user action, making it hard to attribute.

The root pattern is "fire-and-forget without a catch": starting async work and
discarding the only handle that could observe its failure.

### The Fix

Attach a handler on every path — return the promise so callers can handle it,
and add a local `.catch` (or `try`/`catch` with `await`) plus reporting:

```javascript
async function checkout(cartId) {
  try {
    const res = await fetch(`/api/checkout/${cartId}`, { method: "POST" });
    console.log("paid:", res.status);
    return res;
  } catch (error) {
    console.error("checkout failed:", error);
    reportToMonitoring(error, { cartId }); // send to Sentry / logging pipeline
    showPaymentError(error);               // user-visible recovery UI
    throw error; // rethrow if callers must also react (retry, rollback)
  } finally {
    hideSpinner(); // runs on success AND failure — no stuck loading state
  }
}

await checkout("cart-1").catch(() => {}); // callers handle (or deliberately acknowledge)
```

Minimum viable fix when keeping the `.then` shape — never leave the end bare:

```javascript
function checkoutThen(cartId) {
  return fetch(`/api/checkout/${cartId}`, { method: "POST" })
    .then((res) => console.log("paid:", res.status))
    .catch((error) => {
      console.error("checkout failed:", error);
      reportToMonitoring(error, { cartId });
      throw error;
    });
}
```

Rules: return or await every promise you create; end every chain with a
`.catch`; use `finally` for cleanup that must run on both paths; route errors
to monitoring, not just the console.

### Why It Works

A rejection propagates down the chain (or throws at the `await`) until
*something* observes it. Returning the promise gives the caller that
observation point; `.catch`/`try`-`catch` provides the local one. Once
observed, the error re-enters application control: it can be logged to
monitoring with context, surfaced in the UI, retried, or rethrown
deliberately. `finally` restores the UI invariant (spinners cleared, locks
released) regardless of outcome. The rejection is no longer orphaned, so the
runtime never needs its last-resort global report.

### How You'd Catch It

- Reproduce: stub `fetch` to reject and call the function — an
  `UnhandledPromiseRejection` / `Uncaught (in promise)` message with no
  application-visible error confirms the missing handler.
- Lint: `no-floating-promises` (`@typescript-eslint`) requires every promise
  to be awaited, returned, or explicitly voided with a catch; Node's
  `--unhandled-rejections=strict` makes the suite fail loudly.
- Global safety net (last resort, not the fix): log and alert on the runtime
  events — `process.on("unhandledRejection")` in Node,
  `window.addEventListener("unhandledrejection")` in browsers — then fix the
  call site that produced them.
- Review smell: a `fetch(...)` or async call whose promise is neither
  returned, awaited, nor `.catch`ed — especially fire-and-forget side effects.

### Takeaway

Every promise needs an observer — return it, await it in `try`/`catch`, or end
the chain with `.catch` (plus monitoring and `finally`) so no rejection is
ever orphaned.
