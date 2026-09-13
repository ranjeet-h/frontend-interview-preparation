# Shallow Copy vs Deep Copy

## 1. Why This Exists — The Problem First

An order editor keeps a draft object in React state. A developer spreads the draft, changes `draft.customer.address.city`, and expects the old state to stay untouched. The screen looks correct for the moment, but undo history, memoized selectors, or another component now sees the old state change too because the nested address was never copied.

The opposite mistake is just as costly: deep-cloning a large state tree for every keystroke. That allocates and traverses far more data than the edit needs. The real skill is knowing where copying stops, which references are allowed to remain shared, and which cloning tool matches the data you actually have.

## 2. The Analogy — Make It Obvious

Imagine a filing cabinet containing folders. A shallow copy gives you a new filing cabinet, but the folders inside are still the same physical folders. You can rename the label on your new cabinet without affecting the old cabinet, but writing a document inside a shared folder is visible from both cabinets.

A deep copy gives you a second cabinet and photocopies every folder and document inside it. The new cabinet can now be changed independently. The photocopier also needs a rule for a folder that contains a reference back to an earlier folder: it must remember what it already copied, or it will follow the reference forever.

In JavaScript, the cabinet is the top-level object or array. A primitive such as a string is already an independent value. A nested object, array, `Map`, or function is a value that can be reached through a reference, so a shallow operation can put the same nested value in both cabinets.

## 3. How It Actually Works — The Full Explanation

The key invariant is simple: a shallow copy creates a new outer container, but it does not recursively copy the values stored inside that container.

```js
const original = {
  title: "Invoice",
  tags: ["draft"],
  customer: { name: "Asha" },
};

const copy = { ...original };

console.log(copy !== original); // true: the outer objects differ
console.log(copy.customer === original.customer); // true: the nested object is shared
console.log(copy.tags === original.tags); // true: the nested array is shared
```

Object spread and `Object.assign` copy the source's own enumerable properties into a new object. Array spread and `slice()` create a new array and copy its element values. For a primitive value, that value is independent. For an object value, the new property receives the same reference to the existing object. This is why saying “JavaScript copies memory addresses” is a useful shortcut but not a language-level promise: the observable fact is that two properties refer to the same object, which identity comparison exposes with `===`.

```js
const state = {
  user: { name: "Asha", preferences: { theme: "light" } },
  notifications: [{ id: 1, read: false }],
};

// A top-level spread protects only state itself.
const unsafe = { ...state };
unsafe.user.preferences.theme = "dark";
console.log(state.user.preferences.theme); // "dark"

// An immutable update copies every container on the path that changes.
const safe = {
  ...state,
  user: {
    ...state.user,
    preferences: { ...state.user.preferences, theme: "dark" },
  },
};
console.log(safe !== state); // true
console.log(safe.user !== state.user); // true
console.log(safe.notifications === state.notifications); // true: unchanged branch is reused
```

That last pattern is usually the right React/reducer operation. It preserves reference equality for unchanged branches, so selectors and memoized components can cheaply detect what did not change. A full deep copy would break all those unchanged identities and spend work copying data that the update never touched.

A deep copy instead walks the reachable object graph and creates a new container for each cloneable reference. “Graph” matters: data is not always a tree. Two properties may point to one shared object, or an object may point back to itself. A correct clone must preserve those relationships and must track already-seen source objects.

`structuredClone(value)` is the general built-in choice for cloneable data. It handles cycles and supports many built-ins, including `Date`, `Map`, `Set`, `RegExp`, typed arrays, and `ArrayBuffer`. It does not clone everything: functions, DOM nodes, `WeakMap`, `WeakSet`, and symbols as values are not structured-cloneable and cause `DataCloneError`. User-defined class instances are not recreated with their original prototype; their clone is generally a plain object containing the serializable data. A transfer list can move certain buffers instead of copying them, which changes the original buffer's usability, so that option is a deliberate ownership transfer rather than an ordinary copy.

JSON round-tripping is serialization, not a general deep-copy algorithm. `JSON.stringify` first applies JSON's restricted data model and `JSON.parse` builds ordinary objects and arrays from the resulting text. Dates normally become ISO strings through `toJSON`; `Map` and `Set` become `{}` unless custom serialization is supplied; object properties containing `undefined`, functions, or symbols are omitted; `NaN` and infinities become `null`; `BigInt` throws; and cycles throw. In arrays, unsupported values become `null`. It can be acceptable for a deliberately JSON-shaped payload, but it is unsafe as a default clone.

