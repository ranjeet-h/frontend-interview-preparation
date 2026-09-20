## Deep Clone an Object

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `deepClone(value)` returning a structurally independent copy: mutating the clone
must never affect the original, at any depth. The contract is what makes it non-trivial:

- Primitives are returned as-is; **functions are shared by reference** (they cannot be cloned).
- Own **enumerable** string and symbol keys are copied; non-enumerable ones are skipped.
- The prototype is preserved, so `class` instances stay instances (though `#private` fields
  are unreachable from outside the class).
- Built-ins with internal slots need their own constructor: `Date` (by time), `RegExp`
  (`source` + `flags` + `lastIndex`), `Map`, `Set`.
- Arrays keep their length and their holes.
- **Cycles and shared references must terminate and stay shared**: if `a.self === a`, then
  `clone.self === clone`; if two properties point at one object, so do the copies.

Production answer: `structuredClone(value)`. It handles `Date`, `Map`, `Set`, `RegExp`,
typed arrays, `ArrayBuffer`, `Blob`, cycles and shared references natively. It throws
`DataCloneError` on functions, symbols, and DOM nodes, and it flattens class instances to
plain objects. Hand-roll it when you need prototypes or must tolerate functions.

### Examples

```text
deepClone(42)                                 // => 42
deepClone({ a: { b: 1 } })                    // => { a: { b: 1 } }  (independent)
deepClone(new Date(0))                        // => Date(0), a new reference
deepClone(new Map([["k", { n: 1 }]]))         // => Map with a cloned value
deepClone([1, , 3])                           // => [1, <hole>, 3]  (hole preserved)

const a = { n: 1 };
a.self = a;
const c = deepClone(a);
c.self === c                                  // => true   (cycle terminated)
c !== a && c.self !== a                       // => true

const shared = { x: 1 };
const two = deepClone({ p: shared, q: shared });
two.p === two.q                               // => true   (shared identity kept)

class Point { constructor(x) { this.x = x; } }
deepClone(new Point(1)) instanceof Point      // => true
```

### Approach

Depth-first copy with a `WeakMap` of `source -> clone`. Three decisions carry the whole
implementation:

1. **Register the clone before recursing.** Create the empty container, put it in `seen`,
   *then* walk its children. When the walk reaches a back-reference, `seen.get(value)`
   returns the half-built clone and the cycle closes. Registering after the loop is the
   single most common bug — it overflows the stack.
2. **Branch on internal slots, not on properties.** `Date`, `RegExp`, `Map`, and `Set` keep
   their data in internal slots that property copying cannot see. Detect them with
   `Object.prototype.toString`, then use the constructor.
3. **Copy via `Reflect.ownKeys` + `propertyIsEnumerable`.** That covers string *and* symbol
   keys while skipping `length` (arrays), and it lets arrays keep holes: a hole is simply a
   key that is not present.

`WeakMap` rather than `Map` so the memo does not retain the source after the call. Cloning is
`O(n)` in nodes plus edges; the recursion risk is a very deep chain, not a cycle.

### Implementation

```javascript
function deepClone(value, seen = new WeakMap()) {
  // Primitives, symbols, and functions: returned as-is (functions are shared).
  if (value === null || typeof value !== "object") return value;

  // Cycle / shared-reference guard: reuse the clone we already started.
  if (seen.has(value)) return seen.get(value);

  const tag = Object.prototype.toString.call(value);

  // Built-ins whose data lives in internal slots cannot be copied key-by-key.
  if (tag === "[object Date]") return new Date(value.getTime());
  if (tag === "[object RegExp]") {
    const clone = new RegExp(value.source, value.flags);
    clone.lastIndex = value.lastIndex;
    return clone;
  }

  const clone = Array.isArray(value)
    ? new Array(value.length)                                // preserves holes
    : tag === "[object Map]"
      ? new Map()
      : tag === "[object Set]"
        ? new Set()
        : Object.create(Object.getPrototypeOf(value));       // keep class identity

  seen.set(value, clone); // register BEFORE recursing: this is what breaks cycles

  if (tag === "[object Map]") {
    for (const [key, entry] of value) clone.set(deepClone(key, seen), deepClone(entry, seen));
    return clone;
  }
  if (tag === "[object Set]") {
    for (const entry of value) clone.add(deepClone(entry, seen));
    return clone;
  }

  for (const key of Reflect.ownKeys(value)) {
    // Enumerable only: skips array `length` and other non-enumerable metadata.
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
    clone[key] = deepClone(value[key], seen);
  }
  return clone;
}
```

### Walkthrough

Take `const a = { n: 1, when: new Date(0) }; a.self = a;` and call `deepClone(a)`.

1. `seen` is empty, so `a` is cloned: `tag` is `"[object Object]"`, so
   `clone = Object.create(Object.getPrototypeOf(a))` — an empty object.
2. `seen.set(a, clone)` runs **before** any recursion. This is the crucial line.
3. `Reflect.ownKeys(a)` yields `["n", "when", "self"]`.
   - `"n"` → `1` is a primitive → `clone.n = 1`.
   - `"when"` → the `Date` branch returns a brand-new `Date(0)`.
   - `"self"` → `deepClone(a, seen)` → `seen.has(a)` is `true` → returns `clone`.
4. Result: `{ n: 1, when: Date(0), self: <clone itself> }`. `clone.self === clone` and the
   stack never grew beyond two frames.

Now trace shared identity: `const s = { x: 1 }; deepClone({ p: s, q: s })`. The first visit to
`s` builds `sClone` and stores it. The second visit hits `seen.get(s)` and returns the *same*
`sClone`, so `result.p === result.q`. A naive implementation without the memo would produce
two distinct objects — a silent behavioural difference, not just a cycle bug.

### Complexity

Time: `O(n)` over all reachable nodes and edges (`Map`/`Set` entries counted too). Space:
`O(n)` for the clone plus the `WeakMap`, and `O(d)` recursion depth for nesting depth `d`.
Cycle handling adds no extra pass.

### Edge Cases

- **Cycles** — closed by registering the clone before recursing.
- **Shared references** — preserved by the `WeakMap`, so aliasing survives cloning.
- **`Date`/`RegExp`/`Map`/`Set`** — reconstructed from internal slots; property copying alone
  would yield `{}` or a broken object.
- **Sparse arrays** — `new Array(length)` plus enumerable-only copying keeps holes.
- **`null` prototype** — `Object.create(null)` is preserved; the clone has no prototype either.
- **Typed arrays / `ArrayBuffer`** — *not* handled here. `ArrayBuffer.isView(value)` would need
  a branch (`new value.constructor(value)`); `structuredClone` handles them for free.
- **Class private fields** — a `#x` field is an internal slot with no property; it is lost.
- **Getters** — reading `value[key]` invokes the getter, so accessor properties become data
  properties on the clone. Use `getOwnPropertyDescriptor` if you must keep them.
- **`__proto__` as an own key** — `clone[key] = ...` would trigger the prototype setter. Guard
  with `Object.defineProperty(clone, key, { value, enumerable: true, writable: true, configurable: true })`
  if the input can come from `JSON.parse`.
- **Functions** — shared, not cloned; there is no way to clone a closure.

### Interview Follow-ups

- **Why not `JSON.parse(JSON.stringify(value))`?** It drops `undefined`, functions, and symbols,
  turns `Date` into a string, turns `Map`/`Set` into `{}`, throws on cycles, and loses prototypes.
- **How would you support typed arrays?** Add `if (ArrayBuffer.isView(value)) return new value.constructor(value)`
  before the generic branch; `DataView` needs its own handling.
- **Clone with an allow-list / redaction:** pass a predicate or key filter and skip denied keys,
  which is the real use case for hand-rolled cloning in apps.
- **`structuredClone` with transfer:** `structuredClone(buffer, { transfer: [buffer] })` moves
  ownership instead of copying, detaching the source.
- **Production:** use `structuredClone`; use lodash `cloneDeep` only when you need its looser
  prototype behaviour.

### Common Mistakes

- Registering `seen.set(value, clone)` *after* the recursive loop → infinite recursion on cycles.
- Using `typeof value === "object"` without the `null` guard → `deepClone(null)` crashes.
- Copying `Map`/`Set` with `Object.keys` → always `{}`, because entries live in internal slots.
- Using `Object.keys` instead of `Reflect.ownKeys` → symbol-keyed data silently disappears.
- Shallow-copying with `{ ...value }` and calling it deep because "the rest is nested anyway".
- Forgetting that `Array.isArray` must be checked before the generic object branch, or arrays
  come back as `{ "0": ..., "1": ... }`.

