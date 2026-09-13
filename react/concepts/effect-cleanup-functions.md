# Cleanup Functions in `useEffect`

## 1. Why This Exists — The Problem First

A search screen opens a WebSocket for the selected room. The user changes rooms three times, and suddenly one message is handled three times—or an old room's message appears in the new room. A dashboard starts an interval, the user navigates away, and the interval keeps waking up code that no longer has a visible screen. A request for `/users/1` finishes after the user has already selected user 2 and paints the wrong profile.

React can remove a component's rendered output, but it cannot guess how to undo every browser API, library subscription, timer, socket, or request that the component started. An effect cleanup function is the boundary where the component releases that external work at the right lifecycle moment.

## 2. The Analogy — Make It Obvious

Think of an effect as renting a workshop for one particular job. The setup function plugs in the tools, opens the door, and hires the worker needed for that job. The returned cleanup function is the closing checklist: unplug the tools, close the door, and dismiss that worker.

If the job changes from “repair bicycle A” to “repair bicycle B,” the old workshop must be closed before the new job starts. If the customer leaves, the workshop must still be closed. In React, a dependency change is the job change, an unmount is the customer leaving, the effect body is setup, and the returned function is cleanup.

The analogy has one important limit: cleanup is not a general “run something after every render” hook. It belongs to one effect instance and should undo the external resource that instance acquired. React does not call it for a render that never committed, because an effect from an abandoned render was never set up.

## 3. How It Actually Works — The Full Explanation

An effect is useful when a component must synchronize with something outside React: a timer, DOM event target, browser API, subscription, socket, media element, or request. During a committed render, React compares the effect's dependency values with the previous committed values.

For an effect whose dependencies changed, the lifecycle is:

1. React commits the new render.
2. React runs the previous effect instance's cleanup.
3. React runs setup for the new effect instance.

On unmount, React runs the last committed cleanup and does not run a replacement setup. If dependencies are unchanged, React keeps the existing effect instance; it does not run setup and cleanup just because the component rendered again. Passive effects from `useEffect` run after the commit rather than during render. Their exact scheduling relative to paint can vary, so code must not depend on a fragile timing assumption.

The key detail is that each setup closes over the props and state from its own render. If `roomId` changes from `alpha` to `beta`, the cleanup created while `roomId` was `alpha` still knows how to disconnect `alpha`. That is why setup and cleanup should be written together:

```tsx
import { useEffect } from "react";

type Connection = { disconnect(): void };

function connectToRoom(roomId: string): Connection {
  console.log(`Connected to ${roomId}`);
  return {
    disconnect() {
      console.log(`Disconnected from ${roomId}`);
    },
  };
}

export function RoomConnection({ roomId }: { roomId: string }) {
  useEffect(() => {
    const connection = connectToRoom(roomId);

    return () => {
      // This cleanup closes over the roomId and connection for this run.
      connection.disconnect();
    };
  }, [roomId]);

  return null;
}
```

The cleanup should be symmetrical with setup. If setup calls `addEventListener`, cleanup calls `removeEventListener`; if setup calls `setInterval`, cleanup calls `clearInterval`; if setup subscribes, cleanup unsubscribes. The cleanup function must be synchronous from React's point of view: return a function (or nothing), not a Promise. If asynchronous shutdown exists, start it inside cleanup, but do not return the Promise as the cleanup value.

Cleanup prevents two different classes of bugs. First, it prevents resource accumulation: old listeners, timers, and subscriptions remain active when a new effect starts. Second, it prevents obsolete work from winning a race: an old request or socket callback may otherwise update state using an old render's assumptions. Cleanup is not itself a guarantee that a remote server stopped processing a request. `AbortController` can signal cancellation to an API that supports it, while a local `active` flag can only ignore a result that arrives later.

In development Strict Mode, React deliberately performs an extra setup → cleanup → setup cycle for mounted effects. This is a stress test for symmetry. If the user sees two listeners after that cycle, setup added two resources while cleanup removed fewer than two. The code should be correct under this probe; adding a “run once” ref merely hides the missing cleanup.

