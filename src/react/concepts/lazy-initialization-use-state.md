# Lazy Initialization in `useState`

## 1. Why This Exists — The Problem First

Imagine a settings screen that parses a large saved JSON document, builds a lookup map, and chooses the user's initial filter. If that work is written directly inside the `useState` call, JavaScript performs it every time the component renders—even when the user only typed one character into an unrelated input. The state value is reused, but the calculation that produced the first value keeps being paid for.

That is wasteful in a small component and noticeable in a large one. It can make typing feel slow, repeatedly read browser storage, or redo work that was only needed to establish the component's starting state. Lazy initialization gives React a function to call when it needs the initial value, instead of making JavaScript calculate that value before React even receives it.

## 2. The Analogy — Make It Obvious

Think of a hotel room's welcome package. The hotel prepares it when a guest first checks in and leaves it in the room. When that guest later asks for a towel, the staff does not rebuild the welcome package; they use the package already stored for that room.

In this analogy, the room is the component instance, the welcome-package preparation is the initializer function, and the stored package is React's state. `useState(buildWelcomePackage())` prepares the package before handing it to the hotel desk on every visit to the desk—that is ordinary JavaScript argument evaluation. `useState(() => buildWelcomePackage())` hands the desk instructions for preparing it, so React can run those instructions during the room's initial setup and store the result. Later renders are like later service requests: React reads the stored state and does not run the preparation instructions again.

If the hotel closes a room and opens a brand-new room, a new package is prepared. Likewise, a component that unmounts and later mounts again gets a new initial state. Lazy does not mean “once for this source-code location forever”; it means once for each mount of a component instance.

## 3. How It Actually Works — The Full Explanation

The important distinction is between these two expressions:

```tsx
// Fragment (not standalone): assumes React's useState and a createInitialItems helper.
useState(createInitialItems())
useState(() => createInitialItems())
```

JavaScript evaluates arguments before calling `useState`. In the first expression, `createInitialItems()` runs during every execution of the component function. React receives the resulting array, but on an update it ignores that new initial-state argument because the hook already has state.

In the second expression, JavaScript creates an arrow function and passes that function object to `useState`. During the mount path, React treats a function initial argument as an initializer, calls it, and stores the returned value as the hook's initial state. During an update, React reads the existing hook state and does not call the function or use a newly created initializer.

Conceptually, the lifecycle looks like this:

```text
# Pseudocode (not runnable)
mount:  component runs → initializer runs → result is stored as state
update: component runs → existing state is read → initializer is ignored
remount: new component instance → initializer runs again
```

The function is not a general “run this later” callback. React calls it with no arguments, and its return value becomes the initial state. The initializer therefore needs to be synchronous and render-safe: it should calculate or read a value, not start an HTTP request, mutate the DOM, write to storage, or change another piece of application state.

The result is not permanently frozen. A setter can replace it later:

```tsx
// Fragment (not standalone): assumes React's useState and a readInitialItems helper.
const [items, setItems] = useState(() => readInitialItems());

setItems(nextItems); // updates state; it does not rerun readInitialItems()
```

This is why lazy initialization is about the cost of establishing state, not about memoizing every future computation.

There are two details that often decide whether an interview answer is accurate:

- React development Strict Mode may call an initializer twice to expose impure render logic; one result is discarded. Production behavior should not be designed around a single call being guaranteed in every development check. A pure initializer gives the same answer either way and has no harmful external effects.
- A function can itself be the desired state. `useState(() => makeHandler)` means “the initial state is the function returned by `makeHandler`.” `useState(makeHandler)` means “call `makeHandler` as the initializer.” If the state is a function, the extra wrapper is necessary to prevent React from interpreting that function as initializer code.

For server rendering, the initializer still runs while the component is rendered on the server. Browser-only globals such as `window` and `localStorage` may not exist there. A guarded read can avoid a crash, but it can also produce server/client differences that affect hydration. The safest design is to choose a deterministic server-safe default and synchronize browser-only preferences after hydration when that distinction matters.

## 4. Real Code — See It Working

This self-contained component demonstrates the difference between eager evaluation and lazy initialization. `buildRows` logs whenever it runs; changing the filter causes a re-render.