### Takeaway

Deep clone is a depth-first copy plus one memo table. Create the container, register it in a
`WeakMap` *before* recursing, branch on internal slots for built-ins, and copy own enumerable
keys — that combination handles cycles, shared references, and prototypes at once. In
production, `structuredClone` already is that algorithm.

## Implement Deep Equality (`isEqual`)

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `isEqual(a, b)` returning `true` when two values are structurally equal. "Structurally"
needs pinning down, because the answer differs from `===` and from `Object.is`:

- **`NaN` equals `NaN`** (structural equality uses SameValueZero, not `===`).
- **`+0` equals `-0`** — this is the lodash contract and the intuitive one for data comparison.
- Primitives compare by value; functions and symbols compare by reference (a closure has no
  observable structure).
- `Date` compares by time; an invalid `Date` (time `NaN`) equals another invalid `Date`.
- `RegExp` compares by `source` and `flags`; `lastIndex` is state, not identity.
- Arrays compare by length, index, **and hole positions**.
- Plain objects compare by own enumerable key sets (string *and* symbol), then by value.
- `Map` and `Set` compare **order-insensitively**; keys are matched structurally, not just by
  `has`.
- Prototypes must match, so `{}` and `Object.create(null)` are not equal.
- **Cycles must terminate**: `a.self = a; b.self = b` must compare equal.

### Examples

```text
isEqual(1, 1)                          // => true
isEqual(NaN, NaN)                      // => true   (=== would say false)
isEqual(0, -0)                         // => true   (Object.is would say false)
isEqual(null, undefined)               // => false
isEqual("a", "a")                      // => true

isEqual([1, [2, 3]], [1, [2, 3]])      // => true
isEqual([1, , 3], [1, undefined, 3])   // => false  (hole vs explicit undefined)
isEqual(new Date(0), new Date(0))      // => true
isEqual(/ab/gi, /ab/gi)                // => true

isEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })            // => true
isEqual({ a: 1 }, { a: 1, b: undefined })                        // => false (key sets differ)
isEqual(Object.create(null), {})                                 // => false (prototypes differ)

isEqual(new Map([["a", { x: 1 }]]), new Map([["a", { x: 1 }]]))  // => true
isEqual(new Set([1, 2]), new Set([2, 1]))                        // => true  (order-insensitive)

const p = { n: 1 }; p.self = p;
const q = { n: 1 }; q.self = q;
isEqual(p, q)                          // => true   (cycle guard)
```

### Approach

Work in layers, cheapest check first, and only recurse when both sides are non-null objects of
the same tag.

1. **SameValueZero short-circuit.** `a === b` catches identity and most primitives. Add
   `a !== a && b !== b` for `NaN`. This is deliberately *not* `Object.is`, which would split
   `0` and `-0`.
2. **Type gate.** If either side is not an object (or is `null`), they cannot be equal — we
   already know they are not the same primitive. `typeof fn === "function"` lands here, so
   functions compare by reference only, which is honest.
3. **Cycle guard.** Keep a `WeakMap` from `a` to a `Set` of `b` values currently being compared.
   If the pair is already on the stack, return `true`: the assumption is that the rest of the
   comparison will fail on its own if it is going to. This is exactly how lodash breaks cycles.
4. **Tag and prototype gate.** `Object.prototype.toString` distinguishes `Date`, `RegExp`,
   boxed primitives, `Map`, `Set`, and arrays; comparing prototypes catches `{}` vs
   `Object.create(null)` and different classes.
5. **Per-tag comparison.** `Date` by `getTime`, `RegExp` by `source`/`flags`, boxed primitives by
   `valueOf`, arrays by length + holes + index, `Map`/`Set` unordered, everything else by key set.

For `Map`/`Set` the fast path is `has`/`get` with the *same* key object; the slow path is a
linear scan comparing keys structurally, because `new Map([["a", 1]])` and another map with a
different-but-equal string key still match (`has` already handles that case) — the scan matters
for **object keys**, which `has` matches by identity.

### Implementation

```javascript
const enumerableKeys = (object) =>
  Reflect.ownKeys(object).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(object, key));

function isEqual(a, b, seen = new WeakMap()) {
  // 1) SameValueZero: identity, primitives, NaN === NaN, and 0 === -0.
  if (a === b || (a !== a && b !== b)) return true;

  // 2) If either side is not an object, they differ (functions included).
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

  // 3) Cycle guard: this pair is already being compared further up the stack.
  const partners = seen.get(a);
  if (partners?.has(b)) return true;
  if (partners) partners.add(b);
  else seen.set(a, new Set([b]));

  const tagA = Object.prototype.toString.call(a);
  if (tagA !== Object.prototype.toString.call(b)) return false;

  switch (tagA) {
    case "[object Date]": {
      const ta = a.getTime();
      const tb = b.getTime();
      return ta === tb || (Number.isNaN(ta) && Number.isNaN(tb));
    }
    case "[object RegExp]":
      return a.source === b.source && a.flags === b.flags;
    case "[object Number]":
    case "[object String]":
    case "[object Boolean]":
    case "[object Symbol]":
    case "[object BigInt]":
      return isEqual(a.valueOf(), b.valueOf(), seen); // boxed primitives
    default:
      break;
  }

  // Prototype must match: `{}` !== Object.create(null), and different classes differ.
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (i in a !== i in b) return false;              // hole vs explicit undefined
      if (i in a && !isEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  if (tagA === "[object Map]") {
    if (a.size !== b.size) return false;
    entry: for (const [key, value] of a) {
      if (b.has(key) && isEqual(value, b.get(key), seen)) continue;
      for (const [otherKey, otherValue] of b) {          // structural key match
        if (isEqual(key, otherKey, seen) && isEqual(value, otherValue, seen)) continue entry;
      }
      return false;
    }
    return true;
  }

  if (tagA === "[object Set]") {
    if (a.size !== b.size) return false;
    item: for (const value of a) {
      if (b.has(value)) continue;
      for (const other of b) {
        if (isEqual(value, other, seen)) continue item;
      }
      return false;
    }
    return true;
  }

  // WeakMap / WeakSet entries cannot be enumerated: only identity can be compared.
  if (tagA === "[object WeakMap]" || tagA === "[object WeakSet]") return false;

  const keysA = enumerableKeys(a);
  const keysB = enumerableKeys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isEqual(a[key], b[key], seen)) return false;   // getters run here
  }
  return true;
}
```

### Walkthrough

Compare `p = { n: 1, list: [1, NaN] }` with `q = { n: 1, list: [1, NaN] }`:

1. `p === q` is false, both are objects, tags match (`[object Object]`), prototypes match.
2. `seen` records `p -> {q}`. Key sets are `["n", "list"]` on both, so lengths match.
3. `isEqual(1, 1)` → `1 === 1` short-circuits to `true`.
4. `isEqual([1, NaN], [1, NaN])` → arrays, same length. Index 0: `1 === 1` → `true`.
   Index 1: `NaN === NaN` is false, but `NaN !== NaN && NaN !== NaN` is true → `true`.
5. Both keys pass → `true`. Note `===` on the whole object would have been `false`.

Now the cycle case, `p.self = p; q.self = q`:

1. Comparing `p` and `q` records the pair, then walks keys including `"self"`.
2. `isEqual(p.self, q.self)` is `isEqual(p, q)`. `seen.get(p)` already contains `q`, so it
   returns `true` **without recursing**.
3. The rest of the keys (`n`, `list`) compare normally and succeed. Without the guard this is
   infinite recursion; with it, the cycle is assumed consistent.

Finally, `isEqual(new Set([1, 2]), new Set([2, 1]))`: sizes match. `b.has(1)` is `true`,
`b.has(2)` is `true`, so both elements are found and the sets are equal despite different
insertion order.

### Complexity

Time: `O(n)` for the common case (primitives and identity-keyed collections). The structural
fallback for `Map`/`Set` with object keys is `O(n²)` worst case. Space: `O(d)` recursion depth
plus the pair memo, which is `O(p)` pairs in the worst case.

### Edge Cases

- **`NaN`** → equal, via the SameValueZero test; `Object.is` would also say true, `===` would not.
- **`-0` vs `+0`** → equal (SameValueZero). Say so out loud; an interviewer may be probing for
  `Object.is` semantics instead.
- **Holes** → `[1, , 3]` is *not* equal to `[1, undefined, 3]`; the `i in a` check catches it.
- **`null` vs `undefined`** → not equal, and neither is equal to `{}`.
- **`{}` vs `Object.create(null)`** → not equal; prototype comparison is stricter than lodash's.
- **Boxed primitives** → `new Number(1)` equals `new Number(1)` and, in this implementation,
  `Number` instances of equal value but not the primitive `1` (different tags).
