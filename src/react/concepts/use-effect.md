# `useEffect`: Synchronizing with External Systems

## 1. Why This Exists — The Problem First

Your user types "apple" into a search box. Five network requests fire in rapid succession as they type: "a", "ap", "app", "appl", "apple". The final request for "apple" resolves in 40ms over a fast CDN route. Two hundred milliseconds later, the sluggish response for "app" arrives and blindly writes its payload to state. The input shows "apple". The results list shows items for "app". That is a race condition, and it happens in production constantly when developers don't understand how to properly manage and cancel asynchronous effects.

A different team ships a dashboard with a real-time analytics widget. It attaches a listener to a global WebSocket on mount. When the user navigates to settings, the component disappears from the screen — but the WebSocket callback is still alive in memory, listening, waiting. The next time the user comes back, a new listener attaches on top of the old one. After ten navigations, ten zombie callbacks are running in the background, consuming memory, and trying to update state on components that no longer exist. The browser tab slowly degrades.

A third developer wants to keep a dropdown in sync with a primary selection, so they write an effect that calls `setState` when the selection changes. That state update triggers a re-render. The re-render runs the effect. The effect calls `setState` again. The browser tab freezes and the memory monitor climbs to the ceiling.

React needed a controlled, dedicated mechanism with guaranteed setup and teardown semantics — a way to synchronize a component's state with systems that live *outside* React's pure rendering loop. That mechanism is `useEffect`.

## 2. The Analogy — Make It Obvious

Think of a component like a guest in a high-tech smart hotel room.

When the guest arrives, the staff makes up the room — furniture placed, bed set, door unlocked. The physical room is now built and visible. That's React's **render and commit phase**: pure structural work, no external connections yet.

Once the guest is comfortably inside (after the paint), the room's automation system kicks in. That's the **effect**. It connects to the building HVAC to set the temperature to 70°F, pairs the bedside speaker to the guest's phone over Bluetooth, and registers the keycard sensor for room service. These are external systems — they exist completely outside the room's physical structure. The room itself doesn't know or care that they're running; the automation layer does.

Now the guest calls the front desk and asks for 65°F instead. That's a **dependency change**. The automation system doesn't rebuild the entire room. First, it shuts off the 70°F climate routine — that's the **cleanup**. Then it starts the 65°F cooling cycle — that's the **new effect running with the new value**.

When the guest checks out — **component unmounts** — the checkout protocol triggers all teardown routines: Bluetooth disconnects, the AC shuts off, the keycard sensor deregisters. If checkout didn't happen properly and the room gets assigned to a new guest, they'd hear audio from the previous guest's phone. In React, skipping cleanup creates identical chaos: zombie listeners, memory leaks, and ghost state updates from previous renders.

The key insight: the room automation doesn't run *instead of* the physical room — it runs *after* the room is built, in response to what the room currently needs. That's exactly what `useEffect` does.

## 3. How It Actually Works — The Full Explanation

The single biggest mistake developers make with `useEffect` is treating it like `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` stitched together. Those lifecycle methods think in terms of *time* — "when the component mounts, do X." `useEffect` thinks in terms of *synchronization* — "keep this external system in sync with these values, and tear it down cleanly when either those values change or the component disappears." That shift in mental model eliminates almost every common bug.

React executes in four distinct phases for every state or prop change:

```text
[ 1. Render Phase ]      React calls your component function.
                         Pure calculation. Produces a new fiber/virtual DOM tree.
                         Can be paused, restarted, or discarded (Concurrent React).
                         Side effects here are BUGS.

[ 2. Commit Phase ]      React applies calculated changes to the real browser DOM.
                         Synchronous and uninterruptible.
                         useLayoutEffect runs HERE.

[ 3. Paint Phase ]       Browser computes layout and renders pixels to the screen.
                         User sees the updated interface.

[ 4. Passive Effects ]   React runs useEffect callbacks asynchronously, after paint.
                         Non-blocking. Long operations here never delay the UI.
```

`useEffect` lives entirely in phase 4. Because it runs after paint, a slow data fetch or an analytics call inside `useEffect` never blocks the user from seeing their update. This is by design.

**How the dependency array actually works.** The dependency array tells React *when* to re-synchronize. After every render, React compares the new array with the previous one using `Object.is()` — the same strict identity check JavaScript's `===` uses, but without coercion. It checks index by index. If every position passes, React skips the effect. If even one fails, React runs the cleanup from the previous execution and then runs the effect again with the new values.

Three forms of the dependency array:

