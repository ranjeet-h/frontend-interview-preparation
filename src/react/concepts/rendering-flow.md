# Rendering Flow in React (Trigger, Render, Commit)

## 1. Why This Exists — The Problem First

A team adds an API call or analytics tracking call directly inside the body of a React component because "it needs to run whenever the component updates." Under React 18 concurrent updates and fast tab switching, users report duplicate orders, and backend servers get hammered with five times the expected traffic. Another developer notices a list item component re-renders when a parent counter updates and panics, spending two sprints wrapping every single prop and handler in `useCallback` and `React.memo` under the false belief that every component render forces an expensive browser DOM reflow. Meanwhile, a third developer places a tooltip measurement inside `useEffect`, causing users to see a jarring visual glitch as the tooltip renders at coordinate (0, 0) before snapping into position a frame later.

Every one of these production bugs comes from treating React like a direct DOM manipulation library where running a component function immediately pushes pixels to the screen. 

React does not work that way. To write high-performance, predictable web applications, you have to understand the three-step pipeline React uses to translate state changes into pixels: **Trigger**, **Render**, and **Commit**, followed by the browser's own paint cycle.

## 2. The Analogy — Make It Obvious

Think of React's rendering flow as a high-end architectural firm and construction crew renovating a building:

1. **The Change Order (The Trigger):** You call the firm and request an update: "Replace the granite kitchen counter with quartz, and widen the dining room archway." You have not touched a single wall or spent money on physical building materials; you simply filed a request for work.
2. **The Blueprint Revision (The Render Phase):** The architect sits in the studio and drafts a new set of blueprints. They calculate load tolerances, review the structure, and test the layout digitally. If you call back two seconds later with a higher-priority change ("Wait, make the countertop oak wood instead!"), the architect crumples up the unfinished draft, throws it into the recycling bin, and starts a fresh drawing. No demolition occurred, no physical workers were paid, and no building materials were wasted.
3. **The Blueprint Diff (Reconciliation):** The architect compares the newly approved blueprint against the existing building plan. They find that only one counter and one archway need work; the other twelve rooms remain completely untouched.
4. **The Construction Crew (The Commit Phase):** The contractor and construction crew arrive on site with a strict, minimal work order. They synchronously replace the counter and widen the doorway. They work without interruption until the physical alterations are complete.
5. **The Final Inspection & Public Reveal (Browser Paint & Effects):**
   - **Internal Building Inspector (`useLayoutEffect`):** Before allowing the public inside, an inspector measures the doorway width with a laser gauge. If an adjustment is needed, they make it immediately while the doors remain closed.
   - **Opening the Doors (Browser Paint):** The doors open and visitors view the renovated space with their own eyes.
   - **Post-Move-In Routine (`useEffect`):** The homeowner stocks the refrigerator, turns on the Wi-Fi router, and files the project paperwork. These non-urgent tasks happen smoothly after the house is already open and in use.

## 3. How It Actually Works — The Full Explanation

React's runtime splits UI updates into distinct, orderly phases. Understanding what is allowed in each phase separates senior frontend engineers from developers who guess their way through performance debugging.

**Phase 1: Triggering a Render**

Every render cycle begins with a trigger. There are four primary sources:
- **Initial Mount:** When your application starts via `createRoot(rootElement).render(<App />)`.
- **State Updates:** When a component calls a state updater function (`useState` setter or `useReducer` dispatch).
- **Context Value Changes:** When a `<Context.Provider value={...}>` receives a new value reference, scheduling render work for all consuming descendant components.
- **Parent Re-renders:** When a parent component renders, all of its child components render by default, regardless of whether their props changed (unless wrapped in a memoization barrier like `React.memo`).

In React 18+, **Automatic Batching** groups multiple state updates triggered inside event handlers, `setTimeout`, Promises, and native event listeners into a single scheduled render pass. React places this work into a priority queue managed by the Fiber scheduler.

**Phase 2: The Render Phase (Calculation & Reconciliation)**

The Render phase is purely a calculation step. React traverses the Fiber tree, starting from the root or the updated component, and calls each component function to determine what the UI should look like.

- **Component Invocation:** React calls your functional component. The function executes, reads current props and state, evaluates expressions, and returns a tree of React Elements (plain JavaScript objects describing virtual UI nodes, such as `{ type: 'h1', props: { children: 'Dashboard' } }`).
- **Reconciliation (Diffing):** React compares the newly returned React Element tree against the existing Fiber tree from the previous render. It marks changed Fibers with internal flags (Placement, Update, Deletion).
- **Pure and Interruptible:** The Render phase performs zero DOM mutations and causes zero browser layout recalculations. In Concurrent React (such as updates scheduled with `startTransition` or Suspense data fetching), React can pause a low-priority render if a high-priority user interaction occurs (like typing in a text field), process the user event, and either resume or completely discard the draft render.
- **StrictMode Double-Invocation:** In development mode under `<React.StrictMode>`, React deliberately invokes every component render function twice. Because the render phase can be interrupted and restarted, component functions must be mathematically pure: same props and state must always produce the same JSX output without mutating external variables or causing side effects.