- **Functions** → reference equality only; two structurally identical closures are not equal.
- **Weak collections** → entries are unenumerable, so only identity could ever work; we return
  `false` for two distinct instances rather than lying.
- **Getters** → invoked during comparison; a getter with side effects runs more than once.
- **Different classes** → `new A()` vs `new B()` with identical fields is `false` because the
  prototypes differ.

### Interview Follow-ups

- **`Object.is` vs `===` vs SameValueZero:** list the three differences (`NaN`, `-0`) and say
  which one structural equality should use and why.
- **`deepDiff(a, b)`:** walk the same recursion but collect paths where values differ, which is
  what form libraries need for touched-field tracking.
- **`isEqual` for `Map` with object keys is `O(n²)`:** how would you speed it up? (Canonicalise
  keys with a stable stringify, or hash structural keys.)
- **Why is `JSON.stringify` a bad equality shortcut?** Key order changes the output, `undefined`
  and functions vanish, and `NaN` becomes `null`.
- **Production:** lodash `isEqual` — but know its looser prototype rule before relying on it.

### Common Mistakes

- Using `===` for values and forgetting `NaN`, so `isEqual(NaN, NaN)` returns `false`.
- Using `Object.is` and accidentally making `isEqual(0, -0)` false.
- Forgetting the cycle guard, so self-referential structures blow the stack.
- Comparing key counts but not key *names*: `{a: 1}` and `{b: 1}` both have one key.
- Treating `Map`/`Set` as ordered, so equal sets with different insertion order fail.
- Comparing `getTime()` naively and making two invalid dates unequal.

### Takeaway

Deep equality is SameValueZero for leaves, tag + prototype for objects, and a recursion with a
pair memo for containers. The memo is what makes cycles safe; the SameValueZero rule is what
makes `NaN` work. Everything else is per-type detail.

## Deep-Merge Two Objects

`Difficulty: Hard` `Probability: High`

### Problem

Implement `deepMerge(target, source)` returning a new object in which `source` is recursively
merged into `target`. The contract:

- **Inputs are never mutated** (unlike `Object.assign` and lodash `merge`).
- Plain objects merge recursively; a key present only in one side is copied.
- Arrays merge **index-wise**: `merge({ a: [1, 2] }, { a: [9] })` → `{ a: [9, 2] }`.
- Non-plain values (`Date`, `Map`, class instances, functions) are **leaves**: the source value
  wins and is shared by reference.
- `undefined` in the source **does not overwrite** an existing value; `null` does.
- `__proto__`, `constructor`, and `prototype` are never written — prototype pollution.
- Cycles terminate.
- Values are copied deeply enough that mutating the result cannot mutate the source.

### Examples

```text
deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })          // => { a: 1, b: 3, c: 4 }
deepMerge({ a: { x: 1 } }, { a: { y: 2 } })        // => { a: { x: 1, y: 2 } }
deepMerge({ a: [1, 2, 3] }, { a: [9] })            // => { a: [9, 2, 3] }
deepMerge({ a: 1 }, { a: undefined })              // => { a: 1 }  (undefined ignored)
deepMerge({ a: 1 }, { a: null })                   // => { a: null }
deepMerge({ d: new Date(0) }, { d: new Date(5) })  // => { d: Date(5) } (replaced, not merged)

const target = { a: { x: 1 } };
const result = deepMerge(target, { a: { y: 2 } });
result                                   // => { a: { x: 1, y: 2 } }
target                                   // => { a: { x: 1 } }  (untouched)
result.a !== target.a                    // => true

deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}}'))
({}).polluted                            // => undefined  (blocked)
```

### Approach

A recursive walk over the source, building fresh containers and cloning leaves.

- **Plain-object test, not `typeof`.** `isPlainObject` accepts only values whose prototype is
  `Object.prototype` or `null`. That is what keeps a `Date` or a `Map` from being "merged"
  property-by-property into an empty object.
- **Clone before you recurse.** `cloneValue` is the leaf copier; it deep-copies plain objects and
  arrays and returns everything else by reference. `deepMerge` is the combining function.
- **Register in a `WeakMap` before recursing**, exactly as in deep clone: `source -> result`.
  Without it, `source.self = source` recurses forever.
- **Skip `undefined`**, because "field absent" and "field explicitly undefined" should behave the
  same for config merging; the reverse choice (overwrite with `undefined`) is defensible but must
  be stated.
- **Blocked keys.** Reading `source[key]` is fine; *writing* `result[key]` is the danger, because
  `result["__proto__"] = {...}` reaches `Object.prototype`'s setter. `JSON.parse` can create an
  own `__proto__` key, so this is a real attack path, not a theoretical one.

Arrays get their own helper because "merge index-wise" means the target's length is a floor and
each index either deep-merges (object vs object) or is replaced.

### Implementation

```javascript
const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Copy a value so the result shares no mutable structure with the source.
function cloneValue(value, seen) {
  if (value === null || typeof value !== "object") return value;   // primitives, functions
  if (seen.has(value)) return seen.get(value);                     // cycle guard

  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i += 1) {
      if (i in value) copy[i] = cloneValue(value[i], seen);        // keep holes
    }
    return copy;
  }

  if (!isPlainObject(value)) return value;                         // Date, Map, class instance

  const copy = Object.create(Object.getPrototypeOf(value));        // preserves null proto
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
    if (typeof key === "string" && BLOCKED.has(key)) continue;
    Object.defineProperty(copy, key, {
      value: cloneValue(value[key], seen), enumerable: true, writable: true, configurable: true,
    });
  }
  return copy;
}

function mergeArrays(target, source, seen) {
  if (seen.has(source)) return seen.get(source);
  const result = [];
  seen.set(source, result);
  const length = Math.max(target.length, source.length);

  for (let i = 0; i < length; i += 1) {
    const incoming = source[i];
    const current = target[i];
    if (incoming === undefined) result[i] = cloneValue(current, seen);      // keep target side
    else if (isPlainObject(current) && isPlainObject(incoming)) {
      result[i] = deepMerge(current, incoming, seen);                       // merge objects
    } else result[i] = cloneValue(incoming, seen);                          // replace
  }
  return result;
}

function deepMerge(target, source, seen = new WeakMap()) {
  if (!isPlainObject(source)) return cloneValue(source, seen);
  if (seen.has(source)) return seen.get(source);

  const base = isPlainObject(target) ? target : {};
  const result = Object.assign(Object.create(Object.getPrototypeOf(base)), base);
  seen.set(source, result);                       // register BEFORE recursing (cycles)

  for (const key of Reflect.ownKeys(source)) {
    if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
    if (typeof key === "string" && BLOCKED.has(key)) continue;      // pollution guard
    const incoming = source[key];
    if (incoming === undefined) continue;                           // undefined never overwrites
    const current = base[key];

    if (Array.isArray(current) && Array.isArray(incoming)) {
      result[key] = mergeArrays(current, incoming, seen);
    } else if (isPlainObject(current) && isPlainObject(incoming)) {
      result[key] = deepMerge(current, incoming, seen);
    } else {
      result[key] = cloneValue(incoming, seen);
    }
  }
  return result;
}
```

### Walkthrough

`deepMerge({ user: { name: "Ada", roles: ["admin"] } }, { user: { roles: ["editor", "viewer"], active: true } })`:

1. `source` is a plain object, `seen` is empty. `base` is the target, so
   `result = { user: <same reference> }` (a shallow copy).
2. `seen.set(source, result)` — registered before any recursion.
3. Key `"user"`: `current` is `{ name, roles }` and `incoming` is `{ roles, active }`, both plain
   objects → `deepMerge(current, incoming, seen)`:
   - `result2 = { name: "Ada", roles: ["admin"] }` (shallow copy of `current`).
   - Key `"roles"`: both arrays → `mergeArrays(["admin"], ["editor", "viewer"])`. `length` is
     `max(1, 2) = 2`. Index 0: `"editor"` replaces `"admin"`. Index 1: `incoming` is `"viewer"`,
     `current` is `undefined` → replace. → `["editor", "viewer"]`.
   - Key `"active"`: not present on `current` → `cloneValue(true)` → `true`.
4. Result: `{ user: { name: "Ada", roles: ["editor", "viewer"], active: true } }`.
   `target.user.roles` is still `["admin"]` — the input was never touched, and the result's
   `roles` array is a brand-new array.