- No array at all: runs after every single render.
- Empty array `[]`: runs once after mount, cleanup runs on unmount. React sees no changing dependencies.
- `[a, b]`: runs whenever `Object.is(prevA, nextA)` returns `false` OR `Object.is(prevB, nextB)` returns `false`.

The `Object.is()` rule has a critical implication: objects and functions fail the check on every render unless their reference is stable. An object literal `{ id: 1 }` created inside the component body is a brand new allocation every render — `Object.is(prevObj, nextObj)` is always `false`. Putting it in the dependency array makes the effect fire every render, regardless of whether the data actually changed.

**How the cleanup lifecycle actually works.** The return value of `useEffect` is an optional function. Most developers assume cleanup only runs on unmount. It doesn't. It runs in two situations:

1. Right before the effect re-runs because a dependency changed — React tears down the previous synchronization, then establishes the new one.
2. When the component unmounts.

This means for any render where a dependency changes, you get: cleanup from render N, then effect from render N+1. React always starts fresh. It will never apply the new effect on top of the old one.

**How race conditions work and how to stop them.** When you fetch data based on a changing value (like `userId` or a search query), you can get out-of-order responses because the network doesn't respect your render order. There are two standard patterns to handle this:

The first is `AbortController`. When the effect cleans up, it calls `controller.abort()`, which cancels the in-flight HTTP request at the browser level. The `fetch()` call throws an `AbortError`, which you catch and ignore. This is the cleanest approach because it actually cancels the network work.

The second is an `isIgnored` boolean flag. You set a variable `let isIgnored = false` inside the effect, and the cleanup function sets `isIgnored = true`. The async callback checks `if (!isIgnored)` before calling `setState`. The network request still completes — you just discard the result. Use this for APIs that don't support cancellation, like some third-party SDKs.

**Why StrictMode runs your effect twice in development.** In React 18+, `<React.StrictMode>` deliberately mounts your component, runs the effect, calls the cleanup, and then mounts it again and runs the effect a second time. This is not a bug. React is stress-testing your cleanup logic to verify it's symmetrical with your setup. If a double mount-unmount-mount cycle breaks your effect, it means your cleanup isn't properly undoing what your setup does. This matters because Concurrent React features — like Offscreen rendering and route-level state preservation — can unmount and remount component effects without removing the component from the user's view. If your effect only works correctly on the first run, it will break in production on those features.

**What not to use `useEffect` for.** Senior engineers write fewer effects than juniors because they know what genuinely belongs inside React's own pipeline:

If a value can be computed from existing props or state — like a filtered list, a formatted string, or a total — compute it directly during render. Don't write `useEffect(() => setFullName(first + ' ' + last), [first, last])`. Write `const fullName = first + ' ' + last` in the render body. You get the right value on the same render, no extra state, no extra render cycle.

If code runs because a user clicked a button, submitted a form, or purchased something — put it in the event handler. Event handlers are the right place for intentional user-triggered actions. An effect that watches state and fires side effects in response to user actions introduces a delay, a middle-man state variable, and confusion about what triggered what.

If you need to reset state when a key identity prop changes (like switching from one product to another), reach for the `key` prop. `<ProductForm key={productId} />` tells React to throw away the old instance entirely and create a fresh one with clean state. No effect required.

## 4. Real Code — See It Working

**Data fetching with `AbortController` — the complete pattern.**

```tsx
import React, { useState, useEffect } from "react";

interface UserProfile {
  id: string;
  name: string;
  role: string;
}

function UserCard({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A new AbortController is created for THIS specific effect run.
    // When userId changes, the previous controller is aborted in cleanup
    // before this new one takes over.
    const controller = new AbortController();

    async function fetchUserData() {
      setIsLoading(true);
      setError(null);

      try {
        // Passing the signal ties this fetch to this controller.
        // If the controller is aborted, fetch throws an AbortError.
        const response = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data: UserProfile = await response.json();
        // We only reach this line if the controller was NOT aborted,
        // meaning this is still the most recent userId request.
        setProfile(data);
      } catch (err: unknown) {
        // AbortError is expected and intentional — not a real error.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load user");
      } finally {
        // Only clear loading if this request wasn't cancelled.
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    fetchUserData();

    // Cleanup: abort the in-flight fetch before the next userId effect runs,
    // or when the component unmounts. This prevents the race condition entirely.
    return () => {
      controller.abort();
    };
  }, [userId]); // Re-synchronize only when userId actually changes.

  if (isLoading) return <p aria-busy="true">Loading profile for {userId}...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!profile) return null;

  return (
    <div>
      <h3>{profile.name}</h3>
      <p>{profile.role}</p>
    </div>
  );
}
```

