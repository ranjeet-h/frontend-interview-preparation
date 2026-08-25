# React DevTools and Performance Profiling

## 1. Why This Exists — The Problem First

Your team just shipped a complex analytics dashboard with interactive data grids, filter bars, and charts. A few days later, customer tickets roll in: typing a single letter into a search input freezes the UI for 150 milliseconds, and toggling a checkbox causes visible frame stutter.

You open the browser's standard DevTools Elements panel. All you see is a massive, opaque soup of thousands of nested `<div>`, `<span>`, and `<button>` tags. The DOM inspector cannot tell you which React component rendered those tags, what props were passed to them, which `useState` hook triggered the update, or whether an ancestor Context Provider forced 40 unrelated child components to recalculate.

Without proper tooling, developers resort to desperation debugging:
- Scattering 50 `console.log("Rendered CustomerTable", props)` statements across dozens of files, flooding the terminal with noisy, unusable logs.
- Blindly wrapping arbitrary components in `React.memo` and random handlers in `useCallback`, praying the stutter goes away—only to find the lag unchanged because an ancestor created an unstable object reference.
- Guessing which component is slow rather than measuring actual execution cost.

React DevTools and the React Profiler exist to eliminate this guesswork. React maintains an internal tree of Fiber nodes—complete with state queues, hook linked lists, props, and commit schedules—that operates entirely outside the browser's native DOM inspector. React DevTools bridges this gap by plugging directly into React's Fiber runtime, giving you complete visibility into component hierarchies, live state inspection, and millisecond-accurate render profiling.

## 2. The Analogy — Make It Obvious

Think of debugging a modern React application like diagnosing a high-performance sports car with engine trouble.

Opening the browser's native DOM Elements panel is like popping the car's hood and staring at the engine block with your bare eyes. You can see the physical parts (DOM elements), but you cannot see the fuel-air mixture, valve timing, or electrical pulses firing through the wiring harness.

React DevTools gives you two specialized diagnostic instruments:

1. **The Components Tab is the OBD-II Diagnostic Scanner.** You plug a scanner directly into the car's Engine Control Unit (ECU). The scanner reads live sensor data: throttle position, fuel trim, and coolant temperature (props, state, hooks, and context). You can even use the scanner to manually adjust parameters on the fly—like forcing the fuel pump to a different pressure—to test how the engine behaves without turning a single wrench.

2. **The Profiler Tab is the Dynamometer (Dyno) Run with High-Speed Telemetry.** You strap the car onto the dyno rollers, hit "Record", floor the accelerator pedal (trigger the slow UI interaction), and hit "Stop". The dyno software does not give you vague guesses; it generates a millisecond-by-millisecond telemetry breakdown. It shows you the exact cylinder that misfired (the flamegraph), ranks every engine component by how much horsepower it consumed (ranked view), and tells you the exact sensor reading that triggered the injection cycle ("Why did this render?").

3. **The `<Profiler>` API is the In-Cabin Flight Telemetry Box.** Instead of waiting for a mechanic to plug in an external scanner, you install a small, permanent telemetry black box in the vehicle that measures track times and automatically beams performance regressions back to your monitoring servers.

## 3. How It Actually Works — The Full Explanation

React DevTools connects directly to the React reconciler using a global bridge protocol. Understanding this runtime handshake is essential for knowing what the tool can see and what its limitations are.

### The Engine Bridge: `__REACT_DEVTOOLS_GLOBAL_HOOK__`
Before your application's JavaScript bundles load, the React DevTools browser extension injects a global object onto the window called `__REACT_DEVTOOLS_GLOBAL_HOOK__`. When `react-dom` initializes in your bundle, it checks for the existence of this global hook.

If found, React calls `hook.inject(rendererInternals)`, handing DevTools direct access to its internal reconciler. Through this bridge, DevTools listens to every Fiber root mount, commit phase, and state transition. It traverses the Fiber tree by walking the `child`, `sibling`, and `return` pointers, reading each Fiber's `memoizedProps`, `memoizedState`, and hook linked list.

### The Components Tab: Deep Component Inspection
The Components tab represents the live Fiber hierarchy as a clean, component-level tree rather than raw HTML elements.