```tsx
import { useState } from "react";

function buildRows() {
  console.log("building initial rows");
  return Array.from({ length: 10_000 }, (_, id) => ({ id, label: `Row ${id}` }));
}

export function RowSearch() {
  // Production: once per normal mount; development Strict Mode may invoke it twice.
  const [rows] = useState(() => buildRows());
  const [query, setQuery] = useState("");

  const visibleRows = rows.filter((row) =>
    row.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <label>
      Search
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <span>{visibleRows.length} matches</span>
    </label>
  );
}
```

This is the contrasting mistake:

```tsx
// Fragment (not standalone): assumes React's useState and the buildRows helper above.
// Incorrect when buildRows is expensive: it runs on every render.
const [rows] = useState(buildRows());
```

React still keeps the first state value, so the bug can be hard to notice in the UI. The repeated log and repeated allocation reveal the actual cost.

Reading a persisted preference is a practical use case, provided the environment supports the API:

```tsx
import { useState } from "react";

function readTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";

  const saved = window.localStorage.getItem("theme");
  return saved === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => readTheme());

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  return (
    <button type="button" onClick={toggleTheme}>
      Theme: {theme}
    </button>
  );
}
```

The initializer below is not appropriate because rendering it changes an external system:

```tsx
// Intentionally bad, non-runnable example: it demonstrates a render-time side effect.
// Do not do this: Strict Mode or another render retry can write more than once.
const [id] = useState(() => {
  window.localStorage.setItem("last-created", String(Date.now()));
  return crypto.randomUUID();
});
```

If the application must create and persist an ID, keep render pure and perform that workflow at an explicit event or in an appropriate external synchronization boundary. Also note that a random ID is not a stable server-rendering strategy unless the application has a hydration-safe plan.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is lazy initialization in `useState`?**

It is passing a function as the initial-state argument: `useState(() => expensiveSetup())`. On mount, React calls that function and stores its return value. On later renders, React uses the state already associated with the hook and ignores the initializer argument. The benefit is avoiding work that is only needed to compute the starting value.

**Q: Why does `useState(expensiveWork())` run on every render?**

Because this is first a JavaScript evaluation issue, not a React issue. JavaScript must evaluate `expensiveWork()` before it can call `useState`, and the component function runs again on every render. `useState(() => expensiveWork())` creates a function reference instead; React invokes it only on the mount path.

**Q: Does the initializer run exactly once?**

It runs once for a normal mount in production and is not rerun for ordinary updates. It runs again when the component is genuinely unmounted and mounted as a new instance. In development Strict Mode, React can invoke it twice as a purity check, so “once” should be stated with that development caveat rather than as an absolute promise.

**Q: What happens if the initial value depends on a prop that changes later?**

The initializer captures the prop's value from the mount render and does not automatically recalculate when the prop changes. For a value that is merely derived from current props, calculate it during render or use `useMemo` when profiling shows the calculation is expensive. If it is editable state seeded from a prop, define an explicit policy for what happens when the prop changes; do not expect lazy initialization to synchronize it.

**Q: Is lazy initialization the same as `useMemo`?**

No. Lazy initialization supplies the first value of state, and the value changes only through its setter. `useMemo` caches a derived value and may recompute it when dependencies change; its cache is a performance optimization, not the component's source of truth. Use lazy initialization for expensive state setup and `useMemo` for expensive derivation from current inputs.

**Q: Should a lazy initializer have side effects?**

No. It executes during rendering, and React may render more than once, abandon a render, or call the initializer twice in development checks. Reading an available value is generally a calculation; writing to `localStorage`, making a request, registering a subscription, mutating the DOM, or changing external state is a side effect and does not belong in the initializer.

**Q: Is reading `localStorage` in a lazy initializer safe?**

It is efficient on the client because the read happens at initial state setup rather than on every render, but it is not automatically safe in every runtime. SSR has no browser `window`, and a client-only value can differ from the server's default and cause hydration concerns. Guard browser access and choose an SSR strategy deliberately; for some applications, start with a deterministic default and reconcile the preference after hydration.

**Q: What if the state value itself is a function?**

React uses a function initial argument as initializer code, so `useState(handler)` asks React to call `handler` and store its return value. To store `handler` itself, wrap it: `useState(() => handler)`. The same distinction applies to a setter: `setState(next)` can be interpreted as an updater function, while `setState(() => next)` stores a function value.

**Q: When is lazy initialization not worth using?**

