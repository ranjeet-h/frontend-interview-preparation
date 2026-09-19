# Custom Hooks

These are the reusable primitives the problems on the other pages reach for. Every debounce, timer, observer, and fetch in this chapter is one of these hooks under a different name, so getting the contract right here pays off everywhere else.

Two rules apply to all of them:

- **Always clean up** what you subscribe to. If you added a listener, an interval, or an observer, the effect must return a function that removes it.
- **Never read a stale closure.** If a callback fires after the values it closed over have changed, store the callback in a ref and call `ref.current` instead.

Each entry gives the contract, a compact implementation, and the two things interviewers actually probe: cleanup and stale state.

---

## useDebounce

`Difficulty: Easy` `Probability: Very High`

### What it does

Returns a copy of a value that only updates after the value has stopped changing for `delay` milliseconds. It collapses a burst of updates (keystrokes, resizes) into one trailing value.

### Signature

```ts
function useDebounce<T>(value: T, delay?: number): T;
```

### Implementation

```ts
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
```

```ts
const query = useDebounce(search, 300);
useEffect(() => { void fetchResults(query); }, [query]);
```

### Cleanup & stale closures

The cleanup runs `clearTimeout(id)`, so every new `value` cancels the pending timer before scheduling a new one. That is what guarantees only the *last* value wins: each timer closes over the `value` it was created with, but all but the newest are destroyed before they fire. No ref is needed because the dependency array re-runs the effect on every change; if the timeout could survive a render without re-running, a ref would be required.

### Pitfalls

- The first render returns the initial value synchronously; it is not debounced.
- `delay = 0` still defers by a macrotask, so consumers must not assume it is synchronous.
- Debouncing the *state* does not debounce the *request*: pair it with an `AbortController` (see `useFetch`) so the older request cannot win.
- Changing `delay` restarts the timer; that is usually correct but worth stating out loud.

```text
✓ returns the initial value immediately
✓ only emits the last value after the delay
✓ resets the timer on every new value
✓ clears the pending timer on unmount
```

### Used by

**Debounced Search** (40), **API Autocomplete** (43), **Autocomplete / Typeahead / Combobox** (20), **Large Searchable List** (57), **Search + Filters Synced with URL** (67).

---

## useThrottle

`Difficulty: Easy` `Probability: High`

### What it does

Returns a stable version of a callback that runs at most once per `delay` milliseconds, with a trailing call so the final invocation is not dropped. Unlike debounce, throttle guarantees a steady rate while events keep firing.

### Signature

```ts
function useThrottle<A extends unknown[]>(
  callback: (...args: A) => void,
  delay?: number,
): (...args: A) => void;
```

### Implementation

```ts
export function useThrottle<A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 200,
) {
  const latest = useRef(callback);
  const lastRun = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  return useCallback(
    (...args: A) => {
      const now = Date.now();
      const remaining = delay - (now - lastRun.current);

      if (remaining <= 0) {
        lastRun.current = now;
        latest.current(...args);
      } else if (!trailing.current) {
        trailing.current = setTimeout(() => {
          lastRun.current = Date.now();
          trailing.current = null;
          latest.current(...args);
        }, remaining);
      }
    },
    [delay],
  );
}
```

### Cleanup & stale closures

Two separate problems are solved two ways. The **callback** lives in `latest`, refreshed by an effect, so the returned throttled function is stable per `delay` and always invokes the current handler instead of the one from the render that created it. The **timer** lives in `trailing` and is cleared by the unmount effect, so a pending trailing call cannot fire after the component is gone. `lastRun` is a ref so updating it does not trigger a render.

### Pitfalls

- Debounce waits for silence; throttle emits during the burst. State the difference before coding it.
- Do not call `useThrottle(fn)` inline with an unstable `delay`; a changing `delay` changes the returned identity.
- The trailing call uses the arguments of the invocation that scheduled it, which is the standard behavior; document it.
- Scroll handlers still fire at event rate &mdash; throttle the *handler*, not the scroll event itself.

### Used by

**Infinite Scroll** (45), **Windowed Infinite List** (56), **Product Listing / E-commerce Catalog** (66), **Sortable List** (36) drag previews.

---

## useLocalStorage

`Difficulty: Easy` `Probability: Very High`

### What it does

A `useState` that mirrors its value into `localStorage`, restores it on load, survives JSON parse errors and disabled storage, and updates when another tab writes the same key.

