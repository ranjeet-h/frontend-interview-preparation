# Immutability in React State

## Detailed explanation
Immutability in React means you do not change existing state objects or arrays directly. Instead, you create a new value that includes the change. React uses object identity to decide whether values changed, and immutable updates make that identity meaningful.

This is especially important for arrays and objects. Mutating state can cause stale UI, broken memoization, hard-to-debug side effects, and incorrect assumptions about previous renders.

## 1. One-line mental model
Immutability means creating new state values instead of changing existing state objects or arrays in place.

## 2. Problem it solves
React relies on value identity to detect changes and schedule efficient updates. Mutating existing state can hide changes, create stale UI, and make previous renders impossible to reason about.

## 3. Core idea
- Do not mutate state objects or arrays directly.
- Create new arrays with methods like `map`, `filter`, and spread.
- Create new objects with object spread.
- Preserve unchanged nested values when updating deeply.
- Immer can make immutable updates easier.

## 4. Visual / analogy
Immutable updates are like submitting a revised document copy instead of scribbling on the archived original.

```mermaid
flowchart LR
  Old["Old state"] --> Copy["Create copy with change"]
  Copy --> New["New state reference"]
  New --> React["React sees changed identity"]
```

## 5. Minimal example

```tsx
setUser((user) => ({
  ...user,
  name: "Asha",
}));
```

## 6. Real-world example

```tsx
setTodos((todos) =>
  todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo,
  ),
);
```

The array and changed todo object are new, while unchanged todo objects keep their identity.

## 7. Common interview questions
- Why should React state be immutable?
- What happens if you mutate state directly?
- How do you update an object in state?
- How do you update an array in state?
- What is structural sharing?
- What is Immer?
- How does immutability help memoization?

## 8. Active recall test
1. Why is `state.push(item)` wrong?
2. How do you remove an item immutably?
3. How do you update one object inside an array?
4. What does new reference mean?
5. How does immutability help debugging?

## 9. Mistakes / traps
- Using mutating array methods like `push`, `splice`, `sort`, or `reverse` directly on state.
- Shallow-copying an object but mutating a nested object.
- Thinking `const` makes an object immutable.
- Mutating props because they are objects.
- Over-copying large structures without considering normalized state.

## 10. Compare with related concepts
- **Immutability vs `const`:** `const` prevents reassignment, not object mutation.
- **Immutability vs deep clone:** immutable updates copy only the changed path, not always the entire tree.
- **Immutability vs Immer:** Immer lets you write mutation-like code that produces immutable updates.
- **Immutability vs memoization:** immutability supports memoization by making identity meaningful.

## 11. Summary from memory
Explain how to toggle a todo item without mutating state and why React cares about the new references.

## 12. Spaced revision prompts
- After 1 day: Define immutability.
- After 3 days: Update an array immutably.
- After 7 days: Explain shallow copy vs nested mutation.
- After 14 days: Compare manual immutable updates and Immer.
