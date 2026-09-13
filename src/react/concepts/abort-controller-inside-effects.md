# AbortController Inside Effects

## 1. Why This Exists — The Problem First

Imagine a profile screen that fetches `/api/users/1`. Before that response returns, the user selects user 2, so the screen starts `/api/users/2`. Now there are two perfectly valid requests in flight, but only the second one describes what the user currently wants. If request 1 finishes last, it can overwrite the screen with user 1 again.

Unmounting creates a second problem. A component can disappear while its request is still downloading. Without cleanup, the browser and server may keep doing work for a screen nobody can see, and the promise callback may still try to update state from an obsolete effect run.

An `AbortController` gives each effect run a cancellation channel. Cleanup uses that channel to tell an abort-aware operation, usually `fetch`, “this particular request is no longer relevant.”

## 2. The Analogy — Make It Obvious

Think of each effect run as sending one courier with a delivery order. The effect creates a fresh cancellation card and hands a copy of that card to the courier. The courier checks the card while doing the delivery.

When `userId` changes, React first runs the old effect’s cleanup. Cleanup stamps that old card as cancelled. The courier sees the cancellation and stops an in-progress delivery; its result is not treated as a successful delivery. React then starts a new effect run with a new courier and a new card for the new user.

The mapping is exact:

- The `AbortController` is the object allowed to press the cancel button.
- Its `signal` is the card shared with the operation.
- `fetch(..., { signal })` is the courier agreeing to watch the card.
- `controller.abort()` changes the card to cancelled and dispatches the abort notification.
- The effect cleanup is the person who cancels the old delivery before starting the next one.

The analogy also exposes the boundary: a courier that never agreed to watch the card cannot be stopped by it. An arbitrary promise, timer, or SDK call does not become cancellable just because an `AbortSignal` exists.

## 3. How It Actually Works — The Full Explanation

The important invariant is: **one effect setup owns one controller, and that controller is used only by work started by that setup.**

For an effect depending on `userId`, the lifecycle is:

1. React commits a render containing `userId = "1"`.
2. The effect setup creates controller A and starts a fetch with `signal: A.signal`.
3. React later commits `userId = "2"`.
4. React runs cleanup for the old committed effect. Cleanup calls `A.abort()`.
5. The old fetch rejects with an abort-shaped error, and its catch path ignores that expected cancellation.
6. React runs the new setup, which creates controller B and starts the request for user 2.

The controller and signal are separate objects with different jobs. `AbortController` is the imperative side: it exposes `abort(reason?)`. `AbortSignal` is the read-only observation side: it exposes state such as `aborted`, an abort event, and—where supported—the reason. Passing the signal to an API is what connects the API to the controller. Without that step, calling `abort()` only changes an unused signal.

Calling `abort()` is synchronous from the controller’s point of view: the signal becomes aborted and its abort event is dispatched. An abort-aware API then rejects its pending promise. With `fetch`, this can stop an in-progress request or response-body consumption in the browser. It does not undo bytes already received, and it does not guarantee that a server which already received the request stopped its own work. Cancellation is a client-side request-lifecycle signal, not a distributed transaction rollback.

The controller is one-shot. Once its signal is aborted, it stays aborted. A later operation given that signal will reject immediately. That is why a controller belongs inside the effect, not in module scope, state, or a shared ref reused by unrelated requests. Each setup needs a fresh signal and each cleanup must close over the signal for its own setup.

Aborting helps with both resource use and correctness, but it is not the whole correctness story. It prevents an abort-aware `fetch` from continuing normally. A response that already resolved may still run later application code, and an API that ignores signals may still resolve. For code that must protect state from any stale completion, combine cancellation with a local `active` guard, or use a data-fetching library that tracks request identity for you.

The timing matters in React. Cleanup runs before the next setup when dependencies change and when the component unmounts. In development Strict Mode, React may deliberately perform setup → cleanup → setup to check that the effect is reversible. A fresh controller per setup makes that probe safe: the first cleanup aborts only the first request, and the second setup receives a usable controller.

Cancellation can also be composed. `AbortSignal.timeout(5_000)` creates a signal that aborts after a deadline, and `AbortSignal.any([userSignal, timeoutSignal])` can combine independent reasons where the runtime supports it. The same rule still applies: the operation must receive the resulting signal, and abort should be handled as expected control flow rather than displayed as a server failure.

## 4. Real Code — See It Working

The following TypeScript/React example assumes React 18+ and a browser or test environment with `fetch` and `AbortController`. It puts the effect in a reusable hook; the component only consumes the hook’s result.

