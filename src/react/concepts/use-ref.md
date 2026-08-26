# `useRef`: Mutable References and Persistent Identifiers

## 1. Why This Exists — The Problem First

You are building a real-time trading dashboard with an auto-saving document editor. Every second, `setInterval` fires and you need to track that timer ID so you can clear it when the user clicks Pause or navigates away.

The obvious move is to store it in state: `const [timerId, setTimerId] = useState(null)`. So you call `setTimerId(id)` when the interval starts. React sees a state update, schedules reconciliation, diffs the Virtual DOM tree, evaluates child components, and flushes the commit to the screen — all to remember a plain integer that has zero visual representation anywhere on screen. Do this for every interval handle, animation frame ID, WebSocket client instance, and audio context across your app and you have introduced a wall of phantom re-renders that stutter the UI under load.

So you reach for a plain JavaScript variable: `let timerId = null`. Except every render re-executes your component function from top to bottom, wiping that variable back to `null`. Your interval handle is gone. You now have orphaned intervals accumulating in memory every time the component renders. If you move it out to module scope — `let globalTimerId = null` above the function — then every instance of the component on the page shares the exact same variable. Mount two timers and they overwrite each other's IDs and collide.

There is also a second class of problem that state and local variables cannot solve at all. You need to imperatively focus an input on a validation error. You need to measure an element's rendered size with `getBoundingClientRect()`. You need to hand a raw DOM node to a third-party chart library that has no idea React exists. Declarative props cannot do this — you need a stable, persistent pointer to a real browser node.

`useRef` solves both problems: it gives a specific component instance its own isolated memory cell that survives every render without ever notifying React when its contents change.

## 2. The Analogy — Make It Obvious

Think of your component function as an actor performing a live stage play in a theater. The audience watching from their seats is the browser screen — what they see is the rendered DOM.

`useState` is a costume change performed on stage. The moment the actor changes costumes, the audience notices. The lights shift, the scene updates, everyone reacts. That is a re-render.

A local variable like `let x = 1` inside the component is a thought the actor has while performing their lines. The moment they exit the stage between scenes, that thought is gone. Next scene — fresh mind, blank slate.

A module-level variable `let globalX = 1` declared outside the component function is writing on the communal backstage chalkboard. If three actors are playing the same role in three separate auditoriums in the same building, all three read and overwrite the same chalkboard. The notes collide and the messages make no sense to anyone.

`useRef` is the actor's personal pocket notebook. It belongs strictly to that actor's jacket — tied to the specific component instance, not shared with any other. Inside the notebook is one page labeled `.current`. The actor can jot down notes whenever they want: "timer ID is 42," "previous scroll position was 350px," "the canvas node is located here." Scribbling in that notebook does not make the stage lights flash or the audience stir — there is no re-render. And when the actor comes back for the next scene, they reach into their pocket and find the same notebook with exactly what they last wrote, completely intact.

The notebook identity never changes. The actor never gets a different notebook between scenes. Only the ink on the `.current` page changes.

## 3. How It Actually Works — The Full Explanation

When React mounts a functional component for the first time, it creates an internal data structure called a **Fiber node** to represent that component instance. A Fiber is React's unit of work — it tracks the component's type, props, pending updates, and, critically for us, a singly linked list of hook records stored under `fiber.memoizedState`. Every hook call your component makes — `useState`, `useEffect`, `useRef`, and so on — gets one slot in that linked list, in the exact order the hooks were called. This is why React requires hooks to always be called in the same order: it uses position in the list, not a name, to match each hook call to its stored record across renders.

When React encounters `useRef(initialValue)` for the very first time during mount, it runs the `mountRef` path internally. It allocates one plain JavaScript object — `{ current: initialValue }` — stores it in the hook slot's `memoizedState` field, and returns that object to your component. That object now lives in memory tied to this Fiber node, not inside the function body.

On every subsequent render, React runs `updateRef` instead. It walks the linked list, finds the hook slot at the same position, and returns the exact same object it created on mount — no new allocation, no re-reading of `initialValue`. The reference is identical: `Object.is(refFromRender1, refFromRender2)` is `true`. This property is called **reference stability**: the ref object's identity is effectively immutable for the lifetime of the component instance. Only the `.current` property inside it ever changes.

Now here is why mutating `.current` causes no re-render. React's reconciler only schedules re-renders when an update is dispatched through its internal update queue. When you call `setState(newValue)`, React internally calls `dispatchAction`, puts an update payload on the Fiber's update queue, marks the Fiber with a dirty lane priority, and notifies the scheduler. React is fully informed and responds accordingly.

