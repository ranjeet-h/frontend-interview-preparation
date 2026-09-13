# `useMemo`: Memoizing Expensive Computations and Referential Stability

## 1. Why This Exists — The Problem First

Every time state changes in a React component, React re-executes the entire component function from the first line to the return statement. That's the deal. The whole function runs — every variable gets re-evaluated, every object literal gets re-allocated, every array gets re-created from scratch.

Most of the time this is fine and fast. But two specific scenarios make this default behavior actively harmful.

The first scenario: you have a data grid showing 10,000 transaction records. Inside the component, you filter by a search term, then sort by sales count, then compute a running total. Next to the table, you have a simple text input for a user note and a dark-mode toggle. When the user types a single character in the note field, the component re-renders. That means the filter + sort + reduce loops run again on all 10,000 records for a keystroke that has nothing to do with the data. In a 16.6ms frame budget, if that computation takes 15ms, typing stutters. The interface lags. The user blames the app.

The second scenario is subtler and bites even experienced developers. You construct a config object inside a component: `const chartConfig = { colorScheme, threshold };`. You pass it to a heavy chart component wrapped in `React.memo`, and you also have it in a `useEffect` dependency array. Here's the trap: every render creates a brand-new object at a new memory address. `{} !== {}` in JavaScript — two objects with identical contents are not equal unless they are literally the same reference. So `React.memo` sees a new prop reference and re-renders the chart anyway, defeating the entire point of memoization. The `useEffect` sees a new dependency reference and fires a network request on every keystroke — not just when the config actually changed. A single missed object reference can turn a page into an infinite loop of requests.

When developers discover these two problems, the overcorrection is just as damaging. They start wrapping every computed value — `const fullName = useMemo(() => first + ' ' + last, [first, last])`, `const isReady = useMemo(() => count > 0, [count])`. String concatenation is sub-microsecond work. Wrapping it in `useMemo` means allocating a closure function, allocating a dependency array, running a comparison loop, and holding references in the Fiber tree — all to save 0.001ms. You've made the code slower, harder to read, and more memory-hungry. You've solved nothing.

`useMemo` exists to solve the first two problems precisely, without falling into the third.

---

## 2. The Analogy — Make It Obvious

Think of a high-end restaurant kitchen. One dish on the menu requires a complex four-hour veal demi-glace — a reduction made by roasting bones, simmering with wine, and straining over hours. When an order comes in for that dish, the chef does not start from scratch every single time. Instead, the chef checks the walk-in cooler.

Is there already a batch of demi-glace in there? Have the source ingredients changed since it was last made — a new stock batch, a different wine? If nothing changed, the chef grabs the container straight from the shelf. Preparation takes one second instead of four hours.

Crucially, that container has a physical barcode badge on it. When the plating station — the memoized child component — receives the tray, it scans the badge to decide whether to re-plate the garnish. Because the container is the exact same physical object from last time, the badge scan confirms nothing changed and the station skips re-plating entirely. The reference identity is preserved.

Now imagine a line cook who takes a single pinch of table salt — a half-second job — then carefully puts it in a vacuum-sealed container, logs it in a digital inventory system with a timestamp, prints a barcode, and places it in the walk-in cooler. Then retrieves it five seconds later. The overhead of the system is ten times the cost of the work it was supposed to save. That is what `useMemo` does to trivial calculations.

In this analogy: the walk-in cooler is the Fiber node. The container is the cached `[value, deps]` tuple. The barcode is the stable memory reference. The chef's ingredient check is the `Object.is()` dependency comparison. And the line cook's salt fiasco is premature memoization.

---

## 3. How It Actually Works — The Full Explanation

When React renders a functional component, it creates an internal data structure called a Fiber node to represent that component instance. Attached to this Fiber is a linked list of hook objects — one node per hook call, in the exact order the hooks are called. This is why you can't call hooks conditionally: the order is the identity.

When React encounters `useMemo(calculateValue, deps)`, what it actually stores on the hook's `memoizedState` property is a two-element tuple: `[result, dependencies]`. On the first render — called the mount phase — React simply runs `calculateValue()`, stores `[result, deps]` in that hook slot, and returns `result` to the component.

