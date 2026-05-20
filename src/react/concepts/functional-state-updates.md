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
- What is a functional state update?
- When should you use it?
- How does it fix stale state?
- How does batching affect it?
- Can it update arrays/objects?
- Functional update vs dependency array?
- Why is it useful in timers?

## 8. Active recall test
1. What argument does updater receive?
2. What should updater return?
3. Why is it safer for counters?
4. How does it help batched updates?
5. Write a toggle update.

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

