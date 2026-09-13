# Handling Async Logic Inside Hooks

## 1. Why This Exists — The Problem First

An API request does not respect React's render timing. A component can render for `userId = "a"`, start a request, render again for `userId = "b"`, and then receive the response for `"a"` after the response for `"b"`. If both responses write to the same state, the screen can show the wrong user while looking completely healthy.

There is a second failure hiding in a deceptively common line: `useEffect(async () => { ... })`. The request code may look reasonable, but the effect callback has a small, strict return contract that an `async` function cannot satisfy. Safe async hook code exists because JavaScript work finishes later while React effects are tied to a particular render and must be cleaned up when that render is no longer current.

## 2. The Analogy — Make It Obvious

Think of an effect as placing an order at a restaurant. Each render with a new dependency value places a new order. The waiter needs two things from you: start the order now, and provide a cleanup instruction for the old order when the table changes. A promise is the meal's future delivery status; it is not a cleanup instruction.

If the customer changes their order from soup to pasta, the restaurant may be able to stop cooking the soup. That is `AbortController`. If it cannot stop the kitchen, the waiter can still refuse to put the old soup on the table when it arrives. That is an active or request-identity check. The first saves work; the second protects the UI even when the work cannot be stopped.

The table's status also needs more than “a request exists.” It needs to distinguish waiting, successful data, and a real failure. In React, those statuses are state for the render, while the cleanup is the instruction that invalidates work belonging to an older table setup.

## 3. How It Actually Works — The Full Explanation

An effect callback runs after React commits the render. React calls the callback and keeps its return value. That return value must be either `undefined` or a synchronous cleanup function. React later calls that cleanup before the effect runs again because a dependency changed, and when the component is removed.

Every render is an immutable snapshot: its props, state values, and functions are the values from that one render. The effect setup and every async function it creates close over that snapshot, so each effect closure belongs to the render that created it; a later render does not rewrite the old closure's `userId` or state values. Cleanup is the handoff between snapshots: it marks or cancels the old closure's work, while a completion calls a state setter to request a new render rather than mutating the snapshot that is already on screen. That is why cleanup and result guards work together: cleanup revokes the old closure's permission to publish, and the setter publishes only from a still-current operation.

An `async` function always returns a promise, even when its body has no explicit `return`. Therefore this is invalid:

```tsx
// Partial pattern: place this inside a component that imports React and
// declares `Profile` and `setProfile` with useState, for example:
// type Profile = { name: string };
// const [profile, setProfile] = React.useState<Profile | null>(null);
React.useEffect(async () => {
  const response = await fetch("/api/profile");
  setProfile(await response.json());
}, []);
```

React receives a promise where it expects a cleanup function. The fix is to keep the effect callback synchronous and start the asynchronous function inside it:

```tsx
// Partial pattern: place this inside a component that imports React and
// provides `setProfile` as a useState setter in its component scope.
React.useEffect(() => {
  async function loadProfile() {
    // Awaiting here does not change the effect's return value.
    const response = await fetch("/api/profile");
    const profile = await response.json();
    setProfile(profile);
  }

  void loadProfile();
}, []);
```

The `void` makes it explicit that the effect intentionally starts, rather than returns, the promise. It does not handle errors; production code must do that separately.

For a request depending on an input, each effect run owns a particular controller and request. Cleanup aborts that run before the next one begins:

```text
render for "a" -> commit -> effect A starts
render for "b" -> commit -> cleanup A -> effect B starts
response A or abort A arrives
response B arrives
```

`AbortController` is cooperative cancellation. Passing its `signal` to `fetch` lets the browser reject the fetch when `abort()` is called. It does not magically cancel every promise or undo server-side work that already happened. The server might have received and processed the request, so cancellation is mainly a client-side resource and result-lifetime decision.

An abort still rejects the promise, so the catch block must treat `AbortError` as expected control flow. Other errors should move the operation into an error state. For APIs that do not accept an abort signal, an active flag or request ID prevents an old completion from committing its result. The following is a partial pattern: it assumes a component scope with `React`, a stable `slowSource` function in the dependency list, and `setValue`/`setError` state setters declared with `React.useState`:

```tsx
React.useEffect(() => {
  let current = true;

  async function load() {
    try {
      const value = await slowSource();
      if (current) setValue(value);
    } catch (error) {
      if (current) setError(error);
    }
  }

  void load();
  return () => {
    current = false;
  };
}, [slowSource]);
```

The flag is not state. Changing it does not trigger a render; it marks the old effect instance as no longer authorized to publish. A request ID is often clearer when several operations can exist at once: store the latest ID in a ref, capture the ID for the current request, and only publish if the IDs match.

Async state should describe the state machine, not merely whether a promise was created. A typical request moves through `idle -> pending -> success` or `idle -> pending -> failure`. A refresh may be `success + pending` if the UI should keep showing old data while new data loads. That is more useful than blindly replacing data with `undefined` every time.

Dependencies are also part of correctness. The effect must mention values it reads from the render, such as `userId` or an API client whose identity can change. Omitting one gives the async function a stale closure: it continues using the value captured by an older render. Adding an unstable function or object can cause repeated requests, so make dependencies stable or move the construction inside the effect when it belongs there.

Async work started by an event handler is different from synchronization started by an effect. A submit handler can be `async` because React is not interpreting its return value as effect cleanup. It should still guard duplicate submits, handle errors, and decide what happens if the user navigates away.

For server data shared across screens, manual effects are usually the wrong ownership boundary. A query library such as TanStack Query gives the request a cache key, deduplicates observers, tracks status, and coordinates refetching. A custom hook can still be useful as the application-specific API around that library. `useState` and `useReducer` remain better fits for local client state such as form drafts and open panels.

At a senior level, also separate data ownership from loading presentation. A Suspense boundary such as `<Suspense fallback={<Spinner />}><SearchResults /></Suspense>` can show a fallback while a Suspense-aware resource is pending, and a transition-marked update such as `startTransition(() => setQuery(nextQuery))` can keep already-visible UI responsive while a non-urgent update is prepared. They improve what the user sees; they do not replace request cancellation, cleanup-local invalidation or request-identity guards, or server-state caching. A transition does not cancel the network request, and Suspense does not decide whether an older response is still allowed to publish. Pair these boundaries with a cache or framework that owns the resource lifecycle, and keep cancellation and identity policy at the request boundary.

## 4. Real Code — See It Working

This complete browser example uses a mocked API so it can be copied into a React + TypeScript app without a backend. The delay makes out-of-order completion easy to observe.

```tsx
import { useEffect, useState } from "react";

type User = { id: string; name: string };

function getUser(id: string, signal: AbortSignal): Promise<User> {
  const delay = id === "a" ? 700 : 150;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      resolve({ id, name: id === "a" ? "Ada" : "Brendan" });
    }, delay);

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Request aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function UserCard({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("pending");
    setError(null);

    async function load() {
      try {
        const nextUser = await getUser(userId, controller.signal);
        setUser(nextUser);
        setStatus("success");
      } catch (unknownError) {
        if (unknownError instanceof DOMException && unknownError.name === "AbortError") {
          return; // Changing userId is normal invalidation, not a visible failure.
        }
        setError(unknownError instanceof Error ? unknownError.message : "Unknown error");
        setStatus("error");
      }
    }

    void load();
    return () => controller.abort();
  }, [userId]);

  if (status === "pending" && user === null) return <p>Loading…</p>;
  if (status === "error") return <p role="alert">Could not load user: {error}</p>;
  if (user === null) return <p>No user selected.</p>;

  return (
    <article aria-busy={status === "pending"}>
      <strong>{user.name}</strong>
      {status === "pending" && <span> Updating…</span>}
    </article>
  );
}
```

The previous user remains visible during a refresh because the example models `status` separately from `user`. That prevents a distracting blank screen. If the product requires a hard loading screen, clear `user` when starting the request instead; that is a product decision, not an async rule.

To visibly exercise out-of-order completion, use a non-abortable source with a small driver. Click **Run A → B** and request A starts first but takes longer; B completes first and is shown. When A eventually completes, its request ID is stale, so it is ignored. This is the case an aborting demo cannot show because cancellation may prevent A from completing at all.

