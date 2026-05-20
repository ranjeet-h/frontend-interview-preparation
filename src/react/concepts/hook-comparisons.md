# Hook Comparisons

## Detailed explanation
Hook comparisons help decide which hook fits a problem instead of choosing by habit. Common interview comparisons include `useReducer` vs `useState`, `useRef` vs `useState`, and `useMemo` vs `useCallback`.

The best answers explain ownership and effect: Does the value drive UI? Are transitions complex? Is identity stability needed? Is the goal to cache a value or a function?

## 1. One-line mental model
Choose hooks by the kind of value, update, and rendering behavior you need.

## 2. Problem it solves
Using the wrong hook creates overcomplicated state, stale UI, unnecessary renders, or misleading optimizations.

## 3. Core idea
- `useState` handles simple local state.
- `useReducer` handles complex transitions.
- `useRef` stores mutable values without rendering.
- `useMemo` caches calculated values.
- `useCallback` caches function references.

## 4. Visual / analogy
Hooks are tools: screwdriver, wrench, and measuring tape solve different problems.

```txt
Drives UI?          useState/useReducer
Mutable no render?  useRef
Cache value?        useMemo
Cache function?     useCallback
```

## 5. Minimal example

```tsx
const [open, setOpen] = React.useState(false);
const timerRef = React.useRef<number | null>(null);
```

## 6. Real-world example

```tsx
const visibleRows = React.useMemo(() => filterRows(rows, filters), [rows, filters]);
const handleSelect = React.useCallback((id: string) => selectRow(id), [selectRow]);
```

## 7. Common interview questions
#### `useReducer` vs `useState`?
- **The Engine Mechanism (Why it behaves this way):** Both hooks store state in the Fiber node's `memoizedState`. `useState` is internally implemented as `useReducer` with a simple reducer that replaces the state. The difference is in the update API: `useState` accepts a direct value or functional updater, while `useReducer` accepts an action object that a reducer function interprets. `useReducer` is more powerful for complex state transitions because the reducer encapsulates all transition logic in one place, making it easier to test and reason about.
- **The Unforgettable Mental Model:** The **Light Switch vs. the Control Panel**. `useState` is a light switch — on or off, simple. `useReducer` is a control panel with labeled buttons — each button (action) triggers a specific, documented sequence of changes.
- **The Trap:** Using `useReducer` for simple boolean or string state. The overhead of defining action types, a reducer function, and dispatch calls is unnecessary for trivial state. Conversely, using `useState` for complex state with multiple interdependent fields leads to scattered update logic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `useState` is best for simple, independent values — booleans, strings, numbers. `useReducer` shines when state has complex transitions, multiple interdependent fields, or when the next state depends on the previous state in non-trivial ways. `useReducer` also makes testing easier since the reducer is a pure function I can test in isolation. I choose based on complexity: simple state gets `useState`, complex state machines get `useReducer`."

#### `useRef` vs `useState`?
- **The Engine Mechanism (Why it behaves this way):** Both store values that persist across renders, but they interact with React's rendering cycle differently. `useState` stores values in `memoizedState` and triggers a re-render when updated via its setter. `useRef` stores values in a mutable `.current` property that React ignores — updating it never triggers a re-render. `useState` values are captured in closures during render; `useRef` values are read live at access time. `useState` is for values that drive UI; `useRef` is for values that don't.
- **The Unforgettable Mental Model:** The **Billboard vs. the Backstage Monitor**. `useState` is a billboard — when it changes, everyone sees it (re-render). `useRef` is a backstage monitor — only the crew (code that reads it) sees the change, and the audience (UI) is unaffected.
- **The Trap:** Using refs for values that should drive UI. If a value affects what's rendered, it must be state. Using a ref means the component won't re-render when the value changes, causing the UI to show stale data.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The key question is: does this value drive what's on screen? If yes, use `useState` — updates trigger re-renders so the UI stays in sync. If no, use `useRef` — it stores values silently without causing renders. I use refs for timer IDs, DOM node references, previous values, and mutable timing data. I use state for anything the user sees or interacts with."