**Phase 3: The Commit Phase (DOM Mutation)**

Once the Render phase finishes and React has an exact list of diffs, it enters the Commit phase.

- **Synchronous Host DOM Mutation:** React mutates the real browser DOM. It inserts new DOM elements, updates attributes and event listeners, reorders nodes, and removes deleted elements in a single, synchronous, non-interruptible pass.
- **Ref Updates:** React attaches or detaches `ref` references to the updated DOM nodes.
- **Synchronous Layout Effects (`useLayoutEffect`):** Immediately after React updates the DOM tree, but before the browser calculates layout and paints pixels to the screen, React synchronously runs all `useLayoutEffect` cleanup and setup functions. This allows your code to read accurate DOM dimensions (like `getBoundingClientRect()`) and make synchronous DOM mutations before the user sees the frame.

**Phase 4: Browser Paint & Passive Effects**

Once the Commit phase completes and React releases the main JavaScript thread:

- **Browser Layout & Paint:** The browser calculates styles, computes geometric coordinates (Layout / Reflow), composites layers, and draws pixels onto the physical display (Paint). The user now sees the updated interface.
- **Passive Effects (`useEffect`):** After the browser has finished painting, React asynchronously executes `useEffect` cleanups and callbacks. Because these run after paint, operations like data fetching, WebSocket subscriptions, analytics logging, and timer setups do not delay visual frame delivery.

**Why Render Does Not Equal DOM Mutation**

This is the most critical concept in React: **rendering is calculation; committing is mutation**.

When a component re-renders, React simply executes a JavaScript function to generate a virtual descriptor. If the reconciliation algorithm determines that the returned JSX tree produces the exact same element types, attributes, and text as before, React skips the Commit phase entirely for those nodes. The component rendered (JavaScript ran), but zero DOM nodes were modified, zero layout reflows occurred, and zero pixels were repainted.

## 4. Real Code — See It Working

Here is a complete, runnable example tracing the execution timeline across Trigger, Render, Commit, Paint, and Effects.

```tsx
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';

export function RenderFlowInspector() {
  const [count, setCount] = useState(0);
  const [boxDimensions, setBoxDimensions] = useState({ width: 0, height: 0 });
  const boxRef = useRef<HTMLDivElement>(null);

  // 1. RENDER PHASE (Component body execution)
  // Runs whenever React calculates the UI output.
  // Must remain mathematically pure: no DOM writes, no network calls!
  console.log(`[1. RENDER PHASE] Function executed. Current count state: ${count}`);

  // 2. COMMIT PHASE (useLayoutEffect)
  // Fires synchronously after React updates DOM nodes, but BEFORE browser paint.
  useLayoutEffect(() => {
    if (boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      console.log(`[2. COMMIT PHASE - useLayoutEffect] DOM updated. Measured box width: ${rect.width}px`);
      
      // Reading DOM measurements here prevents visual layout flickering
      // If we update state here, React recalculates before the browser paints
    }
    return () => {
      console.log('[2. COMMIT PHASE - useLayoutEffect Cleanup] Cleaning previous layout effect');
    };
  }, [count]);

  // 3. POST-PAINT (useEffect)
  // Fires asynchronously AFTER the browser has drawn the pixels on screen.
  useEffect(() => {
    console.log(`[3. POST-PAINT - useEffect] Screen visible to user. Running passive effect for count: ${count}`);

    // Ideal for network requests, analytics, and non-visual side effects
    const timer = setTimeout(() => {
      console.log(`[Async Task] Logged count ${count} to telemetry`);
    }, 1000);

    return () => {
      console.log('[3. POST-PAINT - useEffect Cleanup] Cleaning previous effect timer');
      clearTimeout(timer);
    };
  }, [count]);

  const handleTriggerUpdate = () => {
    console.log('\n--- [TRIGGER] User Clicked Button ---');
    // Schedules a state update in the Fiber priority queue
    setCount((previous) => previous + 1);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <h2>React Rendering Flow Lifecycle</h2>
      <button 
        onClick={handleTriggerUpdate}
        style={{ padding: '10px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}
      >
        Trigger State Change (Count: {count})
      </button>

      <div
        ref={boxRef}
        style={{
          marginTop: '20px',
          padding: '20px',
          borderRadius: '8px',
          backgroundColor: count % 2 === 0 ? '#dbeafe' : '#fef3c7',
          border: '1px solid #cbd5e1',
          transition: 'background-color 0.15s ease'
        }}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>
          Observed DOM Box — Rendered with Count: {count}
        </p>
      </div>
    </div>
  );
}
```

