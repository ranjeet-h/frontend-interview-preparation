# Functional State Updates

## Detailed explanation
Functional state updates pass a function to the state setter. React calls that function with the latest pending state and uses its return value as next state. This avoids stale closure bugs when the new value depends on the previous value.

Use functional updates for counters, toggles, array updates, queued updates, timers, and event handlers where multiple updates can happen before the next render.

## 1. One-line mental model
Functional updates calculate next state from the latest previous state.

## 2. Problem it solves
Closures can capture old state, and multiple updates may be batched before rendering.

## 3. Core idea
- Setter accepts a function.
- Function receives current pending state.
- Return next state.
- Avoids stale previous-state reads.
- Useful for batched/repeated updates.

## 4. Visual / analogy
It is like saying "add one to whatever the latest balance is" instead of using yesterday's balance.

```tsx
setCount((current) => current + 1);
```

## 5. Minimal example

```tsx
setOpen((open) => !open);
```

## 6. Real-world example

```tsx
setTodos((todos) => todos.filter((todo) => todo.id !== id));
```

## 7. Common interview questions
#### What is a functional state update?
- **The Engine Mechanism (Why it behaves this way):** When you pass a function to a state setter (`setCount(prev => prev + 1)`), React stores this updater function in the Fiber node's pending update queue instead of immediately replacing the state. During the next render, React processes the queue by calling each updater function with the current pending state value, chaining the results together. This ensures each updater receives the most recent state, not the stale value captured in the closure.
- **The Unforgettable Mental Model:** The **Assembly Line**. Instead of each worker using their own outdated blueprint (captured closure), each worker receives the latest version of the product from the previous worker on the line. The product evolves correctly through each station.
- **The Trap:** Using functional updates everywhere when direct values are clearer. Functional updates are specifically for when the new value depends on the previous value — not for simple replacements like `setName('Alice')`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A functional state update is passing a function to the setter instead of a direct value. React calls that function with the latest pending state, ensuring the update is based on the most current value rather than a potentially stale closure. This is essential when multiple updates happen before the next render, like rapid clicks or batched state changes."

#### When should you use it?
- **The Engine Mechanism (Why it behaves this way):** Functional updates are needed whenever the new state value depends on the previous state and multiple updates may occur before React processes them. React batches state updates within the same event handler and microtask. Without functional updates, three consecutive `setCount(count + 1)` calls all capture the same `count` value from the closure, resulting in only a +1 increment instead of +3.
- **The Unforgettable Mental Model:** The **Bank Account**. If three people each deposit $10 using yesterday's balance, they all add $10 to the same old balance. If each person uses the current balance at the moment of their deposit, the total correctly reflects all three deposits.
- **The Trap:** Using functional updates for independent state values. If you're setting a value that doesn't depend on the previous state, a direct value is clearer and more idiomatic: `setOpen(true)` not `setOpen(() => true)`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use functional updates whenever the new state depends on the previous state and multiple updates might batch together — counters, toggles, array mutations, and queue-based updates. For independent state replacements like setting a form field or a boolean flag, I use direct values since they're clearer and don't need the previous-state guarantee."

#### How does it fix stale state?
- **The Engine Mechanism (Why it behaves this way):** A stale closure occurs when a function captures a variable from its enclosing scope at definition time. In React, event handlers and effects capture the state value from the render in which they were created. If the component re-renders with new state but the old closure still references the old value, you get stale reads. Functional updates bypass the closure entirely — React passes the current pending state as an argument, so the updater always operates on the freshest value.
- **The Unforgettable Mental Model:** The **Live Feed vs. the Screenshot**. A closure is a screenshot of state at one moment — it's frozen. A functional update is a live feed — React hands you the current value at the moment of update, not the value from when the function was defined.
- **The Trap:** Thinking functional updates fix all stale closure problems. They only fix stale state reads within the updater function. Stale closures in effects, event handlers, and callbacks still need proper dependency management.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Functional updates fix stale state by bypassing the closure entirely. Instead of reading a captured variable from the render scope, React passes the latest pending state as an argument to the updater function. This guarantees the update is always based on the most recent value, even if multiple updates batch together or the closure was created in an earlier render."

#### How does batching affect it?
- **The Engine Mechanism (Why it behaves this way):** React 18 batches all state updates automatically — inside event handlers, promises, setTimeout, and native event handlers. When multiple `setState` calls happen in the same batch, React queues them and processes them together in a single render. With direct values, each call uses the same captured state. With functional updates, React chains them: the first updater receives the current state, the second receives the result of the first, and so on, all within the same render cycle.
- **The Unforgettable Mental Model:** The **Conveyor Belt**. Batched updates are packages on a conveyor belt. Direct values stamp every package with the same date. Functional updates read the date from the previous package before stamping the next one, so each gets a progressively updated value.
- **The Trap:** Assuming React 18's automatic batching eliminates the need for functional updates. Batching is actually why functional updates are MORE important — without them, all batched updates use the same stale value.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: React 18 batches all state updates automatically, which means multiple setters in the same event handler or async callback are processed together. With direct values, each update uses the same captured state from the closure. Functional updates chain within the batch — each updater receives the result of the previous one — so three `setCount(prev => prev + 1)` calls correctly increment by 3 instead of 1."