`useRef` returns an ordinary, unproxied JavaScript object. There are no getters or setters on `.current`. There are no Proxy traps. No `Object.defineProperty` with a side effect. When you write `countRef.current = countRef.current + 1`, you are doing a plain property assignment on a plain object. JavaScript executes it, the value updates in memory, and React receives zero notification. The screen does not change.

For DOM refs, the attachment timing is what surprises most people. When you write `<input ref={inputRef} />`, React records the relationship between this ref object and this Fiber node during the Render Phase. But it does not touch the browser DOM during rendering. The Render Phase is where React figures out what should change — it builds or updates the Fiber tree, runs component functions, and computes diffs. In Concurrent React, this phase can be paused, restarted, or discarded entirely without committing anything to the screen.

The actual DOM assignment happens during the **Commit Phase**. After the diff is computed, React applies mutations to the real DOM in one synchronous pass. Right after it inserts or updates a DOM node, it assigns that node to `ref.current`. If a node is being removed, React first sets `ref.current = null` before tearing it down. Once the DOM mutations are done and refs are attached, `useLayoutEffect` fires synchronously with `ref.current` fully populated. Then the browser paints. Then `useEffect` fires, also with `ref.current` ready.

```
[ Render Phase ]  ──> React calls Component() ──> ref.current is null (or holds old DOM)
        │
[ Commit Phase ]  ──> React creates real DOM node
        │         ──> React assigns: ref.current = HTMLInputElement
        │         ──> useLayoutEffect runs (ref.current is ready)
        │
[ Browser Paint]  ──> Screen updates visually
        │
[ Effects Phase]  ──> useEffect runs (ref.current is ready)
```

This is why reading a DOM ref inside your component function body during the initial mount gives you `null` — the DOM node literally does not exist yet at that point in time. It only exists after the Commit Phase. Inside an event handler or an effect, the node is always ready.

The two primary patterns this machinery enables are: (1) **DOM manipulation** — focus, scroll, size measurement, or handing the node to an imperative library; and (2) **instance variables** — mutable memory that persists across renders without triggering them. Timer IDs, interval handles, animation frame references, previous prop values, external client instances, and render-tracking flags all belong here.

The `usePrevious` pattern illustrates the Commit Phase timing precisely. On render N, `usePrevious(value)` returns `ref.current` — the value from render N-1 — because the effect that would update it has not run yet. React commits render N to the DOM, then the effect fires and sets `ref.current = value` to the current render's value. On render N+1, `ref.current` holds the value from render N. That one-render lag is intentional, driven entirely by when effects run relative to commits.

## 4. Real Code — See It Working

**Storing timer IDs as instance variables**

The interval ID is pure bookkeeping — no UI depends on knowing its value. Storing it in state would cause a phantom re-render every time the timer starts or stops. The displayed seconds count goes in state because the screen must reflect it; the handle managing that interval goes in a ref.

```tsx
import React, { useState, useRef, useEffect } from "react";

export function Stopwatch() {
  const [seconds, setSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // The interval ID is pure bookkeeping. No UI depends on knowing its value.
  // useState would cause a pointless re-render when the timer starts.
  const intervalIdRef = useRef<number | null>(null);

  const startTimer = () => {
    if (intervalIdRef.current !== null) return; // guard against duplicate intervals

    setIsRunning(true);
    intervalIdRef.current = window.setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalIdRef.current !== null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null; // mark as idle so startTimer can run again
      setIsRunning(false);
    }
  };

  const resetTimer = () => {
    stopTimer();
    setSeconds(0);
  };

  // Clean up on unmount — without this, navigating away leaves an active interval
  // incrementing state on an unmounted component, which causes a React warning.
  useEffect(() => {
    return () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
      }
    };
  }, []);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h2>Timer: {seconds}s</h2>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={startTimer} disabled={isRunning}>Start</button>
        <button onClick={stopTimer} disabled={!isRunning}>Stop</button>
        <button onClick={resetTimer}>Reset</button>
      </div>
    </div>
  );
}
```

**Direct DOM access: focus management and layout measurement**

The ref gives you a direct handle to the real DOM node. Reading it inside event handlers is always safe because the Commit Phase has already completed by the time any user interaction fires.