Key capabilities include:
- **Props, State, and Hooks Inspection:** Clicking any component displays its current props, internal state values, and hook chain in the right-hand panel. DevTools inspects the hook linked list in order (`useState`, `useReducer`, `useMemo`, `useRef`) and formats custom hooks with labels provided by `useDebugValue`.
- **Live State and Prop Mutation:** You can click directly into any prop or state value in the panel, change a boolean or string, and press Enter. DevTools immediately schedules a state update on that Fiber, allowing you to test edge cases, error states, or permission gates without editing code or restarting the app.
- **The Magic `$r` Console Shortcut:** When you select a component in the tree, DevTools assigns that component's underlying Fiber instance or class ref to the global variable `$r` in the browser console. You can switch to the Console tab and immediately run `$r.props`, `$r.state`, or call its methods programmatically.
- **"Highlight updates when components render":** Located in DevTools Settings (the gear icon) under General. When enabled, React paints temporary colored rectangular outlines on the actual screen whenever a component commits to the DOM. Green indicates infrequent updates, yellow indicates moderate frequency, and red indicates rapid, repetitive updates (ideal for spotting accidental infinite loops or keyboard input thrashing).
- **Component Filtering:** You can filter out host DOM nodes (`div`, `span`), third-party library wrappers, or components matching regex patterns to keep the tree readable.

### The Profiler Tab: Measuring Render Cost
The Profiler tab records performance data during user interactions to locate bottlenecks. It focuses on the React commit lifecycle:

1. **Commit Bar Chart:** At the top right of the profiler, every user interaction that triggered a DOM commit appears as a vertical bar. The height and color of each bar represent how long that commit took to render and commit. Tall yellow/orange bars represent expensive commits; short teal bars represent fast commits. You can click any bar to inspect that specific commit.
2. **The Flamegraph View:** Visualizes the component tree for the selected commit.
   - **Width:** Represents how long the component (and its children) spent rendering (`actualDuration`). A wider bar means more time spent.
   - **Vertical Stacking:** Represents the component hierarchy (parents at the top, children nested below).
   - **Color:** Indicates how long the component took relative to the rest of the commit. Gray components did not render during this commit (they successfully bailed out via `React.memo` or unchanged state). Teal/blue components rendered quickly. Yellow/orange components took the most time.
3. **The Ranked View:** Flattens the entire component tree and sorts every component that rendered in that commit from longest render time to shortest render time. This is the fastest way to find the single component dragging down your frame rate.
4. **"Record why each component rendered":** This is the single most important setting in DevTools. Under Profiler Settings -> General, check "Record why each component rendered while profiling." When active, clicking on any rendered component in the Flamegraph or Ranked view will display a tooltip explaining the exact trigger:
   - "Props changed: [items, onItemSelect]"
   - "State changed: [searchQuery]"
   - "Context changed: [CartContext]"
   - "The parent component rendered"

### The Programmatic `<Profiler>` API
React provides a built-in `<Profiler>` component that can be wrapped around any part of your JSX tree to programmatically collect render metrics without requiring the browser extension.

It accepts an `id` and an `onRender` callback function. Every time a component inside the tree commits an update, React executes the callback with detailed timing parameters:
- `id`: The string ID prop of the `<Profiler>` boundary.
- `phase`: Either `"mount"` (initial render) or `"update"` (re-render).
- `actualDuration`: Time in milliseconds spent rendering the `<Profiler>` boundary and its descendants for this current update. This reflects how effectively memoization is skipping work.
- `baseDuration`: Estimated time in milliseconds to render the entire subtree from scratch with zero memoization. Comparing `actualDuration` against `baseDuration` tells you exactly how much time your memoization saved.
- `startTime`: Timestamp when React began rendering this commit.
- `commitTime`: Timestamp when React committed this update to the DOM.

### Profiling in Production Mode: The `react-dom/profiling` Bundle
A common trap is profiling an application in development mode. Development builds are 3x to 10x slower than production builds because of development-only overhead:
- React StrictMode intentionally double-invoking render functions, reducers, and initializers.
- Runtime `PropTypes` validations and hook dependency array checks.
- Un-minified code and missing compiler optimizations.
- Extra warning and debugging checks running on every Fiber.