#### Can it update arrays and objects?
- **The Engine Mechanism (Why it behaves this way):** Functional updates work with any state type. For arrays and objects, the updater function receives the current array/object and must return a new one (immutable update). React's reconciliation compares the returned reference with the previous `memoizedState`. If the reference is different, React schedules a re-render. The functional update pattern ensures you're operating on the latest array/object, not a stale captured reference.
- **The Unforgettable Mental Model:** The **Shared Document**. Multiple editors working on a shared document need to see each other's changes. Functional updates ensure each editor works on the latest version of the document, not a copy they opened hours ago.
- **The Trap:** Mutating the previous state inside the updater: `setTodos(prev => { prev.push(newTodo); return prev })`. This returns the same reference, so React won't detect the change and won't re-render.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, functional updates work perfectly with arrays and objects. The updater receives the current value and must return a new immutable copy — using spread, `filter`, `map`, or similar methods. The key is returning a new reference so React's reconciliation detects the change. I never mutate the previous value in place, as React compares references and won't re-render if the reference hasn't changed."

#### Functional update vs dependency array?
- **The Engine Mechanism (Why it behaves this way):** These solve different problems. Functional updates ensure a state setter uses the latest pending state within a render cycle. Dependency arrays control when an effect re-runs based on changed values. However, they intersect: if you use a functional update inside an effect, you can sometimes remove a state variable from the dependency array because the functional updater doesn't need to capture it from the closure.
- **The Unforgettable Mental Model:** The **Two Tools**. Functional updates are a wrench that tightens the bolt with the right torque (latest state). Dependency arrays are a timer that decides when to start working (effect re-run timing). Different tools, occasional overlap.
- **The Trap:** Removing dependencies from an effect array just because you used a functional update. Only remove a dependency if the functional update truly eliminates the need to capture that variable. Other logic in the effect may still need it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Functional updates and dependency arrays address different concerns. Functional updates ensure state setters use the latest value; dependency arrays control effect re-run timing. They can interact — using a functional update inside an effect may let you safely omit a state variable from the dependency array. But I only remove dependencies when the functional update genuinely eliminates the closure capture, and I verify the rest of the effect doesn't need that variable."

#### Why is it useful in timers?
- **The Engine Mechanism (Why it behaves this way):** `setInterval` and `setTimeout` callbacks capture the state value from the render in which they were created. Since the timer callback runs in a separate event loop tick (after React has potentially re-rendered), the captured state is often stale. A functional update inside the timer callback receives the current pending state from React's Fiber node, bypassing the stale closure and ensuring the counter increments correctly.
- **The Unforgettable Mental Model:** The **Time Capsule vs. the Live Clock**. The timer's closure is a time capsule — it contains the state from when the timer was set. A functional update opens a live clock — it reads the current time at the moment the timer fires.
- **The Trap:** Forgetting that the timer callback itself is a closure. Even with functional updates, if the timer setup depends on other variables, those may still be stale. The functional update only fixes the state variable it receives as an argument.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Timer callbacks are closures that capture state from the render when the timer was created. Since timers fire in later event loop ticks, the captured state is often stale. Using a functional update like `setCount(prev => prev + 1)` inside the timer ensures React passes the latest pending state, so the counter increments correctly regardless of how many renders happened between timer fires."

## 8. Active recall test
1. **What argument does the updater receive?**
   - **Explanation:** The latest pending state value from React's Fiber node. This is the most recent state after all queued updates have been applied, not the stale value captured in the closure from when the function was defined.
2. **What should the updater return?**
   - **Explanation:** The next state value. For primitive state, return the new primitive. For objects/arrays, return a new immutable copy. React uses this return value to update `memoizedState` and determine if a re-render is needed via reference comparison.
3. **Why is it safer for counters?**
   - **Explanation:** Multiple counter updates can batch together before React renders. Direct updates like `setCount(count + 1)` all use the same captured `count`. Functional updates chain: each receives the result of the previous, so three increments correctly add 3 instead of 1.
4. **How does it help batched updates?**
   - **Explanation:** React 18 batches all state updates. Within a batch, functional updates are chained sequentially — the first updater receives the current state, the second receives the first's result, etc. This ensures each update builds on the previous one within the same render cycle.
5. **Write a toggle update.**
   - **Explanation:** `setOpen(prev => !prev)`. This functional update flips the boolean based on the latest pending value, ensuring correct behavior even if multiple toggle calls batch together before React processes them.

## 9. Mistakes / traps
- Using captured state for repeated updates.
- Mutating previous state inside updater.
- Forgetting to return next state.
- Using functional update when direct value is clearer and safe.
- Doing side effects inside updater.

## 10. Compare with related concepts
- **Functional update vs direct set:** previous-state dependent vs direct replacement.
- **Functional update vs reducer:** small local transition vs structured action handling.
- **Functional update vs ref:** updates UI state; ref avoids render.

## 11. Summary from memory
Explain why three `setCount(count + 1)` calls may not increment by three, but functional updates can.

## 12. Spaced revision prompts
- After 1 day: Define functional update.
- After 3 days: Fix stale counter update.
- After 7 days: Update array using functional setter.
- After 14 days: Compare with reducer.

