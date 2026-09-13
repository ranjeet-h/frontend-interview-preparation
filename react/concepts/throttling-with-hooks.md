# Throttling With Hooks

## 1. Why This Exists — The Problem First

A browser can dispatch `scroll`, `pointermove`, `wheel`, and `resize` events many times between two paints. If every event recalculates layout, updates React state, or starts a request, that work competes with the work that keeps the page responsive. The result is dropped frames, excessive renders, and requests describing intermediate states the user never cared about.

The useful question is not “How do I make this callback slower?” It is “What is the maximum rate at which this work needs to happen?” Throttling gives a continuous interaction a controlled execution budget: while events keep arriving, the callback runs no more often than the chosen interval.

## 2. The Analogy — Make It Obvious

Imagine a building entrance with a bouncer and a wall clock. People may arrive at any speed, but the bouncer admits at most one person every 100 milliseconds. The bouncer records when the last person entered and, in trailing mode, remembers the latest person waiting when the door is temporarily closed.

The crowd is the event stream, the bouncer is the throttled wrapper, the clock is the interval check, and an admitted person is a callback execution. React `useRef` is the bouncer’s private notebook: it persists between renders, but writing in it does not ask React to render the screen again. A leading throttle admits the first event immediately; a trailing throttle admits the latest saved event when the window opens.

## 3. How It Actually Works — The Full Explanation

A throttle is a small state machine around a callback:

1. Read the current time when an event arrives.
2. Compare it with the last execution time.
3. If the interval has not elapsed, ignore the event or save its latest arguments.
4. If it has elapsed, record the time and invoke the callback.
5. If trailing behavior is enabled, a timer invokes the saved latest call when the window ends.

A timestamp-only implementation is leading-only. It is cheap and predictable, but it does not run by itself when the interval expires, so the final event can disappear. A leading-and-trailing implementation adds a timer and pending arguments. The first event can run immediately; later events replace the pending arguments; one timer eventually runs the newest one.

React adds two problems that plain JavaScript examples often miss. First, a callback created during render closes over that render’s props and state. A timer that fires later can therefore use an old token, filter, or selected item. Second, recreating the wrapper on every render throws away its timestamp and timer closure and can break `removeEventListener`, which requires the exact function object that was registered.

In development, React Strict Mode makes this lifecycle easier to test by replaying an initial render and by running an Effect's setup, cleanup, and setup again. It does not automatically invoke browser or React event handlers twice, so a user scroll or click is not duplicated merely because Strict Mode is enabled. Any listener setup must therefore be idempotent: register the intended listener, and in cleanup remove that exact listener and cancel its timer so the replay leaves one live subscription rather than two.

Keep timing metadata in refs because it controls the wrapper rather than the UI. Updating a ref persists across renders without scheduling one. The visible result can use state, but the timestamp, timer handle, pending arguments, and latest callback should not cause a render for every incoming event. Keep the public wrapper stable with `useCallback`, and route delayed execution through a ref containing the latest callback.

Throttle is a frequency ceiling, not a real-time promise. Timers are minimum delays and the main thread may be busy. A 100 ms throttle means “not more than once per 100 ms,” not “exactly every 100 ms.” For visual work, `requestAnimationFrame` is often better because it aligns with paint; for telemetry or network budgets, a time window is usually the clearer contract.

## 4. Real Code — See It Working

**Leading-only callback throttle**

This hook and component are self-contained apart from React. The first scroll event runs immediately; further events are ignored until a later event arrives outside the 100 ms window.

```tsx
// Assumptions: React 18+ Hooks, a browser timer/Date.now implementation, and TypeScript.
import { useCallback, useRef, useState } from "react";

export function useThrottleCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  delayMs: number,
) {
  // The ref persists timing state without a render for every incoming event.
  const latestCallback = useRef(callback);
  const lastRunAt = useRef<number | null>(null);
  // Refresh the callback separately so the stable wrapper does not close over old props/state.
  latestCallback.current = callback;

  return useCallback((...args: T) => {
    const now = Date.now();
    const last = lastRunAt.current;
    // null means no invocation has happened yet, so leading mode must run immediately—even at time 0.
    if (last === null || now - last >= delayMs) {
      lastRunAt.current = now;
      latestCallback.current(...args);
    }
  }, [delayMs]);
}

export function ScrollPosition() {
  const [scrollY, setScrollY] = useState(0);
  const onScroll = useThrottleCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      setScrollY(event.currentTarget.scrollTop);
    },
    100,
  );

  return (
    <section>
      <p>Sampled position: {scrollY}px</p>
      <div onScroll={onScroll} style={{ height: 160, overflowY: "auto" }}>
        <div style={{ height: 1200 }}>Scroll this content.</div>
      </div>
    </section>
  );
}
```

