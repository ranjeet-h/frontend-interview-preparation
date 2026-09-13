# Custom Hooks

## 1. Why This Exists — The Problem First

Two screens often need the same behavior: delay a search until typing stops, subscribe to the browser's online status, or keep a form value in local storage. Copying that logic makes the screens drift. One copy eventually forgets timer cleanup, another uses a stale value, and a third exposes a slightly different API. Fixing the bug means finding every copy.

The opposite mistake is hiding the behavior inside a wrapper component that renders no useful UI. Several wrappers make the tree hard to follow and force data through render props. A custom hook gives the behavior one home while letting each component keep control of its own markup.

## 2. The Analogy — Make It Obvious

Think of a custom hook as a sewing pattern, not a shared garment.

The pattern describes where to measure, which pieces to cut, and how to stitch them together. Two tailors can use the same pattern, but each produces a separate jacket with separate fabric and measurements. Changing one jacket does not change the other. In React, the pattern is the hook function, while each call from a rendered component gets its own `useState`, `useRef`, memoized value, and effect state.

The pattern also has a public fitting guide: the values and actions it returns. The hook can hide timer IDs, subscriptions, and cleanup details, just as the pattern hides seam allowances. It should not decide the consumer's UI. A search screen and a command palette can use the same debounce hook and render completely different interfaces.

## 3. How It Actually Works — The Full Explanation

A custom hook is an ordinary JavaScript or TypeScript function that calls hooks. The `use` prefix is the convention that tells humans and the React Hooks linter, “this function participates in the Rules of Hooks.” React does not call a special `createCustomHook` API.

When a component renders, it calls the custom hook like any other function. The custom hook calls its built-in hooks in a fixed order, and those calls are part of the calling component's render. React associates each hook call with that component's current hook state by position. If `useSearchModel` calls `useState` and then `useMemo`, those calls occupy two stable positions in the component's hook sequence. If a later render skips `useSearchModel` or makes it call a hook conditionally, the sequence no longer matches and React reports a Rules of Hooks violation.

That is why a custom hook must be called at the top level of a component or another custom hook—not inside an `if`, loop, event handler, nested function, or after an early return. Conditions belong inside the hook's logic. For example, `useOnlineStatus()` can always subscribe through `useSyncExternalStore`; a caller that does not need the result can avoid rendering that component rather than conditionally calling the hook.

Each call is isolated. If `Header` and `Checkout` both call `useDebouncedValue(query, 300)`, each has a separate current value and timer. The code is shared; the hook state is not. Shared state requires a shared owner such as lifted state, context, or an external store. A custom hook can read or write shared state, but that sharing comes from the store or context—not from the hook function itself.

Composition is just nesting ordinary function calls while preserving hook order. `useCheckoutSearch` may call `useDebouncedValue` and `useOnlineStatus`; all of their internal hook calls still belong to the component that called `useCheckoutSearch`. This lets a large behavior be built from focused pieces, but it does not create a new state boundary.

The return value is the hook's API. Return the smallest useful contract: a value, a tuple when the relationship is obvious, or an object when names make several values clearer. Return actions that express intent (`toggle`, `retry`, `reset`) rather than exposing internal setters unless the setter is genuinely part of the contract. Stability is part of that API: memoize a returned callback only when consumers need referential stability, such as a dependency array or a memoized child. Memoizing every object and function adds complexity without automatically improving performance.

Hooks that synchronize with an external system still need correct lifecycle behavior. A debounce hook owns a timer, so its effect clears the old timer before scheduling a new one and on unmount. A browser subscription should use an API designed for external stores when possible. Data fetching belongs in the repository's data-fetching approach (for example, TanStack Query) rather than every custom hook inventing loading, cancellation, caching, and race handling.

## 4. Real Code — See It Working

The following file assumes React 18+ and TypeScript in a browser build such as Vite. It is complete enough to paste into `src/SearchPage.tsx`; the `searchProducts` function is an injected production boundary, so the hook does not own network caching.

