# Copying Array Methods: toSorted, toReversed, toSpliced, and with

## 1. Why This Exists — The Problem First

You receive a list of rows from a parent component, sort it for a table, and suddenly the parent’s “original” order has changed too. The same class of bug appears when a reducer calls `splice()` on state: a later render, memoized selector, or undo entry is now looking at data that was changed behind its back. The code may look harmless because `sort()` or `splice()` returns a value, but those methods edit the array they were given.

JavaScript added `toSorted()`, `toReversed()`, `toSpliced()`, and `with()` so the requested change can be expressed as “make this new version.” That matters anywhere array identity is used to detect change: React state, Redux-style reducers, memoization, caches, and history snapshots.

## 2. The Analogy — Make It Obvious

Imagine a clerk has one signed paper order that several people are allowed to read. If you cross out and reorder that paper, everyone holding a reference to it sees the edit. That is an in-place array method such as `sort()`, `reverse()`, or `splice()`.

The copying methods ask the clerk to photocopy the order first, make the requested change on the photocopy, and hand back that new sheet. The signed original keeps its old order, so its identity and contents remain stable. The photocopy is shallow: the sheet itself is new, but a photograph stapled to it is still the same photograph. In JavaScript terms, the outer array is new while object elements inside it are still shared references.

## 3. How It Actually Works — The Full Explanation

All four methods read the source array and return another array. They do not assign the result back into the source, so the source’s length, index order, and top-level entries stay unchanged.

`toSorted(compareFn)` is the copying counterpart of `sort()`. With no comparator, it uses the familiar default string-style ordering, so `[10, 2].toSorted()` becomes `[10, 2]`, not `[2, 10]`. For numbers, provide `(a, b) => a - b`. The comparator controls the order of the new array; it does not make the original array mutable.

`toReversed()` produces the elements in reverse index order. `toSpliced(start, deleteCount, ...items)` produces the array that would result from a splice, but it does not return the removed items and does not change the source. It can remove, insert, or replace elements. `with(index, value)` produces a copy with exactly one position replaced. Its index may be negative, such as `-1` for the last position, but an index outside the array throws `RangeError` instead of silently growing the array.

The important identity rule is `result !== source`. That gives a state container a new top-level identity, which is useful to React and memoized code. It is not a deep clone: if `source[0]` is an object, then `result[0] === source[0]`. Changing a nested object through either array still changes that shared object. Copy the object too when the nested value must be independent.

These methods are shallow and eager. They create the result while the call runs; they are not lazy views. Their work is proportional to the array size: reversing, splicing, and replacing need a new array, while sorting also performs the sort. They are about safe ownership and identity, not about avoiding allocation.

Sparse arrays have a sharp edge. A hole is an absent property, not an explicit `undefined`. The copying methods preserve the length but materialize holes as `undefined` in the returned array. For example, `[ , "ready" ].with(0, "new")` fills index `0`, while `[ , "ready" ].toReversed()` returns `["ready", undefined]`. The original hole remains absent. Do not use a hole as if it were the same thing as a deliberate `undefined` when presence checks matter.

These methods are part of the ES2023 standard. A current JavaScript engine may support them, but an older browser, embedded WebView, test runner, or Node.js version may not. Transpiling application syntax does not automatically guarantee that a missing runtime method exists. Choose a supported runtime, or use a feature-tested polyfill/fallback such as `items.toSorted(compare)` when available and `[...items].sort(compare)` otherwise. Check the actual browsers and server runtimes your product supports before shipping the direct calls.

## 4. Real Code — See It Working

This Node.js example can run on a runtime that supports the ES2023 copying methods, such as the repository’s Node 22 environment:

```js
const source = [
  { id: "b", name: "Beta" },
  { id: "a", name: "Alpha" },
];

const sorted = source.toSorted((left, right) => left.name.localeCompare(right.name));
const changed = source.with(0, { id: "x", name: "New row" });
const withoutFirst = source.toSpliced(0, 1);
const reversed = source.toReversed();

console.log(sorted.map((row) => row.id)); // ["a", "b"]
console.log(source.map((row) => row.id)); // ["b", "a"]: the source was not reordered
console.log(sorted !== source); // true: a new outer array was created
console.log(sorted[0] === source[1]); // true: copying is shallow
console.log(changed.map((row) => row.id)); // ["x", "a"]
console.log(withoutFirst.map((row) => row.id)); // ["a"]
console.log(reversed.map((row) => row.id)); // ["a", "b"]

const sparse = [, "ready"];
const filled = sparse.with(0, "new");
const reversedSparse = sparse.toReversed();
console.log(Object.hasOwn(sparse, 0)); // false: the source still has a hole
console.log(filled); // ["new", "ready"]
console.log(reversedSparse); // ["ready", undefined]
```

In React, use the updater form when the next array depends on the previous state. React may queue multiple updates, so the callback receives the latest pending array rather than an older render’s captured value:

```jsx
function TodoList({ initialTodos }) {
  const [todos, setTodos] = React.useState(initialTodos);

  function completeTodo(id) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, completed: true } : todo,
      ),
    );
  }

  function sortByTitle() {
    setTodos((current) =>
      // The updater gives us the current state; toSorted gives React a new array.
      current.toSorted((a, b) => a.title.localeCompare(b.title)),
    );
  }

  function removeTodo(id) {
    setTodos((current) => {
      const index = current.findIndex((todo) => todo.id === id);
      // Returning the same array for a missing id avoids an unnecessary update.
      return index === -1 ? current : current.toSpliced(index, 1);
    });
  }

  return (
    <>
      <button onClick={sortByTitle}>Sort</button>
      <button onClick={() => removeTodo("a")}>Remove A</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <button onClick={() => completeTodo(todo.id)}>{todo.title}</button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

For an older runtime, the equivalent numeric sort fallback is:

```js
function immutableNumericSort(values) {
  // The spread creates the new outer array before legacy sort mutates anything.
  return typeof values.toSorted === "function"
    ? values.toSorted((a, b) => a - b)
    : [...values].sort((a, b) => a - b);
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `sort()` and `toSorted()`?**

`sort()` rearranges the existing array and returns that same array, so `values.sort() === values` is true. `toSorted()` creates and returns a different array while leaving `values` alone. Use `toSorted()` when the input is owned by state, props, a cache, or another caller; use `sort()` only when mutating a deliberately local, throwaway array is part of the design.

**Q: What do `toReversed()` and `toSpliced()` change compared with `reverse()` and `splice()`?**

`reverse()` mutates and returns the original array; `toReversed()` returns a reversed copy. `splice()` mutates the original and returns the removed elements; `toSpliced()` returns the post-splice array and leaves the original untouched. That return-value difference makes `toSpliced()` a direct state-update tool, while `splice()` is not a way to obtain the remaining collection.

**Q: Why is `toSorted()` useful in React?**

React state should be treated as owned by the current render. Sorting it in place changes the array that an earlier render, parent, or memoized calculation may still reference. `toSorted()` returns a new outer identity, so the state updater can publish the new order without modifying the previous snapshot. It does not deep-copy the row objects, so nested edits still need object spreads or another immutable update.

**Q: Are these methods deep clones?**

No. They copy the array container, not every value reachable from it. Primitive entries are copied as values, but object and array entries are copied as references. Use `{ ...item }` for the specific nested object that must change, or use a deliberate deep-cloning/structural-sharing strategy when the data model requires it.

**Q: What happens with sparse arrays?**

The result keeps the same length, but holes become explicit `undefined` values in these copying results. That means `Object.hasOwn(result, index)` can be true where it was false in the source. If index presence carries meaning, test the behavior explicitly or avoid sparse arrays in favor of a dense representation.

**Q: Are these methods safe to use everywhere?**

They are standardized in ES2023, but support depends on the runtime executing the code. A browser compatibility list, Node.js support range, test environment, and embedded WebView can differ. Use direct calls only when the supported runtime guarantees them; otherwise provide a runtime polyfill or a feature-tested fallback. Also remember that a syntax transpiler cannot create a missing method by itself.

**Q: Does a copying method make sorting free?**

No. It intentionally allocates a new outer array, and `toSorted()` still performs sorting work. The benefit is predictable ownership and identity, not zero cost. For a large list, sort only when the sort key or input actually changed, and consider memoizing the derived view at the correct boundary rather than mutating shared data.

## 6. The Traps — What Goes Wrong

- **Sorting state in place.** `items.sort(compare)` changes `items` before a setter is called. A component can observe reordered data without a state transition, and another consumer can see the same mutation. Use `setItems((current) => current.toSorted(compare))`.

- **Assuming “copying” means deep cloning.** `const next = current.toSpliced(0, 1); next[0].settings.dark = true` can still change the object that was stored in `current`. Copy the nested object at the point of the edit: `current.map((item) => item.id === id ? { ...item, settings: { ...item.settings, dark: true } } : item)`.

- **Forgetting the numeric comparator.** Default `toSorted()` follows string-style ordering, just like `sort()`. Use `(a, b) => a - b` for numbers, and return a consistent negative, zero, or positive result from custom comparators.

- **Expecting `toSpliced()` to return removed items.** That is the old `splice()` return contract. `toSpliced()` returns the new remaining/replaced array. If you need both removed and remaining values, compute them separately without mutating the source, for example `const removed = items.slice(start, start + count)` and `const remaining = items.toSpliced(start, count)`.

- **Using an unsupported runtime.** Code can pass in a modern local Node process and fail in an older browser with `TypeError: values.toSorted is not a function`. Treat compatibility as a deployment requirement and test the actual target matrix.

- **Confusing an array copy with a new element.** `toSorted()` changes the order of references; it does not clone each row. This is useful for preserving row identity, but it also means nested mutation remains shared.

- **Using an out-of-range `with()` index.** `with()` replaces an existing position; it is not an append operation. Use `toSpliced(items.length, 0, value)` or `[...items, value]` to append, and handle `RangeError` if the index comes from untrusted or stale input.

## 7. Compare With Related Concepts

| Choice | Key difference | When to use |
| --- | --- | --- |
| `sort()` / `reverse()` / `splice()` | Mutates the input array; `splice()` returns removed items. | Use only for a private local array whose mutation is intentional and contained. |
| `toSorted()` / `toReversed()` / `toSpliced()` | Performs the corresponding change on a new outer array. | Default choice for state, props, shared inputs, cache values, and history snapshots. |
| `with(index, value)` | Replaces one existing position and returns a new outer array. | Use for immutable single-index replacement, especially when the index is already known. |
| `[...items].sort(compare)` | Manually copies one level, then uses mutating `sort()` on that private copy. | Use as a clear ES2015 fallback when `toSorted()` is unavailable; still provide the comparator. |
| `slice()` / `filter()` / `map()` | Copy or derive by selecting/transforming elements rather than using the new copying counterparts. | Use `slice()` for ranges, `filter()` for removal by predicate, and `map()` when values themselves must be transformed. |
| Shallow copy vs deep clone | A new outer array can still share nested objects; deep cloning recursively creates more independent data. | Prefer shallow structural updates for known changed branches; deep clone only when independent recursive ownership is truly required. |

The practical rule is simple: if another part of the program can still own the input, publish a new array. Then copy only the nested objects that you are actually changing.

## 8. 🧠 The Memory Hook — What Sticks

Think “photocopy first, edit second”: the old array keeps its identity and order, while the new array carries the requested change. The photocopy is only one page thick, so the sheet is new but the objects stapled to it are still shared.