The expensive boundary is the throttled handler itself, not only the state update. The event is attached directly to the element, so this example needs no effect.

`callback` is intentionally absent from the `useCallback` dependency list in both hooks. The public wrapper must not be recreated just because the component creates a new callback closure during a render; recreating it would reset closure-owned timing state and could change a DOM listener's identity. `latestCallback.current = callback` keeps the wrapper stable while delayed execution reads the callback from the latest render, so it does not use a stale closure. `delayMs` is included because it changes the throttle contract: changing it creates a new wrapper, but the refs still persist, so the last-run timestamp and any pending timer are not automatically reset. In the trailing hook, an already scheduled timer keeps its existing deadline; later calls use the new delay. If an application needs a delay change to discard pending work and start a fresh window, the owner must explicitly call `cancel` as part of that policy.

**Leading plus trailing behavior with cancellation**

When the final drag or resize value matters, save the newest arguments and expose cancellation.

```tsx
// Assumptions: React 18+ Hooks, browser-compatible setTimeout/clearTimeout, and TypeScript.
import { useCallback, useRef } from "react";

type CancelableThrottle<T extends unknown[]> = ((...args: T) => void) & {
  cancel: () => void;
};

export function useTrailingThrottle<T extends unknown[]>(
  callback: (...args: T) => void,
  delayMs: number,
): CancelableThrottle<T> {
  // Keep the callback fresh without rebuilding the public throttled function each render.
  const latestCallback = useRef(callback);
  // The timer handle is mutable control data; changing it must not trigger a React render.
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Trailing mode retains only the newest arguments because intermediate events are replaceable.
  const pendingArgs = useRef<T | null>(null);
  // null distinguishes "never ran" from a real clock reading of 0 in controlled-clock tests.
  const lastRunAt = useRef<number | null>(null);
  // A generation invalidates a timer callback that was already queued when newer work superseded it.
  const timerGeneration = useRef(0);
  latestCallback.current = callback;

  const cancel = useCallback(() => {
    // Cleanup must cancel the actual pending browser timer, or trailing work can outlive its owner.
    if (timerId.current !== null) clearTimeout(timerId.current);
    timerId.current = null;
    timerGeneration.current += 1;
    // Drop retained arguments so cancellation cannot later invoke obsolete work.
    pendingArgs.current = null;
    // Reset the window too, so an explicit cancel starts the next call fresh.
    lastRunAt.current = null;
  }, []);

  const throttled = useCallback((...args: T) => {
    const now = Date.now();
    const last = lastRunAt.current;
    const remaining = last === null ? 0 : delayMs - (now - last);
    // Replace older trailing input because the latest value is the one the consumer needs.
    pendingArgs.current = args;

    if (remaining <= 0) {
      // A queued trailing callback is obsolete once this event executes immediately.
      if (timerId.current !== null) {
        clearTimeout(timerId.current);
        timerId.current = null;
        timerGeneration.current += 1;
      }
      // Record before invoking so re-entrant calls observe the new throttle window.
      lastRunAt.current = now;
      const currentArgs = pendingArgs.current;
      pendingArgs.current = null;
      if (currentArgs) latestCallback.current(...currentArgs);
      return;
    }

    if (timerId.current === null) {
      // One timer owns the window; later calls only replace pendingArgs.
      const generation = timerGeneration.current + 1;
      timerGeneration.current = generation;
      timerId.current = setTimeout(() => {
        if (timerGeneration.current !== generation) return;
        timerId.current = null;
        // Re-read the clock when the callback actually runs because timers can be delayed.
        lastRunAt.current = Date.now();
        const currentArgs = pendingArgs.current;
        pendingArgs.current = null;
        if (currentArgs) latestCallback.current(...currentArgs);
      }, remaining);
    }
  }, [delayMs]) as CancelableThrottle<T>;

  throttled.cancel = cancel;
  return throttled;
}
```