Now, let's examine why a parent re-render does not automatically translate into a DOM mutation for its children:

```tsx
import React, { useState } from 'react';

// Child component without memoization
function StaticChild({ label }: { label: string }) {
  // This runs every time Parent renders (Render phase work)
  console.log(`[Child Render] Calculating virtual output for: ${label}`);
  
  // However, because the returned DOM structure and text are identical,
  // React's reconciliation diff marks 0 DOM mutations during Commit!
  return <div style={{ marginTop: '8px', color: '#475569' }}>Child: {label}</div>;
}

export function ParentCounter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={() => setCount((c) => c + 1)}>
        Increment Parent Counter: {count}
      </button>
      {/* StaticChild re-renders (JS execution), but incurs zero DOM reflow overhead */}
      <StaticChild label="Fixed Header Item" />
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What exact sequence of events occurs from calling `setState` to pixels appearing on the screen?**

The entire lifecycle follows five clear stages:
1. **Trigger & Schedule:** Calling `setState` queues a state update on the component's Fiber node. In React 18+, updates are automatically batched and scheduled in the Fiber scheduler with an assigned lane priority.
2. **Render Phase:** React executes the component function (and any non-memoized child components) with the new state to generate a new tree of React Element objects.
3. **Reconciliation:** React diffs the new Element tree against the previous Fiber tree to identify changes, attaching mutation flags (Placement, Update, Deletion) to modified Fibers.
4. **Commit Phase:** React synchronously walks the flagged Fiber tree and applies minimal DOM mutations to the host environment. Once DOM operations finish, `useLayoutEffect` cleanup and setup callbacks execute synchronously.
5. **Browser Paint & Passive Effects:** React yields the main thread to the browser. The browser calculates layout geometry and paints physical pixels. Once painting is complete, React asynchronously fires `useEffect` cleanup and setup callbacks.

**Q: Does every component re-render cause a DOM reflow or repaint?**

No. Re-rendering a component means React executes the component's JavaScript function to calculate a new virtual DOM description. The browser DOM is only touched during the subsequent Commit phase if reconciliation detects differences between the new and old output. If the element types, props, and children are identical, React commits zero changes to the host DOM. A component can re-render dozens of times while causing zero browser style calculations, zero layout reflows, and zero pixel repaints.

**Q: What is the technical difference between the Render phase and the Commit phase?**

The Render phase is asynchronous, interruptible, and pure. It calculates descriptions of the UI, generates React Element trees, and performs diffing. Because it touches no real DOM, React's Concurrent scheduler can pause, abort, or restart the Render phase without visual consequences. In contrast, the Commit phase is synchronous and uninterruptible. It applies calculated mutations to the actual browser DOM, updates refs, and runs layout effects. Once the Commit phase begins, it must complete in a single execution burst to prevent tearing or half-updated UI states.

**Q: Why does React 18 render components twice in development mode under StrictMode?**

React deliberately double-invokes component functions, state initializers, and effect hooks in development to uncover unintended side effects in the Render phase. In Concurrent React, render passes can be aborted and restarted when higher-priority events arrive. If a component function contains side effects (such as mutating a shared variable, modifying an array prop, or setting global state), the second render will produce inconsistent data. StrictMode forces these impurities to surface immediately during local development before they cause subtle bugs in production.

**Q: When should you use `useLayoutEffect` instead of `useEffect`?**

Use `useLayoutEffect` exclusively when you need to read layout properties from the DOM (such as `offsetWidth`, `getBoundingClientRect()`, or scroll coordinates) and synchronously make immediate DOM mutations or state adjustments before the user sees the screen. Because `useLayoutEffect` runs synchronously before the browser paints, your changes are included in the very first visual frame, completely preventing visual flickering (layout shift). For all other side effects — including API calls, event subscriptions, analytics logging, and state updates that do not impact layout measurements — use `useEffect` to avoid blocking browser painting.

**Q: How does Automatic Batching in React 18 impact the rendering flow?**

In React 17 and earlier, React only batched multiple state updates inside synthetic React event handlers (like `onClick`). Updates inside `setTimeout`, Promises, or native event listeners triggered separate, sequential render and commit passes for every single `setState` call. In React 18, Automatic Batching groups all state updates occurring within the same event loop tick into a single render and commit pass regardless of origin, reducing unnecessary CPU calculation and redundant render passes.

## 6. The Traps — What Goes Wrong

**Trap 1: Executing Side Effects Directly in the Component Body**

- *The Wrong Assumption:* Placing `fetch()`, `localStorage.setItem()`, or mutations directly in the component function body assuming it runs "once per update."
- *Why It Fails:* The Render phase must be mathematically pure. Because React may invoke render functions multiple times during concurrent transitions, StrictMode checks, or Suspense retries, side effects in the body execute repeatedly, resulting in duplicate API requests, memory leaks, and infinite loops.
- *The Fix:* Move data fetching and external mutations into `useEffect` or dedicated event handlers.

```tsx
// ❌ WRONG: Side effect executed during the render phase
function UserProfile({ userId }: { userId: string }) {
  fetch(`/api/users/${userId}`); // Fires multiple times on concurrent renders or StrictMode!
  return <div>Profile</div>;
}

