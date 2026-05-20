# Copying Array Methods: toSorted, toReversed, toSpliced

## Detailed explanation
`toSorted`, `toReversed`, and `toSpliced` are non-mutating versions of `sort`, `reverse`, and `splice`. They return new arrays and leave original array unchanged.

Frontend use: React state updates, Redux reducers, memoized selectors, table sorting, undo history.

## 1. One-line mental model
Copying array methods do array changes without mutating original array.

## 2. Problem it solves
Classic `sort`, `reverse`, and `splice` mutate arrays and can break immutable state.

## 3. Core idea
- `toSorted()` returns sorted copy.
- `toReversed()` returns reversed copy.
- `toSpliced()` returns spliced copy.
- Original array unchanged.
- Better for React state.

## 4. Visual / analogy
Make edited photocopy, not scribble original.

```txt
old -> toSorted() -> new sorted array
old unchanged
```

## 5. Minimal example

```js
const nums = [3, 1, 2];
const sorted = nums.toSorted();
console.log(nums); // [3, 1, 2]
```

## 6. Real-world example

```js
setRows((rows) => rows.toSorted((a, b) => a.name.localeCompare(b.name)));
```

## 7. Common interview questions
- Why use `toSorted`?
- Does `sort` mutate?
- `splice` vs `toSpliced`?
- Browser support concern?
- Why useful in React?

## 8. Active recall test
1. Which method replaces mutating `sort`?
2. Which replaces `reverse`?
3. Which replaces `splice`?
4. Does original change?
5. Why React care?

## 9. Mistakes / traps
- Calling `sort` on state array.
- Assuming all browsers support new methods without transpilation/polyfill plan.
- Mutating nested objects inside copied array.

## 10. Compare with related concepts
- **`sort` vs `toSorted`:** mutate vs copy.
- **Spread + sort vs `toSorted`:** manual copy vs built-in copy.
- **Copy array vs deep clone:** top-level new array only.

## 11. Summary from memory
Explain how `toSorted` prevents React state mutation.

## 12. Spaced revision prompts
- 1 day: List 3 copying methods.
- 3 days: Compare `splice` and `toSpliced`.
- 7 days: Sort state safely.
- 14 days: Explain shallow copy caveat.