### Signature

```ts
function useLocalStorage<T>(
  key: string,
  initial: T,
): readonly [T, (next: T | ((prev: T) => T)) => void];
```

### Implementation

```ts
export function useLocalStorage<T>(key: string, initial: T) {
  const read = (): T => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial; // blocked storage, private mode, or malformed JSON
    }
  };

  const [value, setValue] = useState<T>(read);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // quota exceeded or storage disabled: keep the in-memory value
        }
        return resolved;
      });
    },
    [key],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || event.newValue === null) return;
      try {
        setValue(JSON.parse(event.newValue) as T);
      } catch {
        // another tab wrote non-JSON; ignore it
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [value, set] as const;
}
```

### Cleanup & stale closures

The lazy initializer reads storage exactly once on mount; `read` is not called during every render. The setter uses the functional updater, so it always persists the value computed from the latest committed state, which matters when the same key is written twice in one tick. The `storage` listener is registered per `key` and removed on unmount or key change, so two tabs stay in sync without leaking.

### Pitfalls

- SSR: the server renders `initial`, the client may read a different stored value, and React reports a hydration mismatch. Fix it with a `useSyncExternalStore`-based hook or by applying the stored value after mount; never read `localStorage` during the render of a shared component.
- `storage` only fires in *other* tabs, never the one that wrote it, so do not depend on it for local updates.
- `undefined` does not survive `JSON.stringify`; either forbid it in `T` or serialize around it.
- The `storage` event is not a substitute for a schema: version your key (`cart:v2`) when the shape changes.

### Used by

**Theme Switcher with Persisted Preference** (6), **Todo / CRUD Application** (2), **Undo / Redo State History** (5), **Shopping Cart with Context + `useReducer`** (60), **Editable Profile / Settings Page** (75), **Stopwatch** (51) / **Countdown Timer** (52).

---

## usePrevious

`Difficulty: Easy` `Probability: Medium`

### What it does

Returns the value from the previous render. It is the standard way to compare the current prop/state with the last one during render, for example to compute a direction or an entrance animation.

### Signature

```ts
function usePrevious<T>(value: T): T | undefined;
```

### Implementation

```ts
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
```

### Cleanup & stale closures

The ordering is the whole point: the effect writes `value` *after* commit, so during the render that receives the new value, `ref.current` still holds the previous one, and the hook returns it. There is nothing to clean up because nothing is subscribed. Writing `ref.current = value` directly in the render body would break React's render purity and behave incorrectly under concurrent rendering, so keep the write in the effect.

### Pitfalls

- On the first render it is always `undefined`; guard before comparing.
- Do not drive side effects from `usePrevious`; it is a render-time comparison tool, not a signal.
- StrictMode double-invokes effects in development; the value may be written twice with the same result, which is harmless.
- For derived-by-comparison values, a plain `useMemo` over the current value is often clearer than a previous-value ref.

### Used by

**Carousel / Slider** (25) slide direction, **Tabs** (16) animated indicator, **Countdown Timer** (52), **Data Table** (38) sort direction, **Multi-Step Form / Wizard** (9).

---

## useClickOutside

`Difficulty: Medium` `Probability: Very High`

### What it does

Calls a handler when a pointer goes down outside the element attached to the returned ref. It is the dismiss mechanism behind dropdowns, popovers, context menus, and modals.

### Signature

```ts
function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: PointerEvent) => void,
  enabled?: boolean,
): void;
```

### Implementation

```ts
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: PointerEvent) => void,
  enabled = true,
) {
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) return;
      latest.current(event);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ref, enabled]);
}
```

### Cleanup & stale closures

The listener is added to `document` and removed in the effect cleanup whenever `enabled`, `ref`, or the component lifecycle changes. The handler is stored in `latest`, so an inline arrow (`() => setOpen(false)`) does not force the listener to be removed and re-added on every render, yet the listener still calls the freshest handler. Without the ref, either you resubscribe every render or you capture a stale `setOpen` from an old render.

### Pitfalls

- Use `pointerdown`, not `click`, when the trigger is a button: a `click` listener added while the menu opens can immediately close it in the same interaction.
- If the popover is portaled, `ref.current.contains` must be checked against the portal content, not just the trigger.
- Escape-to-close is a separate concern; add it explicitly (see `useFocusTrap`).
- Nested menus need a "inside any descendant" check, not a single ref.
- Touch: `pointerdown` covers touch on modern browsers; legacy iOS needed `touchstart`.

