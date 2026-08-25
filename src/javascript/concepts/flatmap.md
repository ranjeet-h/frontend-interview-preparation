# flatMap

## 1. Why This Exists — The Problem First

Imagine an API response containing roles, and each role containing permissions. A plain `map` gives you an array of permission arrays, but the authorization check needs one list of permission names. You can write `roles.map(...).flat()`, yet that makes the “one input can produce zero, one, or many outputs” relationship easy to miss. `flatMap` exists to express that relationship directly.

The same problem appears when a search query produces several index terms, a menu item contributes several links, or a record should be removed by producing no output. The important question is not “how do I flatten an array?” It is “how many output items should this input item contribute?”

## 2. The Analogy — Make It Obvious

Think of a packing station processing one customer order at a time. The worker opens an order, decides which packages it contributes, and places those packages onto one outgoing conveyor belt. An order may contribute several packages, one package, or no packages at all.

The order is the input element. The worker is the callback. The packages returned by the worker are an array. The conveyor belt is the final output array. The station opens only the outer package list supplied for that order; if one returned package is itself a box containing more boxes, those inner boxes stay intact. That is the “flatten one level” part.

So `map` records one result container for every order, while `flatMap` immediately places the contents of each returned array onto the shared belt. Returning `[]` means the order contributes nothing. Returning a normal value means that value itself is one package, not something to unpack.

## 3. How It Actually Works — The Full Explanation

For an array `source`, `source.flatMap(callback)` performs the useful equivalent of `source.map(callback).flat(1)`: it calls the callback for each present source element, then combines returned arrays into one result by removing exactly one array boundary.

For each input element, the result contribution follows these rules:

- Return `[a, b]` and the output receives `a` and `b` as two items.
- Return `[a, [b, c]]` and the output receives `a` and `[b, c]`; the inner array remains because only one level is removed.
- Return `[]` and the output receives nothing, which makes `flatMap` useful for a small one-pass map-and-filter transformation.
- Return `"ready"`, `null`, an object, or a promise and that value is appended as one output item. Only arrays are flattened.

The callback receives the same arguments as `map`: the current value, its index, and the source array. It can also receive a `thisArg` when using the optional second argument, although an arrow function does not take its `this` from that argument. `flatMap` returns a new array and does not change the source array itself. It is a shallow operation: object references placed in the result still point at the same objects.

Sparse arrays have two related hole rules. A hole in the source array has no value, so the callback is not called for that position. A hole in an array returned by the callback contributes no output item when the one-level flatten happens. This is different from returning `undefined`, which contributes an actual `undefined` value.

The method is not an asynchronous iterator. If the callback is `async`, each call returns a promise, and promises are ordinary non-array values to `flatMap`. The result is therefore an array of promises, not resolved values. Resolve first with `Promise.all`, then flatten the resolved arrays if that is the intended shape.

The method is also generic enough to be called with an array-like object, provided it has a numeric `length` and indexed properties. The callback’s return value still follows the same rule: only actual arrays are flattened. In normal application code, using it on real arrays is clearer.

## 4. Real Code — See It Working

```js
const roles = [
  { name: "editor", permissions: ["article:read", "article:write"] },
  { name: "support", permissions: ["article:read", "ticket:read"] },
  { name: "guest", permissions: [] },
];

const permissions = roles.flatMap((role) => role.permissions);

console.log(permissions);
// ["article:read", "article:write", "article:read", "ticket:read"]
```

The empty permission list is intentional: the guest role contributes zero items. If permissions must be unique, deduplicate as a separate policy decision instead of hiding it inside `flatMap`:

```js
const permissions = [
  "article:read",
  "article:write",
  "article:read",
  "ticket:read",
];

const uniquePermissions = [...new Set(permissions)];
console.log(uniquePermissions);
// ["article:read", "article:write", "ticket:read"]
```

A production search index often turns each document into several searchable entries and skips documents that are not ready. Returning an array makes the one-to-many shape visible:

```js
const documents = [
  { id: 1, status: "published", title: "React Forms", tags: ["react", "forms"] },
  { id: 2, status: "draft", title: "Private Notes", tags: ["draft"] },
];

const indexEntries = documents.flatMap((document) => {
  if (document.status !== "published") return []; // WHY: an unpublished document has no public index entries.

  return [
    { term: document.title.toLowerCase(), documentId: document.id },
    ...document.tags.map((tag) => ({ term: tag, documentId: document.id })),
  ]; // WHY: one document can create a title entry and several tag entries.
});

console.log(indexEntries);
// [
//   { term: "react forms", documentId: 1 },
//   { term: "react", documentId: 1 },
//   { term: "forms", documentId: 1 }
// ]
```

The flattening depth is visible here:

```js
const result = [1, 2].flatMap((number) => [number, [number * 10]]);
console.log(result);
// [1, [10], 2, [20]]

const values = [1, 2].flatMap((number) =>
  number === 1 ? [] : undefined,
);
console.log(values);
// [undefined]
```

The first callback returns an outer array containing a number and an inner array. Only the outer array is opened. In the second example, `[]` contributes nothing, while `undefined` is a real returned value and remains in the result.

Holes and non-array returns are not silently converted into something else:

```js
const sparse = [];
sparse[1] = "kept";
const seen = sparse.flatMap((value, index) => [index, value]);
console.log(seen);
// [1, "kept"] — index 0 was a hole, so its callback never ran.

const nonArray = ["a"].flatMap(() => ({ 0: "x", length: 1 }));
console.log(nonArray);
// [{ 0: "x", length: 1 }] — an array-like object is not an Array.
```

An asynchronous callback needs a different sequence:

```js
const loadTags = async (documentId) => [`doc:${documentId}`, "public"];

const pending = [10, 11].flatMap(async (documentId) => loadTags(documentId));
console.log(pending.every((value) => value instanceof Promise));
// true

const resolvedEntries = (await Promise.all(
  [10, 11].map((documentId) => loadTags(documentId)),
)).flat();

console.log(resolvedEntries);
// ["doc:10", "public", "doc:11", "public"]
```

Run the last example as an ES module or inside an async function. The `map` plus `Promise.all` step waits for every request; the final `flat()` then combines the arrays those requests returned. That explicit separation is easier to reason about when failures, cancellation, or concurrency limits matter.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `flatMap` do?**

It calls a mapping callback and flattens the arrays returned by that callback by one level. Conceptually, `items.flatMap(fn)` has the same element result as `items.map(fn).flat(1)`, while expressing the transformation as one operation. The useful model is one input item contributing zero, one, or many output items.

**Q: How is `flatMap` different from `map`?**

`map` preserves one output slot per present input element. If the callback returns an array, that array stays nested. `flatMap` opens one returned array boundary, so the output length can shrink, stay similar, or grow. Use `map` when the one-to-one shape matters; use `flatMap` when each input can emit a variable number of output items.

**Q: How deep does `flatMap` flatten?**

Exactly one level. A callback result such as `[value, [nested]]` becomes `value` and `[nested]` in the final output. It does not recursively flatten all nested arrays. If the data genuinely needs deeper flattening, use an explicit `flat(depth)` or redesign the transformation so the depth is obvious.

**Q: How can `flatMap` filter an item?**

Return `[]` for that input. Flattening an empty array contributes zero items. Returning `null` or `undefined` does not filter; those are non-array values and become actual output entries.

**Q: What happens if the callback returns a non-array value?**

That value is appended as one item. A string remains one string, an object remains one object, and a promise remains one promise. An object with numeric keys and a `length` property is still not flattened unless it is an actual array.

**Q: What happens with sparse arrays?**

The callback is skipped for holes in the source array. Holes in arrays returned by the callback do not become `undefined` entries during flattening; they contribute no element. This is why a deliberate `undefined` return and a missing array slot are observably different.

**Q: Does `flatMap` mutate the original array?**

No. It creates a new result array and leaves the source array’s structure unchanged. That does not make nested objects immutable: if the callback changes a property on an object from the source, the same object reference can be observed through the source and result. Prefer creating updated objects when mutation would create a correctness problem.

