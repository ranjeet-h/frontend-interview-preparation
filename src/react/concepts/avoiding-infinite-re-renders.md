# Avoiding Infinite Re-renders

## 1. Why This Exists — The Problem First

A checkout form opens, and the browser immediately throws `Too many re-renders`. A dashboard does not crash, but its effect keeps refetching because an options object is recreated on every render. Another screen shows a filtered list one render late because an effect copies a value that could have been calculated directly. These bugs feel different in the UI, but they share one failure: work that should finish causes the same render path to start again without a stable stopping point.

The practical cost is larger than an error message. A render loop can freeze the tab; an effect loop can hammer an API, reconnect a WebSocket, or repeatedly write to storage; and a needless derived-state update can produce flicker and stale intermediate UI even when it eventually settles. The fix is not “never update state.” The fix is to make every state update have a clear owner and a clear reason it will stop.

## 2. The Analogy — Make It Obvious

Imagine a receptionist managing a meeting room. The room has a whiteboard showing the current meeting status. When a person clicks “Start,” the receptionist changes the status to `running`. That is a sensible external event: the person’s action causes one state transition, and the room can render again.

Now imagine the receptionist changes the whiteboard every time they look at it: “The status is `running`, so I will write `running` again.” Looking at the board triggers another inspection, which triggers another write, forever. That is a state update during render or an unguarded effect update.

The meeting room also has an equipment controller. It should reconnect only when the room number or meeting ID changes. If the receptionist prints a brand-new, visually identical room card every time they look at the board, the controller thinks it has been given a new room and reconnects on every inspection. In React, the room card is an object or function reference, and the controller is an effect whose dependencies are compared by identity.

The safe workflow is: inspect the current snapshot, commit the visible room, synchronize external equipment only when its real inputs changed, and stop writing when the desired state is already true. React’s render phase is the inspection; state setters are writes; dependency arrays describe the inputs that justify repeating synchronization.

## 3. How It Actually Works — The Full Explanation

React calls a component to calculate a UI snapshot. During that call, props, state values, local variables, and functions belong to that particular render. The render phase should be pure: given the same inputs, it calculates the same result and does not perform a state transition. React may start, pause, retry, or discard render work, so a setter called in the component body is not a safe way to “initialize” something.

Consider this sequence:

```text
render component
  -> setState during render
     -> schedule another render
        -> setState during render
           -> ...
```

React detects repeated render-phase updates and throws `Too many re-renders` rather than allowing the browser to stay trapped in that cycle. The precise internal threshold is an implementation detail; production code should not depend on it.

An event handler is a different boundary. A click handler runs because the user acted, calls a setter, and then React renders the next snapshot. The render itself does not cause the update, so the cycle has a meaningful trigger and can finish.

Effects run after React commits the render. Their job is to synchronize with something outside React: a network request, timer, browser event listener, DOM API, WebSocket, or imperative library. An effect can legitimately set state, such as changing `isLoading` when a request starts. The danger is a feedback loop:

```text
render with value A
  -> effect runs
     -> set value B
        -> render with value B
           -> effect runs because B changed
              -> set value C
                 -> ...
```

That loop is infinite only when the effect keeps producing a changed state value. If an effect calls `setStatus("ready")` while `status` is already `"ready"`, React can bail out because the next value is `Object.is`-equal to the current value. But relying on a no-op update is weaker than expressing the real design. If `status` is derived from props or state, calculate it during render. If it represents an external synchronization, make setup and cleanup correct and make the dependency list describe the synchronization inputs.

React compares dependency-array entries with `Object.is`, one position at a time. Primitives such as strings and numbers usually remain equal when their value is unchanged. Objects, arrays, and functions are compared by reference. This creates a common loop:

```tsx
const options = { query, limit: 20 };

useEffect(() => {
  setResults(loadResults(options));
}, [options]);
```

`options` is a new object on every render. The effect sets `results`, that causes a render, the new object looks different, and the effect runs again. `useMemo` can stabilize the object, but first ask whether the effect should depend on the whole object at all. Often the more direct design is to depend on `[query]` and create the request options inside the effect.

Derived state is another feedback-loop factory. If `filteredItems` is fully determined by `items` and `searchTerm`, storing it in state creates two sources of truth and requires an effect to copy one into the other. The first render has old derived data, then the effect updates it, then another render happens. Computing the filter directly gives the current result in the same render and removes the loop surface. Use `useMemo` only when the calculation is expensive or the resulting reference must be stable for a specific consumer; it is not required for correctness.

Strict Mode in development may mount, run effects, clean them up, and mount again to expose missing cleanup and non-idempotent setup. It does not create a legitimate production feedback loop, and it is not evidence that effects should be silenced. If a subscription, timer, or request cannot tolerate setup followed by cleanup followed by setup, its lifecycle is incomplete. Also distinguish an infinite loop from repeated but finite renders caused by a parent, a context provider, a state update that settles, or a development-only Strict Mode check.

