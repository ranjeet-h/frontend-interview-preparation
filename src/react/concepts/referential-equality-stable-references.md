# Referential Equality and Stable References

## Detailed explanation
Referential equality means two objects, arrays, or functions are equal only if they are the same reference in memory. In React, this matters because dependency arrays, `React.memo`, `useMemo`, and `useCallback` compare references.

Stable references help avoid unnecessary recalculation or re-rendering, but forcing stability everywhere is unnecessary. The goal is to stabilize references only where identity affects behavior or performance.

## 1. One-line mental model
Referential equality checks whether two values are the exact same object or function reference.

## 2. Problem it solves
React optimizations need a cheap way to know whether a value changed.

## 3. Core idea
- Objects/functions created during render get new references.
- Dependency arrays compare references.
- Memoized children care about prop references.
- `useMemo` and `useCallback` can stabilize values.
- Stability has cost and should be purposeful.

## 4. Visual / analogy
Two identical-looking keys are not the same key if they are separate physical objects.

```tsx
{} === {} // false
```

## 5. Minimal example

```tsx
const options = React.useMemo(() => ({ pageSize: 20 }), []);
```

## 6. Real-world example

```tsx
const columns = React.useMemo(() => createTableColumns(onEdit), [onEdit]);
```

Stable columns can prevent a table from resetting or recalculating unnecessarily.

## 7. Common interview questions
- What is referential equality?
- Why do inline objects cause re-renders?
- What are stable references?
- How do dependency arrays compare values?
- When use `useMemo`?
- When use `useCallback`?
- Why can over-stabilizing be bad?

## 8. Active recall test
1. Why is `{}` not equal to `{}`?
2. What happens to inline functions each render?
3. Why do memoized children care?
4. How do you stabilize an object?
5. When should you not bother?

## 9. Mistakes / traps
- Assuming identical object contents mean same reference.
- Memoizing everything.
- Passing unstable object props to `React.memo` children.
- Missing dependencies while trying to stabilize.
- Ignoring that primitive values compare by value.

## 10. Compare with related concepts
- **Referential vs value equality:** same reference vs same content/value.
- **Stable reference vs stale closure:** stable identity can still capture stale values if dependencies are wrong.
- **Memoization vs correctness:** memoization optimizes; it should not hide dependency bugs.

## 11. Summary from memory
Explain why an inline `{ sort: "name" }` object can retrigger an effect every render.

## 12. Spaced revision prompts
- After 1 day: Define referential equality.
- After 3 days: Explain stable references.
- After 7 days: Fix unstable object dependency.
- After 14 days: Compare stability and stale closures.