For the pollution example, `Reflect.ownKeys(source)` includes `"__proto__"` (it is an own key
after `JSON.parse`), the `BLOCKED` check skips it, and `({}).polluted` stays `undefined`.

### Complexity

Time: `O(n + m)` over the nodes of both inputs; each key is visited once. Space: `O(n)` for the
result plus `O(d)` recursion depth. The `WeakMap` is `O(n)` in the worst case.

### Edge Cases

- **`undefined` in the source** → ignored; `null` overwrites. Say which rule you chose.
- **Arrays** → index-wise merge, so lengths can grow from either side; a source hole leaves the
  target's element in place.
- **`Date`/`Map`/`Set`/class instances** → replaced wholesale and shared by reference. Mutating
  `result.date` mutates `source.date`; deep-clone them if that matters.
- **Non-plain `target`** (e.g. `deepMerge(5, { a: 1 })`) → `base` is `{}`, so the result is a
  plain object.
- **`null` prototype** → preserved on the result via `Object.getPrototypeOf(base)`.
- **Prototype pollution** → `__proto__`, `constructor`, `prototype` are skipped at every depth.
- **Cycles** → handled by the pre-recursion `WeakMap` registration.
- **Symbol keys** → merged, because `Reflect.ownKeys` includes them.
- **Getters on the source** → invoked once, materialised as data properties.
- **Deep recursion** → a 100k-deep chain overflows the stack; an iterative worklist is the fix.

### Interview Follow-ups

- **Mutating variant:** `mergeInto(target, source)` writing in place is what lodash `merge` does;
  explain the trade-off (speed and identity vs. accidental shared mutation).
- **Replace arrays instead of merging:** swap the `mergeArrays` branch for `cloneValue`; make it
  an option object rather than a second function.
- **Merge arrays of records by `id`:** index-wise merging is wrong for entity lists; match on a
  key and merge each pair, appending unmatched records.
- **`Object.assign` vs spread vs deep merge:** the first two are shallow — one level only.
- **Production:** lodash `merge` (mutates) or `deepmerge`; `structuredClone` for copying without
  merging.

### Common Mistakes

- Writing `result[key] = source[key]` for non-objects, which shares mutable values with the source.
- Registering the cycle memo after the recursion, so cycles overflow the stack.
- Treating `null` as "empty object to merge into" instead of a value.
- Forgetting the pollution guard and letting `JSON.parse` input write `Object.prototype`.
- Merging arrays element-wise by accident (`for...of` with `push`) so lengths double.
- Assuming the result is fully independent when `Date`/`Map` leaves are still shared.

### Takeaway

Deep merge is "clone, but combine where both sides are plain objects." The three things that make
it safe are: a plain-object test (so built-ins stay leaves), a `WeakMap` registered before
recursing (so cycles terminate), and a blocked-key list (so `__proto__` never reaches a setter).

## Flatten a Nested Object

`Difficulty: Medium` `Probability: High`

### Problem

Implement `flatten(input, separator = ".")` returning a flat object whose keys are the paths to
every leaf:

```javascript
flatten({ user: { address: { city: "Pune" } } })
// => { "user.address.city": "Pune" }
```

The contract:

- **Branches** are plain objects and arrays; **leaves** are everything else — including `null`,
  `Date`, `Map`, class instances, and functions.
- **Arrays flatten with index segments**: `{ a: ["x"] }` → `{ "a.0": "x" }`.
- **Empty branches are kept as leaves** so the shape round-trips: `{ a: {} }` → `{ "a": {} }`.
- `null` is a leaf, not a branch — `typeof null === "object"` is the trap.
- Only own enumerable string keys are visited; symbol keys cannot be represented in a string path.
- A key that already contains the separator collides with a nested path
  (`{ "a.b": 1 }` and `{ a: { b: 1 } }` both produce `"a.b"`) — call that out.
- The input is not mutated; the output has no `undefined` values unless a leaf *is* `undefined`.
- Round-trip: `unflatten(flatten(x))` should reproduce `x` for plain nested data.

### Examples

```text
flatten({ user: { address: { city: "Pune" } } })
// => { "user.address.city": "Pune" }

flatten({ a: 1, b: { c: 2, d: { e: 3 } } })
// => { "a": 1, "b.c": 2, "b.d.e": 3 }

flatten({ tags: ["x", "y"] })
// => { "tags.0": "x", "tags.1": "y" }

flatten({ user: { address: { zip: null } } })
// => { "user.address.zip": null }     (null is a leaf)

flatten({ a: {}, b: [], c: [{ d: 1 }] })
// => { "a": {}, "b": [], "c.0.d": 1 } (empties kept; nested array flattened)

flatten({ at: new Date(0), m: new Map() }, "/")
// => { "at": Date(0), "m": Map(0) }   (built-ins are leaves; custom separator)

flatten({ "a.b": 1 })                  // => { "a.b": 1 }  (ambiguity warning)
flatten({})                            // => {}
```

### Approach

One recursive walk that carries the **path as an array**, joined only when writing the key. Keeping
the path as an array is what makes custom separators, symbol paths, and keys containing dots at
least *expressible*; joining eagerly would destroy the segment boundaries.

- `isBranch` decides object vs leaf. Plain objects only (`Object.getPrototypeOf(value)` is
  `Object.prototype` or `null`) plus arrays. `null` is excluded first, and a `Date`/`Map`/class
  instance is a leaf because merging into it is meaningless.
- **Arrays contribute numeric segments** so flatten and unflatten agree with `get`/`set`/`has`,
  which accept the same `"tags.0"` shape.
- **Empty branches are written as leaves** at their own path, but only when the path is non-empty.
  That is what makes `flatten({})` return `{}` instead of `{ "": {} }`.
- **`Object.defineProperty` for the write.** `JSON.parse('{"__proto__": ...}')` creates an own
  `__proto__` key; assigning `output["__proto__.x"]` is harmless (no such setter), but the
  single-segment case `output["__proto__"] = value` would hit the prototype setter. Using
  `defineProperty` sidesteps the whole class of problems.
- **Holes are skipped** with an `i in array` check, so `[1, , 3]` yields `"0"` and `"2"` only.

### Implementation

```javascript
const isBranch = (value) => {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;   // plain objects only
};

function flatten(input, separator = ".") {
  if (input === null || typeof input !== "object") {
    throw new TypeError("flatten expects an object or array");
  }

  const output = {};

  const write = (path, value) => {
    // defineProperty, not assignment: an own "__proto__" key must not reach the setter.
    Object.defineProperty(output, path.join(separator), {
      value, enumerable: true, writable: true, configurable: true,
    });
  };

  const walk = (value, path) => {
    if (!isBranch(value)) {
      write(path, value);                     // leaf: primitive, null, Date, Map, function
      return;
    }

    const keys = Array.isArray(value)
      ? Array.from(value.keys()).filter((index) => index in value)   // skip holes
      : Object.keys(value);                                          // own enumerable strings

    if (keys.length === 0) {
      if (path.length > 0) write(path, value);   // keep {} / [] so the shape round-trips
      return;                                    // the root itself flattens to {}
    }

    for (const key of keys) walk(value[key], [...path, String(key)]);
  };

  walk(input, []);
  return output;
}
```

### Walkthrough

`flatten({ user: { address: { city: "Pune", zip: null } }, tags: ["a", "b"], meta: {} })`:

1. `walk(root, [])` → the root is a branch, keys `["user", "tags", "meta"]`.
2. `walk(user, ["user"])` → branch → `walk(address, ["user", "address"])` → branch:
   - `walk("Pune", ["user", "address", "city"])` → a string is a leaf → writes
     `"user.address.city" = "Pune"`.
   - `walk(null, ["user", "address", "zip"])` → `isBranch(null)` is `false` (the `null` guard runs
     before the object check) → writes `"user.address.zip" = null`.
3. `walk(["a", "b"], ["tags"])` → array branch, keys `[0, 1]`:
   - `walk("a", ["tags", "0"])` → `"tags.0" = "a"`.
   - `walk("b", ["tags", "1"])` → `"tags.1" = "b"`.
4. `walk({}, ["meta"])` → a branch with no keys and a non-empty path → writes `"meta" = {}`.

Result: `{ "user.address.city": "Pune", "user.address.zip": null, "tags.0": "a", "tags.1": "b", "meta": {} }`.
Note step 4: if the empty-object rule were missing, `meta` would simply vanish, and
`unflatten(flatten(x))` would not be able to reconstruct the input.

### Complexity

Time: `O(n)` in the number of nodes, since each node is visited once. Space: `O(n)` for the output
keys plus `O(d)` recursion depth and the path arrays; each key is a string of length `O(d)`, so the
output can be `O(n·d)` bytes in the pathological case of very deep, very wide data.