```tsx
import { useEffect, useState } from "react";

type User = { id: string; name: string };

type UserState = {
  user: User | null;
  loading: boolean;
  error: Error | null;
};

export function useUser(userId: string): UserState {
  const [state, setState] = useState<UserState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState({ user: null, loading: true, error: null });

    async function loadUser() {
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(userId)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Request failed with HTTP ${response.status}`);
        }

        const user = (await response.json()) as User;

        // Abort is normally enough for fetch, but active also protects this
        // state update if a client resolves after cancellation or ignores it.
        if (active) {
          setState({ user, loading: false, error: null });
        }
      } catch (reason: unknown) {
        // Abort is an intentional lifecycle event, not a user-facing failure.
        if (!active || controller.signal.aborted) return;

        setState({
          user: null,
          loading: false,
          error: reason instanceof Error ? reason : new Error("Request failed"),
        });
      }
    }

    void loadUser();

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId]);

  return state;
}

export function UserProfile({ userId }: { userId: string }) {
  const { user, loading, error } = useUser(userId);

  if (loading) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return <h1>{user?.name}</h1>;
}
```

There are three deliberately separate lines of responsibility here. Creating the controller inside the effect gives this run its own cancellation identity. Passing `controller.signal` to `fetch` makes the network operation observe that identity. Calling `controller.abort()` in cleanup cancels only the request started by that run.

The `active` flag is not a replacement for abort. It is a last-mile state-write guard. It is useful when a wrapper around `fetch` does not forward the signal, when a response has already crossed the point where cancellation can stop it, or when several async steps follow the request. If the application uses TanStack Query, the equivalent is to accept the library-provided signal and forward it:

```tsx
import { useQuery } from "@tanstack/react-query";