If a custom hook owns a `window.addEventListener` subscription, its cleanup must remove that exact listener and call `cancel`. Clearing only the timer still leaves the subscription alive.

**Consumer example — the subscription owner cancels on unmount**

The custom hook below owns the external `window` subscription, so its cleanup is also the lifecycle boundary for the throttled timer. The component only consumes that hook; it does not need to know how the listener is registered.

```tsx
// Assumptions: React 18+ Hooks, a browser with window resize events, and TypeScript DOM types.
import { useEffect, useState } from "react";

export function useWindowResizeThrottle(
  onResize: () => void,
  delayMs: number,
) {
  const throttledResize = useTrailingThrottle(onResize, delayMs);

  useEffect(() => {
    // Register the stable wrapper so React/browser cleanup can identify the same listener later.
    window.addEventListener("resize", throttledResize);
    return () => {
      // Remove the subscription and cancel delayed work at the same lifecycle boundary.
      window.removeEventListener("resize", throttledResize);
      throttledResize.cancel();
    };
  }, [throttledResize]);
}

export function ResponsivePanel() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useWindowResizeThrottle(() => {
    setWidth(window.innerWidth);
  }, 100);

  return <p>Viewport width: {width}px</p>;
}
```

The setup and cleanup pair is safe to replay in Strict Mode: the first setup is cleaned up before the second setup remains active. The inline `onResize` callback may change on each render, but `useTrailingThrottle` reads it through `latestCallback.current`, so the listener identity stays stable while the component is mounted.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is throttling, and how is it different from debouncing?**

Throttling limits execution frequency during activity: the callback can run at most once per interval. Debouncing resets a timer for each call and runs after a quiet period, so a continuous stream may produce no callback until it stops. Use throttle for periodic progress such as scroll or drag; use debounce when only the settled value matters, such as a search request after typing pauses.

**Q: Why use `useRef` instead of `useState` for the timestamp?**

The timestamp and timer are control data, not UI. Ref writes persist without scheduling renders, which matters when events arrive dozens of times per second. State remains appropriate for the sampled value shown on screen; putting the timestamp in state would add render work to every timing decision.

**Q: Does a 100 ms throttle run exactly every 100 ms?**

No. It guarantees a minimum gap, not a real-time schedule. A timestamp version checks only when another event arrives, and a timer can be delayed by the event loop or browser clamping. The contract is “never more often than allowed,” not exact periodic execution.

**Q: What do leading and trailing mean?**

Leading runs the first call in a window immediately. Trailing saves the latest call and runs it when the window ends. Leading gives immediate feedback; trailing preserves the final drag, resize, or pointer value. The correct choice depends on whether intermediate progress, the final value, or both matter.

**Q: How do you avoid stale closures?**

Keep the public throttled function stable, but invoke `latestCallback.current` when work eventually runs. Updating that ref during render makes delayed work see current props and state. Recreating the throttle whenever values change also avoids stale data, but resets timing and can change listener identity, so it is a different contract.

**Q: Why is a new throttled function on every render dangerous?**

Its timestamp and timer live in its closure. Recreating it discards that state, so rapid events can bypass the limit. With DOM listeners, cleanup can also fail because `removeEventListener` needs the same function object used by `addEventListener`.

**Q: How do you clean up a window-based throttle?**

Remove the registered listener and cancel any trailing timer. Otherwise an unmounted component can still receive events, and delayed work can retain data or update abandoned state. A timestamp-only throttle has no timer, but its listener still needs cleanup.

**Q: What does React Strict Mode change for this hook?**

In development, Strict Mode can replay an initial render and run an Effect's setup, cleanup, and setup again to expose unsafe side effects. It does not automatically call event handlers twice. A window subscription is correct when setup and cleanup are idempotent: cleanup removes the exact registered wrapper and calls `cancel`, so replay does not leave duplicate listeners or a trailing callback from the discarded setup.

**Q: When is `requestAnimationFrame` better?**

