# Mounted State Tracking

## 1. Why This Exists — The Problem First

A screen starts a request for a profile, the user navigates away, and the request finishes a few hundred milliseconds later. The callback still exists because the promise or SDK owns it, even though the component that created it no longer does. If that callback updates local state, older React versions could warn about an update after unmount; even without a warning, the result is now useless and the work may have consumed bandwidth, CPU, or a scarce subscription slot.

That is the problem mounted-state tracking tries to answer: “Does this component still own the right to consume this result?” It is a narrow defensive technique, not a general replacement for cancelling work or managing server state correctly.

## 2. The Analogy — Make It Obvious

Imagine a hotel guest ordering room service. The kitchen writes the room number on the order, but the guest may check out before the delivery arrives. At the door, staff can check the hotel’s current occupancy board. If the room is still occupied, deliver the meal; if it is empty, do not hand the meal to nobody.

The component is the guest, the asynchronous operation is the kitchen preparing the meal, and the ref is the live occupancy board. React’s cleanup marks the room empty when the component unmounts. The callback checks the board immediately before using the result.

The analogy also exposes the limitation: checking the board does not stop the kitchen. The meal was still prepared. A cancellation signal is closer to cancelling the order at the kitchen; mounted tracking only rejects delivery at the door.

## 3. How It Actually Works — The Full Explanation

React renders a component, commits it to the UI, and then runs its effect setup. A custom hook can place a mutable boolean in a ref, set that boolean to `true` during setup, and return cleanup that sets it to `false`. The ref object survives re-renders, and its `.current` property can be read by a callback long after the render that created the callback has finished. For an effect that can run again, though, the safest guard is scoped to that effect setup so a callback from an older setup cannot borrow a later setup’s `true` value.

The important sequence is:

1. A component mounts. The hook’s effect setup marks `mounted.current = true`.
2. Some non-cancelable work starts, such as a legacy SDK request or callback registration.
3. React unmounts the component. Before the instance is discarded, effect cleanup runs and marks the ref false.
4. The external operation eventually invokes its callback. The callback reads the current ref value, not a copied boolean from an old render.
5. If the value is false, the callback ignores the result. If it is true, it may update local state—provided the result is also the current result the component wants.

`useRef` matters because changing `.current` does not schedule a render. That is exactly what this flag needs: the callback needs a live coordination value, not a piece of UI state. A state variable would create another render and, more importantly, a callback can close over the state value from the render in which it was created. A ref gives the callback a stable object whose property can be changed later.

Unmounting does not rewind JavaScript. Promises, timers, browser APIs, and third-party libraries are not children of React’s Fiber tree. React can remove a component and run its cleanup, but it cannot automatically cancel arbitrary work that was started elsewhere. React 18 removed the noisy warning for many post-unmount state updates; that did not make network requests, timers, subscriptions, or SDK work cancel themselves. It only made the particular update less visible.

Mounted tracking is also not enough for changing inputs. Suppose a search box starts request A for `rea`, then request B for `react`. Both callbacks can run while the component is mounted. The mounted flag is true for both, so it cannot prevent request A from overwriting the newer result. That is a request-identity or cancellation problem, solved with an abort signal, a sequence/request ID, or a data-fetching library—not with an occupancy flag.

Development Strict Mode deserves a precise mention. React may run setup, cleanup, and setup again to expose missing cleanup. An effect-scoped guard tolerates that sequence: the first cleanup sets the first setup’s `active` variable false, and the second setup creates a separate variable set to true. A callback from the first setup therefore stays rejected even after the second setup begins. The guard is a lifecycle check; it is not a license to hide an effect that should not exist.

## 4. Real Code — See It Working

This first example is a complete custom hook plus component. It uses `useEffect` inside the reusable hook, where the request’s lifecycle belongs. The fake client deliberately has no cancellation API, which is the case where an effect-scoped guard can still be justified.