#### `useMemo` vs `useCallback`?
- **The Engine Mechanism (Why it behaves this way):** Both hooks store values in the Fiber node's `memoizedState` and recompute only when dependencies change. `useMemo` caches the result of a computation: `useMemo(() => expensive(), [deps])`. `useCallback` caches a function reference: `useCallback(fn, [deps])`. Under the hood, `useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`. The difference is semantic: `useMemo` is for computed values, `useCallback` is for function identity stability.
- **The Unforgettable Mental Model:** The **Cached Answer vs. the Signed Contract**. `useMemo` caches an answer to a math problem — you don't re-solve it unless the numbers change. `useCallback` caches a signed contract — the signature (function reference) stays the same so recipients trust it hasn't changed.
- **The Trap:** Using `useCallback` when the function isn't passed to memoized children or used as a dependency. If the function is only used in the current component's JSX, memoizing it adds overhead without benefit.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `useMemo` caches a computed value — it avoids re-running expensive calculations. `useCallback` caches a function reference — it prevents the function from getting a new identity on every render. Both use dependency-based memoization internally. I use `useMemo` for expensive derived values and stable object references. I use `useCallback` when passing functions to memoized children or using them as effect dependencies."

#### When not to use `useMemo`?
- **The Engine Mechanism (Why it behaves this way):** `useMemo` has overhead: React stores the dependencies, compares them with `Object.is` on every render, and manages the memoized value. For cheap computations (arithmetic, string concatenation, simple property access), this overhead exceeds the cost of recomputing. `useMemo` also adds cognitive complexity — future developers must understand why a value is memoized and whether the dependencies are correct. React's own documentation advises against premature memoization.
- **The Unforgettable Mental Model:** The **Safe Deposit Box**. Putting a penny in a safe deposit box costs more than the penny is worth. `useMemo` for cheap values is the same — the protection (avoiding recomputation) costs more than the risk.
- **The Trap:** Memoizing because "it might be slow someday." Profile first, memoize second. Premature optimization makes code harder to read and maintain without measurable benefit.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I don't use `useMemo` for cheap computations — arithmetic, string operations, simple property access. The overhead of dependency comparison and storage exceeds the cost of recomputing. I also avoid `useMemo` when the value is only used once in the current render, since there's no downstream performance impact. I profile first, identify actual bottlenecks, and memoize only where it measurably improves performance."

#### When not to use `useCallback`?
- **The Engine Mechanism (Why it behaves this way):** `useCallback` has the same overhead as `useMemo` — dependency storage and comparison. If a function is only used as an event handler in the current component's JSX (like `onClick={handleClick}`), memoizing it provides no benefit because the parent re-renders anyway, and the child isn't memoized. `useCallback` is only beneficial when the function reference is compared by something: `React.memo` children, effect dependency arrays, or third-party libraries.
- **The Unforgettable Mental Model:** The **ID Card for a Private Party**. An ID card (stable reference) is only useful when someone checks it. If no one checks (no memoized child, no dependency comparison), the ID card is just extra paperwork.
- **The Trap:** Adding `useCallback` to every function "just in case." This creates a web of memoized functions where the overhead of memoization exceeds any performance benefit.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I don't use `useCallback` for functions that are only used as event handlers in the current component's JSX. Since the parent re-renders anyway and the child isn't memoized, there's no performance benefit. I use `useCallback` only when the function is passed to a memoized child, used as an effect dependency, or consumed by a library that compares references. Otherwise, it's unnecessary overhead."