### Used by

**Dropdown / Select** (18), **Accessible Modal / Dialog** (17), **Context Menu** (29), **Tooltip & Popover** (23), **Command Palette** (21), **Multi-Select** (19).

---

## useInterval

`Difficulty: Easy` `Probability: Very High`

### What it does

A declarative `setInterval`. Pass a callback and a `delay`, or `null` to pause. The interval always calls the newest version of the callback without resetting the timer.

### Signature

```ts
function useInterval(callback: () => void, delay: number | null): void;
```

### Implementation

```ts
export function useInterval(callback: () => void, delay: number | null) {
  const latest = useRef(callback);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => latest.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
```

```ts
const [paused, setPaused] = useState(false);
useInterval(() => setCount((c) => c + 1), paused ? null : 1000);
```

### Cleanup & stale closures

This is Dan Abramov's ref-to-latest-callback pattern, and the two effects are deliberately split. The first effect refreshes `latest` after every render, so the ref never holds an old function. The second effect depends **only on `delay`**. That is the key: if the callback were in the dependency array, every inline arrow would tear down and recreate the interval on each render, resetting its phase and making a timer drift. By keeping the callback in a ref, the interval is created once per `delay` and still invokes the current closure. `clearInterval(id)` on unmount and on every `delay` change prevents duplicate timers.

### Pitfalls

- `delay = null` pauses without destroying the ref; toggling back resumes with a fresh interval.
- Changing `delay` resets the interval phase. For a stopwatch, never accumulate ticks &mdash; store a start timestamp and derive elapsed time, or a throttled tab will lose ticks.
- The callback must not read state directly; use functional updaters or refs, or it will be stale between renders.
- React 18 StrictMode mounts, unmounts, and remounts in development; the cleanup makes that safe.

```text
✓ invokes the callback every delay
✓ does not reset the interval when only the callback changes
✓ pauses when delay is null
✓ clears the interval on unmount
```

### Used by

**Stopwatch** (51), **Carousel / Slider** (25) autoplay, **Polling / Auto-Refreshing Dashboard** (47), **Traffic Light** (53), **Countdown Timer** (52).

---

## useTimeout

`Difficulty: Easy` `Probability: High`

### What it does

A declarative `setTimeout`. Runs the callback once after `delay`, or not at all when `delay` is `null`. It is `useInterval` with a one-shot timer.

### Signature

```ts
function useTimeout(callback: () => void, delay: number | null): void;
```

### Implementation

```ts
export function useTimeout(callback: () => void, delay: number | null) {
  const latest = useRef(callback);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setTimeout(() => latest.current(), delay);
    return () => clearTimeout(id);
  }, [delay]);
}
```

### Cleanup & stale closures

Same split as `useInterval`, for the same reason: the callback lives in a ref so a new inline function does not reschedule the timer, and only `delay` controls the timer's lifetime. `clearTimeout(id)` cancels the pending call on unmount or when `delay` changes. This is exactly what stops the common "setState after unmount" warning and the "toast dismissed twice" bug.

### Pitfalls

- The timer is one-shot; if the UI needs a restart button, expose a `key` (or a `nonce` state) that the caller bumps.
- Passing a new `delay` cancels and restarts the countdown; do not pass a derived value that changes every render.
- A very large `delay` overflows the 32-bit timer; clamp it for multi-day timers.
- Prefer `useTimeout` over an inline `setTimeout` in a handler so cleanup is automatic.

### Used by

**Toast / Notification System** (24) auto-dismiss, **Countdown Timer** (52), **Tooltip & Popover** (23) open delay, **Traffic Light** (53), **Poll / Voting UI** (74) auto-close.

---

## useFetch / useAsync

`Difficulty: Medium` `Probability: Very High`

### What it does

Runs an abortable request for a URL, tracks a status union (`idle | loading | success | error`), ignores responses that arrive after unmount or after a newer request, and exposes `refetch`.

### Signature

```ts
type AsyncStatus = "idle" | "loading" | "success" | "error";

function useFetch<T>(url: string): {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  status: AsyncStatus;
  refetch: () => void;
};
```

### Implementation