On every subsequent render — the update phase — React reads the stored tuple back out of the Fiber. It then compares the new `deps` array you've passed against the stored `prevDeps` array, element by element, using `Object.is()`. This is a shallow comparison. It checks that the arrays are the same length and that `Object.is(prevDeps[i], nextDeps[i])` returns `true` for every index. `Object.is()` is nearly identical to strict equality (`===`) with two specific differences: it considers `NaN === NaN` to be `true` (where `===` does not), and it distinguishes `+0` from `-0` (where `===` does not). For day-to-day work, treat it as strict equality.

If every dependency matches, React skips calling `calculateValue()` entirely and immediately returns the `prevResult` already sitting in the Fiber. The cached value is returned as-is. This is the cache hit.

If any dependency changed under `Object.is()`, React calls `calculateValue()`, stores the new `[nextResult, nextDeps]` tuple back into `memoizedState`, and returns `nextResult`. This is the cache miss.

**The Two Purposes of `useMemo`**

The first purpose is caching expensive calculations. React's rule of thumb is anything over roughly 1ms. In a 60fps UI, your entire frame budget is 16.6ms — covering React rendering, style calculation, layout, paint, and compositing. If one computation inside a component costs 10ms, every unrelated state update that touches that component will blow the frame budget and cause visible stutter. `useMemo` gates that computation behind a dependency check so it only runs when the actual source data changes.

The second purpose is preserving referential equality. When you write `const options = { theme, limit }` inside a component, JavaScript creates a new object at a new memory address on every render. Even if `theme` and `limit` haven't changed, the object is a different reference. That breaks two things. First, a child component wrapped in `React.memo` compares props by reference — it sees `prevProps.options !== nextProps.options` and re-renders unnecessarily. Second, any `useEffect`, `useCallback`, or nested `useMemo` that has this object in its dependency array will fire on every render, because the dependency always looks new. `useMemo` keeps the same reference alive across renders until the actual primitive values inside change, so all downstream equality checks succeed.

**When `useMemo` Is Harmful**