For application state, the best “deep copy” is often neither `structuredClone` nor a handwritten universal clone. Copy only the changed path, use a library such as Immer when its draft model fits the team, or normalize shared entities so one update touches a small, explicit branch. A custom clone is appropriate only when the data contract is known and the required types, cycles, identity rules, and failure policy are specified.

## 4. Real Code — See It Working

This example is runnable with Node.js and shows a shallow boundary, a safe production-style update, and a cycle-aware clone for a deliberately small data contract.

```js
function updateLineQuantity(order, lineId, quantity) {
  return {
    ...order,
    lines: order.lines.map((line) =>
      line.id === lineId ? { ...line, quantity } : line,
    ),
  };
}

const order = {
  id: "o-1",
  customer: { id: "c-1", name: "Asha" },
  lines: [{ id: "l-1", sku: "book", quantity: 1 }],
};

const revised = updateLineQuantity(order, "l-1", 3);
console.log(order.lines[0].quantity); // 1: the old snapshot is safe
console.log(revised.lines[0].quantity); // 3
console.log(revised.customer === order.customer); // true: unchanged data is shared
```

Use `structuredClone` when the value is data, not behavior, and the supported runtime provides it:

```js
const original = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  labels: new Map([["priority", "high"]]),
};
original.self = original; // WHY: this proves cycles do not recurse forever.

const cloned = structuredClone(original);
cloned.createdAt.setUTCFullYear(2027);
cloned.labels.set("priority", "normal");

console.log(original.createdAt.getUTCFullYear()); // 2026
console.log(original.labels.get("priority")); // "high"
console.log(cloned.self === cloned); // true: the cycle is rebuilt inside the clone
```

When a custom contract is smaller than JavaScript's full object model, make that contract explicit. This clone supports plain objects, arrays, `Date`, `Map`, `Set`, and cycles; it rejects unsupported values instead of silently corrupting them.