```ts
type AsyncState<T> =
  | { status: "idle"; data: undefined; error: undefined }
  | { status: "loading"; data: T | undefined; error: undefined }
  | { status: "success"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: Error };

export function useFetch<T>(url: string) {
  const [state, setState] = useState<AsyncState<T>>({
    status: "idle",
    data: undefined,
    error: undefined,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState((prev) => ({ status: "loading", data: prev.data, error: undefined }));

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        if (active) setState({ status: "success", data, error: undefined });
      } catch (err) {
        if (!active || controller.signal.aborted) return; // unmount or superseded
        setState({ status: "error", data: undefined, error: err as Error });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [url, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: state.data,
    error: state.error,
    loading: state.status === "loading",
    status: state.status,
    refetch,
  };
}
```

### Cleanup & stale closures

Two guards, because they catch different failures. `controller.abort()` cancels the in-flight network request when `url` changes or the component unmounts. The `active` flag covers the window where the response has already resolved but the effect has since been cleaned up &mdash; an aborted fetch rejects, but a body that finished parsing does not, and a stale microtask must never overwrite newer state. Because every effect run owns its own controller, an older slow response cannot win a race against a newer one: its effect was already cleaned up and `active` is `false`. `refetch` bumps `nonce` through a functional updater, so it is stable and always triggers a fresh run.

### Pitfalls

- A non-2xx response is not a network error; check `res.ok` explicitly or you will parse an error page as JSON.
- `AbortError` must be filtered out of the error state; aborts are intentional, not failures.
- `fetch` has no timeout. Wrap it in `AbortSignal.timeout(ms)` for a deadline.
- Do not put an inline `options` object in the dependency array; it changes identity every render and loops. Either accept primitives (`method`, `body`) or require a memoized init.
- In dev StrictMode the effect runs twice and you will see two requests; the first is aborted, which is expected.
- Caching and request deduplication are out of scope for a hand-written hook; say that TanStack Query or SWR is the production answer.

```text
✓ loading -> success renders data
✓ a non-2xx response surfaces an error
✓ aborting on unmount does not set error state
✓ a slow first request cannot overwrite a fast second one
✓ refetch re-runs the request
```

### Used by

**API-Backed List** (39), **Debounced Search** (40), **Cancellable Search & Race Conditions** (41), **Cached Search Results** (42), **Load More Pagination** (44), **Infinite Scroll** (45), **Dependent API Requests** (49), **Parallel API Requests** (50).

---

## useMediaQuery

`Difficulty: Easy` `Probability: High`

### What it does

Subscribes to a CSS media query and returns whether it currently matches. It is the hook behind responsive layout, reduced-motion handling, and dark mode.

### Signature

```ts
function useMediaQuery(query: string): boolean;
```

### Implementation

```ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mql.matches); // query may have changed since the last render
    mql.addEventListener("change", onChange);

    return () => mql.removeEventListener("change", onChange);
  }, [query]);
}
```

```ts
const isCompact = useMediaQuery("(max-width: 600px)");
const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
```

### Cleanup & stale closures

`mql.removeEventListener("change", onChange)` is the required cleanup: without it, every `query` change leaves the old `MediaQueryList` subscribed and the component keeps setting state after it unmounts. The effect re-subscribes when `query` changes, and re-reads `mql.matches` at the top because the query could have flipped between render and effect. The listener reads `event.matches` rather than a captured boolean, so it cannot go stale.

### Pitfalls

- SSR renders `false` on the server and may render `true` on the client, producing a hydration mismatch. Gate the responsive branch behind a mounted flag or render both and hide with CSS.
- `matchMedia` in `matchMedia` is cheap but not free; memoize the query string, not the event.
- Media queries are evaluated by the browser on resize; do not poll them in an interval.
- Prefer CSS (`@media`) for pure styling and this hook only when JavaScript must branch on the result.

### Used by

**Theme Switcher with Persisted Preference** (6), **Carousel / Slider** (25) autoplay/reduced motion, **Product Listing / E-commerce Catalog** (66) grid density, **Configurable Dashboard with Async Widgets** (71), **Command Palette** (21).

---

## useWindowSize

`Difficulty: Easy` `Probability: Medium`

### What it does

Returns the current viewport width and height, updated on resize (coalesced to one update per animation frame).

### Signature

```ts
function useWindowSize(): { width: number; height: number };
```

### Implementation