```tsx
import { useEffect, useState } from "react";

type Profile = { id: string; name: string };

function loadFromLegacySdk(id: string, onSuccess: (profile: Profile) => void) {
  const timer = window.setTimeout(() => {
    onSuccess({ id, name: `User ${id}` });
  }, 500);

  // This legacy client exposes no cancel method to the caller.
  void timer;
}

function useLegacyProfile(id: string) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    // Each setup owns its guard, so Strict Mode cannot revive an older callback.
    let active = true;

    loadFromLegacySdk(id, (nextProfile) => {
      // Cleanup rejects unmounts, Strict Mode's first setup, and older ids.
      if (!active) return;
      setProfile(nextProfile);
    });

    return () => {
      active = false;
    };
  }, [id]);

  return profile;
}

export function ProfileCard({ id }: { id: string }) {
  const profile = useLegacyProfile(id);

  return <p>{profile ? profile.name : "Loading..."}</p>;
}
```

In an application, the better fetch path is cancellation. This example is self-contained apart from the normal browser `fetch` API and handles both unmounting and a changed `id`. `AbortController` is best-effort: the response may already have settled, server work may continue, or an API may not stop immediately. The cleanup aborts the old request, while the `AbortError` branch treats expected cancellation as non-failure; the signal and request-identity checks are the final protection before committing a result.

```tsx
import { useEffect, useRef, useState } from "react";

type Profile = { id: string; name: string };

function useCancellableProfile(id: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    setProfile(null);
    setError(null);

    fetch(`/api/profiles/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Profile>;
      })
      .then((nextProfile) => {
        // Abort is best-effort, so check both cancellation and request identity.
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setProfile(nextProfile);
      })
      .catch((cause: unknown) => {
        // Aborting during cleanup is expected, not a user-visible failure.
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setError(cause instanceof Error ? cause : new Error("Request failed"));
      });

    return () => {
      // Abort usually stops fetch, but it cannot undo work already delivered.
      controller.abort();
    };
  }, [id]);

  return { profile, error };
}