```tsx
import { useRef, useState } from "react";

type Result = { id: "a" | "b"; label: string };

function getNonAbortableResult(id: Result["id"]): Promise<Result> {
  const delay = id === "a" ? 700 : 150;
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ id, label: id === "a" ? "Ada" : "Brendan" }), delay);
  });
}

export function OutOfOrderDriver() {
  const requestId = useRef(0);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);

  async function load(id: Result["id"]) {
    const idForThisRequest = ++requestId.current;
    setRunning(true);
    const nextResult = await getNonAbortableResult(id);
    if (idForThisRequest !== requestId.current) return; // Old completion loses.
    setResult(nextResult);
    setRunning(false);
  }

  function runRace() {
    void load("a");
    window.setTimeout(() => void load("b"), 25);
  }

  return (
    <section>
      <button onClick={runRace}>Run A → B</button>
      <p>{running ? "Requests in flight…" : result ? result.label : "No result yet"}</p>
    </section>
  );
}
```

For a user action, the async function belongs in the handler, not in an effect:

```tsx
import { useState } from "react";

export function SaveButton({ save }: { save: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    if (saving) return; // Prevents accidental double-submit.
    setSaving(true);
    setMessage("");
    try {
      await save();
      setMessage("Saved");
    } catch {
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return <button onClick={() => void handleSave()} disabled={saving}>{message || "Save"}</button>;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why can’t the `useEffect` callback itself be `async`?**

React uses the callback's return value as a cleanup function. An `async` callback always returns a promise, so it cannot return the synchronous cleanup contract React expects. Put an inner async function in a synchronous effect and call it with `void`; return only cleanup from the effect.

**Q: What happens when dependencies change while a request is in flight?**

React runs the previous cleanup before running the new effect setup. The old request may still resolve unless it supports cancellation, so the cleanup should abort it or invalidate its result. The new request then owns the right to publish data for the new dependency value.

**Q: Is `AbortController` enough to prevent stale data?**

It is the best first tool for `fetch`, but cancellation is cooperative and timing-sensitive. A response may already have completed, and non-fetch work may ignore the signal. Keep the result-lifetime guard when the operation can outlive cleanup, especially with custom promises, workers, or libraries that only partially support signals.

**Q: Where do Suspense boundaries and transitions fit?**

Suspense owns the loading boundary for a resource that is integrated with Suspense, while a transition marks an update as non-urgent so React can keep current content interactive while preparing the next view. Neither is a request-lifecycle policy: neither cancels an in-flight request, rejects an obsolete completion, or supplies a cache key and server-state freshness policy. Use them with request cancellation or identity guards and a server-state cache when the data is remote or shared.

**Q: What is the difference between cancelling work and ignoring a result?**

Cancellation tries to stop the underlying operation and can save bandwidth, CPU, and connection capacity. Ignoring a result lets the operation finish but prevents an obsolete effect from publishing. Use cancellation where supported, and use invalidation when stopping the work is impossible or insufficient.

**Q: How should loading, success, and error be modeled?**

Treat them as states of one operation. Set pending before starting, clear or retain old data according to the UI's refresh behavior, set success only after valid data arrives, and set failure only for a real error. Clear a previous error when a new attempt starts. For complex flows, a discriminated union or reducer prevents contradictory combinations such as `isLoading: false` with both fresh data and a stale error.

**Q: How do stale closures affect async effects?**

The async function captures values from the render that created it. If `userId` is read but omitted from dependencies, a later render can display one ID while the request still uses the old one. Include every render value the effect reads, then stabilize dependencies when their identity is not meant to change.

**Q: Should an effect fetch data on every render?**

No. The dependency array expresses when synchronization must be recreated. An empty array means “for this mount,” while `[userId]` means “when this user changes.” An effect with no dependency array runs after every committed render, which can create request loops if the request updates state.

**Q: How is async event-handler code different from async effect code?**

An event handler is allowed to be `async` because React does not use its return value as cleanup. It represents an explicit user action, so the handler owns duplicate-submit prevention and feedback. An effect represents synchronization with rendered inputs, so its outer callback must stay synchronous and return cleanup.

**Q: When would you choose TanStack Query over a manual effect?**

Choose a query library when remote data needs caching, deduplication, background refetching, retries, invalidation, pagination, or coordination across components. A manual effect is reasonable for one local synchronization such as a component-specific request or a browser API. The key distinction is ownership of server state, not whether the request uses `fetch`.

**Q: What does React Strict Mode change about async effects?**

In development, Strict Mode may perform an extra setup-and-cleanup cycle to expose effects that do not clean up correctly. A correct effect tolerates this: it aborts or invalidates the first request, and only the current setup can publish. Strict Mode is revealing a lifecycle bug, not creating a production race that can be ignored.

**Q: Does cleanup guarantee that the server stopped processing the request?**

No. Cleanup guarantees that your client-side effect can stop listening, abort a supported client operation, or reject an old result. The server may already have accepted the request. Mutations therefore also need server-side idempotency or a request token when retries and duplicate submissions could cause harm.

## 6. The Traps — What Goes Wrong

**Returning the promise from the effect.** The mistake is writing `useEffect(() => fetchData().then(setData), [])`. The promise becomes the effect's return value, so React cannot use it as cleanup. Start the promise inside the callback and return a cleanup function or nothing.

**Using `isMounted` state as the cancellation mechanism.** A state flag causes another render and does not stop the request. Cleanup-local variables, request IDs in a ref, or `AbortController` express the lifetime directly. Also, modern React does not make “set state after unmount” a safe design goal; the real requirement is to stop obsolete work and release resources.

**Aborting without handling `AbortError`.** An expected dependency change then appears as a red error message. Filter the abort case, but do not swallow every error: authentication failures, server errors, and parsing failures still need to reach the UI or an error boundary.

**Checking only `loading` to decide what to render.** `loading = false` does not mean success. It can mean failure, idle, or a request that was cancelled. Keep an explicit status or derive the render branches from a well-defined state shape.

**Leaving dependencies out to “run only once.”** This freezes the effect's captured values and creates stale requests. If an operation truly belongs to mount-only setup, it should not depend on changing render values. Otherwise, list the dependency and handle the cleanup between runs.

**Creating unstable dependencies inside the component.** An object or function created during every render can make an effect restart on every render, and the request can update state, causing a loop. Move construction into the effect, memoize it when identity matters, or pass the primitive values the effect actually needs.

**Assuming abort makes mutations safe.** Aborting a client request does not roll back a server write that already happened. Use idempotency keys, transactions, or a server-side state transition when repeating a mutation could charge, email, or create a duplicate record.

**Reimplementing a cache in every custom hook.** A local `useEffect` can fetch one user, but several components will otherwise duplicate requests and disagree about freshness. Put shared server-state policy in a query cache; keep custom hooks as a typed boundary rather than a second cache implementation.

## 7. Compare With Related Concepts

**Effect synchronization vs event-handler work:** an effect reacts to committed render inputs and must clean up when those inputs stop being current; an event handler reacts to an explicit action and may be `async`. Use an effect for “keep this external resource aligned with state,” and a handler for “do this because the user clicked or submitted.”

**AbortController vs an active flag:** `AbortController` asks a supported operation to stop and saves resources; an active flag only blocks an obsolete completion from publishing. Use both when the operation is cancellable and stale results would be harmful; use the flag when the API cannot be aborted.

**Manual effect vs TanStack Query:** a manual effect owns one component's request lifecycle; a query library owns shared server data, cache identity, and refetch policy. Use manual code for a narrow local integration, and a query library when multiple consumers need the same remote resource.

**`useState` vs `useReducer` for async state:** separate state values are fine for a small request, but they can drift into impossible combinations. Use a reducer or discriminated union when transitions such as retry, refresh, pagination, or cancellation make the state machine non-trivial.

**Cancellation vs error handling:** cancellation means the result is no longer wanted; an error means the wanted operation failed. Keep cancellation quiet in normal UI flow, but expose actionable errors and preserve enough context for retry and observability.

## 8. 🧠 The Memory Hook — What Sticks

An effect is a rented worker tied to one render: start the async job inside it, and when the rental ends, cancel the job or revoke its permission to publish. The promise brings back a result, but cleanup decides whether that result still belongs on today's screen.