```ts
type Size = { width: number; height: number };

export function useWindowSize(): Size {
  const [size, setSize] = useState<Size>(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    let frame = 0;

    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setSize({ width: window.innerWidth, height: window.innerHeight }),
      );
    };

    window.addEventListener("resize", onResize);
    onResize(); // resync in case the viewport changed before the effect ran

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return size;
}
```

### Cleanup & stale closures

The cleanup removes the resize listener **and** cancels a pending animation frame, so no callback fires after unmount. The handler reads `window.innerWidth` at fire time instead of a captured value, so there is no stale width. The `requestAnimationFrame` wrapper throttles the burst of resize events the browser emits into at most one state update per frame, which is what keeps a drag-resize from dropping frames.

### Pitfalls

- Resize fires dozens of times per second; never `setState` directly in the handler.
- Reading `innerWidth` forces layout, so keep any measurement out of render.
- SSR: width starts at `0`; treat `0` as "unknown" rather than "mobile".
- `window.innerHeight` on mobile shrinks when the keyboard opens; use `visualViewport` when that matters.
- A `useSyncExternalStore` implementation is more correct for non-React consumers; the effect version is the interview-friendly one.

### Used by

**Virtualized List** (55), **Windowed Infinite List** (56), **Carousel / Slider** (25), **Configurable Dashboard with Async Widgets** (71), **Seat Booking / Grid Selection** (73).

---

## useIntersectionObserver

`Difficulty: Medium` `Probability: Very High`

### What it does

Attaches an `IntersectionObserver` to an element and calls a handler whenever its visibility relative to a root changes. It powers infinite scroll sentinels, lazy-loaded images, and "is this on screen" logic.

### Signature

```ts
function useIntersectionObserver<T extends Element>(
  onIntersect: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit,
): (node: T | null) => void;
```

### Implementation

```ts
export function useIntersectionObserver<T extends Element>(
  onIntersect: (entry: IntersectionObserverEntry) => void,
  options: IntersectionObserverInit = {},
) {
  const latest = useRef(onIntersect);

  useEffect(() => {
    latest.current = onIntersect;
  }, [onIntersect]);

  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);

  const { root = null, rootMargin = "0px", threshold = 0 } = options;
  const thresholdKey = Array.isArray(threshold) ? threshold.join(",") : threshold;

  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) latest.current(entry);
      },
      { root, rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, root, rootMargin, thresholdKey]);

  return ref;
}
```

```ts
const sentinelRef = useIntersectionObserver<HTMLDivElement>((entry) => {
  if (entry.isIntersecting) void loadMore();
});

return (
  <>
    <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    <div ref={sentinelRef} aria-hidden="true" />
  </>
);
```

### Cleanup & stale closures

`observer.disconnect()` in the cleanup stops all callbacks and releases the observation, which is mandatory &mdash; an unobserved observer keeps a reference to the node and the closure. The handler is kept in a ref so an inline arrow does not rebuild the observer on every render. The effect keys off `root`, `rootMargin`, and a serialized `threshold` rather than the `options` object, so a fresh options object each render does not cause a resubscribe. Using a **callback ref** instead of `useRef` matters: if the observed element mounts later (inside a loading state), a plain ref would be `null` on the first effect run and never observe; setting state from the callback re-runs the effect when the node attaches.

### Pitfalls

- The callback fires on both enter **and** exit. Guard with `entry.isIntersecting` or you will load in both directions.
- Do not `setState` unconditionally in the handler; a state change that shifts layout can re-trigger the observer in a loop.
- `rootMargin` (e.g. `"200px"`) is how you prefetch before the element is visible.
- `threshold` as an array has a new identity each render; the serialized key avoids churn.
- Old browsers need a fallback; feature-detect `typeof IntersectionObserver`.
- Always disconnect; leaked observers are a classic review comment.

```text
✓ attaches an observer to the returned ref
✓ calls the handler on enter and exit
✓ re-observes when the node mounts later
✓ disconnects on unmount
```

### Used by

**Infinite Scroll** (45), **Infinite Social Feed** (76), **Load More Pagination** (44), **Lazy-Loaded Image Gallery** (58), **Windowed Infinite List** (56).

---

## useOnlineStatus

`Difficulty: Easy` `Probability: Medium`

### What it does

Reports whether the browser thinks it has a network connection, and updates when the `online`/`offline` events fire. Use it to disable optimistic actions, queue writes, or show an offline banner.

### Signature

```ts
function useOnlineStatus(): boolean;
```

### Implementation