```tsx
import React, { useRef, useState } from "react";

export function AutoFocusSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxDimensions, setBoxDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleFocusClick = () => {
    // Safe to read here — event handlers always run after the Commit Phase.
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // highlight the text
    }
  };

  const handleMeasureClick = () => {
    if (boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      setBoxDimensions({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "400px" }}>
      <input
        ref={inputRef}
        type="text"
        defaultValue="Edit this search query..."
        style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
      />
      <button onClick={handleFocusClick}>Focus and Select Input</button>

      <div
        ref={boxRef}
        style={{
          padding: "2rem",
          backgroundColor: "#f0f4f8",
          border: "1px dashed #0070f3",
          borderRadius: "8px",
          textAlign: "center",
        }}
      >
        Resizable Container
      </div>
      <button onClick={handleMeasureClick}>Measure Box Dimensions</button>

      {boxDimensions && (
        <p>Measured: {boxDimensions.width}px wide by {boxDimensions.height}px high</p>
      )}
    </div>
  );
}
```

**`usePrevious` — tracking the previous value of any state or prop**

This is the canonical example of refs carrying information across render cycles. The timing subtlety: during render N, `ref.current` still holds render N-1's value because the effect that would update it has not run yet. After commit, the effect updates the ref silently for next time.

```tsx
import React, { useState, useRef, useEffect } from "react";

// Returns whatever `value` was on the previous render.
// On the very first render it returns undefined because nothing came before it.
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  // Effects run AFTER commit. So during render, ref.current is the OLD value.
  // After commit, this effect updates ref.current to the NEW value for next render.
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

export function PriceTracker({ currentPrice }: { currentPrice: number }) {
  const prevPrice = usePrevious(currentPrice);
  const priceDirection =
    prevPrice !== undefined
      ? currentPrice > prevPrice
        ? "▲ UP"
        : currentPrice < prevPrice
        ? "▼ DOWN"
        : "— FLAT"
      : "INITIAL";

  return (
    <div>
      <h3>Current Price: ${currentPrice.toFixed(2)}</h3>
      <p>Previous Price: ${prevPrice !== undefined ? prevPrice.toFixed(2) : "N/A"}</p>
      <p>Trend: {priceDirection}</p>
    </div>
  );
}
```

**Solving stale closures with a ref**

A callback created inside a render closes over the state of that render. If it executes asynchronously later, state may have changed but the callback still reads the old snapshot. Storing the latest value in a ref breaks the closure's dependency on its creation-time snapshot.

```tsx
import React, { useState, useRef, useEffect } from "react";

export function LiveSearch() {
  const [query, setQuery] = useState("");
  // The ref always holds the most recent query, even inside an async callback
  // that was created in a previous render with a stale query value.
  const latestQueryRef = useRef(query);

  useEffect(() => {
    latestQueryRef.current = query;
  }, [query]);

  const handleSearch = () => {
    // Simulated slow network request. Without the ref, `query` inside setTimeout
    // is frozen at whatever value it was when handleSearch was called. The ref
    // reads whatever query is right now, when the timeout actually fires.
    setTimeout(() => {
      console.log("Searching for:", latestQueryRef.current); // always fresh
    }, 2000);
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a query..."
      />
      <button onClick={handleSearch}>Search</button>
    </div>
  );
}
```

**Lazy initialization of expensive ref values**

`useRef` has no initializer function overload. The expression you pass is evaluated by JavaScript before `useRef` even sees it — on every render.