Memoization is not free. Every `useMemo` call allocates a new closure function on every render (you're creating `() => ...` each time), allocates a new array for the dependencies on every render, runs a loop calling `Object.is()` on each dependency, and holds the cached value and previous dependency array as live references in the Fiber tree — increasing heap memory and Garbage Collection pressure.

For sub-millisecond operations — string concatenation, boolean checks, arithmetic, filtering a 5-element array — this overhead is larger than the computation itself. You've paid more to avoid doing something than the thing would have cost. The code is also harder to read and harder to refactor. This is the classic premature optimization trap.

The mental test is: could a profiler actually measure this computation? Would you see it costing frame time in React DevTools? If the answer is no, use a plain variable.

**The React Compiler (React 19)**

React 19 ships with an optional React Compiler that performs static analysis on your component code at build time. It identifies expressions, objects, and JSX subtrees that are safe to memoize and automatically injects low-level cache slots — without you writing a single `useMemo` call.

When the compiler is active, most manual `useMemo` and `useCallback` calls become redundant. You write idiomatic plain JavaScript and the compiler figures out what needs to be stable.

That said, you still need to understand `useMemo` deeply. The vast majority of production codebases are not yet using the compiler. Custom hook APIs still need to document and guarantee referential stability explicitly. And the underlying trade-off — memory footprint versus recomputation cost — is identical whether memoization is managed by you or by a compiler. The compiler handles the syntax, not the judgment call about what actually needs caching.

---

## 4. Real Code — See It Working

**Example 1: Caching an Expensive Data Transformation**

The key here is that `processedProducts` only recalculates when `products`, `selectedCategory`, or `searchTerm` change. Typing in the note field or toggling dark mode triggers a re-render, but the expensive filter + sort loop does not run again.

```tsx
import React, { useState, useMemo } from 'react';

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  salesCount: number;
}

interface ProductTableProps {
  products: Product[];
}

export function ProductTable({ products }: ProductTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [unrelatedCounter, setUnrelatedCounter] = useState(0);

  // This computation runs ONLY when products, selectedCategory, or searchTerm change.
  // Toggling dark mode or incrementing the counter does not re-run this.
  const processedProducts = useMemo(() => {
    const startTime = performance.now();

    const result = products
      .filter((product) => {
        const matchesCategory =
          selectedCategory === 'all' || product.category === selectedCategory;
        const matchesSearch = product.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => b.salesCount - a.salesCount);

    const duration = performance.now() - startTime;
    if (duration > 5) {
      // If you see this warning, the memoization is earning its keep.
      console.warn(`Heavy computation took ${duration.toFixed(2)}ms`);
    }

    return result;
  }, [products, selectedCategory, searchTerm]);

  return (
    <div className={isDarkMode ? 'theme-dark' : 'theme-light'}>
      <header>
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="all">All Categories</option>
          <option value="electronics">Electronics</option>
          <option value="audio">Audio</option>
        </select>
        <button onClick={() => setIsDarkMode((prev) => !prev)}>
          Toggle Theme (Instant — Skips Heavy Calculation)
        </button>
        <button onClick={() => setUnrelatedCounter((c) => c + 1)}>
          Clicks: {unrelatedCounter}
        </button>
      </header>

      <ul>
        {processedProducts.map((p) => (
          <li key={p.id}>
            {p.name} — ${p.price} ({p.salesCount} sold)
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Example 2: Referential Stability for `React.memo` and `useEffect`**

Without `useMemo`, the `chartConfig` object gets a new reference on every render — including when the user types in the note field. `React.memo` would re-render the heavy chart on every keystroke. The `useEffect` would fire a network request on every keystroke. With `useMemo`, the reference only changes when `colorScheme` or `threshold` actually change.

```tsx
import React, { useState, useMemo, useEffect, memo } from 'react';

interface ChartConfig {
  colorScheme: 'warm' | 'cool';
  threshold: number;
}

// React.memo does a shallow prop comparison: prevProps.config === nextProps.config
const HeavyAnalyticsChart = memo(function HeavyAnalyticsChart({
  config,
}: {
  config: ChartConfig;
}) {
  console.log('HeavyAnalyticsChart rendered'); // You want to see this as rarely as possible.
  return (
    <div className="chart-wrapper">
      <p>Theme: {config.colorScheme}</p>
      <p>Threshold: {config.threshold}</p>
    </div>
  );
});

export function AnalyticsDashboard() {
  const [threshold, setThreshold] = useState(100);
  const [colorScheme, setColorScheme] = useState<'warm' | 'cool'>('cool');
  const [textNote, setTextNote] = useState('');

  // Without useMemo: new object reference on every render.
  // Typing in textNote would cause HeavyAnalyticsChart to re-render and the effect to fire.
  // With useMemo: same reference until colorScheme or threshold actually changes.
  const chartConfig = useMemo<ChartConfig>(
    () => ({ colorScheme, threshold }),
    [colorScheme, threshold]
  );

  useEffect(() => {
    // With the stable chartConfig reference, this only fires when the config genuinely changes.
    // Without useMemo on chartConfig, this would fire on every render — including keystrokes.
    console.log('Syncing analytics config with external reporting API...');
  }, [chartConfig]);

  return (
    <div>
      <input
        type="text"
        placeholder="Type quick notes here..."
        value={textNote}
        onChange={(e) => setTextNote(e.target.value)}
      />
      <button onClick={() => setThreshold((t) => t + 10)}>
        Increase Threshold: {threshold}
      </button>
      <button
        onClick={() => setColorScheme((c) => (c === 'cool' ? 'warm' : 'cool'))}
      >
        Toggle Scheme
      </button>

      {/* Typing in textNote does NOT re-render this child because chartConfig is stable. */}
      <HeavyAnalyticsChart config={chartConfig} />
    </div>
  );
}
```

**Example 3: The Anti-Pattern Side by Side**

```tsx
import React from 'react';

interface UserProfileProps {
  firstName: string;
  lastName: string;
  items: Array<{ id: number; price: number }>;
}

// ❌ ANTI-PATTERN: premature optimization
// These are sub-microsecond operations. useMemo here adds overhead, not savings.
export function BadUserProfile({ firstName, lastName, items }: UserProfileProps) {
  const fullName = React.useMemo(
    () => `${firstName} ${lastName}`,
    [firstName, lastName]
  );

  const totalPrice = React.useMemo(
    () => items.reduce((sum, item) => sum + item.price, 0),
    [items]
  );

  const isEligibleForDiscount = React.useMemo(
    () => totalPrice > 100,
    [totalPrice]
  );

  return (
    <div>
      <h2>{fullName}</h2>
      <p>Total: ${totalPrice}</p>
      {isEligibleForDiscount && <span>Discount Applied!</span>}
    </div>
  );
}

// ✅ CLEAN & OPTIMAL: direct derived state during render
// These run in nanoseconds. Calculate them inline. No hooks, no memory pressure.
export function GoodUserProfile({ firstName, lastName, items }: UserProfileProps) {
  const fullName = `${firstName} ${lastName}`;
  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
  const isEligibleForDiscount = totalPrice > 100;

  return (
    <div>
      <h2>{fullName}</h2>
      <p>Total: ${totalPrice}</p>
      {isEligibleForDiscount && <span>Discount Applied!</span>}
    </div>
  );
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `useMemo` do, and what are its two distinct primary use cases?**

`useMemo` caches the return value of a function between renders and gives you back the same cached value whenever the dependencies haven't changed under `Object.is()`. When dependencies do change, it re-runs the function, stores the new result, and returns it.

The two genuinely distinct use cases are: first, skipping expensive computations — if a transformation over large data takes a measurable amount of time (roughly over 1ms), `useMemo` ensures it only re-runs when its source data changes, not when unrelated state updates trigger a re-render. Second, preserving referential stability — when objects or arrays are passed as props to `React.memo`-wrapped children or used in `useEffect` / `useCallback` / `useMemo` dependency arrays, React compares them by reference. A new object literal every render always fails equality checks. `useMemo` keeps the same reference alive until the contents actually change.

**Q: How does React actually compare dependencies internally?**

React stores a tuple `[cachedValue, prevDeps]` on the hook's `memoizedState` property in the Fiber node's linked list. On the update render, it reads that tuple back, takes the new `deps` array you passed, and walks through both arrays index by index calling `Object.is(prevDeps[i], nextDeps[i])`. If the lengths match and every comparison returns `true`, it returns `cachedValue` without touching the calculation function. If any comparison returns `false` — or if you passed no dependency array — it calls the function, replaces the stored tuple with the new `[result, deps]`, and returns the new result.

The key detail is that this is a shallow comparison. `Object.is` is effectively strict equality (`===`) with two edge-case corrections: `Object.is(NaN, NaN)` is `true` (unlike `===`), and `Object.is(+0, -0)` is `false` (unlike `===`). Objects and arrays inside dependency arrays are compared by reference, not by content. If you put an unmemoized object in a dependency array, it will look different on every render and the cache will never hit.

**Q: Why is wrapping every computed value in `useMemo` an anti-pattern?**

Because memoization has real, concrete costs that exceed the benefit for cheap operations.

Every `useMemo` call creates a new closure function on every render — the `() => ...` argument is allocated fresh each time. It also creates a new dependency array literal on every render. React then runs a comparison loop over that array, calling `Object.is()` on each element. And the Fiber node holds the cached value and previous dependency array as live references, increasing heap size and GC pressure.

For a string concatenation that takes 0.001ms, all that machinery takes longer than just doing the concatenation. You've made the render slower and the memory footprint larger. You've also made the code harder to read — a simple `const fullName = first + ' ' + last` now requires parsing four lines and a dependency array to understand.

Reserve `useMemo` for calculations that actually show up in a profiler, or for reference stability on values passed to memoized children.

**Q: How does `useMemo` differ from `useCallback` and `React.memo`?**

They memoize different things at different levels. `useMemo(() => value, deps)` caches the return value of the function — it runs the function and remembers what it returned. The memoized thing is the value: an object, array, number, string, or even JSX. `useCallback(fn, deps)` caches the function itself without calling it. It's literally equivalent to `useMemo(() => fn, deps)` — it just has a cleaner name that makes the intent obvious. `React.memo(Component)` is not a hook at all — it's a higher-order component that wraps a component definition and makes it compare its props shallowly before deciding whether to re-render. `useMemo` runs inside a component during render. `React.memo` wraps the component before it even renders.

The typical production pattern uses all three together: `React.memo` on the child, `useMemo` to keep object props stable, and `useCallback` to keep callback props stable. Remove any one of them and the chain breaks.

**Q: Can `useMemo` be used to trigger side effects or as a semantic guarantee?**

No on both counts.

React's documentation is explicit: `useMemo` is a performance optimization, not a semantic guarantee. React reserves the right to discard memoized values in the future — under memory pressure or in certain concurrent rendering scenarios — and recalculate them. If your application breaks when the memoized function runs more than once, you've misused `useMemo`.

And you absolutely must not trigger side effects inside `useMemo`. The calculation function runs during the render phase. Under Concurrent React, a component can render multiple times, pause mid-render, or have its render discarded entirely before React commits anything to the DOM. If you fire a network request or mutate global state inside `useMemo`, those operations run during these discarded renders. You'll get duplicate requests, memory leaks, and bugs that are nearly impossible to reproduce in development mode. Side effects go in `useEffect` or in event handlers. `useMemo` must be a pure function: same inputs, same output, nothing else observable.

**Q: How does the React Compiler in React 19 change how we think about `useMemo`?**

The React Compiler analyzes your component's abstract syntax tree at build time and automatically inserts memoization where it determines values or JSX are safe to cache. It generates low-level cache lookups that are faster than `useMemo` hook machinery because they're generated code without the hook abstraction overhead.

When the compiler is active in a project, most hand-written `useMemo` and `useCallback` calls become unnecessary. You write clean, straightforward JavaScript and the compiler handles stability.

But the vast majority of codebases in production today don't have the compiler enabled yet. Custom hooks still need to declare their referential stability contracts explicitly in their API design. And the performance reasoning — knowing when something is genuinely expensive versus trivially cheap — is unchanged by the compiler. The compiler eliminates the boilerplate; it doesn't replace the judgment call about what actually needs to be stable.

---

## 6. The Traps — What Goes Wrong

**Trap: Memoizing cheap primitives and making code slower**

The wrong assumption is that memoizing everything is always a safe choice — at worst it's a no-op, right? Wrong. For `const count = list.length` or `const name = user.first + ' ' + user.last`, the computation takes a fraction of a nanosecond. Calling `useMemo` means creating a closure, allocating a deps array, pushing onto the call stack, navigating the Fiber linked list, running a comparison loop, and retaining two objects in memory. The hook overhead is hundreds of times larger than the work it was meant to save. The code also becomes visually noisy, burying a trivially simple operation under four lines of ceremony.

The fix: calculate cheap derived values as plain variables directly during render. Only reach for `useMemo` when profiling in React DevTools shows the computation actually consuming measurable frame time, or when you need referential stability for a memoized child.

**Trap: Passing an unstable reference as a dependency, silently breaking the cache**

The wrong assumption is that because you added `useMemo`, the expensive computation won't re-run. But if any dependency in your array is itself an unstable reference — an object literal or array literal defined outside `useMemo` but inside the component body — `Object.is()` returns `false` on every single render. The cache misses every time. The expensive calculation runs on every render. You've paid the hook overhead on top of the calculation cost, gaining nothing.

```tsx
// ❌ BROKEN: options is a new object on every render.
// useMemo fires every render. You've added overhead without saving anything.
export function Report({ data, filterType }: { data: Item[]; filterType: string }) {
  const options = { type: filterType, active: true }; // new reference every render

  const processedData = useMemo(() => {
    return expensiveProcess(data, options);
  }, [data, options]); // options always fails Object.is()
}

// ✅ FIXED: Move the object construction inside the useMemo callback,
// and list only the stable primitive values as dependencies.
export function ReportFixed({ data, filterType }: { data: Item[]; filterType: string }) {
  const processedData = useMemo(() => {
    const options = { type: filterType, active: true }; // built inside, not a dependency
    return expensiveProcess(data, options);
  }, [data, filterType]); // primitives compared by value — stable when unchanged
}
```

**Trap: Expecting `useMemo` to prevent the component itself from re-rendering**

The wrong assumption: "I wrapped the expensive value in `useMemo` so the component won't re-render on every keystroke." But `useMemo` only skips the computation function — it has zero ability to prevent the parent component's function body from executing again. When parent state changes, the entire component function runs, including all the lines around `useMemo`. What `useMemo` saves is the execution of the callback inside it. The component still re-renders.

If you need to prevent a child component from re-rendering when its props haven't changed, that's `React.memo` on the child, combined with `useMemo` or `useCallback` in the parent to keep props referentially stable.

**Trap: Mutating the cached object returned by `useMemo`**

The wrong assumption: "The memoized object is just a regular variable — I can push to it or modify its properties." When you mutate the object returned by `useMemo` (`cachedArray.push(item)` or `cachedConfig.theme = 'dark'`), you are mutating the exact reference stored inside the Fiber's `memoizedState`. On the next render, React reads `prevResult` from the Fiber — but `prevResult` now contains your mutations. The dependency comparison might show nothing changed, so React returns the mutated stale value as if it were the fresh cached one. You break React's change detection, produce stale UI, and corrupt React DevTools time-travel debugging.

Always treat values returned by `useMemo` as strictly immutable. If you need a modified version, produce a new object: spread the original and change the field.

**Trap: Running side effects inside `useMemo`**

The wrong assumption: "I can fetch data or update localStorage inside `useMemo` because it only re-runs when dependencies change — it's essentially conditional execution." This fails catastrophically under Concurrent React. React can render a component multiple times before committing, can pause a render mid-way, or discard a render entirely. The `useMemo` function runs during these speculative renders. A `fetch()` call inside it will fire on every speculative render that React discards, duplicating network requests and leaking timers. `localStorage.setItem` calls will run in renders that never visibly commit.

Side effects live in `useEffect` or in event handlers. `useMemo`'s calculation function must be pure: given the same inputs, return the same output, with zero observable side effects on the outside world.

---

## 7. Compare With Related Concepts

| Concept | What It Memoizes | Primary Use Case | When to Choose |
| :--- | :--- | :--- | :--- |
| **`useMemo`** | The **return value** of a function | Expensive calculations (>1ms) or stable object/array references for downstream checks | Profiler shows a computation is costly, or an object/array is fed to `React.memo` children or hook deps |
| **`useCallback`** | A **function reference** | Keeping a callback's identity stable across renders | Passing event handlers or callbacks to `React.memo` children or hook dependency arrays |
| **`React.memo`** | A **rendered component subtree** | Skipping a child component re-render when props are shallowly equal | A child is expensive to render and its parent re-renders often with identical props |
| **Plain derived state** | Nothing — computed on every render | Cheap transformations of props or state | Everything that doesn't need memoization, which is most things |
| **`useRef`** | A mutable container (`{ current }`) | Persisting a value across renders without triggering re-renders | DOM refs, timer IDs, previous-value trackers, instance variables with no visual effect |

`useMemo` vs `useCallback` — if what you want to remember is a computed value (object, array, number, string, JSX), use `useMemo`. If what you want to remember is a function to call later without it changing reference, use `useCallback`. They're mechanically identical under the hood; the naming just clarifies intent.

`useMemo` vs plain derived state — if a profiler can measure the computation taking real frame time, or if the output is a non-primitive passed to a memoized child, use `useMemo`. If neither condition is true, which is the case for the vast majority of derived values in a typical component, compute it directly as a variable.

`useMemo` vs `useRef` — if the value is purely derived from props and state and is needed during render to produce output, use `useMemo`. If the value needs to persist and mutate across renders without triggering a re-render (timer IDs, imperative handle references, previous-render snapshots), use `useRef`.

---

## 8. 🧠 The Memory Hook

> **Freeze the four-hour veal demi-glace and preserve its barcode badge. Never build a refrigerated vault just to store a pinch of salt.**
>
> `useMemo` earns its keep in exactly two situations: when recomputing something would visibly cost frame time (a measurable >1ms loop), or when a non-primitive value's reference must stay identical across renders so that `React.memo` children or hook dependency arrays don't falsely see a change. Everything else — calculate it directly and move on.
