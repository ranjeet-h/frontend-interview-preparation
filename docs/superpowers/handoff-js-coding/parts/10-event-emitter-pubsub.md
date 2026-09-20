## Implement a Basic Event Emitter (`on`, `emit`, `off`)

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement an `EventEmitter` class with three methods:

- `on(event, callback)` — register `callback` for `event`. Returns `this` so registrations chain. Throws `TypeError` if `callback` is not a function.
- `emit(event, ...args)` — invoke the registered callback (if any) with `args` and return `true`; return `false` when there is no handler.
- `off(event, callback)` — remove the handler for `event` if it is **the same function reference**; return `true` if something was removed, `false` otherwise.

Scope note: this first cut keeps **one handler per event** (a later `on` replaces the earlier one). The contract points a naive version gets wrong are: `this` inside the callback, identity-based removal, safe self-removal during dispatch, and returning real booleans. Multiple listeners are lifted in the "multiple listeners" problem.

### Examples

```text
const emitter = new EventEmitter();
const greet = (name) => console.log(`hello ${name}`);

emitter.on("greet", greet)             // => emitter (chainable)
emitter.emit("greet", "Ada")           // logs "hello Ada"; => true
emitter.emit("unknown", 1)             // => false (no throw)

emitter.off("greet", greet)            // => true
emitter.emit("greet", "Ada")           // => false
emitter.off("greet", greet)            // => false (nothing to remove)

emitter.on("x", () => {}); emitter.off("x", () => {}) // => false (different reference)
emitter.on("x", 123)                   // => TypeError
```

### Approach

Use a `Map<event, callback>`: string or symbol keys, `O(1)` get/set/delete, and no prototype-pollution surprises (a plain object would collide with `"__proto__"`, `"constructor"`, `"toString"`).

- `on`: validate the callback, then `set`. Last write wins — the documented single-listener contract.
- `emit`: read the handler into a **local variable before calling it**. A handler may call `off`/`on` (even remove itself) mid-dispatch; because the reference was captured first, we neither skip a call nor crash. This is the "snapshot" idea in its smallest form.
- `this`: invoke with `handler.call(this, ...args)` so a normal function sees the emitter as `this`. Arrows ignore it.
- Returns: `on` returns `this` for chaining; `emit` returns a boolean; a listener's own return value is **discarded**.

Error handling is deliberately absent here: if a listener throws, `emit` propagates and the exception is the caller's problem. Error isolation is a later problem.

### Implementation

```javascript
class EventEmitter {
  constructor() {
    this._events = new Map(); // event (string|symbol) -> callback
  }

  on(event, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("listener must be a function");
    }
    this._events.set(event, callback); // one handler per event: last wins
    return this;                       // chainable
  }

  emit(event, ...args) {
    const handler = this._events.get(event); // capture BEFORE any mutation
    if (handler === undefined) return false;
    handler.call(this, ...args);             // `this` === the emitter
    return true;
  }

  off(event, callback) {
    const handler = this._events.get(event);
    if (handler !== callback) return false;  // identity, not shape
    return this._events.delete(event);       // Map.delete -> boolean
  }
}
```

### Walkthrough

`emitter.on("greet", greet)` stores `"greet" -> greet`. Then `emit("greet", "Ada")`:

1. `this._events.get("greet")` returns `greet`; captured in `handler`.
2. `handler.call(this, "Ada")` runs `greet` with `this === emitter` and `name === "Ada"`, logging `hello Ada`.
3. `emit` returns `true`.

Now suppose `greet` calls `emitter.off("greet", greet)` while running. The `off` deletes from the map, but `handler` already holds the reference, so the current call completes normally — no "deleted while iterating" bug. The next `emit("greet")` finds nothing and returns `false`.

For `emit("unknown")`, `get` returns `undefined` and we return `false` without calling anything or throwing.

### Complexity

Time: `on`/`off`/`emit` are `O(1)` average — one `Map` operation plus one call. Space: `O(e)` for `e` registered events, plus the callbacks.

### Edge Cases

- **Second `on` for the same event replaces the first** — intentional for this minimal version; the next problems remove the restriction.
- `emit` with no listeners returns `false` and does not throw.
- `off` matches by reference only: `off("x", () => {})` never removes a stored arrow, because it is a different object.
- A listener that removes itself (or re-registers) during `emit` is safe — the handler was captured first.
- Listener throws → the exception propagates out of `emit`; nothing is swallowed.
- Arrow listeners ignore the `this` we bind; normal functions and methods see the emitter.
- Any value usable as a `Map` key works as an event name — `Symbol("tick")` is a valid distinct event.
- Listener return values are ignored; only the boolean from `emit` is returned.

### Interview Follow-ups

- **Multiple listeners per event** — store an array or `Set` per event and iterate a copy; the subject of a later problem.
- **`once`** — wrap the callback so it removes itself *before* running (next problem).
- **Collect return values?** Could `emit` gather listener return values into an array? Decide and document; Node ignores them.
- **Real `EventTarget` / Node `EventEmitter`** — production uses those; this is the mechanism underneath.

### Common Mistakes

- Storing listeners in a plain object and colliding with inherited keys (`event = "__proto__"`).
- Calling `handler()` detached, so a method listener loses its `this`.
- Removing from the map before reading it, or iterating a live map while it mutates.
- Comparing callbacks by `.name`/`.toString()` instead of `===`.
- Returning `undefined` from `on` (breaks chaining) or from `off` instead of a boolean.

### Takeaway

An event emitter is a `Map` from event to handler. The subtle parts are not the data structure but the contract: bind `this`, compare callbacks by identity, capture the handler before calling it, and return honest booleans.

## Add `once(event, callback)`

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `once(event, callback)` to the emitter: subscribe a listener that runs **at most once**, then automatically unsubscribes. It returns `this` (chainable). The one-shot contract must hold even when:

- the listener is invoked and the event is emitted again;
- the listener **re-emits** the same event while running (re-entrancy);
- the caller removes the subscription with `off(event, callback)` before it ever fires.