**Q: Is `flatMap` faster than `map().flat()`?**

The main guarantee is the result shape and readability, not a universal speed promise. `map().flat()` creates an intermediate mapped array, while `flatMap` can build the final array directly, so it may reduce intermediate allocation. The callback, array sizes, engine, and data shape determine the real performance. Choose it first because the one-to-many intent is clear, then measure if this path is hot.

**Q: Can `flatMap` await an async callback?**

No. `flatMap` is synchronous and does not inspect or await promises. An `async` callback returns a promise for each input, and promises are appended as ordinary non-array values. Use `Promise.all` with `map`, then flatten the resolved arrays, or use an explicit sequential loop when request ordering, rate limits, or failure handling require it.

**Q: When is `flatMap` less readable than separate operations?**

When the callback contains several unrelated decisions, nested conditions, side effects, or asynchronous work. A clear `filter` followed by `map`, or named helper functions followed by `flat`, can explain intent better. The shortest chain is not automatically the clearest production code.

## 6. The Traps — What Goes Wrong

Returning a nested array and expecting recursive flattening is the most common mistake. `flatMap` removes one boundary only, so a result like `[[[1]]]` still contains nesting after the operation. Inspect the shape returned by the callback; if the callback itself returns arrays inside arrays, decide explicitly how many boundaries should disappear.

Returning `undefined` to drop an item is another frequent bug. `undefined` is a value, so it appears in the result. Use `[]` for “emit nothing,” and reserve `undefined` for a real output state when consumers can handle it.

Using `flatMap` with an `async` callback creates an array of promises. It can look plausible in a quick console log because promises are valid objects, but the data has not been loaded. Resolve the promises first, and choose whether the requests should run concurrently, sequentially, or under a concurrency limit.

Using `flatMap` when the nested grouping carries meaning destroys information. For example, `orders.map((order) => order.lineItems)` preserves which line items belong to each order; `orders.flatMap((order) => order.lineItems)` intentionally discards that boundary. Flatten only when downstream logic really wants one shared collection.

Mutating source objects inside the callback makes the “new array” guarantee misleading. The outer array is new, but its object elements may be shared references. Treat `flatMap` as a shape transformation, not as a deep clone.

Calling `flatMap` on a huge dataset can still allocate a large result and retain every emitted object. It is not a streaming transform and it does not impose a memory limit. For very large inputs, process chunks, use a generator or stream where appropriate, or keep the data grouped if flattening is not required.

## 7. Compare With Related Concepts

`map` is the one-to-one choice: use it when every input element should correspond to exactly one output position, including when that output happens to be an array. Use `flatMap` when an input may emit zero, one, or many items and the outer grouping should disappear.

`flat` only reshapes an already nested array; it does not calculate new values. Use `flat` when the nested arrays already contain the final items. Use `flatMap` when each input must first be transformed and its returned array then joined into the outer result.

`filter` answers a yes-or-no question and preserves each accepted original element once. Use it for a simple predicate. Use `flatMap` for a one-to-many transformation, or when returning `[]` and `[value]` makes the combined filtering and expansion genuinely clearer.

`reduce` can implement the same behavior by pushing values into an accumulator, but it exposes more bookkeeping and makes accidental mutation easier. Use `reduce` when the result is not simply a flattened array, such as a grouped object, a sum, or a multi-field accumulator. Use `flatMap` when the output is specifically a list of emitted items.

`Promise.all(...map(...))` handles asynchronous one-to-one resolution, while `flatMap` is synchronous. Use `Promise.all` to wait for async work, then `flat` the resolved arrays if needed; do not expect `flatMap` to perform either waiting or error coordination.

## 8. 🧠 The Memory Hook — What Sticks

Picture one input item handing a packing station a small box: the station opens exactly that box, puts its contents on the shared conveyor, and throws away nothing unless the box is empty. `flatMap` is “one input, zero/one/many outputs, open one layer”; it is not deep flattening and it is not async waiting.