However, standard production builds strip out all DevTools profiling hooks and timing measurements to minimize bundle size.

To get 100% accurate, real-world profiling data, you must create a **Production Profiling Build**. This uses the minified, optimized production React build while keeping profiling instrumentation enabled:
- In **Vite**, you configure an alias that maps `react-dom/client` to `react-dom/profiling` and `scheduler/tracing-profiling`.
- In **Webpack**, you alias `react-dom$` to `react-dom/profiling`.
- In **Next.js**, you run your build with the `--profile` flag (`next build --profile`).

## 4. Real Code — See It Working

### Example 1: Programmatic Profiling with `<Profiler>` and Telemetry Logging
This example shows how to wrap a critical feature tree with `<Profiler>` to track real-world render performance and send slow renders to your monitoring system.

```tsx
import React, { Profiler, ProfilerOnRenderCallback, useState, memo } from "react";

// Types for our custom performance metric payload
interface RenderMetric {
  treeId: string;
  phase: "mount" | "update";
  actualDurationMs: number;
  baseDurationMs: number;
  timeSavedMs: number;
  commitTime: number;
}

// Telemetry reporter that sends metrics to your observability backend (e.g., Datadog, Sentry)
function reportPerformanceMetrics(metric: RenderMetric) {
  // Only alert if render duration exceeds a budget (e.g., 16ms for a 60fps frame budget)
  if (metric.actualDurationMs > 16) {
    console.warn(`[PERF ALERT] Slow commit in ${metric.treeId}:`, metric);
  } else {
    console.log(`[PERF LOG] ${metric.treeId} rendered cleanly:`, metric);
  }
}

// The onRender callback signature matching React's ProfilerOnRenderCallback
const handleProfileRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  const metric: RenderMetric = {
    treeId: id,
    phase,
    actualDurationMs: Number(actualDuration.toFixed(2)),
    baseDurationMs: Number(baseDuration.toFixed(2)),
    timeSavedMs: Number((baseDuration - actualDuration).toFixed(2)),
    commitTime,
  };

  reportPerformanceMetrics(metric);
};

// Expensive child component simulating heavy list rendering
const ExpensiveDataGrid = memo(function ExpensiveDataGrid({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (item: string) => void;
}) {
  // Artificial heavy computation simulating complex row calculations
  const start = performance.now();
  while (performance.now() - start < 12) {
    // Artificial 12ms block to simulate expensive rendering
  }

  return (
    <ul style={{ maxHeight: "200px", overflowY: "auto" }}>
      {items.map((item) => (
        <li key={item} onClick={() => onSelect(item)}>
          {item}
        </li>
      ))}
    </ul>
  );
});

export function AnalyticsDashboard() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [items] = useState(() =>
    Array.from({ length: 500 }, (_, i) => `Dashboard Metric Item #${i + 1}`)
  );

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2>Analytics Telemetry Dashboard</h2>

      {/* Input outside the expensive profiler tree */}
      <input
        type="text"
        placeholder="Type to filter..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ padding: "8px", marginBottom: "16px", width: "300px" }}
      />

      <p>Current Selection: {selected ?? "None"}</p>

      {/* Wrap the performance-sensitive subtree with the Profiler */}
      <Profiler id="AnalyticsDataGridTree" onRender={handleProfileRender}>
        <ExpensiveDataGrid
          items={items}
          onSelect={(item) => setSelected(item)}
        />
      </Profiler>
    </div>
  );
}
```

### Example 2: Diagnosing and Fixing Unstable References with DevTools Profiler
Here is the classic production scenario that DevTools helps solve: a parent component passes an inline function or object to a memoized child, defeating `React.memo`.

```tsx
import React, { useState, useCallback, useMemo, memo } from "react";

interface ProductItem {
  id: number;
  name: string;
  price: number;
}

// 1. Memoized child component. It should only re-render if product or onAddToCart changes.
const ProductCard = memo(function ProductCard({
  product,
  config,
  onAddToCart,
}: {
  product: ProductItem;
  config: { currency: string; taxRate: number };
  onAddToCart: (id: number) => void;
}) {
  console.log(`[Render] ProductCard ID: ${product.id}`);
  return (
    <div style={{ border: "1px solid #ccc", margin: "8px", padding: "8px" }}>
      <h4>{product.name}</h4>
      <p>
        Price: {config.currency}
        {(product.price * (1 + config.taxRate)).toFixed(2)}
      </p>
      <button onClick={() => onAddToCart(product.id)}>Add to Cart</button>
    </div>
  );
});

