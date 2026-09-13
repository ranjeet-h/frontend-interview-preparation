# Hook Comparisons

## 1. Why This Exists — The Problem First

A component starts with a boolean, then grows into a form, a timer, a request, and a list of filtered results. The team keeps adding `useState`, stores a timer ID in state, memoizes every callback, and eventually cannot tell which values should update the screen or which values are only implementation details. The code still runs, but it now has stale displays, unnecessary renders, and state transitions scattered across unrelated event handlers.

The interview question is rarely “can you name the hooks?” It is usually “what kind of value is this, who owns its changes, and who needs to observe those changes?” The useful comparison is about rendering, transitions, identity, and cost—not about which hook is more advanced.

## 2. The Analogy — Make It Obvious

Think of a restaurant kitchen serving a dining room.

`useState` is the order board for simple items: “table 4 is open” or “the search text is `ca`.” When the board changes, the dining room needs a new view, so React renders again. `useReducer` is the head chef’s order protocol: “item added,” “payment failed,” and “checkout completed” are named events, and one central rule decides how several related pieces of kitchen state change together.

`useRef` is a drawer beside the pass. The staff can put a timer handle, DOM node, or socket instance in it and retrieve it later, but changing the drawer does not make the dining room redraw. `useMemo` is a prepared side dish: keep the calculated result while its ingredients are the same. `useCallback` is a stable order slip: keep the function object the same when another worker cares about the slip’s identity.

The analogy has one important boundary. A prepared side dish or stable order slip is not automatically better. If nobody consumes the saved result or checks the slip, the kitchen did extra work for no benefit. And a stable slip can still contain an old instruction if it captured stale render data.

## 3. How It Actually Works — The Full Explanation

React calls a function component again when state or props require a new render. Each call is a render snapshot: local variables such as `open`, `query`, and `items` belong to that particular call. A hook gives React a place associated with the component instance to preserve information between those calls, but the returned values still participate in the snapshot model.

The first decision is whether a change must produce a new UI snapshot:

- `useState` stores a value whose setter schedules a render. Use it for values the component renders or values that determine rendered behavior, such as a controlled input, selected tab, loading status, or error message.
- `useReducer` also stores render-driving state, but updates enter through actions. A reducer receives the previous state and an action and returns the next state. The value is not inherently more powerful than state; the advantage is that transition rules are centralized and named.
- `useRef` returns the same ref object for the mounted component. Assigning `ref.current` is an ordinary synchronous mutation. React does not schedule a render because of it, so the UI will not reflect that assignment until some other render happens.

The second decision is whether the value is derived or whether it is a source of truth. If `visibleRows` can be calculated from `rows` and `filters`, it is usually derived data. Calculate it during render, or memoize that calculation when its cost or identity matters. Do not store both `rows` and `visibleRows` in state unless there is a clear reason to maintain two independent sources of truth; otherwise they can drift apart.

The third decision is whether another consumer observes reference identity. Every render creates a new object or function for an inline expression:

```js
({ pageSize: 20 }) === ({ pageSize: 20 }); // false
(() => {}) === (() => {});                 // false
```

`useMemo(factory, dependencies)` caches the value returned by `factory` until a dependency changes. `useCallback(fn, dependencies)` caches the function reference until a dependency changes. For the identity question, `useCallback(fn, deps)` is effectively the same idea as `useMemo(() => fn, deps)`, with clearer intent. React compares dependencies with `Object.is`.

That cache is a performance tool, not a place to put required application state. React may discard a memoized value in situations such as an initial mount that suspends, so code must remain correct if the calculation runs again. If a value must persist because correctness depends on its identity, use state or a ref according to whether it drives the UI. If you need an external resource, synchronize it with an effect and clean it up.

Dependencies also control freshness. A callback created during a render closes over that render’s values. `useCallback(() => save(userId), [])` has stable identity, but it also keeps the initial `userId`. A complete dependency list gives React permission to replace the function when `userId` changes. A functional updater can remove a state read from a callback because React supplies the latest state when it processes the update:

Inside a component that has declared `const [count, setCount] = useState(0)`, the two update forms differ like this:

```tsx
setCount(count + 1);                 // reads this render's `count`
setCount((current) => current + 1);  // React supplies the current queued value
```

`useReducer` has a related but different stability guarantee: React keeps the `dispatch` function stable for the component instance. The reducer still runs with the latest state when React processes the action. That makes `dispatch` useful to pass through a tree without treating it like a changing callback, while the action payload must still contain the information needed for the transition.

