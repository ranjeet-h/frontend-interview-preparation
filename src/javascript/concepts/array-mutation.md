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
#### Which array methods mutate?
- **The Engine Mechanism (Why it behaves this way):** Mutating array methods modify the internal elements and structure of the existing array object located in the Memory Heap without creating a new object. The array's memory address pointer remains exactly the same. The primary mutating methods are:
  - `push()` and `pop()` (add/remove from end)
  - `unshift()` and `shift()` (add/remove from beginning)
  - `splice()` (adds or removes elements from a specific index)
  - `sort()` (sorts elements in-place)
  - `reverse()` (reverses order in-place)
  - `fill()` (fills elements with a static value)
  - `copyWithin()` (copies array elements within the array)
- **The Unforgettable Mental Model:** The **Haircut**. Getting a haircut changes the hair on your head (in-place mutation). You do not walk out of the salon with a completely new head; it is the exact same head (same reference pointer) but with a different style.
- **The Trap:** Thinking that assigning an array to `const` prevents these mutating methods from working. `const` only locks the stack pointer variable from reassignment; it does not prevent mutation of the heap object's properties or elements.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Mutating array methods are those that alter the data in the existing array heap allocation directly. This includes methods like `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, and `fill`. Because the memory address of the array is unchanged, mutating these arrays directly in React will not trigger re-renders."

#### Does `sort` mutate?
- **The Engine Mechanism (Why it behaves this way):** Yes. The `Array.prototype.sort()` method sorts the elements of the array **in-place** in the Memory Heap. Under the hood, modern engines like V8 sort using highly optimized algorithms (like Timsort). These algorithms modify index pointers and swap elements directly within the existing array block in memory. The method then returns a reference to that *same* array.
- **The Unforgettable Mental Model:** The **Re-arranging of the Bookshelf**. You go to your bookshelf and re-organize the books in alphabetical order. You did not buy a new bookshelf; it is the exact same shelf, but the contents have shifted positions.
- **The Trap:** Writing `const sorted = arr.sort()` and thinking `sorted` and `arr` are now two different arrays. `sorted === arr` will evaluate to `true` because they point to the exact same heap address.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, `sort` mutates the original array in place. It performs an in-place element reordering on the heap and returns the original array's memory pointer. Attempting to sort a React state array directly with `sort` will mutate state invisibly, breaking component lifecycle updates."

#### How do you sort without mutation?
- **The Engine Mechanism (Why it behaves this way):** To sort without mutating, you must first allocate a new array object in the Heap and then sort it, or use the modern non-mutating copy method.
  - *Classic ES6 Approach:* Copy using the spread operator first: `const sorted = [...arr].sort()`. The spread operator allocates a new array and copies references, and then `sort()` mutates that new temporary array safely.
  - *Modern ES2023 Approach:* Use `toSorted()`: `const sorted = arr.toSorted()`. The engine handles both the shallow copy and the sorting under a single native operation, returning the new sorted array.
- **The Unforgettable Mental Model:** The **Double Entry Ledger**. Before you sort the ledger pages and make a mess of the original file, you photocopy the entire ledger (copy) and rearrange the copied pages on your desk.
- **The Trap:** Sorting nested arrays of objects. Although the outer array is a copy, the objects inside the sorted array are still shallow references, meaning modifying an object inside the sorted copy will mutate the object in the original array.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To sort an array without mutating it, we can shallow-copy the array using the spread operator before invoking `sort`, such as `[...arr].sort()`. Alternatively, in modern environments, we should use the native ES2023 `toSorted` method, which automatically allocates a new sorted copy in the heap, leaving the original array completely untouched."

#### Why does React care about array immutability?
- **The Engine Mechanism (Why it behaves this way):** React state hooks use strict equality (`Object.is` or `===`) to determine if state has changed. When you mutate an array in place (e.g. `arr.push(newVal)`), the array's memory address remains identical (e.g. `0x32A`). When React runs its comparison, it sees `0x32A === 0x32A`, concludes that nothing has changed, and cancels the render cycle. Immutability forces you to allocate a new array in the heap, creating a new pointer (e.g. `0x32B`), which React successfully identifies as a state change.
- **The Unforgettable Mental Model:** The **Security Scanner**. The scanner only checks the ticket number (reference pointer). If the ticket number is the same, it lets you pass without checking what is inside your bag (array elements), missing any items you added.
- **The Trap:** Thinking that `forceUpdate()` is an acceptable workaround for mutated arrays, which leads to slow rendering and breaks memoization downstream.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: React relies on reference equality to optimize rendering. If an array is mutated in place, its reference pointer remains the same, causing React's reconciliation engine to assume the state hasn't changed and skip the re-render. Immutability guarantees a new memory reference is created, signaling React to trigger a clean and predictable UI update."

