# flatMap

## Detailed explanation
`flatMap` maps each array item to a new value, then flattens result by one level. It is practical when one input item can produce zero, one, or many output items. Frontend code uses it for tags, menus, nested API rows, permissions, and search indexes.

It equals `array.map(fn).flat(1)`, but reads clearer and avoids one separate intermediate step.

## 1. One-line mental model
`flatMap` = map each item, then flatten one level.

## 2. Problem it solves
Transforming nested or one-to-many arrays often needs `map` plus `flat`.

## 3. Core idea
- Callback runs once per item.
- Return array to emit many items.
- Return empty array to drop item.
- Flattens only one level.
- Does not mutate source array.

## 4. Visual / analogy
One order can become many line items.

```txt
[order1, order2] -> [[itemA, itemB], [itemC]] -> [itemA, itemB, itemC]
```

## 5. Minimal example

```js
const words = ["hi there", "react js"];
const tokens = words.flatMap((text) => text.split(" "));
// ["hi", "there", "react", "js"]
```

## 6. Real-world example

```js
const allPermissions = roles.flatMap((role) => role.permissions);
```

## 7. Common interview questions
#### What does `flatMap` do?
- **The Engine Mechanism (Why it behaves this way):** `Array.prototype.flatMap(callback, thisArg)` maps each element using the mapping function, and then flattens the resulting array. The engine allocates a new array in the Heap. It executes the callback for each item in the original array. If the callback returns a primitive or an object, it is appended to the new array. If the callback returns an array, the engine unpacks its elements exactly one level deep and appends them to the new array. This is completed in a single pass over the elements, avoiding the overhead of creating an intermediate mapped array object.
- **The Unforgettable Mental Model:** The **Suitcase Unpacker**. You open a box of boxes. For each box inside, you look at the item inside. If it is a normal item, you put it on the table. If it is a suitcase (an array), you open it up, take out the shirts inside, and put the shirts directly on the table.
- **The Trap:** Returning a deeply nested array (e.g. `[[[1]]]` or arrays of arrays) and expecting it to flatten into a single flat array. It only unpacks the first level of arrays it encounters.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `flatMap` is a high-order array method that maps each element of an array using a callback function and then flattens the resulting structure by exactly one level. It behaves identically to calling `.map()` followed by a depth-1 `.flat()`, but executes in a single optimized pass, making it perfect for one-to-many, one-to-zero, or mapping transformations that expand arrays."

#### How is it different from `map`?
- **The Engine Mechanism (Why it behaves this way):** `map` maintains a strict 1-to-1 relationship between the input array and the output array. If the input array has length $N$, the output array must have length $N$. If the mapping callback returns an array, that array remains nested inside the output. `flatMap` allows for a **1-to-many**, **1-to-1**, or **1-to-zero** relationship. Because of the post-mapping flat step, if a callback returns an array of length $K$, those $K$ elements are flattened into the outer array, changing the overall length of the returned array.
- **The Unforgettable Mental Model:** 
  - `map` is like a **Slot Machine**. You pull the lever (process an item), and you get exactly one prize container, even if the container has multiple toys inside.
  - `flatMap` is like a **Piñata**. You hit each item, it breaks open (flattens), and all the individual candies scatter directly onto the floor for you to collect.
- **The Trap:** Using `flatMap` when you *want* to keep the nested arrays separate, which accidentally destroys your sub-array structures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `map` always creates a new array of the exact same length as the original, preserving nested array structures. In contrast, `flatMap` flattens returned arrays by one level, which allows us to expand a single element into multiple elements or filter elements out entirely by returning empty arrays, modifying the final array length."