```tsx
// ❌ new HeavyService() runs and is garbage-collected on every single render
const serviceRef = useRef(new HeavyService());

// ✅ Only created once — the null check gates instantiation to the first access
const serviceRef = useRef<HeavyService | null>(null);

function getService(): HeavyService {
  if (serviceRef.current === null) {
    serviceRef.current = new HeavyService();
  }
  return serviceRef.current;
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `useRef` and how does it work under the hood in React Fiber?**

`useRef` returns a plain JavaScript object `{ current: initialValue }` that is stored in the component's Fiber node under `fiber.memoizedState`. During the mount phase (`mountRef`), React allocates this object once and saves it to the hook slot. On every subsequent render (`updateRef`), React walks the hook linked list, finds the matching slot by position, and returns the exact same object — no new allocation, same memory address.

Because the object's identity never changes across renders, mutating `.current` is a direct in-memory mutation. It bypasses React's scheduler entirely, meaning it never triggers reconciliation or component re-renders.

**Q: Why does mutating `ref.current` never trigger a re-render, whereas calling a `useState` setter does?**

When you call `setState(newValue)`, React invokes `dispatchAction`, which places an update payload onto the Fiber's `updateQueue` and marks the Fiber with a dirty lane priority. React's scheduler then schedules a re-render task on the event loop to reconcile the new state against the old tree.

With `useRef`, the returned object is an ordinary JavaScript object without any internal getters, setters, or Proxies. Writing `ref.current = 10` is an ordinary JavaScript assignment. React has no listener attached to the object and receives no notification that a property changed, so no work is scheduled.

**Q: When during the component lifecycle does React attach and detach DOM nodes to a ref?**

React attaches and detaches DOM nodes strictly during the **Commit Phase**, never during the Render Phase.

On unmounting or ref retargeting, React sets `ref.current = null` before tearing down the DOM node. Then it creates or updates the underlying browser DOM elements. Then it synchronously assigns the actual DOM node to `ref.current`. Next, `useLayoutEffect` runs with `ref.current` guaranteed to be populated. After the browser paints the frame, `useEffect` callbacks run with `ref.current` available.

During the initial render function execution, `ref.current` for a DOM element is always `null` because the browser DOM node has not been instantiated yet.

**Q: Why is it dangerous to read or write `ref.current` during the render phase in Concurrent React?**

The render phase in Concurrent React can be paused, restarted, or discarded entirely. With features like `useTransition` and Suspense, React renders components speculatively — computing what the tree would look like without committing to the screen. If a higher-priority user event arrives mid-render, React throws away the in-progress work and starts over.

If you write to `ref.current` during render, the discarded speculative render already mutated the ref. Even though React threw away those render results, the ref now holds a value that reflects a render that never committed — state that is out of sync with the visible UI.

If you read from `ref.current` during render, different components in the same render pass execute at different moments, reading the ref before or after another component has mutated it. Two components that should see the same world see different values. The screen tears visually.

The rule is absolute: only read or write `ref.current` inside event handlers, `useEffect`, `useLayoutEffect`, or functions called from within them.

**Q: What is the difference between `useRef` and `React.createRef`?**

`createRef` is a factory function that creates a new `{ current: null }` object every time it is called. In class components, calling it inside `constructor()` ran once per instance, which worked correctly. In functional components, calling `createRef()` inside the function body generates a brand new object on every render, immediately discarding the old one and resetting `.current` to `null`. The ref cannot persist.

`useRef` leverages the Fiber hook storage to guarantee the exact same object is returned across every render of that component instance. Use `createRef` only in class component constructors. Use `useRef` in all functional components.

**Q: How does `useRef` solve the stale closure problem in async effects and callbacks?**

Closures capture variables from the lexical scope in which they were created. A callback created inside `useEffect` or `useCallback` captures the state and props of that specific render cycle. If it executes asynchronously — in a `setTimeout`, a WebSocket message handler, or a network response — it still reads the old snapshot even though state has updated.

By storing the latest value in a ref (`latestValueRef.current = value`) via an effect after every render, async callbacks can read `latestValueRef.current` at the exact moment of execution. Because the ref object identity never changes and `.current` is always updated to the freshest value, the callback bypasses the closure snapshot and accesses real-time data.

**Q: What is a Callback Ref and when must you use it instead of `useRef`?**

A Callback Ref is a function passed to the `ref` prop instead of a ref object:

```tsx
<div ref={(node) => { if (node) setElementHeight(node.getBoundingClientRect().height); }} />
```

You must use a Callback Ref when you need to be **notified the exact moment a DOM node attaches or detaches**. A `useRef` object is passive — React silently sets `.current` to the node during commit, but your component receives no notification. If a DOM node mounts conditionally (`{isOpen && <Modal ref={ref} />}`), a parent reading `ref.current` in an effect may miss the timing entirely. A Callback Ref executes immediately during the Commit Phase when the node attaches (passed the node) or detaches (passed `null`), letting you trigger measurements or state updates right at that moment.

**Q: How do you lazily initialize an expensive initial value in `useRef`?**

Unlike `useState(() => expensiveComputation())`, `useRef` does not accept an initializer function. The expression `useRef(new ExpensiveClient())` evaluates `new ExpensiveClient()` before `useRef` is called — on every render — even though React only uses the result on mount and discards it on all subsequent renders.

Use a `null` sentinel pattern:

```tsx
const clientRef = useRef<ExpensiveClient | null>(null);