`useContext` answers a different question: “How does a descendant read a value owned by a provider without receiving it through every intermediate component?” The provider owns the value and decides when it changes; a consumer calls `useContext` to read the nearest provider’s value. When that provider value changes, consumers of that context are scheduled to render, even if an intermediate component does not use the value. Context avoids prop drilling, but it does not make the value global, immutable, or free: provider value identity matters, and a broad context can make many consumers rerender. Keep the provider value close to the components that own it, split contexts by change frequency when needed, and use props when the relationship is direct and explicit.

A custom hook is not another storage mechanism. It is a function that composes hooks into a reusable behavior boundary: `useUndoWindow` can combine a ref and an effect, for example. Each caller still owns its own hook state and effects; calling the hook twice creates two independent instances. Return only the operations and data the caller needs, and use context inside a custom hook only when the behavior intentionally consumes shared provider state. There is no universal ranking among these hooks. A simple boolean can become reducer state if it later participates in a larger state machine, but starting with a reducer “because it is senior” adds ceremony. A ref can hold a timer ID, but not the visible “seconds remaining” value. Memoization can prevent a memoized child from receiving a fresh function on every parent render, but it cannot repair an incomplete dependency list.

## 4. Real Code — See It Working

The following TypeScript example assumes React 18 or newer in a browser-based React application. It deliberately demonstrates `useState`, `useReducer`, `useRef`, `useMemo`, and `useCallback`; it does not demonstrate `useContext` or `useEffect`. Those two hooks are shown and labelled in the separate examples below, so the coverage claim stays accurate.

```tsx
import { memo, useCallback, useMemo, useReducer, useRef, useState } from "react";

type CartItem = { id: string; name: string; price: number };
type CartState = { items: CartItem[]; coupon: number };
type CartAction =
  | { type: "add"; item: CartItem }
  | { type: "remove"; id: string }
  | { type: "apply-coupon"; percent: number };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add":
      return { ...state, items: [...state.items, action.item] };
    case "remove":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
      };
    case "apply-coupon":
      return { ...state, coupon: Math.max(0, Math.min(100, action.percent)) };
    default:
      return state;
  }
}

type CartButtonProps = {
  item: CartItem;
  onAdd: (item: CartItem) => void;
};

const CartButton = memo(function CartButton({ item, onAdd }: CartButtonProps) {
  return (
    <button type="button" onClick={() => onAdd(item)}>
      Add {item.name}
    </button>
  );
});

export function CartPanel({ catalog }: { catalog: CartItem[] }) {
  const [query, setQuery] = useState("");
  const [cart, dispatch] = useReducer(cartReducer, { items: [], coupon: 0 });
  const timeoutRef = useRef<number | null>(null);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery),
    );
  }, [catalog, query]);

  const addToCart = useCallback((item: CartItem) => {
    dispatch({ type: "add", item });
  }, []);

  function startUndoTimer() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      console.log("undo window expired");
    }, 5000);
  }

  return (
    <section>
      <label>
        Search catalog
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>

      <p>{cart.items.length} item(s) in cart</p>
      <button type="button" onClick={() => dispatch({ type: "apply-coupon", percent: 10 })}>
        Apply 10% coupon
      </button>
      <button type="button" onClick={startUndoTimer}>Start undo window</button>

      {visibleItems.map((item) => (
        <CartButton key={item.id} item={item} onAdd={addToCart} />
      ))}
    </section>
  );
}
```

`query` drives the input, so it belongs in state. The cart has named operations that update related fields, so a reducer makes the transition boundary obvious. The timeout ID is needed to cancel an imperative browser resource, not to render; a ref avoids a useless render when the ID changes. `visibleItems` is derived from props and query, and its memoization is justified only if filtering is expensive or a downstream consumer needs a stable array. The memoized button can skip work when its `item` and `onAdd` identities remain unchanged.

The callback above has an empty dependency list safely because it dispatches a fixed action and React guarantees that `dispatch` is stable. If it read `query`, `userId`, or another render value, that value would belong in the dependency list. A stable callback is not permission to omit data it uses.

For a timer that must be cleaned up on unmount, the ref and effect belong together. This second example assumes the same browser React setup and demonstrates the production boundary explicitly. The callback ref keeps the pending timer on the stable subscription while still calling the newest `onExpire`; the delay dependency restarts an active timer with the remaining time when `delayMs` changes:

```tsx
import { useEffect, useRef } from "react";

export function useUndoWindow(onExpire: () => void, delayMs = 5000) {
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);
  const delayRef = useRef(delayMs);

  // Keep the pending timer stable while allowing it to call fresh inputs.
  onExpireRef.current = onExpire;
  delayRef.current = delayMs;

  function expire() {
    timerRef.current = null;
    startedAtRef.current = null;
    onExpireRef.current();
  }

  useEffect(() => {
    // A delay change restarts an active timer without losing elapsed time.
    if (timerRef.current !== null && startedAtRef.current !== null) {
      window.clearTimeout(timerRef.current);
      const elapsedMs = Date.now() - startedAtRef.current;
      const remainingMs = Math.max(0, delayMs - elapsedMs);
      timerRef.current = window.setTimeout(expire, remainingMs);
    }

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [delayMs]);

  function start() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(expire, delayRef.current);
  }

  return start;
}
```

Changing `onExpire` does not restart the timer; the ref deliberately makes the callback fresh. Changing `delayMs` does restart the active timer, preserving elapsed time and applying the new delay. Cleanup runs when the delay dependency changes and when the hook unmounts, so the old browser timer cannot fire after its owner is gone. If the product meaning is instead “a delay change starts a new full window,” reset `startedAtRef` before scheduling; the freshness policy must match that contract.

**useContext example — provider owns the state, consumer reads it:**

```tsx
import { createContext, useContext, useState } from "react";

const ThemeContext = createContext<"light" | "dark">("light");

function ThemeLabel() {
  const theme = useContext(ThemeContext); // This consumer rerenders when provider value changes.
  return <span>{theme} theme</span>;
}

export function ThemePanel() {
  const [theme, setTheme] = useState<"light" | "dark">("light"); // Provider owns it.
  return (
    <ThemeContext.Provider value={theme}>
      <button type="button" onClick={() => setTheme("dark")}>Use dark theme</button>
      <ThemeLabel />
    </ThemeContext.Provider>
  );
}
```

`ThemePanel` owns the state and the provider publishes it; `ThemeLabel` consumes it without a theme prop. An intermediate component would not need to forward that prop, but every consumer of this context observes provider value changes. A custom hook could wrap `useContext` to expose a domain-specific API, yet each caller would still own any local state created inside that hook.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you choose between `useState` and `useReducer`?**

Use `useState` when the value is simple and its updates are easy to read locally: a boolean, input string, selected ID, or independent number. Use `useReducer` when several fields change together, transitions have meaningful events, validation or branching is involved, or you want all transition rules in one pure function that can be tested without rendering React. The decision is about the shape of the update logic, not the number of fields alone. A form with many independent fields can still be clear with state; a small state machine can deserve a reducer.

`useReducer` does not make updates automatically immutable or globally shared. The reducer must return new state for changed objects, and the state is still local to that component unless passed through context or another mechanism.

**Q: What is the difference between a state update and a reducer dispatch?**

Both enqueue an update and can lead to a new render. A state setter accepts a next value or a functional updater. A reducer dispatch accepts an action; React later calls the reducer with the current state and that action. The action describes what happened, while the reducer owns how that event changes state. This separation is valuable when multiple UI events must obey the same transition rules.

**Q: Why is `useRef` different from `useState` if both values survive renders?**

They both provide persistence across renders, but only a state setter tells React that the rendered output may have changed. Mutating `ref.current` does not schedule work and does not update the UI by itself. Use state for a value the user must see; use a ref for imperative metadata such as a DOM node, timer handle, WebSocket instance, previous value, or latest callback used by an external listener.

If the screen must show a timer’s remaining seconds, store the seconds in state. A ref may store the timer handle used to cancel the timer, but it cannot replace the visible state.

**Q: Which hook should store a timer ID?**

Usually `useRef`, because the ID is needed to call `clearTimeout` or `clearInterval` and does not drive the UI. Storing it in state would schedule renders for an implementation detail. The timer still needs cleanup, normally in an effect or in the lifecycle that owns the timer, so the ref prevents an orphaned callback rather than merely avoiding a render.

**Q: When is `useMemo` appropriate?**

Use it when recalculating a value is meaningfully expensive, or when a stable object/array identity lets a memoized child or another identity-sensitive consumer skip work. The dependency list must include every reactive value used by the calculation. For a cheap filter over a tiny list, the extra dependency comparison and cached value may cost more than recalculating it, so plain render-time calculation is often clearer.

`useMemo` is not a correctness fix for duplicated state, and it is not a promise that the value will never be recalculated. Profile a real bottleneck or identify a real identity consumer before adding it.

**Q: When is `useCallback` appropriate?**

