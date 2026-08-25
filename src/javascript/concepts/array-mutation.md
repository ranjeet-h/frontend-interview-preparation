# Array Mutation

## 1. Why This Exists — The Problem First

An order screen keeps showing the old order after a developer adds an item. A memoized table does not recalculate after its rows were sorted. A reducer appears to return new state, but another component suddenly sees its data rearranged. These bugs often come from changing an array that several parts of the program still share, then expecting a reference-based change detector to notice the contents changed.

The practical question is not “are arrays mutable?” They are. The useful question is: who owns this array, and can I safely change this particular object in place? Once an array is state, a cache input, a prop, or a value shared with another reference, a new array is usually the safer boundary.

## 2. The Analogy — Make It Obvious

Think of an array as a paper folder on a shared office shelf. Two coworkers can hold the same folder. A mutating operation writes on, removes from, or rearranges the pages in that one folder. Both coworkers still hold the same folder, but its contents have changed underneath them.

An immutable update makes a photocopy first. You can rearrange the copy, add a page, or remove a page without surprising the coworker holding the original. The photocopy is a new folder identity, so a system that checks folder identity can immediately see that it received a different value.

The photocopy is shallow: the pages are copied into a new folder, but a page containing a nested object is still the same page reference. Copying the folder protects the array structure; changing a nested object may still change data visible through the original folder.

## 3. How It Actually Works — The Full Explanation

An array variable stores a reference to an array object. Assignment copies that reference, not every element:

```js
const original = ["draft"];
const alias = original;

alias.push("published");

console.log(original); // ["draft", "published"]
console.log(alias === original); // true
```

`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, and `copyWithin` mutate the existing array. They change its indexed elements, length, or order and generally return either the array itself (`sort`, `reverse`) or an operation result (`push` returns the new length; `splice` returns removed elements). `const` prevents rebinding `original`; it does not freeze the array object.

Non-mutating operations read the source and return another result. `map`, `filter`, `slice`, `concat`, and `flat` create result arrays. The ES2023 copying counterparts—`toSorted`, `toReversed`, and `toSpliced`—also return a new array while leaving the source untouched. These are shallow operations: the outer array is new, but object elements are still shared.

Identity and contents are separate facts. A new array can contain the same element references:

```js
const first = [{ id: 1, done: false }];
const second = [...first];

console.log(first === second); // false: different array objects
console.log(first[0] === second[0]); // true: same nested object
```

That distinction matters in React. State setters and memoization commonly use reference equality as a fast signal. This is safe only when code treats state as a value and does not mutate the old object. `setItems(items)` gives React the same reference, so React may bail out because the state value is considered unchanged. Even when some other render happens, `React.memo`, dependency arrays, selectors, and cached calculations can still reuse results based on the unchanged array reference. Returning `setItems(items.concat(newItem))` or `setItems(items => [...items, newItem])` gives consumers a new array identity.

The updater form is important when the next array depends on previous state. React may queue several updates, so `setItems(items => items.toSpliced(index, 1))` reads the correct pending value rather than closing over an older render's `items`.

Iteration adds another hazard. If a forward loop removes an element with `splice`, the next element shifts into the current index and the loop increments past it. `forEach` also observes a changing array in ways that are easy to misread. Prefer `filter` for removal, iterate backward when in-place removal is truly required, or collect edits and apply them after the read-only pass. A `sort` comparator should be consistent and side-effect-free; sorting while another consumer is reading the same array creates an avoidable shared-state race in program logic.

## 4. Real Code — See It Working

This self-contained inline script uses Node's built-in assertions to make identity and contents explicit. Paste it into a JavaScript file or run it from a Node REPL:

```js
import assert from "node:assert/strict";

const source = [3, 1, 2];
const alias = source;
const sortedCopy = source.toSorted((a, b) => a - b);

assert.deepEqual(source, [3, 1, 2]);
assert.deepEqual(sortedCopy, [1, 2, 3]);
assert.equal(alias, source); // An alias still points at the original object.
assert.notEqual(sortedCopy, source); // Copying creates a new identity.

const users = [
  { id: 1, name: "Ada", active: true },
  { id: 2, name: "Lin", active: false },
];

const activeUsers = users.filter((user) => user.active);
const renamedUsers = users.map((user) =>
  user.id === 1 ? { ...user, name: "Ada Lovelace" } : user,
);

assert.deepEqual(activeUsers, [{ id: 1, name: "Ada", active: true }]);
assert.equal(users[0].name, "Ada"); // map returned a new array and update object.
assert.equal(renamedUsers[0].name, "Ada Lovelace");

function removeAt(items, index) {
  // toSpliced expresses removal without changing a state or prop-owned array.
  return items.toSpliced(index, 1);
}

assert.deepEqual(removeAt(["a", "b", "c"], 1), ["a", "c"]);

// Older runtimes can use a spread copy before a mutating method.
const olderRuntimeSorted = [...source].sort((a, b) => a - b);
assert.deepEqual(olderRuntimeSorted, [1, 2, 3]);
assert.deepEqual(source, [3, 1, 2]);

console.log("Array mutation examples passed");
```

For React state, the same rule looks like this:

```jsx
import { useState } from "react";