## 4. Real Code — See It Working

The following is a complete component for a Vite React TypeScript app. Its fake request is intentionally delayed so the example runs without a backend. A new `customerId` aborts the old request, and the effect depends on the primitive ID rather than an object made during render.

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

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Request cancelled", "AbortError"));
      },
      { once: true },
    );
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
      .then(setCustomer)
      .catch((reason: unknown) => {
        // Aborting is expected cleanup, not a user-visible request failure.
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Request failed");
      });

    // The request belongs to this customerId. Invalidate it on change or unmount.
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
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="c-42">c-42</option>
          <option value="c-73">c-73</option>
        </select>
      </label>
      <CustomerPanel customerId={customerId} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

The reset calls inside the effect are safe here because the effect runs only when `customerId` changes. They do cause a loading render, but they do not update `customerId`, so they cannot retrigger the same effect by themselves. In a real application, a data-fetching library may own this loading, caching, cancellation, and race handling instead.

Here is the derived-value version. It has no effect because `visibleItems` is not independent state; it is a direct consequence of the current inputs.

```tsx
type Item = { id: string; name: string };

function ItemList({ items, searchTerm }: { items: Item[]; searchTerm: string }) {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  const visibleItems = items.filter((item) =>
    item.name.toLowerCase().includes(normalizedTerm),
  );

  return (
    <ul>
      {visibleItems.map((item) => <li key={item.id}>{item.name}</li>)}
    </ul>
  );
}
```

For an expensive calculation, `useMemo` may reduce repeated work, but it does not turn a state loop into a correct design. This complete component keeps the inputs concrete and defines the filtering work locally. The dependency list must still include the values used by the calculation:

```tsx
import { useMemo, useState } from "react";

type Item = { id: string; name: string };

const items: Item[] = [
  { id: "1", name: "Keyboard" },
  { id: "2", name: "Monitor" },
  { id: "3", name: "Webcam" },
];

function expensiveFilter(items: Item[], searchTerm: string): Item[] {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  return items.filter((item) =>
    item.name.toLowerCase().includes(normalizedTerm),
  );
}

export function SearchableItemList() {
  const [searchTerm, setSearchTerm] = useState("");
  const visibleItems = useMemo(
    () => expensiveFilter(items, searchTerm),
    [searchTerm],
  );

  return (
    <section>
      <label>
        Search items
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </label>
      <ul>
        {visibleItems.map((item) => <li key={item.id}>{item.name}</li>)}
      </ul>
    </section>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What causes an infinite re-render in React?**

Usually, a render or an effect schedules a state update that causes the same path to run again and produce another update. Directly calling a setter in the component body is the simplest case. An effect can do the same when it updates a dependency on every run, or when an unstable object/function dependency makes the effect run after every render. The diagnostic question is: “What update causes the next render, and why will that update eventually stop?”

**Q: Why is calling a state setter during render a bug?**

Rendering should calculate the next UI snapshot, not cause a new state transition. Calling a setter while React is still evaluating that snapshot schedules more render work before the current calculation has a stable result. If the setter runs on every invocation, the component never reaches a settled render and React throws. Put user-driven updates in event handlers; use an effect only when the update is genuinely synchronizing with an external system or a carefully guarded transition is required.

**Q: Can an effect update state without causing an infinite loop?**

Yes. For example, an effect can set `isLoading` when a request starts and set it back when the request finishes. It will not loop if the effect is triggered by a stable request key and does not change that key on every run. An effect that depends on `status` and unconditionally changes `status` is different: it forms a feedback edge. Analyze the dependency graph, not just the fact that `setState` appears inside an effect.

**Q: Why do inline objects and functions sometimes create effect loops?**

React compares dependency entries with `Object.is`. A literal object or a function declared in the component body gets a new reference on each render, even when its contents or implementation look identical. If an effect depends on that reference and sets state, the state update produces a new render, which creates another reference, which retriggers the effect. Depend on the primitive values the effect actually needs, move constant values outside the component, or use `useMemo`/`useCallback` when identity itself is part of the design.

**Q: What is the best fix for derived-state loops?**

Remove the redundant state when the value can be calculated from props, state, or context. A filtered array, formatted name, subtotal, or permission flag usually belongs in render, possibly behind `useMemo` if the calculation is measurably expensive. If the value represents a separate user-editable draft or a snapshot intentionally captured at a boundary, it may deserve state, but then define when it is reset rather than blindly synchronizing it in an effect.

**Q: Why does `setCount(count + 1)` in a click handler not automatically loop?**

The handler runs only when the user clicks. It updates state once for that event, React renders the next snapshot, and the handler does not run again merely because rendering occurred. The same expression in the component body runs every time the component renders, so it creates a render-to-update feedback edge. The location and trigger of the update matter more than the setter syntax.

**Q: How does Strict Mode affect infinite re-render debugging?**

Development Strict Mode intentionally performs extra render/effect lifecycle checks, including an effect setup-cleanup-setup cycle on mount in current React development behavior. This can expose missing cleanup or non-idempotent side effects, but it is not a reason to remove Strict Mode. A genuine setter-during-render loop is still a bug without Strict Mode; Strict Mode may make lifecycle mistakes easier to see. Do not “fix” the symptom by adding a ref that suppresses the second setup unless the underlying setup/cleanup contract is correct.

**Q: What does `Too many re-renders` tell you, and how do you debug it?**

It tells you React hit its safety guard while trying to render, but the message is not necessarily the exact root-cause line. First search the component and recently changed children for setters invoked during render, including JSX mistakes such as `onClick={setOpen(true)}`. Then inspect effects that write state, their dependencies, object/function identity, and whether the state is merely derived. Add a render counter or log the specific state transition, use React DevTools to inspect the owner that is changing, and remove one feedback edge at a time.

**Q: Is `useMemo` or `useCallback` the general solution to render loops?**

No. They can stabilize an identity that genuinely belongs in a dependency comparison or prevent expensive recalculation, but they cannot repair an effect whose design updates its own trigger. Memoization also has its own dependency list, and a missing dependency can create a stale closure rather than a loop. First simplify the data flow and make the synchronization boundary correct; memoize only when the identity or computation cost justifies it.

## 6. The Traps — What Goes Wrong

**Calling a handler while rendering.** `onClick={setOpen(true)}` invokes the setter as JSX is evaluated; it does not register a handler. React then renders again and invokes it again. Use `onClick={() => setOpen(true)}` or pass a function whose signature already matches the event. The same mistake appears with `onChange={updateValue(value)}`.

**Adding an unconditional “sync” effect.** An effect such as `useEffect(() => setFullName(first + " " + last), [first, last])` adds a second render for a value already determined by the inputs. It may settle because the string eventually compares equal, but it is still unnecessary and can produce stale UI between renders. Compute `const fullName = first + " " + last` directly unless the state is intentionally editable.

**Fixing a loop by deleting dependencies.** An empty array can hide a loop while leaving the effect with the first render’s values. The result is often a stale token, old ID, or subscription that listens to the wrong room. Dependencies are a correctness contract, not a switch for silencing a linter. Restructure the effect or stabilize the real input instead.

**Memoizing every object and callback.** Blanket memoization makes dependency graphs harder to read and can preserve a reference while its captured values are wrong. It also does nothing for a child that is not memoized or an effect that should not exist. Use primitive dependencies where possible, and add memoization for a measured cost or a real identity requirement.

**Assuming every repeated render is infinite.** A parent update can render a child again; a state update can settle after one additional render; Strict Mode can intentionally repeat development work. The defining symptom is an unbounded feedback cycle or a safety error, not simply “the function ran twice.” Measure before optimizing.

**Updating state from an effect without handling request ownership.** A fetch can finish after the user has selected a different record. Cancellation or an ignore guard prevents old work from writing into the new render’s state. This is not necessarily an infinite loop, but the same unclear effect ownership often causes both bugs: work is not tied to the render/input that made it valid.

## 7. Compare With Related Concepts

**Render loop vs effect loop.** A render loop has a setter invoked while the component function is calculating JSX. An effect loop has a post-commit effect that changes a value which causes that effect to run again. Use the call site to classify it: event handlers and external synchronization are valid update boundaries; render-time writes are not.

**Infinite re-render vs stale closure.** An infinite loop runs new work too often because a feedback edge keeps firing. A stale closure runs old work with values captured by an earlier render, often because dependencies were omitted. Fix the first by breaking or guarding the feedback edge; fix the second by making ownership and dependencies honest.

**Derived value vs derived state.** A derived value is calculated from current inputs during render and has one source of truth. Derived state stores a copy and needs a synchronization policy, reset policy, or user-editing reason. Calculate during render by default; store it only when it has independent lifetime or ownership.

**Stable reference vs stable value.** `useMemo` and `useCallback` can keep an object or function reference stable, but that does not guarantee the logic is current. A stable callback with missing dependencies can still close over stale data. Stabilize identity only after deciding which values the operation must observe.

**Effect synchronization vs event handling.** An effect reacts to committed renders to keep an external system aligned. An event handler reacts to an explicit user action. Submit a form, start a download, or delete an item in the handler; subscribe to a WebSocket or synchronize a browser API in an effect with cleanup.

## 8. 🧠 The Memory Hook — What Sticks

Think of render as reading the whiteboard, not writing on it. Every state update must have a door that triggered it—usually a user event or an external synchronization—and every effect must stop when its real inputs stop changing; if the effect keeps changing its own trigger, you have built a microphone pointed at its speaker.