function getClient(): ExpensiveClient {
  if (clientRef.current === null) {
    clientRef.current = new ExpensiveClient();
  }
  return clientRef.current;
}
```

## 6. The Traps — What Goes Wrong

**Trap: Mutating or reading `ref.current` during the render body**

The wrong assumption is that refs work like local scratchpads during rendering. A common example is tracking render counts:

```tsx
// ❌ WRONG: Mutating ref during render
function BrokenCounter() {
  const renderCount = useRef(0);
  renderCount.current += 1; // Side effect during render!

  return <div>Render count: {renderCount.current}</div>;
}
```

In Concurrent React, if a speculative render is interrupted and discarded, `renderCount.current` has already incremented even though nothing committed. The count is permanently corrupted. Move the mutation into a `useEffect`:

```tsx
// ✅ CORRECT: Mutate inside an effect — only after a real committed render
function AccurateCounter() {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
  });

  return <div>Component mounted or updated</div>;
}
```

**Trap: Using `useRef` for data that directly drives the UI**

The wrong assumption: using `useRef` as a performance optimization to avoid re-renders when updating text or UI elements.

```tsx
// ❌ WRONG: Changing ref does not update the screen
function BrokenInput() {
  const textRef = useRef("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    textRef.current = e.target.value; // UI will NOT update
  };

  return <input onChange={handleChange} />;
}
```

Mutating `.current` does not notify React or schedule reconciliation. The screen will stay empty or display stale data until some unrelated state update forces a re-render. If a value affects the visual output, it belongs in `useState`. If it is internal bookkeeping, it belongs in `useRef`. There is no middle ground.

**Trap: Passing expensive constructors directly to `useRef`**

```tsx
// ❌ WRONG: new HeavyService() runs on every single render
function Dashboard() {
  const serviceRef = useRef(new HeavyService());
}
```

The expression `new HeavyService()` is evaluated by JavaScript before `useRef` is called. On every re-render, a new `HeavyService` instance is instantiated in memory and immediately garbage collected, wasting CPU and memory. Use the null-sentinel lazy initialization pattern shown in the code section.

**Trap: Relying on `useRef` to react to conditional DOM element mounting**

```tsx
// ❌ WRONG: React does not trigger effects when ref.current changes
function ConditionalMeasure() {
  const [show, setShow] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (elementRef.current) {
      console.log(elementRef.current.offsetHeight);
    }
  }, [elementRef.current]); // React does NOT observe ref.current changes!
}
```

`ref.current` is not reactive. Placing `elementRef.current` in the dependency array does nothing — mutations to `.current` never trigger a dependency diff because they never cause a re-render. Use a Callback Ref instead:

```tsx
// ✅ CORRECT: Callback ref fires immediately when node mounts
function ConditionalMeasure() {
  const [show, setShow] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  const measureRef = React.useCallback((node: HTMLDivElement | null) => {
    if (node !== null) setHeight(node.getBoundingClientRect().height);
  }, []);

  return <div ref={measureRef}>Content to measure</div>;
}
```

## 7. Compare With Related Concepts

| Feature / Concept | `useRef` | `useState` | Local Variable (`let x`) | Module Variable (`let x` outside) | `React.createRef` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Persists Across Renders?** | Yes | Yes | No (re-allocated each render) | Yes | No (in functional components) |
| **Triggers Re-render on Change?** | No | Yes | No | No | No |
| **Instance Isolation?** | Yes (scoped to Fiber instance) | Yes (scoped to Fiber instance) | Yes (scoped to function execution) | **No** (shared across all instances globally) | Yes |
| **Update Mechanism** | Synchronous property mutation (`ref.current = v`) | Asynchronous dispatched setter (`setVal(v)`) | Plain assignment | Plain assignment | Plain assignment |
| **Primary Use Case** | DOM nodes, timer IDs, non-visual state, previous values | UI data that affects visual output | Intermediate render-phase calculations | Global singletons / constants | Class component constructors |

The selection rules to internalize:

- **`useRef` vs `useState`:** If changing the value should immediately update what the user sees on the screen, use `useState`. If changing the value is invisible bookkeeping that must survive renders, use `useRef`.
- **`useRef` vs Component `let`:** If the value must survive when the component re-renders, use `useRef`. If it is a temporary intermediate calculation needed only for this single render pass, use `let`.
- **`useRef` vs Module `let`:** Always use `useRef` for component instance data. Module-level variables leak state across multiple component instances and break server-side rendering (SSR).
- **`useRef` vs Callback Ref:** Use `useRef` for general DOM queries in event handlers or effects. Use a Callback Ref when you need code to execute immediately upon a DOM node's physical mount or unmount.

## 8. 🧠 The Memory Hook

`useRef` is a **mutable escape hatch from React's render cycle**. The object's identity never changes — same box, every render, forever. Only the thing inside the box changes. And because React has no listener on that box, changing the contents rings no bells.

Ask one question when you reach for it: "Does the user need to see this value change on screen?" If yes — `useState`. If no — `useRef`.
