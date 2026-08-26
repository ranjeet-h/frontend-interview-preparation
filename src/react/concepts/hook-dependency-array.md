# Hook Dependency Array

## 1. Why This Exists — The Problem First

An order screen shows the right customer, then quietly sends the request with the customer ID from the previous render. A polling timer keeps reading the first search term forever. Another effect reconnects on every keystroke because an options object is recreated during render, and the reconnect itself causes another render. These bugs are not random: a callback created during one render still sees that render's values, while React needs to know when that callback's work is no longer valid.

The dependency array is the small piece of information that lets React decide whether a hook's previous work still matches the current render. Used honestly, it keeps effects synchronized and keeps memoized values and function identities valid. Used as a performance wish or a way to silence a warning, it creates stale data, wasted work, or loops.

## 2. The Analogy — Make It Obvious

Think of a restaurant ticket for one table. The ticket lists the facts that determine the meal: table number, allergy information, and the chosen dish. When one of those facts changes, the kitchen must prepare a new meal. If nothing on the ticket changes, the kitchen can keep the existing meal. A new ticket object does not automatically mean a new order; the kitchen compares the individual facts written on it.

In this analogy, the hook callback is the recipe, the dependency array is the ticket, and each render supplies the latest ticket values. A prop or state value read by the callback is an ingredient. `useEffect` uses the ticket to decide whether to tear down and re-establish an external synchronization. `useMemo` uses it to decide whether a derived result is still valid. `useCallback` uses it to decide whether the same function object can be handed to someone else.

The analogy also explains why an inline object is troublesome. Writing `{ customerId: "c-42" }` on every ticket creates a brand-new ticket ingredient by identity, even when its contents are the same. React compares that object reference, not its fields. A primitive such as the string `"c-42"` can remain equal by value, so it is often the more honest ingredient to list.

## 3. How It Actually Works — The Full Explanation

React components are called again to render new snapshots. Each call has its own `props`, state values, local variables, and closures. A dependency array does not make those variables mutate in place. It tells React which values should cause a hook's stored work to be replaced with work created by the latest render.

For a hook call such as `useEffect(setup, [userId, token])`, React records the dependency values for that hook position. On a later render, it compares the current `userId` with the previous `userId`, and the current `token` with the previous `token`, using `Object.is` one position at a time. If every comparison is true, the dependencies are considered unchanged. If any comparison is false, the hook is considered changed.

For `useEffect`, a changed dependency means React runs the cleanup returned by the previous effect, then runs the new setup after the commit. The new setup closes over the new render's values. Cleanup also runs when the component unmounts. With no dependency array, the effect is eligible after every commit. With `[]`, it is eligible on the first mount and then not again for that mounted instance; development Strict Mode may intentionally perform an extra setup-cleanup cycle to expose missing cleanup.

For `useMemo`, a changed dependency makes React call the calculation again and return its new result. For `useCallback`, a changed dependency makes React return the function from the current render; unchanged dependencies let React return the previously stored function reference. Neither hook makes a calculation or function intrinsically faster. They only make reuse possible, and React may discard memoized caches when it needs to, so correctness must never depend on memoization.

The rule for choosing dependencies is: include every reactive value read by the callback. Reactive values include props, state, context values, and variables or functions declared inside the component that are derived from them. A state setter returned by `useState` and a `dispatch` returned by `useReducer` have stable identities, so they do not need to be listed; including them is harmless and often keeps lint configuration straightforward. A ref object is stable, but changing `ref.current` does not trigger a render, so putting `ref.current` in a dependency list does not make an effect react to ref mutations.

There are two different problems that are easy to mix up. A missing dependency means React keeps old work when the work actually depends on a changed value. An unstable dependency means React replaces work too often because a new object, array, or function reference is created on each render. The solution to the first is to add the dependency or restructure the code. The solution to the second is usually to move a constant outside the component, move a helper inside the effect, depend on the primitive fields actually used, or stabilize the identity only when that identity matters.

The exhaustive-deps lint rule is useful because it statically inspects hook callbacks and points out values that appear to be missing. It cannot understand every domain invariant, and it is not a substitute for design. Treating every warning as “make the array smaller” is dangerous. First ask why the callback reads that value and whether the effect represents one coherent synchronization. If it does, the dependency list should describe that synchronization truthfully.