// 2. The Parent Component with BOTH Broken and Optimized Patterns
export function Storefront() {
  const [cartCount, setCartCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const products: ProductItem[] = useMemo(
    () => [
      { id: 1, name: "Mechanical Keyboard", price: 150 },
      { id: 2, name: "Ergonomic Mouse", price: 80 },
    ],
    []
  );

  // -------------------------------------------------------------
  // THE BUG (What DevTools Profiler flags as "Props changed"):
  // Passing config={{ currency: "$", taxRate: 0.1 }} creates a NEW object reference on every render.
  // Passing () => setCartCount(c => c + 1) creates a NEW function reference on every render.
  // -------------------------------------------------------------

  // THE FIX: Stabilize object and callback references
  const stableConfig = useMemo(() => ({ currency: "$", taxRate: 0.1 }), []);

  const handleAddToCart = useCallback((productId: number) => {
    console.log(`Added product ${productId} to cart`);
    setCartCount((prev) => prev + 1);
  }, []);

  return (
    <div style={{ padding: "16px" }}>
      <h3>Storefront (Cart Items: {cartCount})</h3>

      {/* Typing in this search box re-renders Storefront */}
      <input
        type="text"
        placeholder="Search catalog..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div style={{ display: "flex", marginTop: "16px" }}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            config={stableConfig} // Stable reference: prevents re-render when typing in search
            onAddToCart={handleAddToCart} // Stable callback: prevents re-render when typing in search
          />
        ))}
      </div>
    </div>
  );
}
```

### Example 3: Configuring Vite and Webpack for Production Profiling
To enable profiling in a minified production build, configure your bundler to alias the profiling packages.

**Vite Configuration (`vite.config.ts`):**
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isProfiling = mode === "profiling";

  return {
    plugins: [react()],
    resolve: {
      alias: isProfiling
        ? {
            "react-dom/client": "react-dom/profiling",
            "scheduler/tracing-profiling": "scheduler/tracing-profiling",
          }
        : {},
    },
  };
});
```

