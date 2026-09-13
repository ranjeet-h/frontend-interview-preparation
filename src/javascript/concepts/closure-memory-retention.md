# Closure Memory Retention

## 1. Why This Exists — The Problem First

A screen is removed, but its timer keeps firing. A global event listener still points at a callback from an old render. A cache grows because every callback quietly keeps one more result alive. These bugs are confusing because the code that created the data has already returned, yet the browser still cannot reclaim it.

The missing question is not “did this function finish?” It is “can the garbage collector still reach the values through a live closure?” Closure memory retention explains both sides of the story: why callbacks and private state work after their outer function returns, and why an uncleaned callback can keep large objects alive longer than the feature needs them.

## 2. The Analogy — Make It Obvious

Imagine leaving a workshop with a locked toolbox. The workshop is the outer function. The tools inside are its local variables. A closure is a small set of instructions that leaves with the toolbox key, so it can return later and read or change those tools even though the workshop session is over.

The key is the important part. If nobody has the key, the workshop and its tools can be cleared. If a long-lived timer, DOM listener, or global registry still stores the instructions, that reference is still a path to the key and therefore to the tools. The tools are retained because they are reachable, not because the outer function is somehow still running.

This also explains the difference between useful retention and a leak. Keeping a counter alive while its returned `increment` function is needed is intentional. Keeping a 200 MB response alive through a listener that should have been removed is accidental retention. The mechanism is the same; the ownership decision is different.

## 3. How It Actually Works — The Full Explanation

When JavaScript creates a function inside another scope, the inner function carries access to the lexical environment where it was created. In everyday terms, it remembers the variables it may need. The specification describes this connection with the function's internal `[[Environment]]` reference; the engine can implement the details differently, but the observable rule is stable.

Consider this sequence:

1. `createCounter` creates a lexical environment containing `count`.
2. The returned arrow function is created while that environment is current, so it can access `count`.
3. `createCounter` returns. Its call-stack execution record is gone; the function is not still executing.
4. The global variable `counter` now points to the returned function.
5. The function points to the environment containing `count`, so `count` is reachable through `counter` and remains available.

Garbage collection follows reachability from roots such as global objects, active stack work, scheduled callbacks, and browser-managed objects. If a root can follow references to a closure, then to its captured environment, then to an object stored in that environment, the object is live for collection purposes. If every path is broken, the object becomes eligible for collection. Eligibility does not mean that memory is freed at that exact line; collection happens later according to the engine's strategy.

A closure does not necessarily retain every local variable in a source file forever. Engines can optimize environments, and only values that remain observable through live references need to be preserved. As a developer, the safe rule is to reason about the references your callback can use, then remove the callback or clear the captured holder when the work ends.

The most common retention paths are:

- A one-shot `setTimeout` retains its callback until it runs or `clearTimeout` cancels it; after it runs, that timeout does not keep scheduling the callback.
- A `setInterval` retains its callback and keeps scheduling it until `clearInterval` stops future ticks and breaks that timer's callback path.
- An event target retains a registered listener until the same listener is removed or an abort signal removes it.
- A long-lived array, map, singleton, or cache retains a callback that was pushed into it.
- A returned function intentionally retains private state for as long as callers retain that function.

Event listeners deserve a precise explanation. Removing an element from the document does not automatically mean that every application reference is gone. A listener attached to `window`, `document`, or another long-lived target can keep its closure alive until cleanup. A detached element can remain alive only when a live target reference or closure path reaches the node—for example, application code retains the target, or a retained closure captures the node. Holding only the listener function is not enough to retain the target or node. The practical fix is lifecycle cleanup: use the same function identity with `removeEventListener`, or use an `AbortController` signal and abort it when the owner is destroyed.

In React, each render creates functions that close over that render's props and state. An effect that starts a timer or listener must return cleanup for that exact resource. Missing cleanup can cause duplicate work, stale reads, and retained render data. A dependency array controls when React replaces an effect; it does not cancel a timer or listener by itself.

## 4. Real Code — See It Working