```ts
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setOnline(navigator.onLine); // resync if it changed before the effect ran

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
```

### Cleanup & stale closures

Both listeners are removed in the cleanup, so a component that unmounts stops calling `setOnline`. There is no closure over changing values &mdash; the handlers are constant &mdash; but the effect still re-reads `navigator.onLine` once on mount in case the connection changed between the initial render and commit. For a shared status without duplicated listeners, the same logic maps cleanly onto `useSyncExternalStore`:

```ts
const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true; // assume online during SSR
```

### Pitfalls

- `navigator.onLine` only means "there is a network interface", not "the internet is reachable". Treat it as a hint and still handle request failures.
- The events do not fire on every lost connection; a captive portal reports online.
- Prefer `useSyncExternalStore` when many components need the value, so there is one subscription set, not one per consumer.
- Do not gate rendering on it during SSR; the server has no `navigator`.

### Used by

**Chat / Messaging UI** (68), **Real-Time WebSocket Messages** (69), **API-Backed List** (39), **Toast / Notification System** (24) offline notice.

---

## useEventListener

`Difficulty: Medium` `Probability: High`

### What it does

A generic, typed event subscription for `window`, `document`, or any element. It removes the boilerplate of adding/removing listeners in every component that needs a keyboard shortcut or a scroll reaction.

### Signature

```ts
function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  target?: Window | Document | HTMLElement,
  options?: AddEventListenerOptions,
): void;
```

### Implementation

```ts
export function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  target: Window | Document | HTMLElement = window,
  options?: AddEventListenerOptions,
) {
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: Event) => latest.current(event as WindowEventMap[K]);
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }, [type, target, options]);
}
```

```ts
useEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }
});
```

### Cleanup & stale closures

The returned `listener` is a stable wrapper that reads `latest.current`, so the effect depends only on `type`/`target`/`options` and never resubscribes when the handler identity changes. That is the same ref-to-latest pattern as the timers. The cleanup removes the exact wrapper reference that was added; a mismatched function reference is the most common cause of "listener not removed". Because the handler is refreshed in a separate effect, it always sees the latest props and state.

### Pitfalls

- The generic casts away the specific event type for non-`WindowEventMap` targets (custom events); provide a typed overload if you need it.
- Pass a stable `options` object, or the listener resubscribes each render.
- Keyboard shortcuts must not fire while the user types in an input; check `event.target` or scope the listener.
- `{ passive: true }` is required for `touchstart`/`wheel` if you call `preventDefault` never; omit it if you do.

### Used by

**Undo / Redo State History** (5) keyboard shortcuts, **Command Palette** (21), **Menu / Menubar** (30), **Accessible Modal / Dialog** (17) Escape, **Carousel / Slider** (25) arrow keys.

---

## useFocusTrap

`Difficulty: Hard` `Probability: High`

### What it does

Keeps keyboard focus inside a container while it is open, wraps Tab at the first and last focusable elements, focuses the first element on open, and restores focus to whatever was focused before on close.

### Signature

```ts
function useFocusTrap<T extends HTMLElement>(
  active: boolean,
): RefObject<T | null>;
```

### Implementation

```ts
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

    (focusables()[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus(); // restore focus on close
    };
  }, [active]);

  return ref;
}
```

### Cleanup & stale closures

The cleanup removes the `keydown` listener and returns focus to the element that opened the dialog. The `previouslyFocused` snapshot is captured inside the effect, so it always refers to the trigger that was active when the trap opened, not a value from an earlier render. The focusable set is queried on every Tab press rather than cached, so elements that mount or disable while the dialog is open are respected &mdash; caching the list is the classic stale-focus bug.

### Pitfalls

- Tab wrapping only handles keyboard focus; a programmatic `.focus()` or a click can still escape. A complete trap listens for `focusin` and pulls focus back, or marks the background `inert`.
- Portaled content must live inside `container` for `contains`-style checks to work; set the ref on the portal root.
- `container.focus()` needs `tabIndex={-1}` on the container when there is no focusable child.
- Always restore focus on close, or keyboard users are dropped at the top of the document.
- `aria-modal="true"` and `role="dialog"` belong on the element; the trap does not replace them.

### Used by

**Accessible Modal / Dialog** (17), **Dropdown / Select** (18), **Command Palette** (21), **Menu / Menubar** (30), **Toast / Notification System** (24) interactive toasts.
