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
- What does `flatMap` do?
- How is it different from `map`?
- How deep does it flatten?
- Does it mutate original array?
- When would you return `[]`?

## 8. Active recall test
1. What two operations does `flatMap` combine?
2. What is flatten depth?
3. How do you drop an item?
4. How do you emit multiple items?
5. Is original array mutated?

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