// ✅ CORRECT: Side effect isolated to post-paint passive effect
function UserProfile({ userId }: { userId: string }) {
  useEffect(() => {
    fetch(`/api/users/${userId}`);
  }, [userId]);
  return <div>Profile</div>;
}
```

**Trap 2: Expecting State Variables to Update Synchronously on the Next Line**

- *The Wrong Assumption:* Assuming `setCount(count + 1)` immediately mutates the `count` variable on the very next line of code.
- *Why It Fails:* `setState` does not mutate the current local variable; it schedules an update for the *next* render cycle. The current function execution retains the snapshot value of `count` from the moment the render occurred.
- *The Fix:* If subsequent calculations require the updated value, calculate it in a local constant or use the functional updater form `setCount(prev => prev + 1)`.

```tsx
// ❌ WRONG: Expecting synchronous mutation
function Counter() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);
    console.log(count); // Still logs 0!
  };
}

// ✅ CORRECT: Use local variable or functional updater
function Counter() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    const nextCount = count + 1;
    setCount(nextCount);
    console.log(nextCount); // Accurately reflects 1
  };
}
```

**Trap 3: Measuring DOM Geometry in `useEffect` Causing Visible Layout Flicker**

- *The Wrong Assumption:* Using `useEffect` to position floating elements, tooltips, or popovers relative to a target element.
- *Why It Fails:* `useEffect` runs asynchronously *after* the browser has already calculated layout and painted pixels. The user sees the tooltip render at default coordinates (0,0) for one frame, and then suddenly jump to the target position when `useEffect` fires, causing an annoying visual glitch.
- *The Fix:* Use `useLayoutEffect` so that measurement and repositioning occur synchronously before the browser paints the frame.

**Trap 4: Blanket Memoization Out of Fear of Virtual DOM Rendering**

- *The Wrong Assumption:* Believing every component render is a heavy performance bottleneck, leading to wrapping every single function component in `React.memo` and every primitive callback in `useCallback`.
- *Why It Fails:* React's Render phase for simple components is lightweight JavaScript calculation. The shallow comparison of props in `React.memo` and dependency checks in `useCallback` consume memory and CPU cycles. When applied blindly to trivial components, memoization overhead often costs more than the render calculation it prevents.
- *The Fix:* Use the React DevTools Profiler to identify genuine render bottlenecks before introducing memoization boundaries.

## 7. Compare With Related Concepts

**Render Phase vs Commit Phase**
- *The Difference:* The Render phase is pure calculation where React invokes components and reconciles virtual element trees (can be paused or discarded in Concurrent React); the Commit phase is the synchronous, non-interruptible application of diffs to the real browser DOM.
- *One-Line Rule:* Render computes what needs to change; Commit applies those changes to the browser.

**React Commit vs Browser Paint**
- *The Difference:* React Commit mutates the in-memory DOM tree and runs layout effects; Browser Paint is the browser's subsequent internal process of computing geometry (Reflow) and rasterizing visual pixels to the screen.
- *One-Line Rule:* React Commit updates HTML nodes in memory; Browser Paint draws colored pixels on the physical monitor.

**Rendering vs Reconciliation vs Mounting**
- *The Difference:* Rendering is the execution of a component function to produce JSX descriptors; Reconciliation is the diffing algorithm comparing old and new Fiber trees; Mounting is the complete first-time lifecycle of initializing, rendering, and inserting a brand-new component into the DOM.
- *One-Line Rule:* Rendering creates descriptions, Reconciliation computes diffs, and Mounting performs the initial insertion.

**`useLayoutEffect` vs `useEffect`**
- *The Difference:* `useLayoutEffect` runs synchronously immediately after DOM mutations before browser paint (blocks the screen); `useEffect` runs asynchronously after the browser paints (does not block visual rendering).
- *One-Line Rule:* Use `useLayoutEffect` for DOM layout measurements that alter visual styles; use `useEffect` for all standard, non-blocking side effects.

## 8. 🧠 The Memory Hook — What Sticks

Render is the architect drawing blueprints at a desk; Commit is the construction crew hammering nails on site; Paint is the homeowner walking through the front door. 

A thousand blueprint revisions cost zero physical building supplies until the architect hands the final diff to the crew.