```js
function createCounter() {
  let count = 0;

  return function increment() {
    // The returned function is the live reference that keeps `count` usable.
    return ++count;
  };
}

const counter = createCounter();
console.log(counter()); // 1
console.log(counter()); // 2
```

The outer call has finished, but `counter` still reaches the environment containing `count`. This is useful retention: the state belongs to the counter and is bounded by the lifetime of `counter`.

```js
const target = new EventTarget();

function subscribeToUpdates(payload) {
  const onUpdate = () => console.log(payload.id);

  target.addEventListener("update", onUpdate);

  return function unsubscribe() {
    // Removing the exact listener breaks the target -> closure -> payload path.
    target.removeEventListener("update", onUpdate);
  };
}

const stopListening = subscribeToUpdates({ id: "order-42" });
target.dispatchEvent(new Event("update")); // order-42
stopListening();
target.dispatchEvent(new Event("update")); // no output
```

The important detail is the function identity. Creating a new arrow function inside `removeEventListener` would not remove the registered listener because it would be a different function object.

```js
function startPolling(readValue, onValue) {
  const timer = setInterval(() => {
    // The callback closes over the caller's functions until the timer is cleared.
    onValue(readValue());
  }, 10);

  return function stopPolling() {
    // Cleanup ends future callbacks and releases this timer's callback path.
    clearInterval(timer);
  };
}

let reads = 0;
const stopPolling = startPolling(
  () => ++reads,
  (value) => {
    if (value === 2) stopPolling();
  },
);

setTimeout(() => {
  console.log(reads >= 2); // true
}, 50);
```

The exact number of timer ticks can vary, but cleanup is deterministic: once `clearInterval` runs, that interval cannot schedule another tick. In application code, the owner of the polling feature should always own and call the returned cleanup function.

```js
const productResponseCache = new Map();

function cacheProductResponse(productId, response) {
  const readResponse = () => response;

  // The long-lived Map -> readResponse -> response path keeps the response reachable.
  productResponseCache.set(productId, readResponse);
}

function evictProductResponse(productId) {
  // Explicit eviction removes the cache's path to the closure and its response.
  productResponseCache.delete(productId);
}

cacheProductResponse("sku-42", {
  productId: "sku-42",
  title: "Noise-cancelling headphones",
  recommendations: new Array(10_000).fill("related-product"),
});

console.log(productResponseCache.get("sku-42")().title); // Noise-cancelling headphones
console.log(productResponseCache.has("sku-42")); // true

evictProductResponse("sku-42");
console.log(productResponseCache.has("sku-42")); // false
```

This is runnable in Node and models a common server-side response cache: the `Map` stores a closure, and that closure keeps the response object reachable. After eviction, no cache reference remains; garbage collection may reclaim the response later if no other reference exists. A detached DOM node needs browser APIs and is therefore explained as a browser lifecycle case above, not simulated with a fake Node API.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does a local variable survive after its outer function returns?**

The call-stack record for the outer invocation is finished, but the returned inner function still has access to the outer lexical environment. If a live reference points to that inner function, the environment and the values needed through it remain reachable. The outer function is not running again; the closure is carrying the access path forward.

**Q: Is closure memory retention automatically a memory leak?**

No. Retention is the normal behavior that makes closures useful. It becomes a leak when a closure remains reachable after the feature no longer needs it, especially when it captures a large object or is registered repeatedly. A private counter retained by its active API is intentional; an old listener retained by `window` after a component is gone is not.

**Q: What makes a captured object eligible for garbage collection?**

Every path from a garbage-collection root to the closure and its captured object must be broken. That might mean assigning the last closure reference away, clearing a timer, removing an event listener, deleting a cache entry, or releasing a subscription. The object then becomes eligible; the engine may reclaim it during a later collection cycle, not necessarily immediately.

**Q: How do event listeners retain closure data?**

The event target stores the listener so it can call it later. If the listener closes over `payload`, the target-to-listener reference is also a path to `payload`. A long-lived target such as `window` can therefore retain data from an old feature until the listener is removed. Use a stable listener reference, an unsubscribe function, or an `AbortController` for lifecycle cleanup.

**Q: Can a circular reference prevent garbage collection?**