#### `slice` vs `splice`?
- **The Engine Mechanism (Why it behaves this way):** 
  - `slice(start, end)` is **non-mutating**. It allocates a new array in the Heap and copies the references to elements from `start` up to (but not including) `end` from the original array.
  - `splice(start, deleteCount, ...items)` is **mutating**. It directly alters the original array on the heap, removing `deleteCount` elements starting from `start`, inserting any new `items` in their place, and shifting the remaining elements. It returns a new array containing only the *deleted* elements.
- **The Unforgettable Mental Model:** 
  - `slice` is like taking a **Photograph** of a cake slice. You get a separate picture (new copy), but the actual cake is unharmed.
  - `splice` is like physically **Cutting a Chunk Out of the Cake** and pasting fruit in the hole. The original cake is permanently altered.
- **The Trap:** Confusing their names and calling `arr.splice()` inside a React state updater, which will mutate the state directly and return only the deleted elements as the new state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The core difference is that `slice` is non-mutating, whereas `splice` is mutating. `slice` returns a shallow copy of a portion of an array, leaving the original array intact. `splice` alters the original array in place by adding or removing elements, and returns an array of the deleted elements."

#### How do you add/remove immutably?
- **The Engine Mechanism (Why it behaves this way):** You do this by utilizing operators or methods that allocate a new array block in the heap instead of mutating the source.
  - *Adding:* Use the spread operator `const newArr = [...arr, newItem]` or `arr.concat(newItem)`.
  - *Removing:* Use `arr.filter(item => item.id !== targetId)` or `arr.toSpliced(index, 1)`. These methods iterate through the original array and copy references to the matching elements into a newly allocated array in the heap.
- **The Unforgettable Mental Model:** The **Assembly Line Copy**. Instead of gluing a part directly onto the current conveyor belt car (mutation), the robot copies the car blueprint, adds the new part to the copy, and pushes the new car onto a fresh conveyor belt.
- **The Trap:** Using `arr.filter()` but mutating properties of the elements during the filter check, which mutates the shared underlying objects in the heap.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To add an item immutably, we can use the spread operator to construct a new array reference: `[...arr, newItem]`. To remove an item immutably, we should use `filter` to generate a new array excluding the target element, or utilize the ES2023 `toSpliced` method."

#### What are `toSorted`, `toReversed`, and `toSpliced`?
- **The Engine Mechanism (Why it behaves this way):** These are native copy-on-write methods introduced in **ES2023 (ECMAScript 2023)**. Historically, developers had to manually write helper copies to sort, reverse, or splice arrays without mutating them. The JS engine now handles this natively: when these methods are invoked, the engine allocates a new array in the Heap, copy-assigns the values, performs the sort, reverse, or splice operation on this copy, and returns it.
- **The Unforgettable Mental Model:** The **Auto-Photocopier**. It has a built-in photocopy button. When you ask it to flip or rearrange (reverse or sort) the pages, it automatically prints a fresh copy of the booklet, flips the pages on the copy, and hands it to you.
- **The Trap:** Thinking these perform deep clones. They still perform a *shallow* copy of the array elements, so nested objects are still shared references.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `toSorted`, `toReversed`, and `toSpliced` are modern array methods introduced in ES2023. They serve as non-mutating, copy-on-write counterparts to `sort`, `reverse`, and `splice`. They natively create a shallow-copied array, perform the respective operations on the copy, and return it. This eliminates the need for manual array spreading before operations in modern JS."

## 8. Active recall test
1. **Name three mutating methods.**
   - **Explanation:** `push()`, `splice()`, and `sort()` (or `pop`, `shift`, `unshift`, `reverse`).
2. **Name three non-mutating methods.**
   - **Explanation:** `map()`, `filter()`, and `slice()` (or `concat`, `toSorted`, `toReversed`).
3. **What is the difference between `slice` and `splice`?**
   - **Explanation:** `slice` is non-mutating and returns a copy of a section of the array; `splice` is mutating and removes or replaces elements in the original array, returning the deleted elements.
4. **How do you remove an item immutably?**
   - **Explanation:** By using the `filter()` method to return a new array excluding the target item, or using the modern `toSpliced()` method.
5. **Why can mutation break memoization?**
   - **Explanation:** Memoization checks if inputs have changed using reference equality. If an array is mutated in place, its reference pointer remains identical. The memoization logic assumes the input has not changed and returns stale cached results, completely ignoring the internal changes.

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