```tsx
import { useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string };

type SearchPageProps = {
  searchProducts: (query: string, signal: AbortSignal) => Promise<Product[]>;
};

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Every new value gets a fresh timer; cleanup prevents an old value from winning later.
    const timerId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timerId);
  }, [value, delayMs]);

  return debouncedValue;
}

export function useSearchProducts(
  query: string,
  searchProducts: SearchPageProps["searchProducts"],
) {
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [state, setState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    products: Product[];
    error: string | null;
  }>({ status: "idle", products: [], error: null });

  useEffect(() => {
    if (!debouncedQuery) {
      setState({ status: "idle", products: [], error: null });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", error: null }));

    void searchProducts(debouncedQuery, controller.signal)
      .then((products) => setState({ status: "success", products, error: null }))
      .catch((error: unknown) => {
        // Abort is expected when the user types a newer query; it is not a user error.
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", products: [], error: "Search failed" });
      });

    return () => controller.abort();
  }, [debouncedQuery, searchProducts]);

  return state;
}

export function SearchPage({ searchProducts }: SearchPageProps) {
  const [query, setQuery] = useState("");
  const result = useSearchProducts(query, searchProducts);
  const resultLabel = useMemo(() => {
    if (result.status === "loading") return "Searching…";
    if (result.status === "error") return result.error;
    if (!query.trim()) return "Type to search";
    return `${result.products.length} result(s)`;
  }, [query, result]);

  return (
    <main>
      <label>
        Product search
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “keyboard”"
        />
      </label>
      <p aria-live="polite">{resultLabel}</p>
      <ul>
        {result.products.map((product) => <li key={product.id}>{product.name}</li>)}
      </ul>
    </main>
  );
}
```

The debounce hook owns only time. The search hook owns request lifecycle and aborts the request when its query changes or the component unmounts. In a real app, `searchProducts` should be stable—define it outside the component, memoize it, or obtain it from a stable client—otherwise its changing identity will restart the request on every render.

Here is a second complete hook that demonstrates composition without shared state. It uses the browser's external-store contract, so React can subscribe and read snapshots safely:

```tsx
import { useState, useSyncExternalStore } from "react";

function subscribeToOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToOnlineStatus,
    () => window.navigator.onLine,
    () => true, // Server-rendered HTML assumes online until hydration can read the browser.
  );
}

export function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const online = useOnlineStatus();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button disabled={!online || saving} onClick={() => void handleSave()}>
      {online ? (saving ? "Saving…" : "Save") : "Offline"}
    </button>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What makes a function a custom hook?**

It is a function that participates in the Hooks rules by calling React hooks, directly or through another custom hook, and conventionally starts with `use`. There is no special runtime registration step. The value is the reusable stateful behavior and the small API it returns, not a new component or a special kind of JavaScript function.

**Q: Do two components share state when they call the same custom hook?**

No. Each call runs during a different component render and gets state associated with that component instance. Two calls share the hook implementation, but not its `useState` values, refs, memoized values, or effect lifecycles. To share state, put ownership in a common parent, context, or external store and let a hook provide a convenient access API.

**Q: Why must custom hooks start with `use`? Is React enforcing the name?**

The prefix is primarily a tooling and communication contract. The Hooks linter uses it to recognize custom hooks and check their callers, and DevTools can present the hook meaningfully. React's runtime does not reject every function that lacks the prefix, but omitting it hides the function from the rule checker and invites unsafe calls. A function that calls hooks should follow the convention.

**Q: Why can a custom hook not be called conditionally?**

React matches hook state by the stable order of hook calls during a component render. If the first render calls a custom hook and the next render skips it, all later hook positions shift. React can then associate stored state with the wrong call. Keep the custom hook call unconditional and put the condition inside the hook, or render a different keyed component when a genuinely separate lifecycle is required.

**Q: When should logic be a custom hook instead of a utility function?**

Use a utility for pure work that needs no React lifecycle: parsing, formatting, validation, or transforming data. Use a custom hook when the behavior needs state, a ref, a subscription, memoization tied to render inputs, or React context. Keeping pure work in utilities makes it callable outside React and easy to test without a component harness.

**Q: How do custom hooks replace render props or higher-order components?**

Render props and higher-order components share behavior through extra component layers. A hook shares the non-visual behavior directly in the consuming component, so the consumer chooses its own JSX and the tree stays flatter. They are not identical replacements: a render-prop component can deliberately own DOM structure and provide a rendering boundary, while a hook is best when the reusable result is data and actions rather than markup.

**Q: What should a custom hook return?**

Return the smallest stable contract that consumers need. A single value is ideal for `useOnlineStatus`; an object such as `{ status, data, error, retry }` is clearer for several named values. Do not leak timer IDs, controllers, or internal setters unless callers truly need them. Stabilize returned functions or objects only when identity affects a consumer; otherwise, memoization is noise rather than a guarantee of faster rendering.

**Q: How do you test a custom hook?**

Test observable behavior in a real React environment. For a reusable, UI-independent hook, `renderHook` from the current React Testing Library setup can provide a small harness; use `act` around actions that schedule updates and provide a `wrapper` when the hook needs context. For a hook whose meaning is tightly coupled to a form, DOM, or user flow, render the real component instead. Assert returned values, rendered behavior, transitions, errors, and cleanup—not internal state names or the number of hook calls.

## 6. The Traps — What Goes Wrong

Calling a hook from a normal helper is not made safe by giving the helper a `use`-sounding name. The caller must be a component or custom hook, and the call must be top-level. A function like `formatAndUseTheme()` called from a click handler violates the render-time contract; split the pure formatting from the component's top-level `useTheme()` call.

Assuming a custom hook is a singleton causes subtle product bugs. Two `useDraft()` calls do not magically edit one draft. If synchronization is required, choose an explicit owner and synchronization mechanism. The hook can wrap that context or store, but the shared lifetime must be visible in the architecture.

Putting a condition around a hook is another common failure:

```tsx
// Wrong: the hook sequence changes when enabled changes.
if (enabled) {
  useOnlineStatus();
}