#### How deep does it flatten?
- **The Engine Mechanism (Why it behaves this way):** The flattening depth of `flatMap` is strictly **1**. Under the hood, the engine performs the equivalent of `flat(1)` on the mapped results. If the callback returns a deeply nested array, say `[[value]]`, only the outermost array boundary is stripped, resulting in `[value]` remaining nested as a depth-1 sub-array in the final output.
- **The Unforgettable Mental Model:** The **Single-Shell Egg**. You have nested Russian nesting dolls. The unpacker (depth-1 flat) is only allowed to open the outermost doll. It leaves all other nested dolls closed inside.
- **The Trap:** Assuming that since it's called `flatMap`, it operates like a recursive `flat(Infinity)` operation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `flatMap` flattens with a maximum depth of exactly one. If the mapping callback returns a deeply nested array, only the first layer of array wrapping is stripped. If a deeper flatten is required, we must explicitly chain a `.flat()` call with the desired depth after a standard `.map()`."

#### Does it mutate original array?
- **The Engine Mechanism (Why it behaves this way):** No. `flatMap` is a non-mutating, copying method. The engine allocates a completely new array container on the Heap to hold the transformed and flattened elements. The original array remains completely unchanged in memory.
- **The Unforgettable Mental Model:** The **Factory Blueprint**. The factory reads the original assembly instructions (original array), modifies and replicates them on a brand new assembly line, and produces a new set of products (new array), leaving the original blueprints untouched on the clipboard.
- **The Trap:** Mutating the properties of the objects in the original array *inside* the `flatMap` callback. Since the copy is shallow, mutating nested object properties still affects the original objects.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: No, `flatMap` does not mutate the original array. It allocates and returns a brand-new array on the heap. However, since the mapping copies references for reference-type elements, mutating any captured object property inside the callback will still alter the shared object in the original array."

#### When would you return `[]`?
- **The Engine Mechanism (Why it behaves this way):** You return an empty array `[]` when you want to **exclude or filter out** an element from the output. When the engine maps an item to `[]` and then flattens it by one level, the empty array unpacked contains no elements. As a result, nothing is appended to the final array, effectively shrinking the output array's length.
- **The Unforgettable Mental Model:** The **Invisible Cloak**. Handing the unpacker an empty box (`[]`) means when they open it, nothing is placed on the table. The item is effectively vanished from the final count.
- **The Trap:** Returning `null` or `undefined` expecting them to be dropped. `null` and `undefined` are primitives, so they will be placed directly in the output array as `[null, undefined]`. You must return `[]` to filter them out.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: We return an empty array `[]` when we want to filter out or drop an item from the final array. When `flatMap` flattens the empty array, it contributes zero elements to the output, allowing us to perform a map and a filter operation simultaneously in a single, elegant step."

## 8. Active recall test
1. **What two operations does `flatMap` combine?**
   - **Explanation:** It combines a standard element transformation `.map()` with a depth-1 array flattening `.flat(1)`.
2. **What is flatten depth?**
   - **Explanation:** The flattening depth is strictly capped at one level deep (`flat(1)`).
3. **How do you drop an item?**
   - **Explanation:** By returning an empty array `[]` from the mapping callback function.
4. **How do you emit multiple items?**
   - **Explanation:** By returning an array containing all the items you want to emit from the callback function (e.g. `[itemA, itemB]`).
5. **Is original array mutated?**
   - **Explanation:** No. `flatMap` allocates a completely new array container on the heap and leaves the original array untouched.

## 9. Mistakes / traps
- Expecting deep flatten.
- Returning non-array accidentally.
- Using it when simple `map` is clearer.
- Mutating input items inside callback.

## 10. Compare with related concepts
- **`map` vs `flatMap`:** one output per input vs one-to-many.
- **`flat` vs `flatMap`:** flatten existing nested array vs transform then flatten.
- **`filter` vs `flatMap`:** predicate drop vs return `[]`.

## 11. Summary from memory
Explain how to turn nested API role permissions into one flat permission list.

## 12. Spaced revision prompts
- 1 day: Define `flatMap`.
- 3 days: Compare `map` and `flatMap`.
- 7 days: Use `flatMap` to drop and expand.
- 14 days: Explain one-level flatten limit.