One final boundary matters: dependency arrays do not control ordinary event handlers. A click handler runs because the user clicked. An effect runs because React committed a render and its synchronization became eligible. If the action is caused by the click itself, put it in the click handler. If the component must keep an external system aligned with current props or state, use an effect and list the values that system depends on.

## 4. Real Code — See It Working

The following complete browser example uses a local fake API so it can run without a backend. It demonstrates a production-shaped request, cancellation, and cleanup. The request for an old `customerId` cannot overwrite the screen for the new one.

Save the following as `index.html` in a Vite React TypeScript app; the TSX block is that app's `src/main.tsx`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Customer panel</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type Customer = { id: string; name: string; plan: "Starter" | "Pro" };

const customers: Record<string, Customer> = {
  "c-42": { id: "c-42", name: "Maya Chen", plan: "Pro" },
  "c-73": { id: "c-73", name: "Arun Das", plan: "Starter" },
};

function getCustomer(id: string, signal: AbortSignal): Promise<Customer> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const customer = customers[id];
      customer ? resolve(customer) : reject(new Error("Customer not found"));
    }, id === "c-42" ? 500 : 80);

    // The fixture mirrors fetch cancellation, so the example is runnable.
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Request cancelled", "AbortError"));
    }, { once: true });
  });
}

function CustomerPanel({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCustomer(null);
    setError(null);

    getCustomer(customerId, controller.signal)
      .then((nextCustomer) => setCustomer(nextCustomer))
      .catch((reason: unknown) => {
        // Cancellation is normal cleanup, not an error for the user.
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Request failed");
      });

    // A customer change or unmount invalidates this request.
    return () => controller.abort();
  }, [customerId]);

  if (error) return <p role="alert">{error}</p>;
  if (!customer) return <p aria-busy="true">Loading {customerId}…</p>;
  return <p>{customer.name} — {customer.plan}</p>;
}

function App() {
  const [customerId, setCustomerId] = useState("c-42");
  return (
    <main>
      <label>
        Customer
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="c-42">c-42</option>
          <option value="c-73">c-73</option>
        </select>
      </label>
      <CustomerPanel customerId={customerId} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

This complete example keeps a window subscription for the lifetime of the mounted component. The callback does not read changing state, so `[]` is honest. The same function reference is passed to both `addEventListener` and `removeEventListener`, which is required for removal.

Use the same local Vite React TypeScript setup, with this `index.html` fixture and the TSX block saved as `src/main.tsx`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reading progress</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function ScrollProgress() {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    function updateProgress() {
      const remaining = document.documentElement.scrollHeight - window.innerHeight;
      const next = remaining <= 0 ? 100 : (window.scrollY / remaining) * 100;
      setPercent(Math.round(Math.min(100, Math.max(0, next))));
    }

    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();
    return () => window.removeEventListener("scroll", updateProgress);
  }, []);

  return <progress value={percent} max={100} aria-label="Reading progress" />;
}