`off` must accept the **original** `callback`, even though the stored value is a wrapper. Give the wrapper a back-reference to the original so removal can match either.

### Examples

```text
const e = new EventEmitter();
let calls = 0;
e.once("ready", () => { calls += 1; });

e.emit("ready")   // => true,  calls === 1
e.emit("ready")   // => false, calls === 1  (auto-removed)

// Removal by the original function works through the wrapper:
const e2 = new EventEmitter();
const handler = () => console.log("never");
e2.once("ready", handler);
e2.off("ready", handler)   // => true
e2.emit("ready")           // => false

// Re-entrant emit: the wrapper is removed before it runs, so it fires once.
const e3 = new EventEmitter();
e3.once("tick", () => { console.log("tick"); e3.emit("tick"); });
e3.emit("tick");           // logs "tick" once
```

### Approach

Two candidates:

1. **Flag inside a persistent listener.** Store a wrapper that checks `fired` and returns early on later calls. Wrong: the entry lingers in the map forever (a leak), `emit` keeps returning `true` for a dead subscription, and `off` bookkeeping is confusing.
2. **Self-removing wrapper.** `once` creates `wrapper`, registers it via `on`, and inside the wrapper calls `off(event, wrapper)` **before** invoking the original. Correct and leak-free.

The order in step 2 is the whole point: unsubscribe *first*, then call. That makes re-entrant `emit` safe (the wrapper is already gone) and guarantees the listener never runs twice even if it throws.

`this` must survive the indirection: `emit` calls `wrapper.call(emitter, ...args)`, so inside the wrapper `this` is the emitter; forward it with `callback.call(this, ...args)`.

Removal fidelity: attach `wrapper.listener = callback`, and make `off` match when `existing === callback || existing.listener === callback`. Without that, `off(event, original)` silently fails because the stored function is the wrapper.

> This example extends the minimal emitter from the previous problem. If your `on` already stores an array, `off` scans that array instead of comparing one value.

### Implementation

```javascript
off(event, callback) {
  const existing = this._events.get(event);
  if (existing === undefined) return false;
  // Match the stored function OR the original hidden behind a once-wrapper.
  if (existing === callback || existing.listener === callback) {
    return this._events.delete(event);
  }
  return false;
}

once(event, callback) {
  if (typeof callback !== "function") {
    throw new TypeError("listener must be a function");
  }
  const emitter = this;

  function wrapper(...args) {
    emitter.off(event, wrapper);         // remove FIRST, so re-entrant emit cannot re-fire
    return callback.call(this, ...args); // preserve the emitter as `this`
  }
  wrapper.listener = callback;           // lets off(event, original) find it

  return this.on(event, wrapper);        // chainable
}
```

### Walkthrough

`e3.once("tick", listener)` stores `"tick" -> wrapper`, with `wrapper.listener === listener`. Then `e3.emit("tick")`:

1. `emit` captures `wrapper` from the map and calls `wrapper.call(e3)`.
2. The wrapper immediately calls `e3.off("tick", wrapper)`, deleting the map entry. From this moment the subscription no longer exists.
3. The wrapper invokes `listener.call(e3)`. The listener logs `tick` and calls `e3.emit("tick")` again.
4. The inner `emit` finds no handler (`get` returns `undefined`) and returns `false`. No second call.
5. The outer `emit` returns `true`.

If instead the caller does `e2.off("ready", handler)` before any emit, `off` sees `existing` is `wrapper`; `wrapper !== handler` but `wrapper.listener === handler`, so it deletes and returns `true`.

### Complexity

Time: `once` is `O(1)`; each dispatch adds one `off` call, still `O(1)` average. Space: `O(1)` per subscription (one wrapper closure) plus whatever the original callback closes over.

### Edge Cases

- Re-entrant `emit` inside the handler → no second invocation, because removal happens first.
- Handler throws → subscription is already removed; the error propagates but the one-shot guarantee holds.
- `off(event, original)` → matches via `wrapper.listener`; `off(event, wrapper)` also works if the caller kept it.
- Registering the same `callback` twice with `once` → two independent wrappers, so it fires twice (once each). Dedup only if you deliberately track originals.
- `once` with a non-function → `TypeError`, same guard as `on`.
- Arrows ignore the bound `this`, as always; the one-shot behavior is unaffected.
- If the event never fires and is never removed, the entry stays until `off`/`removeAllListeners` — a subscription leak, not a wrapper leak.

### Interview Follow-ups

- **`prependOnceListener`** — insert at the front of the listener list so it runs before existing listeners, then removes itself.
- **Promise-flavoured `once`** — return a `Promise` that resolves with the next payload; keep the same remove-before-resolve discipline.
- **Remove-before vs remove-after** — explain why remove-before is correct under re-entrancy and exceptions.
- **Node's `once`** — Node uses exactly this wrapper technique and also charges the subscription against `maxListeners`.

### Common Mistakes

- Removing the wrapper *after* calling the callback, so a re-entrant `emit` runs it twice.
- Forgetting `wrapper.listener = callback`, breaking `off(event, original)`.
- Using an arrow for `wrapper` and losing the dynamic `this` from `emit`.
- Leaving the wrapper in the map and guarding with a `fired` flag — a slow memory leak and a wrong `emit` return.
- Forwarding with `callback(...args)` instead of `callback.call(this, ...args)`, so the listener's `this` is `undefined`.

### Takeaway

`once` is an `on` whose listener removes itself before it runs. Those two words — "before it runs" — are what make re-entrancy and error safety fall out for free.

## Support Multiple Listeners per Event

`Difficulty: Medium` `Probability: Very High`

### Problem

Generalize the emitter so an event can have **many** listeners, each called in registration order. `on` appends, `off` removes one matching listener, and `emit` calls every listener with the payload. Pin down the contract:

- **Ordering** — listeners fire in the order they were registered (FIFO). `prependListener` can insert at the front.
- **Duplicates** — registering the same function twice is allowed; both run, in order. (Some APIs dedupe with a `Set`; state your choice.)
- **Removal** — `off(event, callback)` removes the **most recently added** matching listener (Node's `removeListener` semantics); say so explicitly.
- **Isolation of iteration** — a listener may add or remove listeners during `emit`; doing so must not skip or double-run anyone already scheduled for this dispatch.
- **Return value** — `emit` returns the number of listeners invoked; state that.

### Examples

```text
const e = new EventEmitter();
const a = (x) => console.log("a", x);
const b = (x) => console.log("b", x);

e.on("go", a).on("go", b);
e.emit("go", 1)      // logs "a 1" then "b 1"; => 2

e.on("go", a);       // duplicate registration is allowed
e.emit("go", 2)      // logs "a 2", "b 2", "a 2"; => 3

e.off("go", a);      // removes the most recent `a`
e.emit("go", 3)      // logs "b 3", "a 3"; => 2

// Mutation during dispatch must not disturb THIS emit:
const order = [];
const e2 = new EventEmitter();
const second = () => order.push("second");
e2.on("t", () => { order.push("first"); e2.off("t", second); });
e2.on("t", second);
e2.emit("t");
order                // => ["first", "second"]  (snapshot: second still runs)
```

### Approach

Store `Map<event, Function[]>`. The single non-negotiable rule: **iterate a snapshot** of the listener array — `for (const fn of [...list])`. Mutating the live array during `for...of` makes the iterator observe insertions and skip or repeat entries; a copy freezes the dispatch set.

Three further decisions worth stating out loud:

1. **Array vs `Set`.** Arrays preserve order, allow duplicates, and make "remove one occurrence" meaningful. `Set` dedupes and deletes in `O(1)`, but loses duplicates and complicates `once` wrappers. Node uses arrays; choose arrays unless dedup is a stated requirement.
2. **Delete empties.** After `off`, if the array is empty, `delete` the event key so the map does not accumulate dead arrays — a real leak under dynamic event names.
3. **Which occurrence `off` removes.** Node removes the most recently added match, so `on(a); on(b); on(a); off(a)` leaves `[b, a]`. Implement by scanning from the end with `lastIndexOf`; scanning forward with `indexOf` removes the oldest instead.

`emit` does not stop on a throwing listener by default — that is error isolation, covered later. Decide deliberately rather than by accident.

### Implementation

```javascript
class EventEmitter {
  constructor() {
    this._listeners = new Map(); // event -> Function[]
  }

  on(event, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("listener must be a function");
    }
    let list = this._listeners.get(event);
    if (list === undefined) {
      list = [];
      this._listeners.set(event, list);
    }
    list.push(callback);
    return this;
  }

  prependListener(event, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("listener must be a function");
    }
    let list = this._listeners.get(event);
    if (list === undefined) {
      list = [];
      this._listeners.set(event, list);
    }
    list.unshift(callback);
    return this;
  }

  emit(event, ...args) {
    const list = this._listeners.get(event);
    if (list === undefined) return 0;

    const snapshot = [...list];          // freeze the dispatch set
    for (const listener of snapshot) {
      listener.call(this, ...args);      // this === emitter
    }
    return snapshot.length;              // number of listeners invoked
  }

  off(event, callback) {
    const list = this._listeners.get(event);
    if (list === undefined) return false;

    const index = list.lastIndexOf(callback); // remove the most recent match
    if (index === -1) return false;

    list.splice(index, 1);
    if (list.length === 0) this._listeners.delete(event); // avoid dead keys
    return true;
  }
}
```

### Walkthrough

Take the mutation example. `e2` has `["first", "second"]`. `emit("t")`:

1. `snapshot = [first, second]` — a distinct array.
2. Call `first`. It pushes `"first"` and calls `off("t", second)`, which splices `second` out of the **live** list and deletes the key because it is now empty.
3. The loop continues over `snapshot`, so `second` still runs and pushes `"second"`.
4. Result: `["first", "second"]`. A live-array loop would have skipped `second`.

For duplicates: after `on("go", a)` twice and `on("go", b)`, the list is `[a, b, a]`, so `emit` returns `3`. `off("go", a)` uses `lastIndexOf` → index `2`, leaving `[a, b]`; the most recent `a` is gone.

### Complexity

Time: `on` amortized `O(1)`; `emit` `O(k)` for `k` listeners plus an `O(k)` copy; `off` `O(k)` for the reverse scan and splice. Space: `O(L)` for `L` total listeners, plus `O(k)` per `emit` snapshot.

### Edge Cases

- No listeners → `emit` returns `0`, no throw.
- Duplicate callback → registered and invoked twice; `Set` storage would silently drop one.
- Removing the currently-running listener → the snapshot prevents it from affecting this dispatch; the next emit reflects the removal.
- Adding a listener during `emit` → it does **not** run in the current dispatch (not in the snapshot); it runs on the next.
- `off` for an unknown event or non-matching reference → `false`, no-op.
- Removed then re-added mid-dispatch → the old reference still runs once from the snapshot; the new registration waits.
- Empty-list cleanup → the event key is deleted, so long-lived emitters with dynamic event names stay bounded.
- Ordering → strictly registration order; never rely on `Map` key order for listener order.

### Interview Follow-ups

- **`listeners(event)` / `listenerCount(event)`** — return a *copy* of the array and the length; returning the live array lets callers mutate `_listeners` behind your back.
- **`rawListeners` vs `listeners`** — Node returns the `once` wrappers for `rawListeners` and the originals for `listeners`.
- **`maxListeners`** — Node warns above ten to surface listener leaks; implement a counter and a `console.warn`.
- **Error isolation** — wrap each `listener.call` in `try/catch` (or collect failures into an `AggregateError`) so one failure does not abort the rest.

### Common Mistakes

- Iterating the live array, so a listener that removes another causes a skip.
- Using `indexOf` when the contract says "remove the most recent" (`lastIndexOf`).
- Leaving empty arrays in the map — an unbounded leak with dynamic event names.
- Returning the internal array from `listeners()` and letting callers corrupt state.
- Assuming `emit` short-circuits on a thrown error — it does not unless you add isolation.

### Takeaway

Multiple listeners means an array per event and a snapshot per dispatch. Order, duplicate policy, and "which occurrence `off` removes" are API decisions, not accidents — write them down, then make the code match.

## Add `removeAllListeners`

`Difficulty: Easy` `Probability: High`

### Problem

Add `removeAllListeners(event?)` to the multi-listener `EventEmitter` from the previous problem (the `Map<event, Function[]>` version). The contract:

- `removeAllListeners(event)` removes every listener for `event` and returns `this`.
- `removeAllListeners()` with no argument removes **everything** and returns `this`.
- Removing a non-existent event is a silent no-op, not a throw.
- After removal the internal map must not retain empty arrays or dead keys — dynamic event names (per-user, per-request) otherwise leak.

### Examples

```text
const e = new EventEmitter();
e.on("a", fn1).on("a", fn2).on("b", fn3);

e.removeAllListeners("a")  // => e (chainable)
e.emit("a")                // => 0
e.emit("b")                // => 1 (untouched)

e.removeAllListeners()     // => e
e.emit("b")                // => 0

e.removeAllListeners("missing") // => e (no throw)
```

### Approach

This is a memory-management method disguised as a convenience. Two cases:

1. **With an event:** `delete` the key outright. Do not `list.length = 0` and leave the key — the empty array keeps the entry alive and a long-lived emitter with dynamic names grows without bound.
2. **Without an event:** `clear()` the whole map. Reassigning `this._listeners = new Map()` also works but abandons the old map; `clear()` keeps identity stable for anyone holding a reference (tests, subclasses).

Return `this` so teardown chains (`emitter.removeAllListeners().close()`). Accept `undefined` explicitly as "all" — but treat any other value, including symbols, as a concrete event key. No callback validation is needed here; there is no callback.

`once` wrappers need no special handling: they are plain entries in the array, so deleting the array deletes them too.

### Implementation

```javascript
class EventEmitter {
  // ... on / prependListener / emit / off as in the previous problem ...

  removeAllListeners(event) {
    if (event === undefined) {
      this._listeners.clear(); // drop every event at once
      return this;
    }
    this._listeners.delete(event); // no-op when the key is absent
    return this;
  }

  listenerCount(event) {
    return this._listeners.get(event)?.length ?? 0;
  }
}
```

### Walkthrough

`e` holds `"a" -> [fn1, fn2]`, `"b" -> [fn3]`. `removeAllListeners("a")`:

1. `event` is `"a"`, not `undefined`, so we take the single-event branch.
2. `this._listeners.delete("a")` removes the key and drops both references at once. `fn1` and `fn2` become collectable (assuming the caller holds no other reference).
3. Return `this`. `emit("a")` now finds no list and returns `0`; `emit("b")` still returns `1`.

`removeAllListeners()` with no argument calls `clear()`: both remaining keys vanish, and `listenerCount("b")` returns `0` via the `?? 0` fallback.

### Complexity

Time: `O(1)` for a single event (`Map.delete`); `O(e)` for the no-arg form where `e` is the event count (clearing `e` keys). Space: `O(1)` extra — removal only releases memory.

### Edge Cases

- Unknown event → `delete` returns `false`, ignored; still returns `this`, never throws.
- `removeAllListeners(undefined)` explicitly → clears everything (same as no argument).
- Symbol event keys work — `Map` keys are compared by identity, no string coercion.
- `once` wrappers are removed along with everything else; no `wrapper.listener` bookkeeping needed.
- Calling during `emit` is safe: `emit` already iterates a snapshot, so clearing mid-dispatch only affects the *next* dispatch.
- Falsy-but-defined names (`""`, `0`, `null`) are concrete events, not "all" — only `undefined` means all.

### Interview Follow-ups

- **`removeListener` vs `removeAllListeners` return types** — Node returns the emitter from both; why chainability matters for teardown sequences.
- **Bulk-remove by predicate** — remove every listener matching a function across all events; scan entries and reuse the `off` splice logic.
- **`maxListeners` accounting** — reset any per-event warning counters when the list is deleted.
- **Weak references** — could listeners be held weakly so forgotten subscriptions GC themselves? (Overkill; explicit removal is the contract.)

### Common Mistakes

- Setting `list.length = 0` instead of `delete(event)` — the dead key and empty array linger.
- Returning `undefined` instead of `this`, breaking teardown chains.
- Throwing on an unknown event instead of no-op-ing.
- Treating every falsy value as "remove all" — `removeAllListeners("")` must clear only `""`.
- Reassigning `this._listeners` in a subclass-unfriendly way when `clear()` preserves identity.

### Takeaway

`removeAllListeners` is leak control: delete the key for one event, clear the map for all, and never leave empty arrays behind.

## Implement Event Namespaces

`Difficulty: Medium` `Probability: Medium`

### Problem

Extend the multi-listener `EventEmitter` with a namespace convention: event names are `namespace:event` strings such as `"user:login"` or `"cart:add"`. Add:

- `on`, `emit`, `off` work unchanged — namespaces are just structured names.
- `removeNamespace(namespace)` — delete **every** event whose name is exactly `namespace` or starts with `namespace + ":"`. Returns `this`.
- `emit` returns the number of listeners invoked, as before; `removeNamespace` of an unknown namespace is a no-op returning `this`.

### Examples

```text
const e = new EventEmitter();
e.on("user:login", onLogin).on("user:logout", onLogout).on("cart:add", onAdd);

e.emit("user:login", user)  // => 1
e.removeNamespace("user")   // => e
e.emit("user:login", user)  // => 0 (gone)
e.emit("user:logout")       // => 0 (gone)
e.emit("cart:add", item)    // => 1 (untouched)

e.removeNamespace("missing") // => e (no throw)
```

### Approach

Namespaces are a naming convention, not a second data structure. Keep the single `Map<event, Function[]>` and implement `removeNamespace` as a **prefix scan**: collect matching keys first, then delete them. Collect-then-delete matters because deleting from a `Map` while iterating it is legal in JS but easy to misread; a two-phase pass is obviously correct.

The match rule needs the `":"` boundary: namespace `"user"` matches `"user"` itself and `"user:login"` but **not** `"username:login"`. So the predicate is `key === ns || key.startsWith(ns + ":")`. Non-string keys (symbols) never match a string namespace — skip them with a `typeof` guard rather than coercing.

Do not change `emit` dispatch: namespaces add no routing, only bulk removal. If teardown must be atomic with respect to a concurrent `emit`, rely on the existing snapshot — `emit` already iterates a copy, so deleting keys mid-dispatch only affects the next emit.

### Implementation

```javascript
class EventEmitter {
  // ... on / emit / off / removeAllListeners as in the previous problems ...

  removeNamespace(namespace) {
    if (typeof namespace !== "string") {
      throw new TypeError("namespace must be a string");
    }
    const prefix = namespace + ":";
    const doomed = []; // collect first, delete second
    for (const key of this._listeners.keys()) {
      if (typeof key !== "string") continue; // symbols are never namespaced
      if (key === namespace || key.startsWith(prefix)) doomed.push(key);
    }
    for (const key of doomed) this._listeners.delete(key);
    return this;
  }
}
```

### Walkthrough

Map holds `"user:login"`, `"user:logout"`, `"cart:add"`. `removeNamespace("user")`:

1. `prefix` is `"user:"`.
2. Scan keys: `"user:login"` starts with `"user:"` → doomed. `"user:logout"` → doomed. `"cart:add"` → neither equal nor prefixed → kept.
3. Delete the two doomed keys. Their listener arrays drop to zero references and GC.
4. Return `this`. The next `emit("user:login")` finds no list and returns `0`.

A key like `"username:login"` would not match: it is not `=== "user"` and does not start with `"user:"` — the colon boundary prevents the false positive.

### Complexity

Time: `O(e)` for `e` distinct events — one scan plus one delete per match. Space: `O(m)` for the `m` matched keys held temporarily; could delete inline for `O(1)` but the two-phase form is clearer.

### Edge Cases

- `"user"` must not remove `"username:login"` — the `ns + ":"` boundary is the whole contract.
- Non-string keys (symbols) are skipped, never coerced with `String(key)`.
- Empty-string namespace `""` → prefix `":"`; only events literally `""` or starting with `":"` match. Document it; do not special-case it into "remove all".
- Nested namespaces (`"app:user:login"`) work: `removeNamespace("app")` clears them, `removeNamespace("app:user")` clears the subset.
- Removal during `emit` is safe via the dispatch snapshot; the in-flight emit finishes, the next one sees the deletion.
- Non-string `namespace` argument throws `TypeError` rather than silently matching nothing.

### Interview Follow-ups

- **Hierarchical emit** — should `emit("user:login")` also fire `"user"` or `"*"` listeners? That is wildcard routing, the next problem.
- **Namespace `off`** — remove one callback from every event in a namespace; combine the prefix scan with the `lastIndexOf` + splice from `off`.
- **Case sensitivity** — `"User:login"` vs `"user:login"` are distinct; normalise only if the spec says so.
- **Separator choice** — `:` vs `/` vs `.`; dots collide with property-path conventions, colons read cleanly.

### Common Mistakes

- Using `key.startsWith(ns)` without the colon — deletes `"username:..."` by accident.
- Deleting inside the iteration without realising `Map` iteration semantics, then skipping keys in other structures (arrays would break; `Map` tolerates it, but collect-then-delete is unambiguous).
- Coercing symbol keys to strings, creating phantom matches or throwing.
- Building a parallel namespace index that drifts out of sync with the listener map.
- Forgetting chainability (`return this`) on a teardown method.

### Takeaway

Namespaces are a string convention plus a prefix scan. The contract is one predicate — exact match or `namespace + ":"` prefix — and bulk deletion that leaves no dead keys.

## Implement Wildcard Subscriptions

`Difficulty: Medium` `Probability: Medium`

### Problem

Add wildcard matching to the multi-listener emitter so one subscription can observe many events:

- `on("user:*", fn)` fires `fn` for any event starting with `"user:"`. `on("*", fn)` fires for **every** event.
- `emit(event, ...args)` invokes exact listeners first (registration order), then matching wildcard listeners (registration order), and returns the total count invoked.
- `off(event, callback)` removes using the same pattern string passed to `on` — `off("user:*", fn)`, not `off("user:login", fn)`.
- Exact event names never contain `*`; only subscription patterns do. Keep the `Map<event, Function[]>` for exact listeners and a separate ordered list for wildcard entries.

### Examples

```text
const e = new EventEmitter();
e.on("user:login", exact);
e.on("user:*", audit);
e.on("*", metrics);

e.emit("user:login", u)   // exact, then audit, then metrics; => 3
e.emit("user:logout", u)  // audit, then metrics; => 2
e.emit("cart:add", item)  // metrics only; => 1

e.off("user:*", audit)    // => true
e.emit("user:login", u)   // exact + metrics; => 2
```

### Approach

Split storage in two: the existing `Map` for exact events, plus an array `this._wildcards` of `{ pattern, listener }` in registration order. `emit` then:

1. Snapshot the exact list (`[...list]`) and the wildcard list (`[...this._wildcards]`) — both snapshots, because a listener may subscribe or unsubscribe mid-dispatch and must not disturb the in-flight emit.
2. Run exact listeners first with `listener.call(this, ...args)`.
3. Filter the wildcard snapshot by match (`pattern === "*"` or `event.startsWith(pattern.slice(0, -1))`) and run those, forwarding the **event name as the first argument** (`listener.call(this, event, ...args)`) so a wildcard handler knows which event fired.

Why pass the event name to wildcards but not exact listeners? An exact listener already knows its event; a `user:*` handler does not. State the asymmetry explicitly — it is the detail interviewers probe.

`off` checks the exact map first, then scans `_wildcards` from the end (most-recent match, consistent with `off` semantics).

### Implementation

```javascript
class EventEmitter {
  constructor() {
    this._listeners = new Map(); // exact event -> Function[]
    this._wildcards = [];        // [{ pattern, listener }] in registration order
  }

  on(event, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("listener must be a function");
    }
    if (typeof event === "string" && event.includes("*")) {
      if (event !== "*" && !event.endsWith(":*")) {
        throw new Error(`unsupported wildcard pattern: ${event}`);
      }
      this._wildcards.push({ pattern: event, listener: callback });
      return this;
    }
    let list = this._listeners.get(event);
    if (list === undefined) {
      list = [];
      this._listeners.set(event, list);
    }
    list.push(callback);
    return this;
  }

  emit(event, ...args) {
    const exact = this._listeners.get(event);
    const exactSnap = exact === undefined ? [] : [...exact]; // snapshot
    const wildSnap = [...this._wildcards];                   // snapshot
    for (const listener of exactSnap) listener.call(this, ...args);
    let count = exactSnap.length;
    for (const { pattern, listener } of wildSnap) {
      const hit = pattern === "*" ||
        (typeof event === "string" && event.startsWith(pattern.slice(0, -1)));
      if (hit) {
        listener.call(this, event, ...args); // wildcards receive the event name
        count += 1;
      }
    }
    return count;
  }

  off(event, callback) {
    if (typeof event === "string" && event.includes("*")) {
      // Match the pattern AND the function, scanning newest-first.
      for (let i = this._wildcards.length - 1; i >= 0; i -= 1) {
        if (this._wildcards[i].pattern === event && this._wildcards[i].listener === callback) {
          this._wildcards.splice(i, 1);
          return true;
        }
      }
      return false;
    }
    const list = this._listeners.get(event);
    if (list === undefined) return false;
    const index = list.lastIndexOf(callback);
    if (index === -1) return false;
    list.splice(index, 1);
    if (list.length === 0) this._listeners.delete(event);
    return true;
  }
}
```

### Walkthrough

After the three `on` calls: exact map has `"user:login" -> [exact]`; `_wildcards` is `[{user:*, audit}, {*, metrics}]`. `emit("user:login", u)`:

1. `exactSnap = [exact]`, `wildSnap` copies both wildcard entries.
2. `exact(u)` runs with `this === emitter`. Count is `1`.
3. `matches("user:*", "user:login")` → prefix `"user:"` matches → `audit("user:login", u)` runs. Count is `2`.
4. `"*"` always hits → `metrics("user:login", u)` runs. Count is `3`. Return `3`.

If `audit` calls `off("*", metrics)` while running, it mutates the live `_wildcards` but `wildSnap` still holds `metrics`, so `metrics` runs this time and disappears next time.

### Complexity

Time: `emit` is `O(k + w)` for `k` exact listeners and `w` wildcard entries (each checked once), plus two `O(...)` copies. Space: `O(k + w)` per dispatch for the snapshots.

### Edge Cases

- `off("user:login", audit)` does **not** remove `on("user:*", audit)` — removal keys on the pattern string, not the fired event.
- Symbol events never match string wildcards; `"*"` matches every *string* event (decide and document whether it matches symbols — here it does not).
- Invalid patterns (`"us*r"`, `"user*"`) throw at registration rather than silently never matching.
- Wildcard handlers receive `(event, ...args)` — arity differs from exact handlers; document it.
- A throwing wildcard listener aborts later listeners unless you add per-listener `try/catch`.
- `removeAllListeners()` with no args must clear `_wildcards` too, or `"*"` handlers leak across teardowns.

### Interview Follow-ups

- **`**` multi-segment globs** (`"app:**"` crossing colons) vs single-segment `"*"` — define how many levels each crosses.
- **Ordering guarantees** — exact-before-wildcard vs pure registration order across both stores; either is defensible, but write it down.
- **Performance** — with hundreds of patterns, index wildcards by prefix in a trie instead of a linear scan.

### Common Mistakes

- Forgetting the event-name first argument, so wildcard handlers cannot tell which event fired.
- Iterating live `_wildcards` during `emit`, skipping handlers when one unsubscribes mid-dispatch.
- Matching `off` by function alone and removing the wrong pattern's entry.
- Allowing `*` in emitted event names, turning dispatch into ad-hoc glob evaluation.
- Leaking `_wildcards` in `removeAllListeners()` / `removeNamespace` by clearing only the exact map.

### Takeaway

Wildcards are a second ordered store consulted on every emit. Snapshot both stores, run exact listeners first, and hand wildcard handlers the event name — then make `off` key on the pattern string.

## Implement a Basic Pub/Sub System

`Difficulty: Medium` `Probability: High`

### Problem

Build a standalone `PubSub` broker — the decoupled Kelkoo of the event emitter — with:

- `subscribe(topic, callback)` — register `callback` for `topic`. Returns an **unsubscribe function** that removes exactly that registration when called.
- `unsubscribe(topic, callback)` — remove the most recent matching registration; returns `boolean`.
- `publish(topic, data)` — invoke every subscriber for `topic` with `data` (single payload, not variadic). Returns the number of subscribers invoked.
- Publishers never see subscribers and vice versa — both only know the broker and the topic string. One subscriber throwing must not prevent the rest from running (error isolation).

### Examples

```text
const bus = new PubSub();
const unsub = bus.subscribe("prices", (p) => console.log("A", p));
bus.subscribe("prices", (p) => console.log("B", p));

bus.publish("prices", 99)  // logs A 99, B 99; => 2
unsub();                    // removes A only
bus.publish("prices", 100) // logs B 100; => 1
bus.publish("unknown", 1)  // => 0 (no throw)

bus.subscribe("prices", () => { throw new Error("boom"); });
bus.publish("prices", 5)   // B still runs; the error is collected, not swallowed silently
```

### Approach

The mechanics mirror the multi-listener emitter (`Map<topic, Function[]>`, snapshot per publish), but three decisions make it pub/sub rather than an emitter:

1. **Unsubscribe function over method.** `subscribe` returns a closure capturing `(topic, callback)` with an idempotent guard — calling it twice removes once and returns `false` the second time. This is the React-`useEffect`-cleanup shape interviewers expect.
2. **Single-payload `publish(topic, data)`.** Topics carry one message value, not variadic event args. The uniformity is what lets publishers and subscribers stay ignorant of each other.
3. **Error isolation.** Wrap each `callback(data)` in `try/catch`, collect failures, and continue dispatching. After all subscribers run, throw an `AggregateError` if anything failed (or report via an `onError` hook). Swallowing errors silently is worse than crashing — a subscriber that throws must be visible *and* non-fatal to its neighbours.

Snapshot the subscriber array before iterating, exactly as with `emit`: a subscriber that unsubscribes (or subscribes) mid-publish affects only the next publish.

### Implementation

```javascript
class PubSub {
  constructor() {
    this._topics = new Map(); // topic -> Function[]
  }

  subscribe(topic, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("subscriber must be a function");
    }
    let list = this._topics.get(topic);
    if (list === undefined) {
      list = [];
      this._topics.set(topic, list);
    }
    list.push(callback);

    let active = true;
    return () => { // idempotent cleanup closure
      if (!active) return false;
      active = false;
      return this.unsubscribe(topic, callback);
    };
  }

  unsubscribe(topic, callback) {
    const list = this._topics.get(topic);
    if (list === undefined) return false;
    const index = list.lastIndexOf(callback);
    if (index === -1) return false;
    list.splice(index, 1);
    if (list.length === 0) this._topics.delete(topic); // no dead topics
    return true;
  }

  publish(topic, data) {
    const list = this._topics.get(topic);
    if (list === undefined) return 0;
    const snapshot = [...list]; // freeze the dispatch set
    const failures = [];
    for (const subscriber of snapshot) {
      try {
        subscriber(data); // single payload; no `this` contract (called plain)
      } catch (error) {
        failures.push(error); // isolate: keep dispatching
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `PubSub: ${failures.length} subscriber(s) failed`);
    }
    return snapshot.length;
  }
}
```

### Walkthrough

`subscribe("prices", A)` then `subscribe("prices", B)`: topic holds `[A, B]`, and the first call returns an `unsub` closure over `("prices", A)`. `publish("prices", 99)`:

1. `snapshot = [A, B]`.
2. `A(99)` logs `A 99`; `B(99)` logs `B 99`. No failures, so no throw. Return `2`.
3. `unsub()` sets `active = false` and splices `A` out, leaving `[B]`. A second `unsub()` call hits the guard and returns `false`.
4. `publish("prices", 100)` snapshots `[B]`, runs it, returns `1`.

When the throwing subscriber joins (`[B, boom]`) and `publish("prices", 5)` runs: `B(5)` logs, `boom` throws into `failures`, the loop continues (nothing skipped), then an `AggregateError` carrying the original error propagates. `B` already ran.

### Complexity

Time: `publish` is `O(k)` for `k` subscribers plus an `O(k)` snapshot copy; `subscribe` amortized `O(1)`; `unsubscribe` `O(k)` for the scan and splice. Space: `O(T)` total subscribers plus `O(k)` per publish snapshot and `O(f)` failures.

### Edge Cases

- Unknown topic → `publish` returns `0`, no throw; `unsubscribe` returns `false`.
- Duplicate subscription of the same function → two entries; one `unsub()` removes one (most recent).
- Double-calling the returned unsubscribe → second call is a `false` no-op, never removes a *different* duplicate.
- Throwing subscriber → isolated via `try/catch`; surfaced as `AggregateError`, never swallowed.
- Subscribe/unsubscribe during `publish` → snapshot semantics: current dispatch unaffected, next publish reflects the change.
- Subscribers are called plain (`subscriber(data)`), not bound to the broker — pub/sub handlers must not depend on `this`.
- Empty-topic cleanup (`delete` when the list empties) so dynamic topics do not leak.

### Interview Follow-ups

- **Sticky / replay topics** — cache the last payload and immediately deliver it to late subscribers (like `BehaviorSubject`).
- **Async delivery** — queue `publish` on a microtask so publishers never run subscriber code re-entrantly; ordering and error-surfacing change.
- **`onError` hook vs `AggregateError`** — production brokers often route failures to a handler instead of throwing from `publish`.
- **Unsubscribe-all / `clear()`** — broker teardown for tests; same dead-key discipline as `removeAllListeners`.

### Common Mistakes

- Letting one throwing subscriber abort the loop — the defining pub/sub bug.
- Swallowingcaught errors entirely instead of surfacing them (`AggregateError` or a hook).
- Returning `this` from `subscribe` instead of the cleanup function.
- Non-idempotent cleanup closures that remove a *different* duplicate registration on second call.
- Binding subscribers to the broker (`call(this, ...)`) and encouraging `this`-dependent handlers across a decoupling boundary.

### Takeaway

Pub/sub is an emitter with a decoupling contract: `subscribe` returns cleanup, `publish` carries one payload, and every subscriber runs in its own `try/catch` so neighbours never pay for one failure.

## Implement an Observable-Style Subscription API

`Difficulty: Hard` `Probability: Medium`

### Problem

Build a minimal observable — `createObservable(subscribeFn)` returning `{ subscribe }` — with this contract:

- `subscribe(observerOrNext)` accepts an observer `{ next?, error?, complete? }` or a bare `next` function. Returns a subscription `{ unsubscribe, closed }`.
- The producer `subscribeFn(observer)` may return a teardown function (or `{ unsubscribe }`); calling `subscription.unsubscribe()` runs it exactly once and stops further signals.
- Terminal states: after `error` or `complete`, the subscription closes — `next` calls are ignored and teardown runs. `error` with no `error` handler **throws** (it must never vanish silently).
- Late `unsubscribe` is idempotent; signals after `unsubscribe` are dropped.

### Examples

```text
const ticks = createObservable((observer) => {
  let n = 0;
  const id = setInterval(() => observer.next(n += 1), 10);
  return () => clearInterval(id); // teardown
});

const sub = ticks.subscribe({ next: (v) => console.log(v) });
sub.unsubscribe(); // timer cleared, exactly once; sub.closed === true

// Terminal states close automatically:
const done = createObservable((o) => { o.next(1); o.complete(); o.next(2); });
done.subscribe({ next: (v) => console.log(v), complete: () => console.log("done") });
// logs 1, then "done"; the second next(2) is dropped

// Unhandled errors must surface:
const bad = createObservable((o) => o.error(new Error("boom")));
bad.subscribe({ next: () => {} }); // => throws Error("boom")
```

### Approach

An observable is a function that installs a producer per subscriber, wrapped in a **closed-flag gate**. Every signal path (`next`/`error`/`complete` delivered to the observer, plus `unsubscribe`) checks `closed` first:

1. **Normalise the observer.** A bare function becomes `{ next: fn }`. Missing `error`/`complete` become no-ops — except a missing `error` handler must rethrow, or failures disappear.
2. **Wrap signals, not the producer.** Give the producer a safe observer whose `next` drops when `closed`, whose `error`/`complete` set `closed = true` *before* invoking the handler and then run teardown. Close-before-invoke is the `once` remove-before-run rule again: a handler that re-emits or unsubscribes re-entrantly cannot resurrect the stream.
3. **Capture teardown once.** If `subscribeFn` returns a function (or subscription-like), store it; `unsubscribe` runs it at most once via the same `closed` guard. If `subscribeFn` itself throws synchronously, deliver it to `error` — the subscriber must see producer failures as stream errors.

Error isolation here differs from pub/sub: there is one observer per subscription, so no neighbour to protect — the rule is that terminal signals run teardown and unhandled errors throw.

### Implementation

```javascript
function createObservable(subscribeFn) {
  if (typeof subscribeFn !== "function") {
    throw new TypeError("subscribeFn must be a function");
  }

  return {
    subscribe(observerOrNext) {
      const observer = typeof observerOrNext === "function"
        ? { next: observerOrNext }
        : (observerOrNext ?? {});

      let closed = false;
      let teardown = undefined;

      const subscription = {
        get closed() { return closed; },
        unsubscribe() {
          if (closed) return; // idempotent
          closed = true;
          runTeardown();
        },
      };

      function runTeardown() {
        if (typeof teardown === "function") teardown();
        else if (teardown?.unsubscribe) teardown.unsubscribe();
        teardown = undefined; // run at most once
      }

      const safe = {
        next(value) {
          if (closed) return; // terminal or unsubscribed: drop
          observer.next?.(value);
        },
        error(err) {
          if (closed) return;
          closed = true; // close BEFORE invoking, so re-entrant signals drop
          try {
            if (typeof observer.error === "function") observer.error(err);
            else throw err; // unhandled errors must surface, never vanish
          } finally {
            runTeardown(); // teardown runs even when the handler throws
          }
        },
        complete() {
          if (closed) return;
          closed = true;
          try {
            observer.complete?.();
          } finally {
            runTeardown();
          }
        },
      };

      try {
        teardown = subscribeFn(safe); // producer installs per subscriber
        if (closed) runTeardown();    // terminated synchronously: clean up the just-returned teardown now
      } catch (err) {
        if (closed) throw err; // thrown out of a terminal handler: propagate, do not re-wrap
        safe.error(err);       // synchronous producer failure becomes a stream error
      }
      return subscription;
    },
  };
}
```

### Walkthrough

`done.subscribe({ next, complete })` where the producer calls `next(1); complete(); next(2)`:

1. `subscribe` normalises the observer, sets `closed = false`, builds `safe` and `subscription`.
2. `subscribeFn(safe)` runs: `safe.next(1)` → open, so `observer.next(1)` logs `1`.
3. `safe.complete()` → sets `closed = true` first, calls `observer.complete()` (logging `"done"`), then `runTeardown()` fires (a no-op here — the producer has not returned yet). Control returns into `subscribeFn`, which returns; back in `subscribe` the returned teardown is stored, and the `if (closed) runTeardown()` line fires it immediately. Without that check a synchronously-completing producer would leak its resources.
4. `safe.next(2)` → `closed` is `true`, dropped silently. The stream delivered exactly one terminal signal.

For `ticks`: the producer starts an interval and returns the `clearInterval` teardown. `sub.unsubscribe()` sets `closed = true` and runs the teardown; the next interval callback hits `safe.next` with `closed === true` and is dropped. A second `unsubscribe()` returns early.

### Complexity

Time: `O(1)` per signal — a flag check plus one handler call. Space: `O(1)` per subscription (the closure triple of observer/teardown/subscription) plus whatever the producer allocates.

### Edge Cases

- Bare-function subscribe (`subscribe((v) => ...)`) → treated as `next`-only; `error` rethrows, `complete` is a no-op.
- `null`/`undefined` observer → all signals dropped except unhandled `error`, which throws.
- Producer throws synchronously → routed to `safe.error`, so the subscriber sees it (or it throws when unhandled).
- Handler throws inside `error`/`complete` → `finally` still runs teardown; the exception propagates to whoever signalled.
- Re-entrant `unsubscribe` inside `next` → sets `closed`, so subsequent signals in the same burst drop.
- Teardown that is neither a function nor subscription-like → ignored; never throws.
- Every path to `closed = true` nulls teardown after running — the anti-leak guarantee for interval-style producers.

### Interview Follow-ups

- **Operators (`map`, `filter`, `take`)** — each returns a new observable wrapping the source's `subscribe`; `take(n)` unsubscribes after `n` values.
- **Multicasting (`Subject`)** — one producer fanning out to many observers reintroduces snapshot-during-emit and per-observer error isolation.
- **RxJS interop** — real observables add `closed` checks on the *producer* side too and schedule teardown via `Subscription.add`.

### Common Mistakes

- Setting `closed = true` *after* invoking the handler, so re-entrant `next` slips through during `complete`.
- Running teardown before the terminal handler, tearing down resources the handler still needs.
- Swallowing unhandled `error` with an `?.` no-op — the silent-failure bug this contract exists to prevent.
- Non-idempotent `unsubscribe` that runs interval-clearing (or ref-counted) teardown twice.
- Forgetting to route a synchronous `subscribeFn` throw into `error`, leaving the subscriber hanging with `closed === false`.

### Takeaway

An observable is a per-subscriber producer behind a closed-flag gate: close before delivering anything terminal, run teardown exactly once, and never let an error vanish silently.

