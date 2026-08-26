# Race Conditions Inside Effects

## 1. Why This Exists — The Problem First

Picture a product search page. The user types `rea`, then `read`, then `react`. Each change starts a request. The UI does not care which request was started first; it cares that the results match the query currently on screen.

Now suppose the `react` request returns quickly, so the user sees the right results, but the older `rea` request finishes a moment later. If every response blindly calls `setResults`, the screen silently goes backward and shows results for `rea`. Nothing crashed. The bug is that an old operation was allowed to write into new UI state.

This is a race condition inside an effect: overlapping async work competes to update state, and completion order is not the same as “which result is current.” The same failure appears in route changes, filters, autocomplete, profile panels, and any component that starts work when a changing dependency changes.

## 2. The Analogy — Make It Obvious

Imagine a restaurant where a customer changes their order while the kitchen is busy. The waiter sends order ticket A for “vegetable pasta.” Before it is ready, the customer changes the order and the waiter sends ticket B for “mushroom risotto.” Ticket B is prepared first and served. Then ticket A arrives late. If the table accepts every plate that arrives, the customer ends up with the old meal.

The customer’s current order is the component’s latest render and dependency values. Each ticket is one effect run. The kitchen is the server and network; it can finish tickets in any order. A plate is a resolved promise callback that is about to call `setState`.

The restaurant needs a rule: only the ticket that still represents the current order may be served. React cleanup gives each old effect run a chance to mark its ticket obsolete. An ignore flag is the waiter checking the ticket before serving it. An `AbortController` is a cancellation message sent to the kitchen so it can stop preparing an obsolete ticket when the kitchen and transport support cancellation.

The important part of the analogy is not “async is slow.” It is that there are multiple independent tickets and no automatic ordering guarantee between them.

## 3. How It Actually Works — The Full Explanation

When a component renders with `query = "react"`, React commits that render and runs its effect. The effect starts request A. Later, the query changes to `"react hooks"`; React commits another render. Because the dependency changed, React runs the cleanup belonging to the first effect instance before running the new effect. The new effect starts request B.

Each effect instance captures the dependency values from the render snapshot that created it. Cleanup invalidates that particular effect instance, but it does not update the values already captured by its callbacks; an old callback still sees the old `query`, which is why it must lose permission to commit rather than somehow become current.

At this point, A and B are both in flight. They are not made sequential by React. The browser’s networking layer, the server, caches, payload sizes, connection reuse, and failures all affect when each promise settles. If B settles first, its callback runs in a later JavaScript turn and stores the new result. If A settles afterward, its callback can still run unless the code has made A irrelevant or cancelled it.

The core invariant is:

> Only work associated with the currently selected input may commit a result to the current component state.

There are two common ways to preserve that invariant.

An ignore flag invalidates the effect instance. Each invocation creates its own lexical variable, such as `let active = true`. Cleanup changes that variable to `false`. The callback closes over the variable from its own effect invocation, so an old callback sees `false` while the newest effect’s callback sees its own `true`. The request still uses network and server resources, but its result is ignored.

`AbortController` asks an abort-aware API, most commonly `fetch`, to stop observing the request. The controller must be created inside the effect because a controller is one-shot: once aborted, its signal remains aborted and cannot be reset. Cleanup calls `abort()`. `fetch` then rejects with an `AbortError`, which is expected control flow and should not become a visible “Search failed” message.

Cancellation and ignoring are related but not identical. Aborting prevents the client from continuing to consume the response when the API honors the signal; it does not undo server-side work that already happened, and it does not replace the final state guard. A custom client may accept a signal but fail to propagate it. A promise that is not cancellable can only be ignored.

Cleanup also runs when the component unmounts. That matters because an async callback may settle after the component that started it is gone. In modern React, the old “setState on an unmounted component” warning is not a reliable definition of the bug; the real concern is leaked work, wasted resources, and stale or invalid side effects. Cleanup is where subscriptions, timers, and request cancellation belong.

Development Strict Mode can make this easier to notice: React may perform an extra setup/cleanup cycle to expose effects that do not clean up correctly. That is not the same as a production user typing twice, but correct cleanup must handle both. Also, changing a dependency does not cancel arbitrary promises automatically. React controls effect setup and cleanup; it does not control the async operation you started.

`startTransition` addresses a different part of the problem. If rendering a large result list is non-urgent, wrapping the state update that displays those results in `startTransition` lets React prioritize urgent updates such as the user’s input and mark the result render as lower priority. With `useTransition`, the UI can expose an `isPending` loading indicator while that non-urgent render is pending. It does not cancel the request, change which response finishes first, or invalidate an older effect instance. Keep the abort and/or current-result guard; transition priority controls rendering work after a result is chosen, not request ownership.

For server state, a query library can make request identity a first-class concept. A key such as `['search', query]` identifies the data. The library can deduplicate requests, cache results, track loading and error state, and pass an abort signal to a query function. That reduces the amount of lifecycle bookkeeping in a component, but the query function still needs to honor cancellation and the server response still needs authorization and validation on the backend.