// Right: call it every render; decide how to use its result.
const online = useOnlineStatus();
const canSubmit = enabled && online;
```

Returning a fresh callback that consumers place in an effect dependency can create a loop. The hook should either return a stable callback with correct dependencies, or the consumer should call the action from an event handler. `useCallback` is not a cure for an unclear API and must not hide missing dependencies.

A custom hook that fetches data with a hand-written effect can accidentally show an old response after a newer query, leak updates after unmount, or duplicate caching logic. If the repository uses a query library, let that library own server state. If a local effect is justified, include cancellation or request identity handling and test out-of-order responses.

Testing the hook by calling `useDebouncedValue("a", 300)` directly in a Node test does not test React behavior and violates the Rules of Hooks. Render it through `renderHook` or a small component. Conversely, do not use isolated hook tests to avoid testing a form's actual accessible behavior when the hook's contract is the form interaction.

## 7. Compare With Related Concepts

**Custom hook vs utility function:** A hook can call React hooks and receives a render lifecycle; a utility is plain JavaScript and can run anywhere. Use a utility for pure computation and a custom hook for React-owned state or synchronization.

**Custom hook vs component:** A hook returns data and actions; a component returns React elements and owns a UI boundary. Use a hook when the consumer should control markup, and a component when the structure, accessibility behavior, or visual boundary is itself reusable.

**Custom hook vs context:** A hook is a reusable access/behavior function; context is a mechanism for making one value available to descendants. Use a custom hook to package context access and validation, but use context (or a store) when state must actually be shared.

**Custom hook vs render prop:** A hook keeps the tree flat and shares non-visual logic; a render prop shares logic while explicitly handing rendering control to a child function. Use a render prop when the provider must own a rendering or measurement boundary; use a hook when consumers need values and actions.

**Local hook state vs external store:** `useState` inside a custom hook belongs to one component instance; an external store has its own lifetime and can be observed by many components. Use local state for isolated behavior and an external store for deliberately shared state, persistence, or cross-tree coordination.

## 8. 🧠 The Memory Hook — What Sticks

A custom hook is a shared recipe cooked in separate kitchens: the recipe and cleanup logic are reused, but every component gets its own serving. Remember the boundary—hooks share behavior by default; context or a store shares state by explicit ownership.
