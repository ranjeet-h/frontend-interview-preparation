# useState

## Detailed explanation
`useState` is the basic React hook for storing component-owned state in functional components. It returns the current state value and a setter function. Calling the setter schedules a re-render with the new value.

Use `useState` for local UI state such as input values, selected tabs, open/closed flags, counters, and small independent values. If the next state depends on the previous state, use the functional updater form to avoid stale values.

## 1. One-line mental model
`useState` gives a function component memory that can trigger re-rendering.

## 2. Problem it solves
Function components need a way to remember values between renders and update the UI when those values change.

## 3. Core idea
- `useState(initialValue)` returns `[value, setValue]`.
- The initial value is used on the first render.
- Calling the setter schedules a re-render.
- State should be updated immutably.
- Use functional updates when the next value depends on the previous value.

## 4. Visual / analogy
`useState` is like a whiteboard beside a component: React reads it during render and redraws when it changes.

```mermaid
flowchart LR
  Event["Event"] --> Setter["setState"]
  Setter --> Render["Re-render"]
  Render --> UI["Updated UI"]
```

## 5. Minimal example

```tsx
function Counter() {
  const [count, setCount] = React.useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## 6. Real-world example

```tsx
function SearchInput({ onSearch }: { onSearch: (value: string) => void }) {
  const [value, setValue] = React.useState("");

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      onSearch(value.trim());
    }}>
      <input value={value} onChange={(event) => setValue(event.currentTarget.value)} />
    </form>
  );
}
```

## 7. Common interview questions
#### What does `useState` return?
- **The Engine Mechanism (Why it behaves this way):** `useState(initialValue)` returns a tuple `[state, setState]`. Under the hood, React maintains a linked list of hook objects on the current Fiber node. Each `useState` call creates a `Hook` object with `memoizedState` (the current value) and `queue` (a linked list of pending updates). The first element is the `memoizedState` value; the second is a dispatch function that pushes updates onto the queue and schedules a Fiber re-render.
- **The Unforgettable Mental Model:** The **Vending Machine Slot**. `useState` gives you two things: the snack currently sitting in the slot (state value), and a button to request a new snack (setter). Press the button, and the machine queues your request — the snack swaps out on the next cycle.
- **The Trap:** Thinking the setter returns the new value. `setState(newValue)` returns `undefined`. The new value is only available on the next render.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `useState` returns a two-element array: the current state value and a setter function. The state value reflects what React has committed for the current render. The setter schedules an update — it queues the new value on React's internal hook queue and triggers a re-render. The setter always returns undefined, so you cannot chain it or read the new value synchronously."

#### Why does state not update immediately?
- **The Engine Mechanism (Why it behaves this way):** When you call `setState`, React does not mutate the state variable in place. Instead, it creates an `Update` object and appends it to the hook's update queue on the Fiber. React then schedules a re-render at the appropriate priority level. During the next render phase, React processes all queued updates through a reducer, computes the new `memoizedState`, and only then does the component function receive the new value. This batching allows React to combine multiple state updates into a single render pass.
- **The Unforgettable Mental Model:** The **Restaurant Kitchen Ticket**. When you place an order (call `setState`), the chef doesn't instantly materialize the dish on your table. The order goes on a ticket rail, the kitchen batches similar orders, and only when the food is ready does it appear at your table (next render).
- **The Trap:** Reading state immediately after calling the setter and expecting the new value. `setCount(5); console.log(count)` will log the old value because `count` is a closure over the current render's scope.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: State updates in React are asynchronous and batched. When you call the setter, React queues the update and schedules a re-render rather than mutating state immediately. This design allows React to batch multiple state changes into a single render pass for performance. The state variable you see in the current render is a snapshot — the new value only appears in the next render cycle after React processes the update queue."

#### What is a functional state update?
- **The Engine Mechanism (Why it behaves this way):** A functional update passes a function to the setter: `setState(prev => prev + 1)`. React stores this function in the update queue. When processing updates during the render phase, React calls each queued function sequentially, passing the result of the previous update as the argument. This guarantees that even if multiple updates are batched together, each function receives the most recently computed state, not the stale render-time value.
- **The Unforgettable Mental Model:** The **Assembly Line Worker**. Instead of saying "add 1 to whatever is on the conveyor belt right now" (which might be outdated), you hand the worker a recipe: "take whatever is currently in front of you and add 1." The worker always uses the freshest item.
- **The Trap:** Thinking functional updates are only for performance. They are primarily for correctness — they prevent stale values when multiple updates are batched or when the setter is called from a closure that captured an old render.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A functional update is when you pass a function to the state setter instead of a raw value. React calls this function with the most recent state during the update processing phase, guaranteeing you always work with the latest value. This is essential when multiple state updates are batched together or when the setter is called from a callback that captured an older render's state. It ensures correctness over convenience."

#### How do you update objects or arrays in state?
- **The Engine Mechanism (Why it behaves this way):** React uses `Object.is()` to compare state values between renders. If you mutate an object or array in place, `Object.is(oldRef, newRef)` returns `true` because the reference hasn't changed, so React skips the re-render entirely. By creating a new object or array (via spread, `map`, `filter`, etc.), you produce a new reference that `Object.is()` detects as different, triggering the reconciliation process.
- **The Unforgettable Mental Model:** The **Photo vs. Painting**. React takes a photo of your state before and after the update. If you paint over the same canvas (mutate), the photo looks identical — React thinks nothing changed. If you swap in a new canvas (new reference), the photo is different and React notices.
- **The Trap:** Using `array.push()` or `object.property = value` and then calling `setState`. The reference is the same, so React bails out of rendering. You must always create a new reference.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Objects and arrays in React state must be updated immutably. Because React uses reference equality via `Object.is()` to detect changes, mutating an object or array in place won't trigger a re-render. Instead, I create a new reference using the spread operator for objects, or methods like `map`, `filter`, and `concat` for arrays. This ensures React's reconciliation engine detects the change and updates the UI accordingly."

#### What is lazy initialization?
- **The Engine Mechanism (Why it behaves this way):** `useState` accepts either a value or a function. When you pass a function — `useState(() => expensiveComputation())` — React calls it only during the initial mount to compute the initial state. On subsequent renders, React ignores the function entirely and reads from `memoizedState`. This avoids re-running expensive computations on every render, which would happen if you wrote `useState(expensiveComputation())` without the arrow function wrapper.
- **The Unforgettable Mental Model:** The **Safe Combination**. You only need to crack the safe once (initial mount). After that, you just reach in and grab what's inside. Lazy initialization ensures you don't waste time cracking the safe every time you walk into the room.
- **The Trap:** Passing `useState(expensiveFunction())` without the arrow wrapper. This calls the function on every render, defeating the purpose of lazy initialization.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Lazy initialization means passing a function to `useState` instead of a direct value. React calls this function only once during the initial mount to compute the starting state. On every subsequent render, React skips the function and reads the stored state. This is critical when the initial value requires expensive computation — without lazy initialization, that computation would run on every render, wasting CPU cycles."

#### When should you avoid `useState`?
- **The Engine Mechanism (Why it behaves this way):** `useState` triggers a full component re-render whenever the setter is called with a new reference. If a value can be derived from existing props or state during render, storing it as separate state creates redundant data that can drift out of sync. React's render phase is designed to be fast for pure computations — adding a `useState` call introduces unnecessary render cycles and potential inconsistency bugs.
- **The Unforgettable Mental Model:** The **Duplicate Spreadsheet Column**. If column C is always column A plus column B, don't store column C as a separate column. Calculate it on the fly. Storing it separately means every time A or B changes, you have to remember to update C too — and you'll forget sometimes.
- **The Trap:** Storing derived values like `const [fullName, setFullName] = useState(firstName + ' ' + lastName)` instead of computing `const fullName = firstName + ' ' + lastName` directly in the render body.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I avoid `useState` for derived values — anything that can be computed from existing props or state during render. Storing derived values as state creates a second source of truth that can drift out of sync. I also avoid it for values that don't affect rendering, where `useRef` is more appropriate. And for complex state machines with multiple related transitions, I prefer `useReducer` for better organization and predictability."

#### How is `useState` different from `useRef`?
- **The Engine Mechanism (Why it behaves this way):** `useState` stores its value in the Fiber's hook `memoizedState` and calling the setter schedules a re-render through React's update queue. `useRef` stores its value in a plain JavaScript object's `.current` property that persists across renders but has no connection to React's update scheduling. Changing `.current` is a silent mutation — React's reconciliation engine never sees it, so no re-render occurs.
- **The Unforgettable Mental Model:** The **Billboard vs. the Diary**. `useState` is a billboard — when you change it, everyone sees the update immediately (re-render). `useRef` is a personal diary — you can write in it anytime, but nobody else notices unless you choose to show them.
- **The Trap:** Using `useRef` for values that should trigger UI updates, or using `useState` for values that change frequently but don't need to render (like interval IDs or WebSocket connections).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The key difference is that `useState` triggers a re-render when updated, while `useRef` does not. Use `useState` for values that affect what the user sees — form inputs, toggles, counters. Use `useRef` for values that need to persist across renders but shouldn't trigger rendering — DOM node references, timer IDs, or the latest value of a prop for use inside closures. If changing a value should update the UI, it's state. If it's just bookkeeping, it's a ref."

## 8. Active recall test
1. **What does `useState` return?**
   - **Explanation:** A tuple `[state, setState]` — the current state value and a setter function that schedules a re-render.
2. **Why does `setCount(count + 1)` sometimes unsafe in repeated updates?**
   - **Explanation:** Because `count` is captured from the current render's closure. If multiple updates are batched, each call reads the same stale `count` value instead of the progressively updated value. Use `setCount(prev => prev + 1)` instead.
3. **How do you initialize expensive state lazily?**
   - **Explanation:** Pass a function to `useState`: `useState(() => expensiveComputation())`. React calls it only on mount, not on every render.
4. **Why should arrays in state be copied?**
   - **Explanation:** React uses `Object.is()` for reference equality. Mutating an array in place produces the same reference, so React skips the re-render. Creating a new array via spread, `map`, or `filter` produces a new reference that triggers rendering.
5. **When is derived state unnecessary?**
   - **Explanation:** When a value can be computed directly from existing props or state during render. Storing it as separate `useState` creates redundant data that can drift out of sync and causes unnecessary re-renders.

## 9. Mistakes / traps
- Mutating state directly.
- Storing derived values as separate state.
- Expecting the state variable to change immediately after calling the setter.
- Using stale values instead of functional updates.
- Keeping state too high in the tree.

## 10. Compare with related concepts
- **`useState` vs `useReducer`:** `useState` is simpler; `useReducer` fits complex transitions.
- **`useState` vs `useRef`:** state re-renders; ref does not.
- **`useState` vs props:** state is owned locally; props are received.

## 11. Summary from memory
Explain how `useState` drives a controlled input and why functional updates matter.

## 12. Spaced revision prompts
- After 1 day: Write `useState` syntax from memory.
- After 3 days: Explain functional updates.
- After 7 days: Update an array immutably.
- After 14 days: Compare `useState`, `useReducer`, and `useRef`.