## 4. Real Code — See It Working

The following examples assume React 18+ with `useEffect` imported from `react`. They are component-sized examples, but the external functions are browser APIs or small interfaces that can be replaced by production clients.

An interval must be cleared using the ID returned by the same setup call. A functional state update matters here because the interval callback may keep the effect's original render in its closure:

```tsx
import { useEffect, useState } from "react";

export function PollingClock() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      // Read the latest state without making the interval restart every tick.
      setSeconds((current) => current + 1);
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return <p>Open for {seconds} seconds</p>;
}
```

Event removal depends on the same callback identity and compatible listener options. Defining the callback inside the effect makes that identity local to the setup/cleanup pair:

```tsx
import { useEffect, useState } from "react";

export function OnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return <p>{online ? "Online" : "Offline"}</p>;
}
```

For changing requests, create a fresh controller for each effect run. The cleanup aborts the old run before the new run starts. The `AbortError` branch is expected control flow, while other errors still deserve normal error handling:

```tsx
import { useEffect, useState } from "react";

type User = { id: string; name: string };

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setUser(null);
    setError(null);

    fetch(`/api/users/${encodeURIComponent(userId)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<User>;
      })
      .then((nextUser) => {
        if (active) setUser(nextUser);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError(reason instanceof Error ? reason : new Error("Request failed"));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId]);

  if (error) return <p role="alert">{error.message}</p>;
  if (!user) return <p>Loading…</p>;
  return <h2>{user.name}</h2>;
}
```

Here is the same race boundary with a subscription-shaped API. The subscription object—not a newly created function—is the thing that owns the resource, so cleanup calls its unsubscribe method:

```tsx
import { useEffect, useState } from "react";

type Message = { text: string };
type Subscription = { unsubscribe(): void };
function subscribeToRoom(
  roomId: string,
  onMessage: (message: Message) => void,
): Subscription {
  const intervalId = window.setInterval(() => {
    onMessage({ text: `Message from ${roomId}` });
  }, 2_000);

  return {
    unsubscribe() {
      window.clearInterval(intervalId);
    },
  };
}