### Edge Cases

- **`null` leaves** — kept, because the `null` check precedes the object check.
- **Empty object/array** — kept as a leaf so the shape survives a round-trip; the root's own empty
  state returns `{}`.
- **Arrays** — index segments (`"tags.0"`); nested arrays give `"0.0"`-style paths.
- **Holes** — skipped, so `[1, , 3]` yields `"0"` and `"2"` and the hole is lost.
- **`Date`/`Map`/`Set`/class instances** — leaves, returned by reference in the output.
- **Key containing the separator** — collides with nesting; the array-path variant
  (`flattenToPaths`) avoids it, and a non-dot separator only moves the problem.
- **`__proto__` keys** — safe thanks to `defineProperty`.
- **Symbol keys** — not visited by `Object.keys`; use `Reflect.ownKeys` if you must, but a symbol
  cannot be encoded in a joined string path, which is why the array-path variant exists.
- **Non-object input** — throws `TypeError` rather than returning a nonsense single key.
- **Very deep nesting** — recursion depth equals depth; an iterative stack avoids the overflow.

### Interview Follow-ups

- **`unflatten`** — the inverse; the next problem. Together they are a round-trip pair.
- **`{ arrays: false }` option** — treat arrays as leaves (common for config serialisation, where
  an array is a value, not a tree).
- **Flatten to path arrays** — return `{ "user.address.city": ... }`'s sibling,
  `[["user","address","city"], value]` pairs, which is lossless for keys containing dots.
- **Bracket-notation keys** — `user[address][city]` for form/query-string encoders; same walk,
  different `path.join`.
- **Naming trap:** lodash `_.flatten` flattens **arrays**, not objects. There is no lodash
  equivalent for object flattening; `flat`/`flatten` in lodash are about arrays.

### Common Mistakes

- Treating `null` as a branch because `typeof null === "object"` → crashes on `Object.keys(null)`.
- Using `typeof value === "object"` as the branch test and flattening `Date`/`Map` into `{}`.
- Dropping empty objects, which silently breaks `flatten` → `unflatten` round-trips.
- Using `value.forEach` on arrays, which skips holes silently but also hides index semantics.
- Building the key by string concatenation at each level, so a custom separator applies
  inconsistently.
- Assuming the inverse is exact when keys contain the separator.

### Takeaway

Flatten is one recursive walk with the path carried as an array and joined at the leaf. The three
decisions that make it correct are: `null` is a leaf, empty branches are preserved, and the write
uses `defineProperty` so exotic keys cannot touch a prototype.

## Unflatten an Object

`Difficulty: Medium` `Probability: High`

### Problem

Implement `unflatten(flat)` — the inverse of the previous problem:
`{"user.address.city": "Pune", "user.tags[0]": "x"}` becomes
`{ user: { address: { city: "Pune" }, tags: ["x"] } }`. Split each key on `.` (and
`[n]` brackets), then walk-or-create containers down the segments. A segment that is a
canonical array index (`"0"`, `"1"`, …) creates an **array**; anything else creates a
plain object. Never mutate the input, and never let a `__proto__` segment touch a
prototype.

### Examples

```text
unflatten({ "a.b.c": 1, "a.b.d": 2 })       // => { a: { b: { c: 1, d: 2 } } }
unflatten({ "tags[0]": "x", "tags[1]": "y" }) // => { tags: ["x", "y"] }
unflatten({})                                 // => {}
unflatten({ "a": 1 })                         // => { a: 1 } (no dots: as-is)
```

### Approach

Parse, then build. A tiny `parsePath` turns `"a.b[0].c"` into `["a", "b", 0, "c"]`
(numbers stay numbers so the builder can tell arrays from objects). Then for each
entry, walk from the root: for every segment but the last, move into the existing
container or create one — an array when the *next* segment is a number, an object
otherwise. Set the last segment to the value.

The decision that matters is "array or object?", and it must be made from the *next*
segment, not the current one: in `tags[0]`, `tags` is an object property whose value
is an array because `0` follows. Prototype safety comes from creating containers with
`Object.create(null)`? No — that would change the result's prototype and break
`deepEqual` comparisons. Instead, refuse `__proto__`/`constructor`/`prototype`
segments explicitly.

### Implementation

```javascript
function parsePath(path) {
  if (typeof path !== "string" || path === "") {
    throw new TypeError("path must be a non-empty string");
  }
  const segments = [];
  // Split on dots, then expand [n] brackets: "a.b[0].c" -> ["a","b","0","c"].
  for (const part of path.split(".")) {
    const re = /([^[\]]+)|\[(\d+)\]/g;
    let match;
    let found = false;
    while ((match = re.exec(part)) !== null) {
      found = true;
      segments.push(match[2] !== undefined ? Number(match[2]) : match[1]);
    }
    if (!found) throw new SyntaxError(`invalid path segment: "${part}"`);
  }
  return segments;
}

function isDangerousKey(key) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function unflatten(flat) {
  if (flat === null || typeof flat !== "object" || Array.isArray(flat)) {
    throw new TypeError("unflatten expects a plain object");
  }
  const root = {};
  for (const [key, value] of Object.entries(flat)) {
    const segments = parsePath(key);
    let node = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const next = segments[i + 1];
      if (typeof segment === "string" && isDangerousKey(segment)) {
        throw new Error(`refusing dangerous path segment: "${segment}"`);
      }
      if (node[segment] === undefined) {
        // The NEXT segment decides the container: number -> array, else object.
        node[segment] = typeof next === "number" ? [] : {};
      } else if (node[segment] === null || typeof node[segment] !== "object") {
        throw new Error(`path conflict at "${String(segment)}": not a container`);
      }
      node = node[segment];
    }
    const last = segments[segments.length - 1];
    if (typeof last === "string" && isDangerousKey(last)) {
      throw new Error(`refusing dangerous path segment: "${last}"`);
    }
    node[last] = value;
  }
  return root;
}
```

### Walkthrough

`unflatten({ "a.b.c": 1, "a.b.d": 2 })`:

1. First entry: segments `["a", "b", "c"]`. `root.a` missing → next is `"b"`
   (string) → `{}`. Move in. `a.b` missing → next is `"c"` → `{}`. Move in. Set
   `c = 1` → `{ a: { b: { c: 1 } } }`.
2. Second entry: segments `["a", "b", "d"]`. `root.a` exists (object) → reuse. `a.b`
   exists → reuse. Set `d = 2` → `{ a: { b: { c: 1, d: 2 } } }`.

Shared prefixes reuse containers; divergent leaves accumulate. // => `{ a: { b: { c: 1, d: 2 } } }`

### Complexity

Time: `O(entries × depth)` — each entry walks its segments once. Space: `O(output)` —
the rebuilt tree, plus `O(depth)` transient segment arrays.

### Edge Cases

- `{}` → `{}`; keys without dots copy straight across.
- Numeric segments build arrays: `"tags[0]"` makes `tags` an array, sized by assignment.
- Conflicting shapes (`{"a": 1, "a.b": 2}`) throw instead of silently overwriting —
  the flat form is ambiguous and guessing is wrong.
- `__proto__` anywhere in a path throws; `Object.entries` also skips inherited keys.
- Values are assigned by reference (no cloning) — document whether callers need a copy.

### Interview Follow-ups

- **Round-trip property:** `unflatten(flatten(x))` deep-equals `x` for JSON-shaped data —
  a good property test.
- **Custom separators / escaping:** dots inside real key names need an escape scheme.
- **Merge instead of throw on conflict:** deep-merge values when both sides are objects.

### Common Mistakes

- Deciding array-vs-object from the *current* segment instead of the next one.
- `node[segment] || {}` — discards legitimate falsy containers and masks conflicts.
- Building with `eval` or `new Function` on path strings.
- Allowing `__proto__` through plain assignment, polluting the prototype.
- Splitting `"a.b[0]"` on `.` only and treating `"b[0]"` as a literal key.

### Takeaway

Unflatten is parse-then-build: split keys into typed segments, let the *next* segment
choose array vs object, reuse shared prefixes, and refuse prototype-unsafe keys.

## Deeply Remove a Property

`Difficulty: Easy` `Probability: High`

### Problem

Implement `deepOmit(obj, path)` that returns a **new** object with the value at `path`
removed, leaving the input untouched. `"a.b.c"` removes `c` from `a.b`; removing the
last element of an array index should splice it (keeping the array dense), while
removing a missing path returns a (cloned) object unchanged. Reuse the same `parsePath`
shape as the previous problems: dot segments plus `[n]` indices.