Use it when the work is visual and should happen at most once before a paint. Use a time throttle when the rule is a fixed rate, such as one analytics send per second. A frame budget and a network budget are different problems.

**Q: How do you test it?**

Use fake timers and a controlled clock. Test the leading call, repeated calls inside the window, the trailing call’s latest arguments, cancellation, cleanup, delay changes, and a callback that changes between renders. Real sleeps make tests slow and flaky.

## 6. The Traps — What Goes Wrong

**Throttling only the state update:** The wrong assumption is that React batching makes everything before `setState` cheap. It does not: the expensive calculation or request has already happened before React receives the state update, so batching only groups the later render work. The actual behavior is that every event can still perform the expensive work while only the state commits are coalesced. Put the expensive calculation or request behind the throttle boundary, and let the throttled callback perform the state update too.

**Using debounce for continuous feedback:** The wrong assumption is that debounce is simply a slower throttle. Debounce resets its quiet-period timer on every event, so continuous drag or scroll input keeps postponing the callback. The actual behavior is a preview that can look frozen until activity stops. Use throttle or `requestAnimationFrame` for progress, and reserve debounce for work that should wait for the settled value.

**Putting bookkeeping in state:** The wrong assumption is that the timestamp and timer handle belong in React state because they change over time. State updates schedule renders, even though this control data is not displayed. The actual behavior is that every event can schedule a render just to record a time, adding work to the high-frequency path. Store control data in refs and keep only the visible sampled result in state.

**Capturing the first callback:** The wrong assumption is that the callback passed to the hook stays current inside a stable wrapper. A timer or event listener can run after later renders, while a closure created earlier still points at the old token, filter, or selection. The actual behavior is delayed work using stale values. Read the latest callback through a ref, or deliberately recreate the wrapper with the timing and listener-identity consequences understood.

**Forgetting trailing cancellation:** The wrong assumption is that unmounting or navigation automatically makes a scheduled trailing timer harmless. The timer is a browser resource independent of the component tree, so it can still fire after its owner is gone. The actual behavior is delayed work retaining obsolete arguments or attempting an abandoned state update. Provide `cancel`, clear the timer, drop pending arguments, and invoke it from the subscription owner’s cleanup.

**Assuming every event is observed:** The wrong assumption is that a throttle is a slower queue that eventually processes every event. Throttle is lossy by design: calls inside the window are ignored or replaced by the latest pending arguments. The actual behavior is that intermediate events disappear, even though the first and/or final event may be delivered. If every event is business data, aggregate or queue it instead of silently dropping it.

**Ignoring server backpressure:** The wrong assumption is that a client throttle protects the server. A 100 ms client throttle still allows ten requests per second per user, and other clients are unrestricted; a malicious or buggy client can bypass it entirely. The actual behavior is only local pacing, not an API safety limit. Add batching, deduplication, request cancellation, and server-side rate limits where needed.

**Choosing a delay by habit:** The wrong assumption is that a familiar number has a universal UX meaning—16 ms is automatically smooth or 500 ms is automatically acceptable. The actual behavior depends on callback cost, device speed, event frequency, browser scheduling, and what the user needs to perceive. Measure the work and test on the slowest supported device, then choose a delay that matches the actual interaction and request budget.

## 7. Compare With Related Concepts

- **Throttle vs debounce:** throttle runs periodically during activity; debounce waits for inactivity. Use throttle for progress and debounce for a settled result.
- **Throttle vs `requestAnimationFrame`:** throttle uses a time window; `requestAnimationFrame` aligns visual work with paint. Use the latter for animation-like updates.
- **Throttle vs batching:** throttle limits how often work starts; batching combines several inputs into one operation. Batch when all inputs matter; throttle when intermediate values may be dropped.
- **Throttle vs virtualization:** throttle reduces event-handler frequency; virtualization reduces DOM work. They solve different bottlenecks and can be combined.
- **Throttle vs server-side rate limiting:** a client throttle improves one client’s behavior but cannot protect the API. Enforce the real safety limit on the server.

## 8. 🧠 The Memory Hook — What Sticks

Picture a bouncer with a clock: a crowd may arrive continuously, but only one person crosses the door per interval. `useRef` is the bouncer’s private notebook, trailing mode is the last person waiting, and cleanup is locking the door before leaving.