Use it when function identity matters: for example, a callback is passed to a child wrapped in `React.memo`, is used as a dependency of synchronization logic, or is consumed by an API that subscribes and unsubscribes based on function identity. If the function is only used by a child that always renders with its parent, `useCallback` usually adds bookkeeping without reducing work.

It does not make the function body faster. It only gives consumers the same function reference until a dependency changes. The callback must still list all changing values it reads.

**Q: Is `useCallback(fn, deps)` the same as `useMemo(() => fn, deps)`?**

For caching a function reference, they express the same underlying idea. `useCallback` communicates intent more directly and avoids wrapping the function in a factory. Neither hook makes captured values live, and neither should be used as a substitute for a ref, state, or a correct effect dependency.

**Q: Can `useMemo` or `useCallback` prevent stale closures?**

No. A complete dependency list lets React replace the cached value when its captured inputs change, but an empty or incomplete list can preserve an old closure indefinitely. If a long-lived external subscription must keep one identity while reading the latest value, use a deliberate latest-value ref pattern or the appropriate effect-event API for the React version in use. If the callback only needs previous state, prefer a functional updater.

**Q: Why does a functional state updater matter in a callback?**

`setCount(count + 1)` computes its argument using the callback’s render snapshot. If that callback is delayed or two calls happen in one event, both can compute from the same snapshot. `setCount((current) => current + 1)` gives React a function to apply against the current queued state, so multiple updates compose correctly. This is about state freshness, not about making arbitrary props current.

**Q: Should derived data be put in state or `useMemo`?**

Usually neither is the first answer: calculate cheap derived data during render. Use `useMemo` when the calculation is expensive or its reference is observed by a memoized consumer. Store it in state only when it is genuinely independent state produced by an event or external system, not merely another representation of existing props and state. Duplicating derived data creates synchronization bugs because every source update must remember to update the copy.

**Q: What does React compare in a dependency array?**

React compares each entry with `Object.is`. Primitive values compare by value; objects, arrays, and functions compare by reference. A freshly created `{ sort: "name" }` is therefore different from the previous render’s equivalent-looking object. Depending on the primitive fields, moving a constant outside the component, or memoizing the object can avoid accidental reruns—but only if that matches the intended data flow.

**Q: Is `useReducer` always better for complex state?**

No. A reducer is useful when centralized event-to-state rules improve clarity and testing. It can be worse when the reducer becomes a large switch with vague actions, leaks UI concerns into domain logic, or adds ceremony to independent values. The senior choice is the smallest model that makes valid transitions easy to see and invalid transitions hard to express.

**Q: When should you use `useContext` instead of props?**

Use props when a parent is intentionally passing data or behavior to a direct child; the dependency stays explicit and the child is easy to reuse. Use context when many descendants need the same value and threading it through unrelated intermediate components would be noise, such as a theme, locale, or authenticated user. The provider owns the value, and consumers rerender when the provider value changes. Context is not automatically cheaper: a changing object value can notify every consumer, so split contexts or memoize the provider value when that identity is the actual bottleneck.

**Q: Does `useContext` make state global, and who owns it?**

No. Context transports a value through one provider subtree; it does not create a process-wide store. The provider or another owner still decides how the value changes, often with `useState` or `useReducer`. A consumer can read and invoke actions exposed by the provider, but it should not be described as owning the provider’s state merely because it can consume it.

**Q: What is a custom hook, and who owns its state?**

A custom hook is a reusable composition of hooks and behavior, not shared state by itself. Every component that calls `useUndoWindow` gets its own refs, effects, and timer; the caller owns that instance and its lifetime. Custom hooks are useful for hiding synchronization details while returning a small API. If they read context, they compose context consumption; they still do not turn their local state into shared state.

**Q: What is `useEffect` for, and when does cleanup run?**

`useEffect` is for synchronizing a committed component with something outside React: a timer, subscription, DOM API, network connection, or other imperative resource. React runs the setup after commit, runs the previous cleanup before rerunning setup when dependencies change, and runs cleanup on unmount. It is not the place for derived data that can be calculated during render or ordinary event logic that belongs in a click or input handler. The timer example uses it because a browser timeout is an external resource with a lifetime that must be cleaned up.

## 6. The Traps — What Goes Wrong

The first trap is putting visible state in a ref:

```tsx
const secondsRef = useRef(0);

function tick() {
  secondsRef.current += 1;
}
```

The number changes in JavaScript, but React has no reason to call the component again. The screen remains unchanged. Use `useState` for the displayed number and keep only the timer handle in a ref.