For a cheap literal such as `useState(0)` or `useState("")`, the wrapper adds indirection without meaningful savings. It is also the wrong tool when the value must track changing inputs, when initialization needs an asynchronous request, or when the “initial value” is actually a value derived from state and props on every render.

**Q: What does React store after the initializer returns?**

At the conceptual level, React stores the returned value in the hook state associated with that component instance. On an update it reads that stored value and processes queued state updates; it does not use the newly evaluated initial argument to reset the state. The exact internal data structures are implementation details, but the observable invariant is stable: initial-state input is for initialization, and the setter is for later changes.

## 6. The Traps — What Goes Wrong

**Mistaking a lazy initializer for a callback you control.**

The function is not returned to you for later use. React calls it as part of initial state setup. If you need a function as the state value, use `useState(() => actualFunction)`. Otherwise React will call `actualFunction` and store its return value.

**Assuming the initializer repairs state when props change.**

This code only uses `userId` on the first mount:

```tsx
// Fragment (not standalone): assumes React's useState and a userId in component scope.
const [draft, setDraft] = useState(() => makeDraft(userId));
```

If `userId` changes while the same component remains mounted, `draft` remains the old draft. That is often correct for a user-edited form, but it is wrong if the product expects a new draft. Make the reset an explicit event or change the component identity with a deliberate `key` when remounting is truly the desired behavior.

**Putting writes or requests in render-time initialization.**

Strict Mode can expose this by producing duplicate writes or requests in development. A successful return value does not make the side effect safe. Keep initialization deterministic and move external work to an event handler or a synchronization mechanism designed for that external system.

**Calling the expensive function outside the wrapper.**

The difference is one pair of parentheses:

```tsx
// Fragment (not standalone): assumes React's useState and a parseLargeDocument helper.
useState(parseLargeDocument()); // parse now, on every component render
useState(() => parseLargeDocument()); // let React initialize once per mount
```

The first form can be expensive even though React later ignores the new result.

**Treating Strict Mode's duplicate call as duplicate committed state.**

Development Strict Mode is checking whether render-time code is pure; it is not adding two copies of the state to the hook. One initialization result is discarded. The real danger is that an impure initializer can still perform its external action twice, which is why relying on “it only runs once” is unsafe.

**Using browser APIs without an SSR plan.**

`localStorage.getItem("theme")` can throw on the server because `localStorage` is not defined. Adding `typeof window !== "undefined"` prevents that particular crash, but the server's fallback and client's first render still need to be compatible with the framework's hydration rules.

**Using lazy initialization to hide a broader performance problem.**

It removes repeated initialization work; it does not make a 10,000-item filter, a large render tree, or a network request cheap. Profile the expensive path and choose the right fix—better data structures, virtualization, memoized derivation, caching, or server-side work—rather than wrapping every calculation in a function.

## 7. Compare With Related Concepts

**Lazy initialization vs. `useMemo`.** Lazy initialization creates the starting state once per mount. `useMemo` recomputes a derived value when its dependencies change and may discard its cache. Use lazy initialization when the result becomes state; use `useMemo` when the result should follow current inputs.

**Lazy initialization vs. a direct initial value.** A direct value is fine when constructing it is cheap: `useState(0)`. A function wrapper matters when producing the initial value does meaningful work or touches a costly read. The wrapper controls when the computation happens; it does not change state semantics after initialization.

**Lazy initialization vs. a functional state update.** `useState(() => createInitialValue())` supplies the initial state. `setState((previous) => nextValue(previous))` computes a later state update from the latest committed state. Both use functions, but one is for mount-time initialization and the other is for update-time sequencing.

**Lazy initialization vs. an effect.** Initialization calculates the first render's state synchronously. An effect is for synchronizing with something outside React after a commit, such as a subscription or external system. Do not put an API request or storage write in the initializer just because it runs only once; “once” does not make render-time side effects correct.

**Lazy initialization vs. `useRef`.** State updates schedule a re-render and are appropriate when the UI depends on the value. A ref stores a mutable value without scheduling a render. Use lazy state for initial UI state and a ref for an instance-local mutable handle that should not itself drive the UI.

## 8. 🧠 The Memory Hook — What Sticks

`useState(value)` makes JavaScript cook the meal before React sees it; `useState(() => value)` hands React the recipe to cook when the component first opens. React stores the first meal for that mount, so later renders read the stored state—but a new mount gets a new meal, and a pure recipe is safe when React checks it twice.