function TodoList() {
  const [todos, setTodos] = useState([]);

  function addTodo(title) {
    // The updater receives the latest state, and the spread creates a new array.
    setTodos((current) => [...current, { id: crypto.randomUUID(), title }]);
  }

  function completeTodo(id) {
    // Copy the changed object too; the old state's nested object must stay stable.
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, completed: true } : todo,
      ),
    );
  }

  function sortByTitle() {
    // toSorted avoids reordering the array that the previous render owns.
    setTodos((current) =>
      current.toSorted((a, b) => a.title.localeCompare(b.title)),
    );
  }

  return null;
}
```

If the target browsers do not provide the ES2023 copying methods, use `[...current].sort(...)`, `[...current].reverse()`, or a spread/slice construction for insertion and removal. A shallow copy is enough when only array structure changes; copy the affected object as well when changing an object's property.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Which common array methods mutate the original array?**

`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, and `copyWithin` mutate it. The important detail is not memorizing a list in isolation: inspect whether the method changes the receiver's elements, order, or length. `sort` and `reverse` return the same array; `splice` returns removed elements, which is not the new array.

**Q: What is the difference between `slice` and `splice`?**

`slice(start, end)` returns a shallow copy of a range and leaves the source alone; `end` is excluded. `splice(start, deleteCount, ...items)` changes the source by deleting and/or inserting elements, then returns a new array containing the deleted elements. The similar names are a common interview trap.

**Q: Why does `sort` cause bugs even when its result is assigned to a new variable?**

`const sorted = values.sort(compare)` does not create a second array. `sort` rearranges `values` and returns that same array, so `sorted === values` is true. Use `values.toSorted(compare)` or `[...values].sort(compare)` when the original must remain unchanged.

**Q: Why does React care about array identity?**

Reference equality is a cheap change signal. Mutating an existing state array and passing that same reference back can make React treat the state value as unchanged, and it can make memoized children or selectors reuse stale work. Creating a new array communicates that the collection changed; creating new objects for changed elements preserves the same guarantee one level deeper.

**Q: Is a spread copy a deep clone?**

No. `[...items]` copies the outer array and each element reference. It prevents operations such as `sort` from changing the old array's ordering, but `copy[0].name = "new"` still changes the shared object. Use an object copy for the item being changed, and use a deliberate domain-specific deep-copy strategy only when the data model requires it.

**Q: How would you remove items safely while iterating?**

For a new result, use `filter`, such as `items.filter(item => item.id !== id)`. If an in-place edit is required for a local, exclusively owned work array, iterate from the last index toward zero so removing an item does not move an unread item into a skipped position. In state and shared data, prefer the non-mutating result.

**Q: Are `toSorted`, `toReversed`, and `toSpliced` deep or lazy copies?**

They are non-mutating methods that return new arrays with shallowly copied element references. They are not a deep clone, and they do not make nested objects independent. Their value is that the copy-before-operation intent is explicit and built into the method.

## 6. The Traps — What Goes Wrong

- **“`const` means immutable.”** `const` blocks reassignment of the variable, not `items.push(...)` or `items[0] = ...`. Use `Object.freeze` for a shallow runtime guard, or—more importantly—adopt ownership and immutable-update rules.

- **Sorting props or state in place.** `items.sort()` changes the caller's array before returning. This can reorder data for another component even if the current function never calls a setter. Copy first or use `toSorted`.

- **Using `splice` as if it returned the updated array.** `const remaining = items.splice(index, 1)` gives the removed elements. The original was changed, and `remaining` is not the remaining collection. Use `items.toSpliced(index, 1)` or `items.filter(...)`.

- **Removing during a forward loop.** After `items.splice(i, 1)`, the old `i + 1` moves to `i`; incrementing `i` skips it. Filter in one pass, or decrement/iterate backward when mutation is unavoidable.

- **Assuming shallow copying protects nested records.** `const next = [...items]` gives a new container but shared records. Update a record with `{ ...record, field: value }` and replace it in a new array.

- **Using default `sort` for numbers.** Without a comparator, values are compared as strings, so `[2, 10, 1].sort()` becomes `[1, 10, 2]`. Use `(a, b) => a - b` for ascending numeric order.

- **Calling a non-mutating method but ignoring its result.** `items.filter(...)` does not edit `items`; it creates a result that must be assigned or returned. Mutation and non-mutation differ in both side effect and how the result is consumed.

## 7. Compare With Related Concepts

| Choice | What happens | When to use |
| --- | --- | --- |
| `sort` / `reverse` | Reorders the existing array and returns it | Only when the array is local and exclusively owned, and in-place change is intentional |
| `toSorted` / `toReversed` | Returns a reordered shallow copy | Default for state, props, cache inputs, and shared arrays |
| `splice` | Changes length/order and returns removed elements | Use only for an intentionally mutable local; otherwise use `toSpliced`, `slice`, or `filter` |
| `slice` | Returns a shallow range copy; source is unchanged | Read a range or build a copy before a legacy mutating method |
| `map` | Returns one output per input; source is unchanged | Transform values or replace selected objects immutably |
| `filter` | Returns only matching elements; source is unchanged | Remove items by a condition |
| `Object.freeze` | Shallowly rejects or prevents direct property changes | Development guard or API boundary; not a deep immutability solution |

Use mutation for a short-lived array that no other code can observe and where avoiding an allocation is meaningful. Use a new array for state, props, memoized inputs, reducer results, and shared data; the new identity makes ownership and change detection predictable. Remember that immutability is about the update boundary, not about pretending every nested value was deep-cloned.

## 8. 🧠 The Memory Hook — What Sticks

If two parts of the program hold the same folder, writing on the folder changes both views; a new photocopy changes the identity and protects the old view. For arrays, ask “who else can see this reference?”—then mutate only private work data, and copy before changing shared state.