**Window event subscription — listener with guaranteed teardown.**

```tsx
import React, { useState, useEffect } from "react";

function WindowScrollProgress() {
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    function handleScroll() {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollPct(Math.min(100, Math.max(0, pct)));
    }

    // Sync with the external browser event stream.
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Immediately sync to the current scroll position on mount.
    handleScroll();

    // Cleanup removes the EXACT same function reference.
    // Without this, every mount adds a new listener that is never removed.
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []); // Empty array: attach once on mount, remove on unmount.

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(scrollPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: `${scrollPct}%`,
        height: 4,
        background: "blue",
      }}
    />
  );
}
```

**Synchronizing an imperative third-party widget — two separate effects for two separate concerns.**

```tsx
import React, { useEffect, useRef } from "react";

interface VideoPlayerProps {
  src: string;
  isPlaying: boolean;
  onEnded: () => void;
}

function VideoPlayer({ src, isPlaying, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Effect 1: Synchronize the playback state with the imperative DOM API.
  // This only needs to re-synchronize when isPlaying changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {
        // Browser autoplay policy can reject the promise — handle gracefully.
      });
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Effect 2: Synchronize the event listener with the onEnded callback.
  // Separate concern, separate effect. Keeps dependency arrays honest.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("ended", onEnded);
    };
  }, [onEnded]); // If the parent passes a new onEnded ref, we re-sync automatically.

  return <video ref={videoRef} src={src} playsInline />;
}
```

Notice that the two effects are deliberately separate. They have different dependencies and different cleanup responsibilities. Merging them into one block would mean any change to `isPlaying` causes the `onEnded` listener to be torn down and re-attached, which is unnecessary work. Keep one effect per synchronization concern.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `useEffect` actually designed for, and why is it wrong to treat it as a lifecycle replacement?**

`useEffect` is designed for synchronizing a component with an external system — anything that lives outside React's declarative render loop: the DOM, the network, WebSockets, timers, browser APIs, third-party widgets. The key word is synchronization.

