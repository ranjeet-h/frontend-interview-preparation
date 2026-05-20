# Array Mutation

## Detailed explanation
Array mutation means changing an existing array in place. Methods like `push`, `pop`, `splice`, `sort`, and `reverse` mutate the original array. Non-mutating methods like `map`, `filter`, `slice`, `concat`, and newer copy methods return new arrays.

This is critical for frontend work because React state, Redux reducers, memoization, and undo/redo logic all rely on predictable immutable updates. Accidentally mutating arrays can cause stale UI or hard-to-debug shared state.

## 1. One-line mental model
Array mutation changes the original array instead of creating a new one.

## 2. Problem it solves
Developers must know which array methods are safe for immutable state updates.

## 3. Core idea
- Some array methods mutate the original array.
- Some return a new array.
- Mutating shared arrays affects all references.
- React state should be updated immutably.
- New copy methods like `toSorted` avoid mutation.

## 4. Visual / analogy
Mutation edits the original document. Immutable update creates a revised copy.

```txt
Mutating: arr.sort()
Copying:  [...arr].sort() or arr.toSorted()
```

## 5. Minimal example

```js
const numbers = [3, 1, 2];
numbers.sort();
console.log(numbers); // [1, 2, 3]
```

`sort` changed the original array.

## 6. Real-world example

```js
setRows((rows) => rows.toSorted((a, b) => a.name.localeCompare(b.name)));
```

`toSorted` returns a sorted copy and leaves old state unchanged.

## 7. Common interview questions
- Which array methods mutate?
- Does `sort` mutate?
- How do you sort without mutation?
- Why does React care about array immutability?
- `slice` vs `splice`?
- How do you add/remove immutably?
- What are `toSorted`, `toReversed`, and `toSpliced`?

## 8. Active recall test
1. Name three mutating methods.
2. Name three non-mutating methods.
3. What is the difference between `slice` and `splice`?
4. How do you remove an item immutably?
5. Why can mutation break memoization?

## 9. Mistakes / traps
- Calling `sort` directly on React state.
- Confusing `slice` and `splice`.
- Using `reverse` on state arrays.
- Shallow-copying the array but mutating nested objects.
- Assuming `const` makes an array immutable.

## 10. Compare with related concepts
- **Mutation vs immutability:** change original vs create new value.
- **`sort` vs `toSorted`:** mutating sort vs copy sort.
- **Array reference vs array contents:** same reference can hold changed contents.

## 11. Summary from memory
Explain how to sort a React state array without mutating the previous state.

## 12. Spaced revision prompts
- After 1 day: List mutating array methods.
- After 3 days: Compare `slice` and `splice`.
- After 7 days: Use `toSorted`.
- After 14 days: Explain mutation and React state bugs.