```js
function cloneData(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new TypeError("cloneData accepts data, not behavior or symbol values");
    }
    return value;
  }
  if (seen.has(value)) return seen.get(value); // WHY: preserve cycles and repeated references.
  if (value instanceof Date) return new Date(value.getTime());

  if (value instanceof Map) {
    const result = new Map();
    seen.set(value, result);
    for (const [key, entry] of value) result.set(cloneData(key, seen), cloneData(entry, seen));
    return result;
  }
  if (value instanceof Set) {
    const result = new Set();
    seen.set(value, result);
    for (const entry of value) result.add(cloneData(entry, seen));
    return result;
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("cloneData accepts only plain objects and supported built-ins");
  }

  const result = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const [key, entry] of Object.entries(value)) result[key] = cloneData(entry, seen);
  return result;
}

const graph = { name: "root", values: new Set([1, 2]) };
graph.self = graph;
const graphCopy = cloneData(graph);
console.log(graphCopy !== graph, graphCopy.self === graphCopy); // true true
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a shallow copy, and what remains shared?**

A shallow copy creates a new outer object or array and copies its immediate property or element values. Primitive values are independent values, but nested objects, arrays, maps, sets, and functions remain the same referenced values. Therefore `copy.nested === original.nested` can be `true` even though `copy !== original`.

**Q: Is object or array spread a deep copy?**

No. Spread copies one level. `{ ...object }` copies own enumerable properties, and `[...array]` copies the element values into a new array. Neither recursively clones nested objects. `slice()` and `Object.assign()` have the same shallow boundary for this discussion.

**Q: Why is a targeted copy usually better for React state?**

An immutable update must create new references along the path that changed, but it can reuse unchanged branches. That gives React and memoized selectors a useful identity signal and avoids traversing the whole state tree. The important rule is not “spread everything”; it is “copy every container you mutate, and no fewer.”

**Q: When is `structuredClone` useful?**

It is useful for cloneable, data-like values when you need independent nested containers and do not want to write type handling yourself. It preserves useful built-in data such as dates, maps, sets, regular expressions, typed arrays, and cycles. It is not a clone of arbitrary JavaScript behavior or application instances, so the data contract must exclude unsupported values and account for class prototypes.

**Q: What are the main problems with `JSON.parse(JSON.stringify(value))`?**

It loses or transforms values because JSON has fewer types than JavaScript. Dates become strings, maps and sets usually become empty objects, unsupported object properties disappear, special numbers become `null`, `BigInt` throws, and cycles throw. It also strips prototypes and methods. Use it only when the input is intentionally JSON data and those conversions are wanted.

**Q: How should you choose a custom deep-copy implementation?**

First list the allowed values and the required semantics: plain objects, arrays, dates, maps, sets, class instances, symbols, property descriptors, cycles, repeated references, and functions. Then choose a tested library or `structuredClone` if it covers that contract. Write a custom clone only for a narrow contract you can test; a “universal” recursive function is usually incomplete and dangerous.

**Q: Why do cycles matter?**

Naive recursion assumes every child eventually ends. A cycle violates that assumption, so a clone such as `for (...) result[key] = clone(child)` can recurse until a stack overflow. A `WeakMap` from each source object to its new object lets the algorithm return the existing clone when it encounters a reference again. That also preserves aliasing when two original properties point to the same child.

**Q: How are dates and maps different under common cloning choices?**

A shallow copy shares the same `Date` or `Map` object. JSON turns a date into text and a map into a plain empty object by default. `structuredClone` creates a new date and map with their data. A custom clone must explicitly copy the timestamp and iterate map keys and values, including deciding whether keys themselves should be cloned.

**Q: Does a deep copy always mean “no references are shared”?**

It means the clone does not share cloneable mutable objects with the source. It does not make immutable primitives into new identities, and behavior such as a function cannot be safely duplicated by copying its closure. A correct graph clone may also preserve repeated references inside the cloned graph: if `original.left === original.right`, a good clone keeps `copy.left === copy.right` while keeping both separate from `original.left`.

## 6. The Traps — What Goes Wrong

- **Wrong assumption: a top-level spread makes nested state immutable.** `const next = { ...state }` still shares `state.user`. Mutating `next.user.name` mutates the old snapshot. Copy each object and array on the path before changing it.

- **Wrong assumption: array spread copies the objects inside.** `[...items]` protects the array's length and slots, not each item. Use `items.map(item => ({ ...item, changed: true }))` when every item needs a new object, or copy only the matching item when one item changes.

- **Wrong assumption: JSON cloning is a harmless universal shortcut.** It silently changes dates and discards unsupported properties, then fails loudly for cycles or `BigInt`. The fix is to use `structuredClone`, a targeted immutable update, or a documented serializer for a known JSON contract.

- **Wrong assumption: `structuredClone` preserves class behavior.** The clone is not a new instance with all custom methods and prototype invariants restored. Keep class instances out of data snapshots, provide a `toJSON`/rehydration boundary, or write an explicit domain copy operation.

- **Wrong assumption: a recursive custom clone only needs objects and arrays.** It may mishandle dates, maps, sets, symbols, non-enumerable properties, accessors, typed arrays, or cycles. A narrow implementation should reject values outside its contract rather than return a plausible but wrong object.

- **Wrong assumption: deep cloning is automatically safer in production.** A clone on every keystroke can create garbage-collection pressure and destroy useful reference equality. In reducers, copy the changed path. Clone at a boundary when isolation is the requirement, such as taking an editable draft or protecting a worker message.

- **Wrong assumption: copying prevents all shared external state.** A clone cannot make a database row, file, DOM node, subscription, or function closure independent. Clone plain data at the boundary and keep resources under explicit ownership rules.

## 7. Compare With Related Concepts

| Choice | What it does | When to use it |
| --- | --- | --- |
| Shallow copy | New outer container; nested references may be shared | Copy a container when nested data is immutable or intentionally shared |
| Targeted immutable update | New references only along the changed path | Use for React state, reducers, and normalized application data |
| `structuredClone` | Native deep clone for supported data and cycles | Use for an isolated snapshot of cloneable data; validate unsupported values |
| JSON round-trip | Serializes through JSON's smaller type system | Use only for deliberately JSON-shaped data where conversions are acceptable |
| Custom clone | Application-defined semantics and type support | Use for a small, tested data contract or explicit domain copy operation |
| Immer or similar library | Lets code express mutations while producing structural sharing | Use when nested immutable updates are frequent and the project accepts the dependency |

Copying and mutation are separate decisions. A shallow copy is still followed by mutation if you mutate a shared nested value. A deep clone gives isolation, but it does not make the original update pattern efficient. In production, ask first whether you need isolation, structural sharing, serialization, or a new domain object; then choose the smallest tool that guarantees that property.

## 8. 🧠 The Memory Hook — What Sticks

Copy the cabinet, and ask whether the folders inside are still the same physical folders. Spread changes the cabinet; targeted updates replace only the folders on the changed path; deep cloning photocopies the whole cabinet, but only for data the copier actually understands.