The opposite trap is putting every mutable detail in state. Timer IDs, abort controllers, DOM nodes, and socket objects generally do not belong in rendered state. State updates create scheduling and rendering work; use a ref when React does not need to observe the change, and make the external resource’s cleanup explicit.

Another mistake is choosing `useReducer` because it sounds more advanced. A reducer for `isMenuOpen` can hide a one-line transition behind an action type, a switch, and dispatch calls. Start with the simplest representation. Move to a reducer when related transitions are becoming scattered or order-dependent.

Memoizing everything is also a performance trap. `useMemo` and `useCallback` retain dependencies, compare them on every render, and make data flow harder to inspect. If no memoized child, effect, or identity-sensitive library benefits, the cache has no useful consumer. Measure expensive calculations and stabilize only the boundary that needs it.

An empty dependency list is not a freshness instruction. This code has a stable but stale callback if `userId` changes:

```tsx
const saveCurrentUser = useCallback(() => save(userId), []);
```

The fix is normally `[userId]`, or a redesign that passes the ID as an argument or reads a deliberately maintained latest-value ref. Suppressing a dependency warning without changing the data flow does not fix the closure.

A related identity trap is memoizing an object while forgetting one of its inputs:

```tsx
const options = useMemo(() => ({ userId, sort }), [userId]);
```

When `sort` changes, `options` still describes the old sort because the cache is reused. The stable reference is now hiding a correctness bug. Dependencies describe what the calculation reads, not what seems convenient to list.

Finally, a ref is not a synchronization protocol. Writing `latest.current = value` during render can help an imperative callback read a current value, but it does not notify subscribers, coordinate async responses, or guarantee that external work is complete. Effects, cancellation, request identity, and state are still needed for those responsibilities.

Using context for every prop is another trap. Context hides the dependency from the component signature and can wake many consumers when one provider value changes. Use it for a genuinely shared subtree concern, keep direct relationships as props, and split frequently changing values from rarely changing actions when render cost matters.

Calling a custom hook does not share its state with another caller. Two calls to `useUndoWindow` create two timer refs and two independent lifecycles. To share state, lift it to a common owner, expose it through context, or use an external store; do not assume the hook name makes the state singleton.

The effect trap is using `useEffect` to repair data that should have been derived during render or to run code that belongs directly in an event handler. That adds a commit, a second render, and possible flicker or stale intermediate state. Effects synchronize with external systems; event handlers respond to user actions; render calculates the next UI.

## 7. Compare With Related Concepts

`useState` versus `useReducer`: state setters are a direct fit for simple independent values; reducers centralize named transitions across related fields. Use the setter when the update is obvious at the call site; use a reducer when scattered setters are making the state machine unclear.

`useState` versus `useRef`: state is the render-visible snapshot; a ref is persistent mutable storage that React does not watch. Use state for “the user should see this”; use a ref for “imperative code must retain or retrieve this.”

`useMemo` versus `useCallback`: `useMemo` returns a cached calculated value; `useCallback` returns a cached function reference. Use the one matching the identity you need to stabilize, and use neither when no consumer benefits.

`useMemo` versus `useRef`: both can appear to preserve a value, but memoization is discardable optimization while a ref is a stable mutable container for the mounted instance. Use `useMemo` to avoid recalculation or stabilize a derived identity; use a ref when correctness requires imperative persistence and the value does not drive rendering.

Derived data versus state: derived data has another source of truth and can be recalculated; state represents an independently changing value. Calculate or memoize the former, and use state for the latter.

`useCallback` versus a module-level function: a module-level function is stable but cannot capture per-instance props or state. Use it for behavior that needs no component data; use `useCallback` when the function must close over render values and its identity has a consumer.

`useContext` versus props: props make a direct dependency visible and local; context supplies a value to a whole provider subtree. Use props for explicit parent-to-child data flow, and context when many descendants need the same concern and the intermediate layers should not know about it.

`useEffect` versus render or event logic: render should calculate values from the current snapshot, and event handlers should perform work caused by a user action. Use an effect only when React must keep an external system aligned with committed UI, with cleanup for the resource lifetime.

Custom hook versus context: a custom hook packages behavior but gives each caller an independent instance; context transports an owner’s value to descendants. Use a custom hook for reusable logic and context for shared subtree data—often combine them when a custom hook provides the safe consumer API for a context.

## 8. 🧠 The Memory Hook — What Sticks

Ask two questions in order: “Does this change what the user sees?” and “Does anyone care whether this reference is the same?” The first points to state or a reducer, the silent implementation detail points to a ref, and the second points to memoization only when a real consumer is checking identity.