### Examples

```text
deepOmit({ a: { b: { c: 1, d: 2 } } }, "a.b.c") // => { a: { b: { d: 2 } } }
deepOmit({ tags: ["x", "y"] }, "tags[0]")       // => { tags: ["y"] }
deepOmit({ a: 1 }, "missing.path")              // => { a: 1 } (no-op)
deepOmit({ a: { b: 1 } }, "a")                  // => {}
```

### Approach

Clone-on-write down the path. Recurse (or loop) through the segments, shallow-copying
each container on the way so untouched branches keep their references — this gives
structural sharing, the same idea behind immutable state updates. At the parent of the
last segment, copy once more and `delete` (objects) or `splice` (arrays). If any
segment is missing or not a container, bail out and return the clone-so-far unchanged.
(Path parsing reuses `parsePath` from the Unflatten problem above — one parser per page.)

Deleting vs nulling matters: `delete` removes the key (so `"c" in result` is `false`
and `Object.keys` shrinks), while assignment would leave a present-but-`undefined`
key. For arrays, `delete arr[0]` leaves a hole — `splice` keeps it dense.

### Implementation

```javascript
function deepOmit(obj, path) {
  const segments = parsePath(path); // dot + [n] segments, numbers stay numbers

  function omit(node, depth) {
    if (node === null || typeof node !== "object") return node; // path dead-ends
    const segment = segments[depth];
    const last = depth === segments.length - 1;
    const copy = Array.isArray(node) ? [...node] : { ...node };

    if (last) {
      if (Array.isArray(copy) && typeof segment === "number") {
        if (segment >= 0 && segment < copy.length) copy.splice(segment, 1);
      } else if (!Array.isArray(copy) && typeof segment === "string") {
        delete copy[segment]; // no-op when absent: exactly the contract
      }
      return copy;
    }

    const child = node[segment];
    if (child === null || typeof child !== "object") return copy; // nothing below
    copy[segment] = omit(child, depth + 1); // only the path is re-created
    return copy;
  }

  if (obj === null || typeof obj !== "object") {
    throw new TypeError("deepOmit expects an object");
  }
  return omit(obj, 0);
}
```

### Walkthrough

`deepOmit({ a: { b: { c: 1, d: 2 } } }, "a.b.c")`, segments `["a", "b", "c"]`:

1. Depth 0: copy root → `{ a: <same ref> }`. Child `a` is an object → recurse.
2. Depth 1: copy `a` → `{ b: <same ref> }`. Child `b` is an object → recurse.
3. Depth 2 (last): copy `b` → `{ c: 1, d: 2 }`, `delete copy.c` → `{ d: 2 }`.
4. Unwind: the new `b` is installed into the new `a`, installed into the new root.

The input's `b` still has `c: 1`; only the three containers on the path were recreated.

### Complexity

Time: `O(depth + width of copied levels)` — each container on the path is shallow-copied
once; off-path branches are untouched. Space: `O(depth)` new containers plus the
shallow copies.

### Edge Cases

- Missing path → returns an equal-valued clone, no throw.
- Array index removal splices (dense); out-of-range index is a no-op.
- `delete` on objects removes the key entirely (vs `undefined` assignment).
- `__proto__` segments: `parsePath` results flow into `{...spread}` copies, and spread
  defines `__proto__` as an *own* property rather than setting the prototype — but
  state the assumption and keep the `isDangerousKey` guard from the sibling problems
  if the threat model needs it.
- Non-object input throws; primitives on the path stop the descent gracefully.

### Interview Follow-ups

- **Omit several paths:** fold `deepOmit` over the list, or collect-then-delete in one
  walk for efficiency.
- **Immutable `set` by the same technique:** clone-on-write, assign at the leaf.
- **Structural sharing:** untouched branches keep reference equality — why React
  re-renders skip them.

### Common Mistakes

- Mutating the input (`delete obj.a.b.c` directly) when the contract says copy.
- Deep-cloning the *whole* object first — correct but `O(n)` instead of `O(path)`.
- `delete arr[i]` on arrays, leaving a hole instead of splicing.
- Setting `undefined` instead of deleting, so the key survives `Object.keys`.
- Recursing into `null` (`typeof null === "object"`) without the guard.

### Takeaway

Immutable removal is clone-on-write down the path: copy each container you descend
through, `delete`/`splice` once at the leaf, and share everything else by reference.

## Deeply Rename Keys

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `deepRename(obj, renames)` that returns a **new** object with keys renamed
at any depth: `renames = { "user.name": "fullName", "tags": "labels" }` renames the
`name` key under `user` and every top-level `tags` key. Each rename entry maps a
*path* to the *new key name* (not a new path). Renames apply to every matching
location; missing paths are ignored. The input is never mutated.

### Examples

```text
deepRename({ user: { name: "A", age: 3 } }, { "user.name": "fullName" })
// => { user: { fullName: "A", age: 3 } }

deepRename({ a: { x: 1 }, b: { x: 2 } }, { "x": "y" })
// => { a: { y: 1 }, b: { y: 2 } }  (every matching key, at any depth)

deepRename({ a: 1 }, { "missing": "z" }) // => { a: 1 } (no-op)
```

### Approach

Two readings of "rename", and the examples pin the useful one: a rename entry fires
wherever its path resolves, and a single-segment path like `"x"` is a *key name* that
matches at every level. One recursive walk does it all: carry the dotted path down, rebuild every object, and
at each key prefer a full-path table hit, then a bare-name hit, else keep the key.
Full-path matches win over bare matches, collisions resolve rename-wins, and arrays
recurse without renaming indices. No `parsePath` needed here — the walk builds the
paths itself as it descends.

Key collision needs a rule: if the new name already exists on the same object, the
renamed value wins and overwrites — state it, because silent merge vs overwrite is a
genuine API decision. (Path parsing reuses `parsePath` from the Unflatten problem above.)

### Implementation

```javascript
function isBarePath(path) {
  return !path.includes(".") && !path.includes("[");
}

function deepRename(obj, renames) {
  if (obj === null || typeof obj !== "object") {
    throw new TypeError("deepRename expects an object");
  }
  if (renames === null || typeof renames !== "object" || Array.isArray(renames)) {
    throw new TypeError("renames must be an object mapping path -> new key");
  }
  for (const newKey of Object.values(renames)) {
    if (typeof newKey !== "string" || newKey === "") {
      throw new TypeError("each rename target must be a non-empty key name");
    }
  }
  return renameNode(obj, "", renames);
}

function renameNode(node, path, renames) {
  if (Array.isArray(node)) {
    // Indices are positions, never names: recurse without renaming them.
    return node.map((value, index) => renameNode(value, `${path}[${index}]`, renames));
  }
  if (node === null || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    const newKey = Object.hasOwn(renames, childPath)
      ? renames[childPath] // full-path hit wins
      : Object.hasOwn(renames, key) && isBarePath(key)
        ? renames[key] // bare name matches at any depth
        : key;
    const renamed = renameNode(value, childPath, renames);
    if (newKey === "__proto__") {
      // Plain assignment would set the prototype; define an own property instead.
      Object.defineProperty(out, newKey, {
        value: renamed, enumerable: true, writable: true, configurable: true,
      });
    } else {
      out[newKey] = renamed; // rename wins on collision (documented)
    }
  }
  return out;
}
```

### Walkthrough

`deepRename({ user: { name: "A", age: 3 } }, { "user.name": "fullName" })`:

1. Root (path `""`): key `"user"` — no hit (`"user.name" ≠ "user"`, and `"user"` is
   not a bare entry) → keep; recurse with path `"user"`.
2. At `user`: key `"name"`, childPath `"user.name"` → full-path HIT → emit as
   `"fullName"`, value `"A"` returned as-is. Key `"age"` → no hit → keep.
3. Result: `{ user: { fullName: "A", age: 3 } }`. The input tree is untouched — every
   object on the walk was rebuilt. // => as shown

For the bare case, `deepRename({ a: { x: 1 }, b: { x: 2 } }, { x: "y" })`: at each
level the childPath (`"a.x"`, `"b.x"`) misses, but the bare entry `"x"` hits, so both
become `y` → `{ a: { y: 1 }, b: { y: 2 } }`.

### Complexity