function App() {
  return <><ScrollProgress /><div style={{ minHeight: "200vh" }}>Article</div></>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

Here is the identity problem and the smallest useful fixes. The first component reconnects whenever its parent re-renders because `options` is a new object. The second depends on the primitive it actually uses. The third memoizes the object because its identity is passed to the effect and changes only when its inputs change.

Use the same local Vite React TypeScript setup, with this `index.html` fixture and the TSX block saved as `src/main.tsx`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Room connection identities</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type Options = { roomId: string; highQuality: boolean };

function connect(roomId: string, highQuality: boolean): () => void {
  console.log(`Connected to ${roomId}; high quality: ${highQuality}`);
  return () => console.log(`Disconnected from ${roomId}`);
}

export function RoomWithUnstableObject({ roomId }: { roomId: string }) {
  const options: Options = { roomId, highQuality: true };
  useEffect(() => connect(options.roomId, options.highQuality), [options]);
  return <p>Room {roomId}</p>;
}

export function RoomWithPrimitiveDependencies({ roomId }: { roomId: string }) {
  const highQuality = true;
  useEffect(() => connect(roomId, highQuality), [roomId, highQuality]);
  return <p>Room {roomId}</p>;
}

function RoomWithMemoizedOptions({ roomId }: { roomId: string }) {
  const [online, setOnline] = useState(true);
  const options = useMemo(() => ({ roomId, highQuality: online }), [roomId, online]);
  useEffect(() => connect(options.roomId, options.highQuality), [options]);
  return <button onClick={() => setOnline((current) => !current)}>Toggle</button>;
}

function App() {
  const [roomId, setRoomId] = useState("room-42");
  return (
    <main>
      <label>
        Room
        <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          <option value="room-42">room-42</option>
          <option value="room-73">room-73</option>
        </select>
      </label>
      <RoomWithUnstableObject roomId={roomId} />
      <RoomWithPrimitiveDependencies roomId={roomId} />
      <RoomWithMemoizedOptions roomId={roomId} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

`RoomWithUnstableObject` is intentionally the bad version: it needs a new dependency design, not a lint suppression. The local `connect` fixture stands in for an external client and returns the cleanup function that a real subscription would need.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a dependency array, and how does React compare it?**

It is a list of values that determine whether a particular hook's stored work is still valid. React compares the previous and current entries position by position with `Object.is`. If every entry is equal, an effect is skipped or a memoized result/function can be reused. If one entry differs, the effect is re-synchronized or the memoized calculation/function is replaced. The array is not a list of values React watches continuously; React checks it during renders.

**Q: What is the difference between no array, `[]`, and `[value]`?**

No array makes an effect eligible after every commit; for `useMemo` and `useCallback`, the calculation or function is not reused based on dependencies. `[]` says the callback has no reactive dependencies, so an effect sets up on the first mount and cleans up on unmount for that mounted instance. `[value]` makes the hook re-run or recalculate when `Object.is(previousValue, currentValue)` is false. In development Strict Mode, an extra setup and cleanup cycle can occur, so “once” should not be treated as “exactly one call in all environments.”

**Q: Why does a missing dependency create a stale closure?**

Each render creates a new scope. If an effect with `[]` reads `userId`, its callback closes over the `userId` from the first render. Later renders create new values, but React does not rewrite the old callback. Because `userId` was omitted, React does not replace that effect, so it continues to use the old snapshot. The fix is to list `userId`, or redesign the work so it genuinely does not need that changing value.

**Q: Should every variable referenced in the callback be listed?**

Every reactive value that the callback reads should be listed, including values derived from props or state. Stable React-provided setters and reducer dispatchers do not need to be listed. A module-level constant does not change because a component rendered again. For a function or object declared inside the component, first decide whether it really belongs in the synchronization: move a helper inside the effect, move a constant outside, depend on primitive fields, or stabilize the identity when another consumer actually needs that identity.

**Q: Why can an object or function dependency cause repeated effects?**

Objects, arrays, and functions are compared by reference. A new literal or function expression in the component body creates a new reference on every render, even if its contents or source text look identical. React sees a changed dependency every time. If the effect sets state, the cycle can become render → effect → state update → render. Memoizing the object can help, but extracting the primitive fields or moving the object outside the component is often simpler and more honest.

**Q: When should a function be moved, memoized, or placed in a ref?**

Move it inside the effect when it only supports that effect. Move it outside the component when it needs no props or state. Use `useCallback` when a stable function identity is itself useful, such as passing it to a memoized child or using it as a dependency, and list the callback's own reactive dependencies. A ref is a specialized escape hatch for a long-lived subscription or timer that must read the latest value without being recreated; it is not a general way to hide dependencies.

**Q: How does the exhaustive-deps lint rule help, and when is suppression reasonable?**

It performs static analysis of a hook callback and warns when a referenced reactive value appears to be missing from the dependency list. It catches many stale-closure bugs before runtime. It does not know every business invariant and it does not make an effect well-designed. Before suppressing a warning, make the synchronization boundary explicit and check whether the code should use a functional state update, a ref, a different effect, or an event handler. Suppression should be rare and documented by the invariant that makes the omission safe.

**Q: Is `useMemo` or `useCallback` required for correctness?**

No. They are performance and identity tools. A correct component must produce the right result even if React recalculates a memo or returns a new callback. Use `useMemo` when avoiding a genuinely expensive calculation or preserving an object/array identity has a measured downstream benefit. Use `useCallback` when a function identity affects a memoized child or another hook. Do not use either to make an invalid dependency list appear correct.

**Q: Why is a dependency array different from an event trigger?**

An effect responds to a committed render and synchronizes an external system with current values. A button handler responds to one user action. If a save request should happen because the user submitted a form, the submit handler is the clearest trigger. Watching `isSubmitted` in an effect makes the request happen for every cause of that state change and introduces another render into the flow. Dependencies describe what synchronization is valid, not what event a product feature should react to.

## 6. The Traps — What Goes Wrong

**Leaving out a value to stop re-runs.**

The wrong assumption is that the dependency array is a throttle. Removing `token` from an effect that sends authenticated requests may stop reconnection, but the callback now keeps the token from an older render. Add the value and solve the reason for the extra work, or move the action to the event that owns it. Do not trade a visible re-run for an invisible stale-data bug.

**Treating `[]` as a universal “run once” switch.**

An empty list is correct only when the callback needs no changing reactive values. `useEffect(() => subscribe(userId), [])` subscribes to the initial user, not the current user. For a timer that increments state, use a functional update such as `setCount((current) => current + 1)` if the interval itself should remain stable; for a timer that reads other changing values, design its dependencies or latest-value ref deliberately.

**Putting inline objects, arrays, or functions in the list.**

`const filters = { status, limit: 20 }` gets a new identity on each render. Depending on `filters` makes the effect re-run for unrelated renders. Prefer `[status]` when `limit` is a constant, create the object inside the effect from `[status]`, or use `useMemo` when the object identity must be shared. Memoization is a tool for a real identity requirement, not a reflex.

**Putting `ref.current` in the list and expecting ref changes to trigger work.**

Mutating `ref.current` does not schedule a render, so React has no render in which to compare that value. A ref is appropriate when an existing long-lived callback must read mutable latest data. If attaching a DOM node should trigger logic, use a callback ref or state that changes during the attachment, depending on the requirement.

**Using an effect to derive render data.**

An effect such as `useEffect(() => setFullName(first + last), [first, last])` renders once with old `fullName`, then updates state and renders again. The value is already a pure calculation from current inputs. Use `const fullName = first + last` during render, and reserve effects for synchronization with something outside React.

**Splitting one synchronization across dishonest dependencies.**

If one effect both opens a room connection and writes an analytics event, a change to the analytics callback may tear down a perfectly valid connection. Keep separate synchronization concerns in separate effects with separate lists. The goal is not the fewest effects; it is a dependency list whose changes have one understandable meaning.

**Assuming a memoized value is permanent.**

React may discard memoization caches, and development behavior can mount, clean up, and mount effects again. Never store correctness-critical state in `useMemo` or rely on `useCallback` never changing. Write code that remains correct when the calculation runs again or the function identity changes, then use memoization to reduce measured work.

## 7. Compare With Related Concepts

**Dependency array vs. Rules of Hooks.** The dependency array controls when a hook's work is refreshed. The Rules of Hooks require hooks to be called in the same order on every render. Use dependencies to describe data relationships; use unconditional hook calls to preserve hook ordering.

**Dependency array vs. state.** State stores a value and a setter that can schedule a render. A dependency list stores no application data; it tells React which render values invalidate a hook's previous work. Use state for UI-owned data, dependencies for declaring what a calculation or synchronization reads.

**Dependency array vs. memoization.** The array is the invalidation policy. `useMemo` and `useCallback` are two consumers of that policy that may reuse work or identity. Use a truthful dependency list first; add memoization only when recalculation or identity changes have a concrete cost.

**Dependency array vs. a ref.** Dependencies cause React to revisit a hook after a render when values differ. A ref gives callbacks a stable mutable container, and changing it does not re-render. Use dependencies for declarative synchronization; use a ref for narrowly scoped imperative state that must survive renders without itself driving rendering.

**Dependency array vs. functional state update.** Dependencies decide when a callback or effect should be recreated. A functional update lets React apply a state transition to the latest queued state, so the transition does not need to read a captured previous value. Use `[count]` when the effect must re-run for a new count; use `setCount((current) => current + 1)` when only the transition needs the latest count.

**Effect dependency vs. `React.memo` props.** An effect dependency comparison decides whether that effect's synchronization changes. `React.memo` compares a component's incoming props to decide whether to skip rendering that child. Both rely on identity comparisons, but optimizing a child prop does not make an effect dependency correct, and an effect re-run does not imply a child must re-render.

## 8. 🧠 The Memory Hook — What Sticks

Treat the array like a validity ticket, not a speed limit: list every reactive value that makes the callback's work valid. If the ticket is incomplete, old render snapshots survive; if it contains a freshly recreated object, valid work looks new every time. Tell the truth about the ingredients, then React can keep the synchronization, result, or function aligned with the current render.