#### Which hook stores timer IDs?
- **The Engine Mechanism (Why it behaves this way):** Timer IDs (from `setTimeout`, `setInterval`) are stored in `useRef` because they're mutable values that don't drive UI. The timer ID is set when the timer starts and cleared in cleanup. Storing it in `useState` would trigger an unnecessary re-render every time a timer starts or is cleared. The ref provides silent, mutable storage that's perfect for this metadata.
- **The Unforgettable Mental Model:** The **Parking Ticket**. The timer ID is like a parking ticket — you need it to claim your car (clear the timer), but displaying it on a billboard (state) serves no purpose. Keep it in your wallet (ref).
- **The Trap:** Storing timer IDs in state. This causes re-renders when the timer starts and when it's cleared, adding unnecessary render cycles for a value that only the cleanup function needs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Timer IDs go in `useRef`. They're mutable metadata that don't affect what's rendered. Storing them in state would trigger unnecessary re-renders every time a timer starts or stops. The ref gives me a place to store the ID so the cleanup function can access it, without affecting React's rendering cycle."

#### Which hook handles complex transitions?
- **The Engine Mechanism (Why it behaves this way):** `useReducer` handles complex transitions because it centralizes all state transition logic in a single reducer function. The reducer receives the current state and an action, and returns the next state. This makes it easy to handle multi-step state changes, conditional transitions, and state that depends on multiple fields. The dispatch function is also stable across renders (React guarantees this), so it can be safely omitted from effect dependency arrays.
- **The Unforgettable Mental Model:** The **Traffic Controller**. A reducer is like a traffic controller at a busy intersection — it receives signals (actions) from all directions and decides how to route traffic (state transitions) safely and predictably.
- **The Trap:** Using `useReducer` for simple state just because it looks "more professional." The added boilerplate (action types, reducer function, dispatch calls) is unnecessary overhead for a boolean toggle or simple string.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `useReducer` handles complex transitions because it centralizes all state change logic in one pure function. It's ideal for multi-step forms, state machines, and state where multiple fields change together based on an action. The reducer is testable in isolation, and the dispatch function is stable across renders. I reach for `useReducer` when `useState` would require multiple setters and scattered update logic."

## 8. Active recall test
1. **Which hook does not re-render on change?**
   - **Explanation:** `useRef`. Updating `ref.current` is a synchronous JavaScript assignment that React's scheduler ignores. Unlike `useState`, which triggers a re-render when its setter is called, refs provide mutable storage that's completely invisible to React's rendering cycle.
2. **Which hook caches function identity?**
   - **Explanation:** `useCallback`. It stores the function reference in the Fiber node and only creates a new reference when dependencies change. This prevents the function from getting a new identity on every render, which is essential for memoized children and effect dependencies.
3. **Which hook caches a calculated value?**
   - **Explanation:** `useMemo`. It stores the result of a computation and only recomputes when dependencies change. This avoids re-running expensive calculations on every render, improving performance for costly derived values.
4. **Which hook is best for a boolean toggle?**
   - **Explanation:** `useState`. A boolean toggle is simple, independent state with a straightforward update pattern (`setOpen(prev => !prev)`). `useReducer` would add unnecessary boilerplate (action types, reducer, dispatch) for a trivial use case.
5. **Which hook is best for a wizard reducer?**
   - **Explanation:** `useReducer`. A multi-step wizard has complex state transitions: next step, previous step, validation, completion. `useReducer` centralizes all transition logic in one reducer function, making it testable, predictable, and easy to extend with new steps or validation rules.

## 9. Mistakes / traps
- Using refs for visible UI state.
- Using reducers for trivial values.
- Memoizing cheap calculations.
- Expecting `useCallback` to make code faster automatically.
- Storing derived state instead of memoizing or calculating.

## 10. Compare with related concepts
- **State vs ref:** render-driving vs silent mutable.
- **Reducer vs state:** event-based transitions vs simple setter.
- **Memo vs callback:** value vs function.

## 11. Summary from memory
Explain which hook you would choose for a timer ID, a controlled input, filtered rows, and cart actions.

## 12. Spaced revision prompts
- After 1 day: Compare state and ref.
- After 3 days: Compare memo and callback.
- After 7 days: Compare reducer and state.
- After 14 days: Pick hooks for five scenarios.