Time: `O(n)` — one walk rebuilds every object once; each key costs two hash lookups.
Space: `O(n)` — the whole tree is rebuilt (renames can strike anywhere, so path-local
sharing isn't available).

### Edge Cases

- Rename target collides with an existing key: rename wins (documented).
- Renaming to the same name is a harmless delete-then-set.
- Array elements recurse; array *indices* are never renamed (indices aren't names).
- Missing paths are ignored, never created.
- `__proto__` as a new key: assigning `out["__proto__"] = value` on a plain object
  sets the prototype — use `Object.defineProperty` or a `Map`/null-prototype
  accumulator if the threat model includes hostile rename tables.

### Interview Follow-ups

- **Rename with a function:** `(path, key, value) => newKey | undefined` generalises
  the table — return `undefined` to keep the key.
- **Two-phase alternative:** clone-on-write per path (like `deepOmit`) plus a bare-name
  sweep — more code, but path-local structural sharing when renames are few and the
  tree is huge.
- **Invert the table** for reverse migrations.

### Common Mistakes

- Mutating the input while renaming (delete + set on the original).
- Only renaming the first match instead of every match.
- `out[newKey] = value` without deleting the old key (duplication, not rename).
- Forgetting arrays recurse but their indices must not be renamed.
- The `__proto__` assignment trap on hostile input.

### Takeaway

Deep rename is a full-tree rebuild with a rename table checked two ways: full paths
resolved by descent, bare names matched at every level. Collisions resolve rename-wins,
and `__proto__` needs an explicit guard.

## Get a Value by Path

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `get(obj, path)` that reads the value at a string path and returns
`undefined` when any part of the path is missing — never throwing for missing data:

```javascript
get({ user: { address: { city: "Pune" } } }, "user.address.city")
// => "Pune"
```

The contract:

- `path` is parsed by the `parsePath` helper defined in the Unflatten problem above:
  dot segments plus `[n]` brackets, with numeric segments kept as numbers.
- A missing key, a `null`/`undefined` intermediate, or an out-of-range array index
  returns `undefined`. Only a malformed `path` itself throws (from `parsePath`).
- Primitives on the path simply resolve to `undefined` when the property is absent;
  boxing semantics are not emulated beyond a plain property read.
- The returned value is by reference — no cloning. Reading `__proto__` is a plain
  read and is safe; writing is where the danger lives (see `set` next).

### Examples

```text
get({ user: { address: { city: "Pune" } } }, "user.address.city") // => "Pune"
get({ tags: ["x", "y"] }, "tags[1]")                             // => "y"
get({ tags: ["x", "y"] }, "tags[5]")                             // => undefined (no throw)
get({ user: { address: null } }, "user.address.city")            // => undefined
get({ a: { b: undefined } }, "a.b")                              // => undefined (present, but undefined)
get({ a: { b: undefined } }, "a.missing")                        // => undefined (absent — same result)
get(null, "a.b")                                                 // => undefined
get({ a: 1 }, "a.b.c")                                           // => undefined (primitive intermediate)
```

### Approach

Parse once, then walk. `parsePath("user.tags[0]")` yields `["user", "tags", 0]`, so
the reader never does string surgery itself — one parser per page, reused here.

The loop keeps a single invariant: `node` is the value at the segments consumed so
far. Start at `obj`; for each segment, if `node` is `null` or `undefined`, stop and
return `undefined`. Otherwise advance with `node = node[segment]`. There is no
`typeof` gate inside the loop: a primitive intermediate naturally yields `undefined`
on the next property read, and an explicit gate would only add a behavioural choice
about boxing to defend.

This is deliberately the opposite of `unflatten`'s builder: no containers are
created, nothing is thrown for absent keys, and the transient cost is just the
segment array.

### Implementation

```javascript
// Reuses parsePath from the Unflatten problem above: "a.b[0].c" -> ["a", "b", 0, "c"].
function get(obj, path) {
  const segments = parsePath(path); // throws only for a malformed path string
  let node = obj;
  for (const segment of segments) {
    if (node === null || node === undefined) return undefined; // missing: no throw
    node = node[segment];
  }
  return node;
}
```

### Walkthrough

`get({ user: { address: { city: "Pune" } } }, "user.address.city")`:

1. `parsePath` returns `["user", "address", "city"]`.
2. `node` starts at the root. Segment `"user"` → the user object.
3. Segment `"address"` → the address object. Neither was nullish, so no early return.
4. Segment `"city"` → `"Pune"`. Loop ends, returns `"Pune"`. // => `"Pune"`

For `get({ user: { address: null } }, "user.address.city")`: after `"address"`,
`node` is `null`. The next iteration sees `null` and returns `undefined` without
ever reading `.city` off `null` — that nullish check is what makes missing data safe.

### Complexity

Time: `O(d)` for path depth `d` — one property read per segment. Space: `O(d)` for
the transient segment array from `parsePath`; `O(1)` extra besides it.

### Edge Cases

- Missing key or out-of-range index → `undefined`, not a throw.
- `null`/`undefined` root or intermediate → `undefined` (so `get(null, "a")` is safe).
- Primitive intermediate (`{ a: 1 }`, path `"a.b.c"`) → `undefined` via the nullish
  guard on the following step.
- Explicit `undefined` leaf vs absent path both read as `undefined` — `get` cannot
  tell them apart; that is the `has` problem below.
- Array holes (`[, ,]`) read as `undefined`; holes and explicit `undefined` merge here.
- Malformed path (`""`, non-string) throws from `parsePath` — the one throw `get` allows.
- `__proto__` as a segment is a plain read and does not mutate anything.

### Interview Follow-ups

- **`get` with a default:** `getOr(obj, path, fallback)` returns `fallback` when the
  resolved value is `undefined` — one line on top of `get`.
- **Array-form paths:** accept `["user", "address", "city"]` directly to support keys
  containing dots without an escaping scheme.
- **Why not `path.split(".")`?** It leaves `"tags[0]"` as one literal key instead of
  `["tags", 0]`.
- **Production:** lodash `get`; optional chaining (`?.`) for static paths known at
  write time.

### Common Mistakes

- Splitting on `"."` only and treating `"b[0]"` as a literal key.
- Wrapping the walk in `try/catch` instead of the nullish guard — it hides real bugs.
- Throwing on a missing path when the contract says return `undefined`.
- Re-implementing a second parser instead of reusing `parsePath`.

### Takeaway

`get` is parse-then-walk with one guard: if the current node is nullish, return
`undefined`. Everything else is a plain property read per segment.

## Set a Value by Path

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `set(obj, path, value)` that writes `value` at `path`, **mutating** `obj`
in place and returning it:

```javascript
const input = {};
set(input, "user.address.city", "Pune")
// => input is now { user: { address: { city: "Pune" } } }
```

The contract — the mirror image of `deepOmit`'s clone-on-write, stated explicitly
because interviewers check it:

- **Mutation:** `obj` itself is modified; the return value is the same reference.
- `path` uses the same `parsePath` helper as Unflatten and `get` above: dots plus
  `[n]`, numbers stay numbers.
- Missing intermediates are **created**: the *next* segment decides the container —
  a number means an array, anything else means a plain object.
- An existing container is reused; a missing value or a primitive in the way is
  replaced by the fresh container.
- `__proto__`, `constructor`, and `prototype` segments throw instead of writing.
- `obj` must be a non-null object; otherwise throw a `TypeError`. `value` is stored
  by reference, not cloned.

### Examples

```text
set({}, "user.address.city", "Pune")       // => { user: { address: { city: "Pune" } } } (mutates input)
set({ tags: [] }, "tags[0]", "x")          // => { tags: ["x"] }
set({ a: { b: 1 } }, "a.c", 2)             // => { a: { b: 1, c: 2 } }
set({ a: 1 }, "a.b", 2)                    // => { a: { b: 2 } }  (primitive replaced)
set({ tags: ["x"] }, "tags[2]", "z")       // => { tags: ["x", <hole>, "z"] } (array extended)

const input = { a: { b: 1 } };
set(input, "a.b", 9) === input              // => true  (same reference)
set({}, "__proto__.polluted", true)         // => throws (refused)
```

### Approach

Walk to the *parent* of the last segment, creating as you go. For each segment but
the last, look at the child: if it is a non-null object, reuse it; otherwise build a
fresh container chosen by the *next* segment (`typeof next === "number"` → `[]`,
else `{}`) and install it. Then write the last segment directly.

Two decisions carry the implementation. First, the container choice reads the *next*
segment, not the current one — in `tags[0]`, `tags` is an array only because `0`
follows, exactly as in `unflatten`. Second, the dangerous-key check runs on every
segment including the leaf, and an existing container is reused even when its kind
disagrees with the path (no silent data loss).

### Implementation

```javascript
// Reuses parsePath and isDangerousKey from the Unflatten problem above.
function set(obj, path, value) {
  if (obj === null || typeof obj !== "object") {
    throw new TypeError("set expects an object");
  }
  const segments = parsePath(path); // "a.b[0]" -> ["a", "b", 0]
  let node = obj;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (typeof segment === "string" && isDangerousKey(segment)) {
      throw new Error(`refusing dangerous path segment: "${segment}"`);
    }
    const child = node[segment];
    if (child !== null && typeof child === "object") {
      node = child; // reuse: never discard an existing container
    } else {
      // The NEXT segment decides: number -> array, else plain object.
      const fresh = typeof next === "number" ? [] : {};
      node[segment] = fresh;
      node = fresh;
    }
  }

  const last = segments[segments.length - 1];
  if (typeof last === "string" && isDangerousKey(last)) {
    throw new Error(`refusing dangerous path segment: "${last}"`);
  }
  node[last] = value; // mutate in place
  return obj;         // same reference, for chaining
}
```

### Walkthrough

`set({}, "user.tags[0]", "x")`, segments `["user", "tags", 0]`:

1. `node` is the root. Segment `"user"` (not last): child is `undefined` → next is
   `"tags"` (a string) → create `{}`. Root is now `{ user: {} }`, `node` moves in.
2. Segment `"tags"` (not last): child is `undefined` → next is `0` (a number) →
   create `[]`. State: `{ user: { tags: [] } }`, `node` is that array.
3. Last segment `0`: `node[0] = "x"` → `{ user: { tags: ["x"] } }`.
4. Return the original root reference. // => `{ user: { tags: ["x"] } } }`

### Complexity

Time: `O(d)` — one step per segment, each a hash lookup plus at most one
allocation. Space: `O(d)` transient segments from `parsePath`, plus the containers
created along the path.

### Edge Cases

- Primitive or `null` in the way (`{ a: 1 }`, `"a.b"`) → replaced with a fresh container.
- Existing container of the "wrong" kind is reused as-is (no data loss); state the rule.
- Array extension past the end creates holes (`tags[2]` on length 1).
- Dangerous segments throw at any depth, including the leaf.
- Non-object root throws `TypeError`; `value` is stored by reference (mutating it
  later is visible through the path).

### Interview Follow-ups

- **Immutable `set`:** same walk with clone-on-write per level (the `deepOmit`
  technique) — compare the trade-off: safe sharing vs allocation and code size.
- **`unset` vs `set(path, undefined)`:** the former removes the key, the latter leaves
  a present-but-`undefined` key; `has` below tells them apart.
- **Upsert into arrays of records:** match on `id` instead of index when order is unstable.
- **Production:** lodash `set` (mutates, same contract).

### Common Mistakes

- Choosing array-vs-object from the *current* segment instead of the next one.
- `node[segment] || {}` — discards `0`, `""`, and `false` containers and masks conflicts.
- Forgetting to return the input reference, or cloning when the contract says mutate.
- Letting `__proto__` through on the leaf assignment, polluting the prototype.
- Splitting on `"."` only, so `"tags[0]"` becomes a literal key.

### Takeaway

`set` is `get`'s walk plus creation: reuse an existing object, otherwise build the
container the *next* segment demands — and mutate the input you were given.

## Check a Path Exists

`Difficulty: Easy` `Probability: High`

### Problem

Implement `has(obj, path)` returning `true` only when the full path resolves to a
**present** key — including keys explicitly set to `undefined`:

```javascript
has({ a: { b: undefined } }, "a.b")
// => true
```

The contract:

- `path` uses the same `parsePath` helper as the sibling problems (dots plus `[n]`).
- Every segment must resolve through non-null objects to a key that is *present*;
  presence is tested with `Object.hasOwn` (own properties only), so prototype members
  do not count and holes do not count.
- `has` distinguishes what `get` cannot: `{ b: undefined }` (present) vs `{}` (absent)
  both read as `undefined` through `get`, but `has` returns `true` and `false`.
- Never throws for missing data; only a malformed `path` throws (from `parsePath`).
  A `null`/`undefined` root or intermediate yields `false`.

### Examples

```text
has({ user: { address: { city: "Pune" } } }, "user.address.city") // => true
has({ user: { address: {} } }, "user.address.city")               // => false (missing leaf)
has({ a: { b: undefined } }, "a.b")                               // => true  (present-but-undefined)
get({ a: { b: undefined } }, "a.b") !== undefined                 // => false (why get-checks lie)
has({ a: { b: undefined } }, "a.missing")                         // => false
has({ tags: ["x"] }, "tags[0]")                                   // => true
has({ tags: ["x"] }, "tags[1]")                                   // => false (out of range)
has({ user: null }, "user.address")                               // => false (null intermediate)
has({ a: 1 }, "a.b")                                              // => false (primitive intermediate)
```

### Approach

Walk the segments the way `get` does, but check *presence* before descending. At
each level: if the current node is not a non-null object, return `false` (there is
nowhere for a key to live). If `Object.hasOwn(node, segment)` is `false`, return
`false` — this is the line `get(...) !== undefined` cannot replace, because an
explicit `undefined` value is present while a missing key is not. Otherwise advance
with `node = node[segment]` and continue. Surviving every segment means the path
exists, so return `true`.

`Object.hasOwn` (own properties) is the default because path utilities answer "did
someone put a value here?", not "is this reachable through the prototype?". Mention
the `hasIn` variant that uses `in` when the interviewer asks about inherited members.
Arrays need no special case: indices are own keys, and holes are absent keys.

### Implementation

```javascript
// Reuses parsePath from the Unflatten problem above.
function has(obj, path) {
  const segments = parsePath(path); // throws only for a malformed path string
  let node = obj;
  for (const segment of segments) {
    // Only objects (and functions) can hold path keys; primitives end the search.
    if (node === null || (typeof node !== "object" && typeof node !== "function")) {
      return false;
    }
    if (!Object.hasOwn(node, segment)) return false; // missing vs undefined: decided here
    node = node[segment];
  }
  return true;
}
```

### Walkthrough

`has({ a: { b: undefined } }, "a.b")`, segments `["a", "b"]`:

1. `node` is the root (an object). `Object.hasOwn(root, "a")` → `true`, so advance:
   `node` becomes `{ b: undefined }`.
2. `node` is an object. `Object.hasOwn(node, "b")` → `true` — the key exists even
   though its value is `undefined`. Advance: `node` becomes `undefined`.
3. Segments exhausted → return `true`. // => `true`

Contrast `get({ a: { b: undefined } }, "a.b") !== undefined`: `get` returns
`undefined`, so the comparison is `false` — wrong. And for `has({a: {}}, "a.b")`,
step 2 finds `hasOwn` is `false` and returns `false`, where `get` would also have
returned `undefined`. Same reading, opposite presence.

### Complexity

Time: `O(d)` — one `hasOwn` plus one property read per segment. Space: `O(d)` for
the transient segment array; `O(1)` extra.

### Edge Cases

- Explicit `undefined` → `true`; missing key → `false`. The whole point of `has`.
- `null`/`undefined` at any level including the root → `false`, no throw.
- Primitive intermediates (`{ a: 1 }`, `"a.b"`) → `false` via the object gate.
- Array holes: `0 in [,]` is `false` and `hasOwn` agrees — a hole is absent.
- Inherited members (`"toString"`, `"constructor"`) → `false` under `hasOwn`; the
  `in`-based `hasIn` variant would say `true` — name which one you implemented.
- `null`-prototype objects work: `Object.hasOwn` does not need the prototype.
- Malformed path throws from `parsePath`, consistent with `get`/`set`.

### Interview Follow-ups

- **`hasIn` variant:** swap `Object.hasOwn(node, segment)` for `segment in Object(node)`
  to include inherited properties; say when each is wanted.
- **`getOr` done right:** `has(obj, path) ? get(obj, path) : fallback` applies the
  default only when absent, unlike `get(...) ?? fallback` which also fires on explicit
  `undefined`/`null`.
- **Deep pick/omit by paths:** `has` gates whether there is anything to copy or delete.
- **Production:** lodash `has` (own) vs `hasIn` (inherited) — the same split.

### Common Mistakes

- Implementing presence as `get(obj, path) !== undefined` — fails on explicit `undefined`.
- Using truthiness (`if (get(...))`), which additionally fails on `0`, `""`, and `false`.
- Skipping the intermediate object gate and reading properties off `null`.
- Using `in` while claiming own-property semantics (or vice versa) without stating it.
- Forgetting holes: `delete arr[0]` plus a length check still reports present; `hasOwn`
  reports absent.

### Takeaway

Presence is a per-level `hasOwn` check, not a value comparison. `get` tells you what
is there; only `has` tells you whether anything is there at all.