export function RoomMessages({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const subscription = subscribeToRoom(roomId, (message) => {
      setMessages((current) => [...current, message]);
    });

    return () => subscription.unsubscribe();
  }, [roomId]);

  return <p>{messages.length} messages in {roomId}</p>;
}
```

The local `subscribeToRoom` implementation fakes a server connection with an interval, and `unsubscribe()` clears that interval. A production messaging client can provide the same subscription contract.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is an effect cleanup function?**

It is the function returned by an effect's setup callback. React retains it for that committed effect instance and calls it when the effect must be replaced or removed. Its job is to release the external work that setup started: clear a timer, remove a listener, unsubscribe, disconnect, or abort a request.

**Q: When exactly does cleanup run?**

It runs before setup for the next committed effect when a dependency changed, and it runs when the component unmounts. It does not run after every render when dependencies are unchanged. In development Strict Mode, React also performs an extra setup/cleanup cycle to expose effects that are not safely repeatable.

**Q: Does cleanup only run on unmount?**

No. Treating it as an unmount-only hook is the common source of duplicate subscriptions. If `roomId` changes, React must disconnect the old room before connecting the new one. The unmount is only the final time the last effect instance is cleaned up.

**Q: Why must cleanup reverse setup?**

Because React only knows that an effect instance exists; it does not know the resource semantics of a third-party client or browser API. If setup adds one listener and cleanup removes a different listener, the external system still owns the original listener. A symmetric pair gives every setup a matching release and makes repeated setup safe.

**Q: How do you clean up an event listener correctly?**

Pass the exact same function object to `removeEventListener` that you passed to `addEventListener`, and use compatible options—especially the same `capture` setting. Defining the handler inside the effect is often simplest because setup and cleanup share the same reference. A stable callback or an event-listener abstraction can also work, but it should not be used to conceal stale data or an incorrect dependency boundary.

**Q: How do you clean up timers?**

Capture the return value from `setTimeout` or `setInterval`, then call the matching clear function in cleanup. A timeout that has already fired is harmless to clear, and clearing an interval prevents future ticks. The important part is clearing the ID belonging to this effect run, not a mutable global ID that another run may have replaced.

**Q: How does cleanup help with fetch requests?**

Create an `AbortController` inside the effect, pass its signal to `fetch`, and call `abort()` in cleanup. This asks the browser and fetch implementation to stop the old request and causes its promise to reject with an abort error. You still need to ignore or handle that expected error, and you should remember that aborting the browser-side operation does not necessarily undo work already accepted by a remote server.

**Q: Is `AbortController` required to prevent stale data?**

No, but cancellation and stale-result protection are different. If the API cannot be aborted, an `active` boolean set to `false` in cleanup can prevent an old promise from committing its result. That saves correctness, but the request may still consume network and server resources. A production data-fetching library may add caching, deduplication, retries, and its own request identity rules; an effect cleanup alone does not provide those features.

**Q: Can a cleanup function be `async`?**

Do not return an `async` function directly from the effect because it returns a Promise, while React expects either a cleanup function or nothing. Start asynchronous shutdown inside a synchronous cleanup if the API requires it, and make sure the application can tolerate shutdown finishing after the component is gone. For ordinary timers, listeners, and subscriptions, use their synchronous release methods.

**Q: What does Strict Mode reveal about cleanup?**

It reveals whether setup and cleanup are a balanced pair. React may mount an effect, clean it up, and mount it again in development. A correct effect ends that probe with one live resource. A missing cleanup leaves duplicate listeners or connections; a cleanup that destroys shared state it does not own can break the second setup. Strict Mode is exposing a lifecycle assumption, not creating a production-only resource leak.

**Q: Should cleanup call a state setter?**

Usually no. Cleanup is for releasing the external resource, and the component is often about to be removed or replaced. A setter there can be wasted work and can obscure ownership. There are narrow cases where a subscription library updates shared state during unsubscribe, but that behavior belongs to the library's contract rather than being a general cleanup pattern.

**Q: What if an effect starts work but setup throws before it returns cleanup?**

Make setup as atomic as practical and acquire resources in an order you can safely unwind. If setup can partially succeed and then throw, a single cleanup returned at the end may never be registered, so use an abstraction that handles partial acquisition or guard each acquired resource. This is one reason well-designed subscription APIs expose one object with one `unsubscribe` method.

## 6. The Traps — What Goes Wrong

The first trap is “cleanup is only for unmount.” With `[roomId]`, an old room remains connected while the new room is connected if cleanup is omitted. The callback may run twice, and the old callback may still have the old room's closure. The fix is to return the disconnect operation from the same effect that connected the room.

The second trap is removing a listener with a new function:

```tsx
// Wrong: these are two different function objects.
window.addEventListener("resize", () => console.log(window.innerWidth));
window.removeEventListener("resize", () => console.log(window.innerWidth));
```

The browser compares listener identity; identical source text does not make the functions identical. Define one `handleResize` variable and use it for both calls. Also keep the relevant options consistent.

The third trap is storing a timer ID outside the effect. A later render can overwrite the shared variable before an earlier cleanup runs, so cleanup clears the wrong timer. Keep the ID in the effect's local closure. If the timer needs current state, use a functional update or deliberately choose a dependency boundary that recreates the timer.

The fourth trap is treating a boolean cancellation flag as network cancellation. This pattern can protect state correctness:

The following is an illustrative fragment, not a standalone component. It assumes `useEffect`, `loadReport`, and the `setReport` state setter already exist in the surrounding component; that context is omitted so the cancellation boundary stays visible.

```tsx
useEffect(() => {
  let active = true;

  loadReport().then((report) => {
    if (active) setReport(report);
  });

  return () => {
    active = false;
  };
}, []);
```

But `loadReport()` still runs. Use an abort signal when the underlying client supports it, and use the flag as an additional guard when a library cannot fully cancel its work.

The fifth trap is swallowing every request error because abort is expected. A blanket `.catch(() => {})` hides real outages, malformed responses, and permission failures. Filter the known abort case, then surface or log the rest according to the application's error policy.

The sixth trap is returning a Promise from cleanup:

The following is an illustrative fragment, not a standalone component. It assumes `useEffect` and an application-specific `disconnectAsync` function are available in the surrounding component; the surrounding setup is omitted because the example focuses only on React's synchronous cleanup contract.

```tsx
// Wrong: async makes the returned cleanup value a Promise.
useEffect(() => {
  return async () => {
    await disconnectAsync();
  };
}, []);
```

Use a synchronous cleanup that starts the asynchronous operation instead:

```tsx
useEffect(() => {
  return () => {
    void disconnectAsync();
  };
}, []);
```

That does not make shutdown finish before unmount; it only follows the cleanup contract. If completion must be awaited for correctness, move the lifecycle into an owner that can explicitly await it.

The seventh trap is using a ref guard to defeat Strict Mode:

The following is an illustrative fragment, not a standalone component. It assumes `useRef`, `useEffect`, and the application-specific `connect` function are available in the surrounding component; that setup is omitted because the example focuses on why a ref guard is unsafe.

```tsx
// Wrong: it hides a lifecycle problem and can break after a real remount.
const didRun = useRef(false);
useEffect(() => {
  if (didRun.current) return;
  didRun.current = true;
  connect();
}, []);
```

The real fix is to make `connect()` and its cleanup symmetrical, or to move the operation to an event handler if it is caused by a user action. A component can genuinely mount again later, and that new instance must be allowed to acquire its resource.

The eighth trap is using an effect for derived data. Filtering an array, formatting a label, or calculating a total does not allocate an external resource, so there is nothing to clean up. Derive it during render or memoize an expensive calculation; reserve cleanup for synchronization with something outside React.

## 7. Compare With Related Concepts

**Cleanup vs setup:** setup acquires or starts an external resource; cleanup releases or stops the resource acquired by that specific setup. Rule: write them next to each other and make the pair symmetrical.

**Cleanup vs unmount:** unmount is one event that triggers cleanup, but dependency changes trigger cleanup too. Rule: if changing an input should replace an external connection, include that input in dependencies and clean up the old connection before creating the new one.

**Cleanup vs error handling:** cleanup releases resources regardless of whether the work succeeded; error handling decides what to do when work fails. Rule: abort an expected cancellation separately from displaying or logging a genuine failure.

**Cleanup vs cancellation:** cleanup is React's lifecycle opportunity to release work; cancellation is a capability of the underlying operation. Rule: use cleanup to call `abort`, `unsubscribe`, or `disconnect`, but do not claim that every cleanup can stop remote work.

**`useEffect` vs `useLayoutEffect`:** both can return cleanup functions, but layout effects are tied to the synchronous layout phase and are appropriate only when setup/teardown must coordinate with DOM measurement or visual mutations before paint. Rule: use passive `useEffect` for ordinary external synchronization; choose `useLayoutEffect` only when paint timing is part of correctness.

**Effect cleanup vs component keys:** changing a key destroys one component identity and mounts a new one, which naturally runs cleanup for the old instance. Rule: use a key when you truly want a fresh component state boundary; use effect dependencies when the same component should stay alive while replacing one external subscription.

**Effect cleanup vs data-fetching library lifecycle:** an effect can abort a request, but it does not automatically provide cache sharing, deduplication, retries, or stale-time policy. Rule: use the application's data layer for server state when available, and understand the cleanup it performs on your behalf.

## 8. 🧠 The Memory Hook — What Sticks

Every effect run is a tenant with its own key: setup rents the room, cleanup hands back that tenant's key before the next tenant arrives or the building closes. If an effect opens something outside React, its returned function must close that exact thing—and a dependency change is a checkout, not just another render.