export function useUserWithQuery(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/users/${userId}`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as { id: string; name: string };
    },
  });
}
```

The query library owns the controller lifecycle; the query function still has to pass the signal to the real abortable operation.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What problem does `AbortController` solve inside a React effect?**

It lets cleanup cancel an abort-aware operation started by that effect run. For a changing search term or user ID, that saves work on requests that are no longer needed and reduces the chance that an obsolete request continues to consume bandwidth or connection capacity. It is also useful on unmount, when a component no longer needs the request it started.

It does not, by itself, prove that the server stopped processing, and it does not replace a state-write guard for APIs that ignore cancellation.

**Q: Why must the controller be created inside the effect?**

An effect setup and its cleanup form one lifecycle pair. Creating the controller inside setup gives that pair a private, fresh cancellation identity. When dependencies change, the old cleanup aborts its own controller while the new setup creates another one.

If a controller is reused after abort, its signal is already permanently aborted, so the next request can fail immediately. If one controller is shared by unrelated requests, cancelling one operation cancels every operation that received the same signal.

**Q: What is the difference between `AbortController` and `AbortSignal`?**

The controller is the object that owns the command: code calls `controller.abort()`. The signal is the observable, read-only channel passed to an abort-aware API: `fetch(url, { signal: controller.signal })`. The API listens to that signal and decides how to stop itself. Keeping this distinction clear explains why `signal.aborted = true` is invalid and why a controller alone does nothing unless its signal is passed onward.

**Q: What happens when `fetch` is aborted?**

The signal becomes aborted, the fetch operation rejects, and the rejection is commonly identified by `error.name === "AbortError"`. If the response body is being consumed, abort can also interrupt that body read. Code should catch the rejection and treat it as expected cancellation.

The exact error object can differ across browsers, Node.js versions, and HTTP clients, so production code should not rely only on `instanceof DOMException`. Checking the signal owned by the effect, or using the client’s documented cancellation predicate, is often more portable.

**Q: How should an effect distinguish cancellation from a real failure?**

Do the distinction in the catch path before setting user-visible error state. In the example, `controller.signal.aborted` means this effect run was intentionally cancelled, so the catch returns. A DNS failure, non-OK HTTP response, malformed JSON, or other non-abort error still reaches the normal error state.

Checking only `response.ok` is not enough: an HTTP 500 is a fulfilled fetch promise and must be converted into an application error explicitly. Conversely, an abort is not evidence that the server is down.

**Q: Does aborting a request eliminate a race condition?**

It closes the race for an abort-aware request that has not already completed, but it is not a universal guarantee. Cancellation can happen after a response has resolved, and a custom client may ignore the signal. The robust boundary is to make obsolete work unable to commit state: forward the signal to the transport and guard the final state update with effect-local request identity or an `active` flag.

For larger applications, a query library can combine cancellation with cache keys, stale-result handling, retries, and deduplication. The transport still needs to receive the signal if you want actual network cancellation.

**Q: Is calling `abort()` the same as cancelling work on the server?**

No. It tells the client-side operation to stop waiting, reading, or downloading when that operation supports abort. The request may already have reached the server, and the server may have already performed side effects. If an operation must be all-or-nothing, use server-side idempotency, transaction boundaries, or a compensating action; do not treat an HTTP abort as a distributed rollback.

**Q: Which async APIs can use an `AbortSignal`?**

Only APIs that explicitly support it. `fetch`, many modern platform APIs, and some libraries accept a `signal` option. A promise created with `new Promise`, a third-party SDK that discards options, or a timer does not automatically become cancellable. For unsupported work, use that API’s cancellation method, an effect-local ignore flag, or a library with a cancellation contract.

**Q: How does this differ from an `active` or `isCurrent` flag?**

An active flag is local result suppression: the work continues, but the old callback refuses to update state. `AbortController` is cooperative operation cancellation: the transport gets a signal and may stop doing work. The flag works with almost any promise-shaped API; the controller can save network and parsing work but requires signal support. They solve different layers and can be used together.

**Q: How do query libraries use this pattern?**

Libraries such as TanStack Query create and manage cancellation as part of a query lifecycle. The query function receives a signal in its context. Passing that signal to `fetch` lets the library abort an obsolete request when the query becomes irrelevant. If the query function ignores the signal, the library can stop considering the query active, but the underlying HTTP request may continue. Cancellation is therefore an end-to-end chain, not a feature activated by naming a parameter `signal`.

## 6. The Traps — What Goes Wrong

**Reusing one controller across renders.**

The wrong assumption is that a controller is a resettable switch. It is not. Once aborted, its signal remains aborted. Create it in each effect setup so every request starts with a fresh signal.

**Calling `abort()` but never passing the signal.**

This cancels the controller’s signal, not the request. The request has no connection to that signal and continues normally. The operation must receive `{ signal: controller.signal }` or its equivalent option.

**Treating an abort as a real error.**

If the catch block always calls `setError`, navigating away or typing the next search term can flash “Request failed.” Cancellation is expected lifecycle control flow; filter it before displaying an error or retrying it.

**Assuming abort guarantees stale state cannot be written.**

A request may already have resolved, a body parser may be in a later async step, or a wrapper may ignore the signal. Protect the final state commit with an effect-local guard when correctness matters. The guard is not redundant; it covers the part of the pipeline that transport cancellation cannot reach.

**Putting one signal on unrelated work.**

One signal means one cancellation group. Passing the same signal to a user request, an analytics upload, and a cache refresh means cleanup cancels all three. Use separate controllers unless those operations truly share one lifecycle.

**Believing the server was rolled back.**

Aborting a client request after a `POST` may leave the server-side write completed even though the browser reports an abort. For mutations, design idempotency and retry behavior explicitly; do not use cancellation as transactional semantics.

**Forgetting that cleanup also runs on dependency changes.**

Cleanup is not only an unmount hook. If the dependency changes from `a` to `b`, React cleans up the `a` effect before setting up `b`. Omitting cleanup leaves old requests alive and makes overlapping work harder to reason about.

**Starting async work without handling its rejection.**

An `async` effect callback is the wrong shape because React expects the callback to return either nothing or a synchronous cleanup function, not a Promise. Start an inner async function, call it, catch its errors, and return the synchronous cleanup that aborts the controller.

## 7. Compare With Related Concepts

**AbortController vs an active/ignore flag.** AbortController asks a cooperative transport to stop; a flag lets completed work finish but ignores its result. Use AbortController for `fetch` and other signal-aware APIs, and add a flag when the later processing pipeline also needs a stale-result guard.

**AbortController vs a timeout.** AbortController is the cancellation mechanism; a timeout is one possible reason to invoke it. `AbortSignal.timeout(5_000)` expresses a deadline, while cleanup expresses “this effect run is obsolete.” Use both when a request must stop on either unmount/dependency change or a time budget.

**AbortController vs `clearTimeout`.** `clearTimeout` cancels a timer because timers have their own cancellation API. A signal does not cancel a timer unless the code listening to the signal explicitly calls `clearTimeout`. Use the API’s native cleanup contract, or wrap the timer in a signal-aware helper.

**AbortController vs query-library cancellation.** A controller is a low-level cancellation primitive. A query library adds request identity, caching, deduplication, retries, and lifecycle decisions around it. Use the controller directly for a small, local integration; use a query library when the application owns server state rather than one isolated request.

**AbortController vs `useEffect` cleanup generally.** Cleanup is React’s lifecycle boundary; abort is one action performed at that boundary. The same cleanup may remove a listener, unsubscribe a stream, clear a timer, and abort a request—but only the request receives an abort signal.

## 8. 🧠 The Memory Hook — What Sticks

Every effect run gets its own courier, cancellation card, and cleanup. React cancels the old card before sending the new courier; but the courier only stops if you actually hand the card to the transport. **Create inside, pass the signal through, abort in cleanup, and never mistake client cancellation for a server rollback.**