Not by itself. Modern tracing collectors keep objects that are reachable from roots and can collect a cycle that is disconnected from all roots. The real leak is an unwanted root-to-cycle path, such as a global registry retaining one member of the cycle.

**Q: How do closures provide private state?**

The outer scope does not expose its local binding directly. It returns functions that form the allowed interface, and those functions retain access to the binding. This is encapsulation, not a security boundary: debugging tools can still inspect runtime memory, and code with access to the returned API can call whatever operations that API provides.

**Q: What is a stale closure in a React effect?**

A callback from an earlier render can keep reading the props or state values from that render. For example, an interval created once may keep the initial `count` unless the effect is recreated with the right dependencies or the callback uses a functional state update. Cleanup prevents old intervals from continuing, while dependency design determines which render's values a current callback sees.

## 6. The Traps — What Goes Wrong

**Trap: “The outer function returned, so all its locals are gone.”**

Returning only removes the active call-stack work. It does not remove a lexical environment that a live closure can still reach. A counter, memoized result, or callback proves that the values are still needed by the program.

**Trap: “Every closure captures the whole outer scope forever.”**

The observable guarantee is access to bindings the function may use, not a promise that every unrelated local is retained forever. Engines can optimize representation. Do not depend on a particular optimization; keep captured values small and avoid putting large payloads in a long-lived closure when only an identifier is needed.

**Trap: “Removing a DOM node always removes the leak.”**

The target may still be referenced by application code, or a retained closure may still capture the node; listeners on `window` or `document` are independent of that node's position in the document. Holding only a listener function does not by itself retain its target or a detached node. Pair registration with explicit cleanup and make the owner responsible for calling it.

**Trap: “A new function with the same body removes the listener.”**

Listener removal compares the function object, not its source text. This fails:

```js
const target = new EventTarget();

target.addEventListener("update", () => console.log("update"));
target.removeEventListener("update", () => console.log("update")); // different function
```

Store the callback or use an abort signal so cleanup refers to the registration that actually exists.

**Trap: “Setting a dependency array makes React clean up every resource.”**

Dependencies tell React when an effect should be replaced. The effect itself must return a function that clears its timer, removes its listener, or unsubscribes from its source. Without that cleanup, each replacement can leave another live closure behind.

**Trap: “Garbage collection is the same as feature cleanup.”**

Garbage collection eventually reclaims unreachable memory. It does not unsubscribe from a server, cancel a timer that is still scheduled, remove a DOM listener, or clear an application cache. Cleanup changes the ownership graph so collection can become possible.

## 7. Compare With Related Concepts

**Closure retention vs. a memory leak:** Closure retention is the mechanism of keeping a captured environment reachable. A memory leak is unwanted retention after the owner considers the data dead. Use a closure for private state or a callback that genuinely needs its inputs; add cleanup when the owner can outlive the operation.

**Closure vs. object property:** Both can preserve a reference, but a closure hides the binding behind function behavior while an object property exposes it through the object interface. Use a closure when the invariant should be changed only through controlled operations; use an object when callers should inspect or replace the data directly.

**Closure vs. global variable:** Both can make data long-lived, but a global is reachable through a broad application-wide path and is easy for unrelated code to mutate. Use a closure to narrow ownership and access; use a global only for intentionally shared process-wide state with a clear lifecycle.

**Garbage collection vs. explicit cleanup:** GC reclaims values only after they are unreachable. Explicit cleanup removes timers, listeners, subscriptions, and cache entries while the feature still has a chance to do so. Use cleanup for external resources and treat GC as the final memory reclamation step, not as the lifecycle API.

**Closure retention vs. stale closure:** Retention asks whether the old callback and its captured values are still reachable. Staleness asks whether that callback is reading an older render's values. A callback can be stale without holding a large object, and it can retain current data without being stale. Use cleanup to stop obsolete work and correct dependencies or functional updates to choose the right values.

## 8. 🧠 The Memory Hook — What Sticks

When a function leaves with the toolbox key, the workshop is gone from the stack but its tools stay reachable as long as someone still holds that key. A closure is useful when that key belongs to a live feature; it becomes a leak when a timer, listener, or registry forgets to give the key back.