## 4. Real Code — See It Working

This first example is intentionally unsafe. It is valid React code, but an older response can overwrite a newer one:

```tsx
import { useEffect, useState } from "react";

type Result = { id: string; title: string };

declare function searchProducts(query: string): Promise<Result[]>;

export function UnsafeSearch({ query }: { query: string }) {
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    void searchProducts(query).then((nextResults) => {
      // Unsafe: this callback does not know whether query is still current.
      setResults(nextResults);
    });
  }, [query]);

  return <pre>{JSON.stringify(results, null, 2)}</pre>;
}
```

The following component is self-contained apart from React and can be pasted into a browser-based React/TypeScript app. The fake API deliberately makes shorter queries slower, so an old request is likely to finish last. The `active` guard preserves correctness even though the fake promise cannot be cancelled:

```tsx
import { useEffect, useState } from "react";

type Result = { id: string; title: string };

function fakeSearch(query: string): Promise<Result[]> {
  const delay = Math.max(80, 500 - query.length * 70);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve([{ id: query, title: `Result for “${query}”` }]);
    }, delay);
  });
}

export function SafeSearchWithIgnore({ query }: { query: string }) {
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);

    void fakeSearch(query)
      .then((nextResults) => {
        // Cleanup flips only this effect run's variable to false.
        if (active) setResults(nextResults);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason : new Error("Search failed"));
      });

    return () => {
      // The request may still finish, but it no longer owns the state update.
      active = false;
    };
  }, [query]);

  if (error) return <p>{error.message}</p>;
  return <pre>{JSON.stringify(results, null, 2)}</pre>;
}
```

For a real `fetch`, use a new controller per effect run and treat abort as expected:

```tsx
import { useEffect, useState } from "react";

type Result = { id: string; title: string };

export function SafeFetchSearch({ query }: { query: string }) {
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    void fetch(`/api/products?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        return response.json() as Promise<Result[]>;
      })
      .then((nextResults) => {
        if (!controller.signal.aborted) setResults(nextResults);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason : new Error("Search failed"));
      });

    return () => controller.abort();
  }, [query]);

  if (error) return <p>{error.message}</p>;
  return <pre>{JSON.stringify(results, null, 2)}</pre>;
}
```

The last state check is deliberate. Aborting usually rejects `fetch`, but a response can already have crossed the point where cancellation changes delivery, and not every async operation is truly abortable. The guard makes the state-ownership rule explicit.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a race condition inside a React effect?**

A race occurs when an effect starts async work, the effect runs again before that work completes, and multiple operations can update the same state. Because completion order is nondeterministic, an older request can settle after a newer request and commit stale data. The bug is not that requests are concurrent by itself; the bug is that stale work still has permission to write.

**Q: Why can a request started later finish first?**

React does not serialize network operations. Server execution time, cache hits, connection state, network latency, response size, and failures can all differ per request. JavaScript runs each settled promise callback when it is scheduled, not according to request-start order. Therefore “last started” and “last completed” are separate facts.

**Q: What should happen when the dependency changes?**

The previous effect instance should lose ownership of the state update, and its work should be cancelled when possible. React runs the previous cleanup before the next effect setup for a dependency change. Cleanup can abort a fetch, invalidate an ignore flag, unsubscribe, or clear a timer. The new effect then starts work for the new dependency values.

**Q: Is an ignore flag enough to fix the race?**

It is enough to prevent a stale callback from updating React state, provided the flag is declared inside the effect and checked at every path that can commit a result. It does not stop the request, server processing, bandwidth use, or other side effects. Use it for non-cancellable work; pair it with cancellation when the underlying API supports cancellation.

**Q: What does `AbortController` actually cancel?**

It signals an abort-aware operation such as `fetch` to stop waiting for or consuming the request. The client-side promise rejects, commonly with a `DOMException` named `AbortError`. It cannot roll back a server mutation that already ran, and a custom API must actually pass the signal through. For mutations, cancellation is not a substitute for idempotency and server-side consistency.

**Q: Why must the controller be created inside the effect?**

Each effect run represents one request and needs an independent signal. An `AbortController` is one-shot; after `abort()`, its signal stays aborted. Reusing one controller across renders means the next request may start already cancelled, or cleanup for one request may cancel another request it does not own.

**Q: Does React automatically cancel promises when an effect cleans up?**

No. React calls the function you return from the effect. It has no general way to cancel an arbitrary promise because promises do not have a universal cancellation protocol. The effect must use the API’s cancellation mechanism or prevent the callback from committing with an ownership check.

**Q: What is the difference between this race and a stale closure?**

A race condition is about multiple async operations completing in an unsafe order. A stale closure is about one callback reading values captured from an older render snapshot. Cleanup can invalidate that effect instance, but it does not rewrite the callback’s captured values or make its old `query` current. They can occur together, but their fixes differ: cancel or invalidate old work for the race; use correct dependencies, functional state updates, or a deliberately managed ref for stale captured values. Adding an abort controller does not make a callback’s captured `query` current.

**Q: Does putting the request in `useEffect` make it safe?**

No. `useEffect` gives the request a lifecycle boundary, but it does not impose ordering on the work started inside it. Safety comes from preserving the current-input invariant during cleanup and completion. The dependency array controls when the effect runs; it is not a cancellation or freshness guarantee.

**Q: Does `startTransition` fix this race?**

No. `startTransition` changes the priority of React state updates and the rendering work they schedule. It can keep urgent input responsive while a result list renders at lower priority, and `useTransition` can expose a pending/loading state for that render. It does not cancel network requests, prevent an old promise from settling, or replace an ignore flag or abort/result guard. Request cancellation and stale-result protection are still effect-lifecycle concerns.

**Q: When would you choose a query library instead of manual fetching?**

For shared server state, a query library usually earns its complexity through cache identity, deduplication, retries, refetch policies, loading/error state, and request cancellation. A small one-off effect may be simpler when the work is genuinely local or not reusable. Whichever approach you choose, the query function must handle aborts and the backend must still enforce authorization; a client cache is not a security boundary.

**Q: How would you test this race?**

Control completion order rather than relying on real network timing. Mock two requests, resolve the newer one first, then resolve the older one, and assert that the UI still shows the newer result. Also test dependency cleanup, unmount before resolution, abort errors being ignored, real errors being shown, and rapid changes that start several requests. This verifies the invariant directly and avoids a flaky “sleep and hope” test.

## 6. The Traps — What Goes Wrong

The first trap is assuming start order determines display order. It does not. A local development server often responds in a predictable order, which hides the bug. Force out-of-order responses in tests and inspect behavior under slow connections and variable server latency.

Another trap is using one module-level or component-level `active` flag for every request. That creates shared mutable state: cleanup for request A can affect request B, or a later effect can turn the flag back on while A is still finishing. Declare the flag inside the effect so each invocation owns its own closure.

A third trap is checking the flag before an `await` but not after it. Every asynchronous boundary can allow cleanup to run. Check ownership immediately before each state update or side effect that must belong to the current effect instance.

Treating `AbortError` as a user-visible network failure is also wrong. Typing a new character normally aborts the previous search; showing “Search failed” on every keystroke makes expected control flow look like an outage. Filter aborts, but continue to report genuine HTTP and parsing errors.

The opposite mistake is assuming abort solves everything. It may happen after the server has accepted the request, and some libraries do not propagate the signal. Keep a result guard where correctness matters, and design write APIs with idempotency, authorization, and server-side validation.

An incomplete dependency array can create a different bug that looks similar. If the effect reads `query` but does not list it as a dependency, it may keep using an old query rather than starting a new request. Fix the dependency model first; do not hide a stale closure by adding cancellation.

Finally, do not use an effect as a hand-built server-state cache for every screen. Manual code tends to miss deduplication, retries, cache invalidation, refetch-on-focus behavior, loading transitions, and cross-component ownership. Use the smallest correct abstraction, and move shared server data to a query layer when those responsibilities appear.

## 7. Compare With Related Concepts

**Ignore flag vs `AbortController`:** An ignore flag prevents a completed callback from committing, while `AbortController` asks the underlying operation to stop and also rejects the client promise. Use an ignore guard for work with no cancellation protocol; use abort plus a guard for abort-aware fetches where wasted work matters.

**Race condition vs stale closure:** A race chooses the wrong completion among multiple operations; a stale closure reads old values from one callback’s render. Use cancellation or invalidation for the former, and correct dependencies, functional updates, or refs for the latter.

**Effect cleanup vs component unmount:** Cleanup runs before a dependency-driven rerun as well as on unmount. Use it to end the ownership of every effect instance, not only to prevent work after unmount.

**Client-side cancellation vs server rollback:** Aborting a browser request does not undo a mutation that reached the server. Use cancellation to reduce client work; use transactions, idempotency keys, and server-side authorization to make writes safe.

**Manual effect fetching vs a query library:** A manual effect can solve one component’s lifecycle, while a query library models server data identity and sharing across components. Use manual code for narrowly scoped local work; use a query layer when caching, deduplication, invalidation, or coordinated refetching are requirements.

**Race condition vs debouncing:** Debouncing reduces how many requests start by waiting for input to settle; it does not guarantee that the remaining overlapping requests finish safely. Debounce for load reduction, and still enforce current-result ownership with cancellation or invalidation.

## 8. 🧠 The Memory Hook — What Sticks

Every effect run gets a ticket, and cleanup revokes the old ticket before a new one is issued. The network may deliver plates in any order, but only the ticket belonging to the current render is allowed to update the table.
