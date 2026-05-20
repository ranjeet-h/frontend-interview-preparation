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
- `useReducer` vs `useState`?
- `useRef` vs `useState`?
- `useMemo` vs `useCallback`?
- When not to use `useMemo`?
- When not to use `useCallback`?
- Which hook stores timer IDs?
- Which hook handles complex transitions?

## 8. Active recall test
1. Which hook does not re-render on change?
2. Which hook caches function identity?
3. Which hook caches calculated value?
4. Which hook is best for a boolean toggle?
5. Which hook is best for a wizard reducer?

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