**Webpack Configuration (`webpack.config.js`):**
```js
module.exports = (env, argv) => {
  const isProfiling = argv.profile === true;

  return {
    resolve: {
      alias: isProfiling
        ? {
            "react-dom$": "react-dom/profiling",
            "scheduler/tracing": "scheduler/tracing-profiling",
          }
        : {},
    },
  };
};
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does React DevTools connect to the running React application under the hood?**

React DevTools injects a global object called `__REACT_DEVTOOLS_GLOBAL_HOOK__` onto the browser's `window` object before any application scripts run. When the application loads and `react-dom` initializes, React checks `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`. If present, React calls `hook.inject(rendererInternals)` and registers its reconciler instance. 

Through this registration, DevTools hooks into the reconciler's commit phase. Every time React completes a render cycle and commits updates to the DOM, it notifies the DevTools hook with the root Fiber node. DevTools then walks the Fiber linked tree (`child`, `sibling`, `return`) to extract component names, hooks, props, state, and render timing metrics.

**Q: What is the difference between `actualDuration` and `baseDuration` in the React Profiler?**

`actualDuration` is the time in milliseconds that React spent rendering the `<Profiler>` boundary and its children during that *specific* commit. If child components are wrapped in `React.memo` or their state did not change, React skips rendering them, resulting in a small `actualDuration`.

`baseDuration` is an estimate of how many milliseconds it would take to render the entire `<Profiler>` subtree from scratch if no memoization existed (the worst-case cost). 

Comparing the two metrics tells you how well your optimizations are working:
- If `actualDuration` is significantly smaller than `baseDuration`, your memoization strategy (`React.memo`, `useMemo`, `useCallback`) is actively saving render time.
- If `actualDuration` is nearly equal to `baseDuration`, every component in the tree is re-executing from scratch on every commit.

**Q: Why should you never measure production performance solely in development mode?**

Development builds of React are fundamentally unoptimized and run significantly slower than production builds. In development:
1. React Strict Mode intentionally invokes component render functions, reducers, and initial state factories twice to help developers detect side effects.
2. React runs hundreds of runtime invariant checks, PropTypes validations, and hook dependency checks on every render pass.
3. Code is unminified and full of debugging metadata that degrades CPU cache performance and V8 JIT optimization.
4. DevTools itself adds synchronization overhead in development mode.

A component that takes 15ms to render in development might take only 0.8ms in a production build. Optimizing code based on development timings leads to premature optimization and wasted engineering effort. You should always measure performance using a dedicated production profiling build (`react-dom/profiling`).

**Q: How do you use the Profiler to diagnose why a component re-rendered when it was wrapped in `React.memo`?**

First, open React DevTools Settings (gear icon) -> Profiler tab, and check **"Record why each component rendered while profiling."**

Next, start recording in the Profiler tab, perform the interaction that triggers the re-render, and stop recording. Click on the commit in the timeline, and select the memoized component in the Flamegraph or Ranked view.

The right-hand panel will display the exact reason for the render under "Why did this render?":
1. **"Props changed":** DevTools will list the exact keys whose values changed (e.g., `style`, `onClick`, `data`). You can then inspect the component in the Components tab to see if an object literal, inline array, or unmemoized callback was passed by the parent, breaking shallow reference equality (`Object.is`).
2. **"State changed":** An internal hook inside the component triggered a state transition.
3. **"Context changed":** A `useContext` hook consumed a Context Provider whose value changed, which bypasses `React.memo` entirely.

**Q: What is the difference between the Flamegraph view and the Ranked view in the React Profiler?**

The **Flamegraph view** preserves the hierarchical tree structure of your components for a single commit. The top bar is the root component, and children are nested underneath. Bar width represents how long that component and its subtree took to render, while bar color indicates relative cost (gray = did not render, teal = fast, yellow = slow). It is best for understanding parent-child cascading renders and structural bottlenecks.

The **Ranked view** flattens the tree and sorts every component that rendered in that commit by its individual render duration from slowest to fastest. It completely ignores hierarchy. The Ranked view is best for instantly identifying the single most expensive component in a commit so you know exactly where to begin your optimization work.

**Q: How do you determine whether a performance lag is caused by React rendering versus browser paint and layout reflow?**

You correlate React DevTools Profiler with the browser's native **Chrome DevTools Performance panel**:
- **React Profiler** measures purely the JavaScript execution time of React's Render phase (component functions running, virtual DOM diffing) and Commit phase (React applying mutations to the DOM and scheduling layout effects).
- **Chrome Performance Panel** measures the entire browser pipeline: JavaScript execution, Style Recalculations, Layout (reflow), Layer Painting, and GPU Compositing.

If the React Profiler reports that a commit took only 2ms, but the browser freezes for 100ms, the bottleneck is not React's virtual DOM—it is browser Layout and Paint thrashing (e.g., querying `offsetWidth` in a layout effect, forcing synchronous reflows, or rendering 10,000 DOM nodes without list virtualization).

## 6. The Traps — What Goes Wrong

### Trap 1: Profiling in Development Mode and Panicking Over Numbers
- **The Mistake:** Recording a profile in `npm run dev`, seeing a component render take 24ms, and spending three days refactoring it with complex memoization structures.
- **Why It's Wrong:** Development builds include React 18/19 StrictMode double-rendering, runtime prop validation, un-minified code, and full Fiber validation checks. The 24ms number is an artifact of the development environment.
- **What Happens:** You write bloated, hard-to-maintain memoization code to fix a problem that would have executed in 1.2ms in a real production build.
- **The Fix:** Create a production profiling build using `react-dom/profiling` before deciding whether a render duration constitutes a genuine bottleneck.

### Trap 2: Obsessing Over Render Count Instead of Render Cost
- **The Mistake:** Enabling "Highlight updates when components render", seeing 30 components flash green on every keystroke, and assuming the app is broken.
- **Why It's Wrong:** React is designed to re-render virtual DOM nodes rapidly. Thirty lightweight functional components returning simple HTML elements might take a combined 0.3ms to render and produce zero DOM mutations.
- **What Happens:** Developers spend weeks adding `useCallback` and `useMemo` everywhere, increasing memory consumption and code complexity without improving frame rates by even 1 millisecond.
- **The Fix:** Only optimize components that are both re-rendering unnecessarily **and** have a measurable render cost (e.g., > 10ms of blocking JavaScript or thousands of rendered child nodes).

### Trap 3: Missing the "Record Why Each Component Rendered" Setting
- **The Mistake:** Profiling an interaction, clicking on a yellow component, and staring at the duration bar wondering why it re-rendered when its props look identical in the Components tab.
- **Why It's Wrong:** By default, DevTools does not retain the previous commit's prop and state references to save memory. Without the setting enabled, it cannot show diffs.
- **What Happens:** Developers guess at what changed between renders, often misdiagnosing the root cause.
- **The Fix:** Open DevTools Settings -> Profiler -> check "Record why each component rendered while profiling" before starting any recording session.

### Trap 4: Expecting `React.memo` to Block Context Updates
- **The Mistake:** Wrapping a component in `React.memo` and expecting it to skip rendering when an ancestor Context Provider updates.
- **Why It's Wrong:** `React.memo` only checks incoming **props**. If the component calls `useContext(MyContext)` or `useSelector`, any change to that context value immediately forces the component to re-render, completely bypassing `React.memo`.
- **What Happens:** The component continues to re-render on every context tick. Developers assume `React.memo` is "broken."
- **The Fix:** Split large context objects into smaller, granular contexts (e.g., `UserActionsContext` vs `UserDataContext`), or wrap the inner heavy JSX in a memoized child component that receives only primitive props.

### Trap 5: Misinterpreting Destructured and Renamed Props
- **The Mistake:** Looking for a prop named `userTitle` in the DevTools panel because the component declared `function Card({ title: userTitle })`.
- **Why It's Wrong:** DevTools inspects the Fiber's `memoizedProps` object passed by the parent, not the local variable names destructured inside the component scope.
- **What Happens:** Developers assume props are missing or not being forwarded properly.
- **The Fix:** Always look for the exact prop key defined by the parent JSX attribute (`<Card title="Admin" />` shows as `title` in DevTools).

## 7. Compare With Related Concepts

| Feature / Tool | Primary Purpose | What It Can See | What It Cannot See | When to Use |
| :--- | :--- | :--- | :--- | :--- |
| **React DevTools Components Tab** | Live tree inspection & state debugging | Props, internal state, hook lists, Context values, source Fiber | Render duration in milliseconds, historical commit timelines | Inspecting live data flow, verifying props, testing UI with live state mutation |
| **React DevTools Profiler Tab** | React render performance analysis | Millisecond render time, Flamegraphs, Ranked costs, "Why did this render?" | Browser Paint, Layout reflows, network latency, garbage collection | Finding expensive React components and eliminating wasted re-renders |
| **Chrome DevTools Performance Panel** | Whole-browser runtime profiling | JS call stack, Long Tasks (>50ms), Layout, Paint, Composite, Frames | React component names (unless sourcemaps match), hook state, props | Diagnosing browser jank, layout thrashing, paint bottlenecks, memory leaks |
| **Programmatic `<Profiler>` API** | Automated telemetry & regression testing | `actualDuration`, `baseDuration`, mount vs update phase | Interactive UI visualizer, live prop mutation | Sending production performance metrics to Datadog/Sentry or running CI perf tests |
| **Flamegraph View** | Structural render visualization | Tree hierarchy, parent-child render cascades, subtree render costs | Quick identification of the single most expensive leaf component | Understanding how an update cascades down through nested layout trees |
| **Ranked View** | Bottleneck identification | Sorted list of components from highest render duration to lowest | Component parent-child hierarchy and nesting relationships | Finding the #1 slowest component in a commit in under two seconds |

## 8. 🧠 The Memory Hook

**Components Tab is your live X-Ray; Profiler Tab is your Dyno test.**

Use the **Components Tab** to inspect what data is inside a component *right now*. Use the **Profiler Tab** with *"Record why each component rendered"* enabled to measure how many milliseconds that component stole from the main thread and the exact prop reference that caused it. Measure in production mode before you optimize, because React in development mode is intentionally lying to you.