export function CancellableProfile({ id }: { id: string }) {
  const { profile, error } = useCancellableProfile(id);

  if (error) return <p role="alert">{error.message}</p>;
  return <p>{profile ? profile.name : "Loading..."}</p>;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does mounted state tracking solve?**

It prevents a callback from applying a result after its component instance has unmounted. The usual implementation stores a boolean in a ref, sets it true during effect setup, sets it false in cleanup, and checks it before a state update. It does not cancel the underlying operation and it does not prove that a result belongs to the latest request.

**Q: Why can an async callback run after unmount?**

Because the operation is owned by a promise, timer, browser API, or external library rather than by React. Unmounting removes the component from React’s tree and runs cleanup, but JavaScript does not delete callbacks already registered with those systems. When the operation settles, its callback can still run and its closure can still refer to the old setter.

**Q: Why use a ref instead of state for the mounted flag?**

The callback needs a mutable value that can be read at callback time without causing another render. A ref object has stable identity across renders, and `.current` can be changed during cleanup. State is for values that drive rendering; using it for this coordination flag adds a render and makes closure timing easier to misunderstand. The ref is not magic cancellation—it is simply a live cell shared by the hook and its callbacks.

**Q: Is setting state after unmount still a React memory leak?**

Not automatically. React 18 removed the warning that often led developers to call every post-unmount update a leak. A late update is generally ignored, but the operation that produced it may still waste resources, and subscriptions or timers may continue indefinitely if they were never cleaned up. The correct diagnosis is to ask whether the external resource remains active, not to equate one ignored setter call with a heap leak.

**Q: Why is cancellation usually better than mounted tracking?**

Mounted tracking waits for the work to finish and then discards the answer. Cancellation asks the source to stop, which can save network bandwidth, parsing, server work, battery, and connection slots. It also expresses ownership clearly: when the component no longer needs the request, its cleanup revokes the request’s lifetime. Use `AbortController` for APIs that support it, and use the library’s unsubscribe/dispose method for subscriptions.

**Q: Can a mounted flag prevent stale search results?**

No. If request A and request B both finish while the component remains mounted, the flag is true for both. The UI can still show A after B. Use cancellation where possible, or associate each request with an incrementing ID and accept a response only if its ID is still current. TanStack Query and similar libraries solve this broader server-state lifecycle with caching, deduplication, cancellation, and observer ownership.

**Q: When is mounted tracking reasonable in production?**

When an external API genuinely cannot be cancelled or unsubscribed from, and ignoring a late callback is safer than allowing it to touch local state. Keep the guard close to that integration, document why cancellation is unavailable, and still clean up every resource that the API does expose. It should be an exception around a boundary, not a standard wrapper around every fetch.

**Q: What happens in React Strict Mode?**

In development, React can perform an extra setup-and-cleanup cycle. A correct lifecycle guard becomes true, then false, then true for the active setup. This is useful because it reveals effects that fail to clean up. Code that “works” only when setup runs once is not correctly modeling ownership.

## 6. The Traps — What Goes Wrong

- **Using a mounted flag instead of aborting a cancellable request.** The flag suppresses the final setter but lets the request complete. Prefer `AbortController` for `fetch`, and treat abort as expected cleanup.

- **Assuming React 18 solved async cleanup.** The removed warning changed diagnostics, not the lifetime of timers, subscriptions, sockets, or requests. Inspect the external resource and give it an explicit cleanup path.

- **Using the flag to solve “latest request wins.”** Mounted status answers whether the component exists, not whether this response is current. Add request cancellation or a request-generation check when inputs can change.

- **Forgetting that cleanup must run for the exact resource created by setup.** If setup registers a listener, cleanup must remove that listener; if it starts an interval, cleanup must clear that interval. A boolean does not unsubscribe anything.

- **Treating every post-unmount callback as a memory leak.** A settled promise callback usually becomes collectible once nothing retains it. A never-removed event listener, timer, or SDK subscription can keep firing and retain objects. Measure and inspect the retaining resource instead of relying on the warning’s presence or absence.

- **Creating a reusable `useIsMounted` helper and checking it everywhere.** That spreads a passive workaround through business logic and can hide unclear ownership. Keep lifecycle management in the effect or data-fetching abstraction that owns the operation.

- **Ignoring errors because the component unmounted.** Cancellation is expected, but real server errors still matter to logs, retries, and observability. Distinguish an intentional abort from an HTTP failure or a parsing failure.

## 7. Compare With Related Concepts

- **Mounted tracking vs `AbortController`:** mounted tracking ignores a late result; `AbortController` requests that the operation stop. Use cancellation for `fetch` and mounted tracking only for a non-cancelable boundary.

- **Mounted tracking vs effect cleanup:** mounted tracking is one value changed by cleanup. Cleanup is the broader lifecycle obligation: abort, unsubscribe, disconnect, clear timers, and release resources. Use cleanup even when you also need a guard.

- **Mounted tracking vs request identity:** mounted status is component-level ownership; request identity is version-level ownership. Use a generation/request ID or cancellation when multiple requests can overlap.

- **Mounted tracking vs state:** state describes UI data and schedules renders; a ref is a mutable coordination cell that does not render. Use state to display the profile and a ref only when an external callback needs a live value.

- **Mounted tracking vs a query library:** a query library owns server-state lifetime outside one component, often adding cache, deduplication, retries, stale-time policy, and observer tracking. Use it for application server state; reserve a local guard for an integration the library cannot own.

## 8. 🧠 The Memory Hook — What Sticks

Mounted tracking is the hotel’s occupancy board: it can refuse a late delivery, but it cannot stop the kitchen. Ask two separate questions every time—“does this component still exist?” and “is this still the newest work?”—then use cleanup, cancellation, or request identity for the question you actually need to solve.