Lifecycle methods (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`) think in terms of time. "When the component mounts, do this. When it updates, do that." `useEffect` thinks in terms of state. "For the current value of `userId`, keep the data in sync with this API call. When `userId` changes, cancel the previous call and start a new one."

When you think in lifecycles, you ask "how do I run this once?" When you think in synchronization, you ask "what external resource depends on these values, and how do I keep it consistent?" The synchronization model naturally surfaces the cleanup requirement because any synchronization that can be set up can be torn down.

**Q: Exactly when does `useEffect` execute during React's rendering pipeline, and how does it differ from `useLayoutEffect`?**

`useEffect` fires asynchronously in the Passive Effects phase — after React has committed DOM changes and after the browser has finished painting pixels to the screen. It never blocks the browser's rendering pipeline.

`useLayoutEffect` fires synchronously in the Commit phase — after React mutates the DOM but before the browser paints. It blocks paint. Use it only when you need to read DOM geometry (like `getBoundingClientRect()`) and immediately apply corrections before the user sees anything, to prevent layout flicker. For everything else — data fetching, subscriptions, timers, analytics — `useEffect` is correct.

**Q: How does React evaluate the dependency array between renders?**

React stores a snapshot of the dependency array from the previous render. After the next render produces a new array, React walks through both arrays index by index and runs `Object.is(prev[i], next[i])` for each position. If every comparison returns `true`, the effect is skipped. If any returns `false`, the previous cleanup runs and the effect runs again with the new captured values.

`Object.is()` means objects and functions fail the check by reference, not by value. A new object literal `{}` created inside the component is a different reference every render, even if the data inside is identical. This is why putting inline objects or functions directly in the dependency array causes infinite effect loops.

**Q: What is a stale closure in the context of `useEffect`, and how do you cause one?**

A stale closure happens when an effect captures a variable from the component's scope — a prop or piece of state — but doesn't include it in the dependency array. Because JavaScript closures close over the values at the time the function was created, an effect with `[]` as its dependency array will forever see the values from the very first render. If state changes, the effect's callback still reads the frozen initial value.

The classic example is a `setInterval` inside an effect with `[]`:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1); // count is captured as 0 forever
  }, 1000);
  return () => clearInterval(id);
}, []);
```

Every tick calls `setCount(0 + 1)`, so `count` never gets past 1. The fix is the functional updater form: `setCount(prev => prev + 1)`. This removes the dependency on `count` entirely by reading the latest value from React's internal queue rather than from the closed-over variable.

**Q: When does the cleanup function run, and what happens if you skip it?**

Cleanup runs in exactly two situations: right before the effect runs again because a dependency changed (using captured values from the *previous* render), and when the component unmounts.

If you skip cleanup on a subscription, event listener, or timer, the previous connection stays alive every time the effect re-runs. After ten re-renders with changing dependencies, ten listeners are attached. They consume memory, fire their callbacks, and try to call state setters on potentially unmounted components. In the best case, you get duplicate state updates. In the worst case, the browser tab degrades and React throws "Can't perform a state update on an unmounted component" warnings.

**Q: Why does `useEffect` fire twice on mount in React 18 StrictMode?**

React 18's `<React.StrictMode>` in development mode runs a deliberate mount → cleanup → mount cycle for every component. This is React testing that your effect is resilient to being re-mounted, which is exactly what Concurrent React features like Offscreen rendering and Suspense transitions can do in production. If your effect breaks during this double invocation — for example, if it tries to add an event listener without removing it in cleanup, causing a duplicate — that bug would also surface silently in production when Concurrent features trigger the same pattern. StrictMode makes the bug loud and immediate in development.

**Q: Why can't you pass an `async` function directly to `useEffect`?**

An `async` function always returns a `Promise`. React expects `useEffect` to return either `undefined` or a synchronous cleanup function. If you write `useEffect(async () => {...})`, React receives a Promise object where it expects a function or nothing. Any cleanup you try to `return` from inside the async function is a value resolved by the Promise — React never sees it, so it never calls it.

The correct pattern is to define the async function inside the synchronous effect body and call it immediately:

```tsx
useEffect(() => {
  let isIgnored = false;

  async function loadData() {
    const data = await fetchSomething();
    if (!isIgnored) setData(data);
  }

  loadData();

  return () => { isIgnored = true; };
}, [dependency]);
```

**Q: How do you recognize that an effect is unnecessary and should be removed?**

Three clear signals:

If you're computing a value from existing props or state and storing it in a new state variable via an effect, that's unnecessary. Compute it during render — same result, no extra renders, no extra state.

If you're triggering logic in response to a specific user action (form submit, button click, navigation) by watching state changes in an effect, that logic belongs in the event handler where the action originated. Effects fire for *any* reason the dependency changes, not just user actions — so using an effect here makes the trigger ambiguous and the behavior fragile.

If you're clearing or resetting state when an identity prop changes (like switching from user A to user B), reach for `key={userId}` on the component instead. React automatically tears down and rebuilds the component instance with fresh state — no effect, no state management.

## 6. The Traps — What Goes Wrong

**Trap 1: Object or array in the dependency array causing an infinite loop.**

```tsx
function SearchResults({ query }: { query: string }) {
  // This object is recreated on every render — new reference every time.
  const options = { caseSensitive: false, maxResults: 10 };

  useEffect(() => {
    fetchResults(query, options);
  }, [query, options]); // options always fails Object.is() — infinite loop
}
```

`options` is an object literal created in the component body. Its reference changes every render. React compares `prevOptions` to `nextOptions`, sees two different references, and runs the effect. The effect likely updates state, causing another render, creating a new `options` reference, triggering the effect again.

Fix: Move static objects outside the component entirely. Or pass the primitive values as dependencies: `[query, options.caseSensitive, options.maxResults]`. Or stabilize the object with `useMemo`.

**Trap 2: Stale closure in `setInterval`.**

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1); // count is frozen as 0 from the first render
    }, 1000);
    return () => clearInterval(id);
  }, []); // Empty deps — effect runs once, closure is sealed
}
```

Every second this calls `setCount(0 + 1)`. `count` never grows past 1.

Fix: `setCount(prev => prev + 1)`. The functional updater removes the dependency on the closed-over `count` entirely, reading from React's internal latest-state queue instead.

**Trap 3: Passing an `async` function directly.**

```tsx
// WRONG: Returns Promise<void>, not undefined or a cleanup function
useEffect(async () => {
  const data = await fetchData();
  setData(data);
  return () => cleanup(); // This runs inside the Promise. React never sees it.
}, []);
```

The cleanup you return from inside an async effect is wrapped in a Promise. React receives the Promise as a return value, not the cleanup function. The cleanup is never called.

Fix: Define async inline and call it synchronously, as shown in the code examples above.

**Trap 4: Suppressing the linter instead of fixing the dependency graph.**

```tsx
useEffect(() => {
  logVisit(userId, currentTheme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // userId and currentTheme are silently ignored
```

The `react-hooks/exhaustive-deps` rule exists because every value used inside an effect that changes over renders must appear in the dependency array. Suppressing the rule means React doesn't know `userId` changed — so when the user navigates to a different profile, the log records the wrong user.

Fix: Include all reactive values. If you genuinely want to read a value in the effect without making it a trigger for re-running, that's what `useEffectEvent` (currently experimental) is for — it lets you extract non-reactive logic that always reads the latest value without being a dependency.

**Trap 5: Missing cleanup on subscriptions creates zombie handlers.**

```tsx
useEffect(() => {
  const handleResize = () => setWidth(window.innerWidth);
  window.addEventListener("resize", handleResize);
  // No return statement — listener is never removed
}, []);
```

Every unmount-remount cycle adds another listener. On resize, every registered handler fires. They all try to call `setWidth`. If any of the associated component instances are no longer mounted, you get warnings about updating unmounted components. Memory climbs.

Fix: Always mirror every setup call with its teardown in the return function.

**Trap 6: Forgetting that cleanup runs with the *previous* render's values.**

A subtle but important one: when your cleanup function closes over dependencies, it captures the values from the render *that scheduled the effect*, not the values from the render that triggered cleanup.

```tsx
useEffect(() => {
  const ws = new WebSocket(`wss://example.com/room/${roomId}`);
  ws.onmessage = (msg) => handleMessage(msg);

  return () => {
    // roomId here is the VALUE from the render that created this effect,
    // not the new roomId that caused the cleanup to run.
    // This is correct — you're closing the old connection, not the new one.
    ws.close();
  };
}, [roomId]);
```

This is actually the correct behavior — the cleanup should close the *old* WebSocket for the *old* `roomId`. React guarantees this. But developers sometimes get confused and expect cleanup to see the new dependency values. It sees the old ones, by design.

## 7. Compare With Related Concepts

**`useEffect` vs `useLayoutEffect`**

Both synchronize with external systems. The difference is *when* they run relative to the browser's paint step.

`useLayoutEffect` runs synchronously after React commits DOM changes but before the browser paints. It blocks paint. Use it when you need to read DOM geometry and immediately correct it to prevent the user from seeing an intermediate state — like measuring a tooltip's position and adjusting it before it appears on screen.

`useEffect` runs asynchronously after paint. It never blocks the user interface. Use it for everything else: data fetching, subscriptions, timers, analytics.

Rule: default to `useEffect`. Only switch to `useLayoutEffect` when you have a visible layout flicker caused by DOM measurement and correction.

**`useEffect` vs event handlers**

An event handler fires in direct response to a specific user action: a click, a keypress, a form submission. The user's action is the trigger. It's intentional, explicit, traceable.

`useEffect` fires in response to a state or prop value changing, regardless of *why* that value changed. It could be a user action, a WebSocket message, a timer, or a parent re-render. The effect doesn't know and doesn't care.

Rule: if code runs because the user *did something*, put it in the event handler. If code must run whenever a *value is a certain thing*, put it in `useEffect`.

**`useEffect` vs derived state / `useMemo`**

Derived state means computing a new value from existing props or state. The temptation is to store that derived value in state and sync it via `useEffect`. This is always wrong when the derivation is purely from within React — it adds an extra state variable, forces an extra render cycle (render → effect fires → setState → render again), and creates a window where the derived state is stale.

`useMemo` runs during the render phase and memoizes the computed value. It's the right tool when the computation is expensive enough that you don't want to repeat it on every render.

Rule: if a value comes entirely from props and state, compute it during render (or memoize with `useMemo`). Never use `useEffect` to sync state with state.

**`useEffect` vs `useSyncExternalStore`**

`useEffect` can technically subscribe to external stores (Redux, Zustand, browser history) by setting up a listener and calling `setState` in the callback. But under React 18's Concurrent Mode, this can cause *tearing* — different components in the same render tree reading different snapshots of the external store, because React can interrupt and resume renders.

`useSyncExternalStore` is React 18's dedicated hook for subscribing to external mutable state. It guarantees that every component in a render tree reads the same consistent snapshot, preventing tearing.

Rule: use `useSyncExternalStore` for global mutable stores and browser APIs like `navigator.onLine` or `window.matchMedia`. Use `useEffect` for imperative side effects — network requests, DOM manipulation, timers.

## 8. 🧠 The Memory Hook

`useEffect` is not a lifecycle hook — it's a synchronization cable between your component and an external system. When the dependency changes, React yanks the old cable out (cleanup runs with the old values), then plugs the new one in (effect runs with the new values). If you're not connecting to something *outside* React — no network, no DOM, no timer, no subscription — leave the cable drawer closed and compute it during render.
