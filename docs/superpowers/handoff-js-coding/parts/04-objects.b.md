## Pick Selected Properties From an Object

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `pick(object, keys)` that returns a **new plain object** containing only the
properties named in `keys`. This is the "allow-list" projection you write constantly when
shaping API payloads and view models.

Contract:

- `keys` is any iterable of `string | symbol` (array, `Set`, generator).
- A key is **included only if it exists** on `object`; keys that are absent are omitted,
  not set to `undefined`.
- Existence is tested with `key in object`, so inherited properties count (matching
  `_.pick`), but the value copied is the resolved `object[key]`.
- Values are read **once**; a getter becomes a plain data property on the result.
- The result is a fresh **`{}`** — never a `null`-prototype object, never the input.
- The input is not mutated.
- `object` being `null`/`undefined` throws `TypeError`.

### Examples

```text
pick({ a: 1, b: 2, c: 3 }, ["a", "c"])        // => { a: 1, c: 3 }
pick({ a: 1, b: 2 }, ["a", "z"])              // => { a: 1 }         (z omitted)
pick({ a: undefined }, ["a"])                 // => { a: undefined } (present, kept)
pick({ a: 1 }, ["toString"])                  // => { toString: [Function] } (inherited)
pick({ a: 1 }, [])                            // => {}
pick({ a: 1 }, new Set(["a"]))                // => { a: 1 }         (any iterable)
const sym = Symbol("s");
pick({ [sym]: 9, a: 1 }, [sym])               // => { [Symbol(s): 9] }
pick(null, ["a"])                             // => TypeError
```

### Approach

The whole problem is two decisions that naive code gets wrong.

1. **Existence, not truthiness.** `if (object[key])` drops `0`, `""`, `false`, and
   explicit `undefined`. `if (object[key] !== undefined)` still drops a present
   `undefined`. Only `key in object` answers "does this property exist?".
2. **Assignment vs `CreateDataProperty`.** `result[key] = value` runs the `[[Set]]` path,
   so writing the key `"__proto__"` does not create a property — it **replaces the
   result's prototype**, silently corrupting the object (and enabling prototype
   pollution if a key list is attacker-controlled). Use `Object.defineProperty` (which
   always writes an own data property) or build the result with `Object.fromEntries`,
   which performs `CreateDataPropertyOrThrow` per entry and is safe by construction.

`keys` may be a one-shot iterator, so iterate it directly with `for...of` rather than
indexing. Copying only the listed keys means the work is proportional to the key list,
not the source size.

### Implementation

```javascript
function pick(object, keys) {
  if (object === null || object === undefined) {
    throw new TypeError("pick: cannot read properties of " + object);
  }

  const source = Object(object); // works for primitives too: pick("ab", [0, 1])
  const result = {};

  for (const key of keys) {
    if (key in source) {
      // defineProperty writes an OWN data property; `result[key] = ...` would treat
      // "__proto__" as a prototype assignment instead of a normal value.
      Object.defineProperty(result, key, {
        value: source[key], // single read; a getter runs exactly once
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
}

// Equivalent one-liner: Object.fromEntries uses CreateDataProperty, so it is also
// "__proto__"-safe, but note it does NOT skip absent keys unless you filter first.
const pickEntries = (object, keys) =>
  Object.fromEntries([...keys].filter((key) => key in object).map((key) => [key, object[key]]));
```

### Walkthrough

`pick({ a: 1, b: 2, c: 3 }, ["a", "c", "z"])`:

1. `source` is the same object. `result = {}`.
2. `"a" in source` → `true`; define own `a = source.a = 1`. Result: `{ a: 1 }`.
3. `"c" in source` → `true`; define own `c = 3`. Result: `{ a: 1, c: 3 }`.
4. `"z" in source` → `false`; nothing is written, so `z` is absent (not `undefined`).

Now `pick({ a: undefined }, ["a"])`: `"a" in source` is `true`, so we define `a` with the
value `undefined` and `Object.keys` reports `["a"]` — the property exists. A check like
`if (object[key])` would have produced `{}`, which is the classic bug.

Finally `pick({ x: 1 }, ["__proto__"])`: `"__proto__" in source` is `true` (inherited from
`Object.prototype`), and `source["__proto__"]` is `Object.prototype`. `defineProperty`
creates an own key named `"__proto__"` whose value is `Object.prototype`; the result's
actual prototype is still `Object.prototype`. With `result[key] = ...` the result would
have gained a prototype instead of a property.

### Complexity

Time: `O(k)` where `k = keys.length` (`in` and one read per key). Space: `O(m)` for the
result, `m` = number of present keys.

### Edge Cases

- **Absent keys** are omitted; **present-but-`undefined`** keys are kept. Use `in`.
- **Inherited keys** (`"toString"`, `"constructor"`) are included because `in` walks the
  chain; use `Object.hasOwn(source, key)` instead if you want own-only semantics.
- **`__proto__` key** becomes an own property, never a prototype change.
- **Symbol keys** flow through `for...of` and `defineProperty` unchanged.
- **Getters** run exactly once and are flattened into data properties; accessor semantics
  are lost (document it if you need them — copy descriptors instead).
- **Primitives** as `object`: `Object("ab")` exposes index and `length` properties.
- **`null`/`undefined` source** throws rather than silently returning `{}`.
- **Huge/infinite key iterables** are consumed lazily; an infinite generator never ends.

### Interview Follow-ups

- **`omit` is the dual** (next problem): enumerate the source and subtract the key set.
- **Deep pick by path** (`pick(obj, ["a.b.c"])`): split on `"."`, walk with `??`, and
  create the intermediate containers; guard against `__proto__`/`constructor` segments.
- **Defaults / validation**: `pick` with a schema becomes a whitelist parser — combine
  with a validator (Zod-style) instead of hand-rolling coercion.
- **TypeScript**: `pick<T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K>`;
  the return type is exactly the language feature this polyfills at runtime.

### Common Mistakes

- `if (object[key])` (or `!== undefined`) to test presence, dropping falsy/`undefined`
  values that are genuinely present.
- `result[key] = object[key]`, which lets a `"__proto__"` key mutate the result's
  prototype.
- Using `Object.keys(object)` to drive the loop — that copies everything and ignores the
  allow-list, so it is just a shallow clone.
- Reading the value twice (`source[key]` in the guard and again in the assignment),
  invoking getters twice and risking inconsistent snapshots.
- Assuming `keys` is an array and calling `.filter`/`.map` on a `Set`.

### Takeaway

`pick` is "does the key exist, then copy its value." `in` answers existence correctly
(so falsy values survive), and the copy must be `CreateDataProperty`, not `[[Set]]`, or
`"__proto__"` turns your projection into a prototype pollution bug.

## Omit Selected Properties From an Object

`Difficulty: Easy` `Probability: High`

### Problem

Implement `omit(object, keys)` that returns a new plain object with every **own
enumerable** property of `object` except those named in `keys`. It is `pick`'s dual:
`pick` walks the allow-list, `omit` walks the source and subtracts a deny-list.

Contract:

- `keys` is any iterable of `string | symbol`; build a `Set` for `O(1)` membership.
- Enumerate **own** properties only, and only those whose descriptor is `enumerable`,
  for both string and symbol keys (`Reflect.ownKeys` + descriptor check).
- Keys in `keys` that do not exist are harmless.
- The result is a fresh plain `{}`; the input is not mutated.
- `object === null | undefined` throws `TypeError`.

### Examples

```text
omit({ a: 1, b: 2, c: 3 }, ["b"])            // => { a: 1, c: 3 }
omit({ a: 1, b: 2 }, ["z"])                  // => { a: 1, b: 2 }   (no-op)
omit({ a: 1 }, [])                           // => COPY of { a: 1 }
omit({ a: 1 }, ["a"])                        // => {}
omit(Object.create({ inherited: 1 }, { own: { value: 1, enumerable: true } }), [])
                                             // => { own: 1 }        (inherited dropped)
const sym = Symbol("s");
omit({ [sym]: 9, a: 1 }, [sym])              // => { a: 1 }
omit([10, 20, 30], [1])                      // => { 0: 10, 2: 30 }  (plain object, no length)
omit(null, ["a"])                            // => TypeError
```

### Approach

`omit` enumerates the source, so the contract question is **what counts as a property**.

- Use `Reflect.ownKeys(object)` — it returns string *and* symbol keys. `for...in` would
  also include inherited enumerable properties; `Object.keys` would drop symbols.
- Filter by `Object.getOwnPropertyDescriptor(object, key).enumerable`, because
  `Reflect.ownKeys` includes non-enumerable properties such as an array's `length` and
  methods added with `defineProperty`. Non-enumerable keys are skipped, matching spread.
- Copy with `Object.defineProperty` (same `__proto__` reason as `pick`). This also means
  getters are invoked once and flattened into data properties — the same behavior as
  object spread or `Object.assign` for reads, but spread would copy `__proto__` as an
  own key only via `CreateDataProperty`, which is what we do here explicitly.

The result built from an array is a **plain object**, not an array: `omit([10, 20], [1])`
returns `{ 0: 10 }`, losing `Array.prototype` and `length`. That is intentional — `omit`
returns a shape, and if you want an array you should use `filter`/`slice`.

A caution: lodash's `omit` uses `keysIn`, so it also copies **inherited** enumerable
properties. Our version is own-only, which is what spread and most reviewers expect.
State which contract you are implementing and stay consistent.

### Implementation

```javascript
function omit(object, keys) {
  if (object === null || object === undefined) {
    throw new TypeError("omit: cannot read properties of " + object);
  }

  const source = Object(object);
  const excluded = new Set(keys); // O(1) lookups, works for string and symbol keys
  const result = {};

  for (const key of Reflect.ownKeys(source)) {
    if (excluded.has(key)) continue;

    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor.enumerable) continue; // skip `length`, hidden props, etc.

    Object.defineProperty(result, key, {
      value: source[key], // one read; getters run once and become data props
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return result;
}
```

### Walkthrough

`omit({ a: 1, b: 2, c: 3 }, ["b"])`:

1. `excluded = Set { "b" }`. `Reflect.ownKeys(source)` → `["a", "b", "c"]`.
2. `"a"` not excluded, enumerable → define own `a = 1`. Result `{ a: 1 }`.
3. `"b"` is excluded → skip.
4. `"c"` not excluded → define own `c = 3`. Result `{ a: 1, c: 3 }`.

Now an array: `omit([10, 20, 30], [1])`. `Reflect.ownKeys` → `["0", "1", "2", "length"]`.
`"0"` copied, `"1"` skipped, `"2"` copied, `"length"` is **non-enumerable** so skipped.
The result is `{ 0: 10, 2: 30 }` — a plain object with no `length` and no `Array.prototype`.

### Complexity

Time: `O(n + k)` — enumerate `n` own keys, one `Set` lookup each, plus building the
`Set` in `O(k)`. Space: `O(n)` for the result and `O(k)` for the excluded set.

### Edge Cases

- **Non-enumerable properties** (array `length`, hidden metadata) are skipped.
- **Inherited properties** are not copied; `Object.create({ x: 1 })` with `[]` yields `{}`.
  lodash differs here — call it out if asked.
- **Symbols** are enumerated by `Reflect.ownKeys` and copied as symbol keys.
- **Getters** are evaluated during the copy; the result holds snapshots.
- **`__proto__` as an own enumerable key** (e.g. from `JSON.parse('{"__proto__":1}')`)
  is copied as a real own property, not merged into the prototype.
- **Arrays/typed arrays/class instances** become plain objects; prototypes are not kept.
- **Frozen input** is fine — `omit` only reads.
- **`null`/`undefined`** throws.

### Interview Follow-ups

- **`omitBy(object, predicate)`**: same skeleton, replace the `Set` with
  `predicate(value, key)` — handy for stripping `undefined` before a network call.
- **Rest-destructuring form**: `const { b, ...rest } = object` copies only own enumerable
  properties and is the idiomatic shallow omit, but it is static (keys known at compile
  time) and still evaluates getters.
- **Deep omit by path**: recurse along `"a.b.c"`, deleting the leaf and pruning empty
  parents; guard against `__proto__`/`constructor` path segments.
- **Reverse direction**: `pick` is `omit` with the complement key set only when the source
  is flat and own-enumerable; they are not perfect duals across prototypes.

### Common Mistakes

- Using `for...in` or `Object.assign(dest, src)`, which include **inherited** enumerable
  properties and diverge from the documented own-only contract.
- `Object.keys` instead of `Reflect.ownKeys`, silently dropping symbol keys.
- Forgetting the `enumerable` check, so an array's `length` or other non-enumerable keys
  leak into the result.
- `delete`-and-mutate on the input rather than building a fresh object, breaking callers
  who still need the original.
- Assuming the result for array input is an array.

### Takeaway

`omit` is a shallow clone minus a key set: enumerate own enumerable keys with
`Reflect.ownKeys`, filter non-enumerables, and copy with `CreateDataProperty`. The
"own vs inherited" and "enumerable vs all" choices are the contract, so state them.

## Invert Object Keys and Values

`Difficulty: Easy` `Probability: High`

### Problem

Implement `invert(object)` that returns a new plain object mapping each value of
`object` back to its key. It is the standard "lookup table the other way round" utility
(e.g. turning `{ success: 200 }` into `{ 200: "success" }`).

Contract:

- Only own enumerable string and symbol keys are read.
- Each value is used as a property key (`ToPropertyKey`): strings and symbols stay as
  they are, numbers/symbols/objects are coerced (an object becomes `"[object Object]"`).
- When several keys share a value, **the last one enumerated wins** (a plain `invert`);
  provide `invertMany` to collect collisions into arrays instead.
- The result is a fresh plain `{}`; the input is not mutated.
- A `"__proto__"` *value* must become an own property, not a prototype change.

### Examples

```text
invert({ a: 1, b: 2, c: 3 })          // => { 1: "a", 2: "b", 3: "c" }
invert({ a: 1, b: 1 })                // => { 1: "b" }          (last wins)
invert({ a: "x", b: "y" })            // => { x: "a", y: "b" }
invert({ a: undefined })              // => { undefined: "a" }  (coerced to "undefined")
invert({ a: null })                   // => { null: "a" }
invert({ a: "__proto__" })            // => { __proto__: "a" }  (own property, safe)
const sym = Symbol("k");
invert({ a: sym, b: 2 })              // => { [Symbol(k)]: "a", 2: "b" }
invert({ 2: "b", 1: "a" })            // => { a: "1", b: "2" }  (integer keys sort ascending)
invert({ a: { x: 1 }, b: { y: 1 } })  // => { "[object Object]": "b" } (collision)
```

### Approach

`invert` is a single pass over the key/value pairs; the interview is entirely about
**coercion and collisions**.

- **Enumerate with `Reflect.ownKeys` + the `enumerable` descriptor check** so symbol keys
  survive and non-enumerable properties (an array's `length`) do not.
- **Values become property keys via `ToPropertyKey`.** Assigning `result[value]` performs
  that coercion automatically: `42` → `"42"`, a `Symbol` stays a symbol, `null` →
  `"null"`, `undefined` → `"undefined"`, an object → `"[object Object]"` (so unrelated
  object values collide).
- **`"__proto__"` as a value** is the trap: `result[value] = key` takes the `[[Set]]` path
  and, when `value === "__proto__"`, sets the result's prototype instead of adding a
  property. Write with `Object.defineProperty` (or `Object.fromEntries`, which uses
  `CreateDataProperty`) to make it an own data property.
- **Ordinary-object key order** is: integer-like keys ascending, then string keys in
  insertion order, then symbols. So inverting integer values reorders them, and numeric
  inversions do not preserve insertion order.

For collisions, decide by contract: last-wins is what a bare `invert` does; many
libraries instead collect into an array. Offer both and explain the trade-off.

### Implementation

```javascript
function invert(object) {
  if (object === null || object === undefined) {
    throw new TypeError("invert: cannot read properties of " + object);
  }

  const source = Object(object);
  const result = {};

  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor.enumerable) continue;

    // The value is coerced by defineProperty; "__proto__" becomes an own property,
    // unlike `result[value] = key`, which would repoint the prototype.
    Object.defineProperty(result, source[key], {
      value: key,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return result;
}

// Collision-collecting variant: every key that shared a value is retained.
function invertMany(object) {
  const result = {};
  for (const key of Reflect.ownKeys(Object(object))) {
    if (!Object.getOwnPropertyDescriptor(object, key).enumerable) continue;
    Object.defineProperty(result, object[key], {
      value: [...(result[object[key]] ?? []), key],
      writable: true, enumerable: true, configurable: true,
    });
  }
  return result;
}
```

### Walkthrough

`invert({ a: 1, b: 1, c: 3 })`:

1. `Reflect.ownKeys` → `["a", "b", "c"]`, all enumerable.
2. Key `"a"`, value `1`: `defineProperty(result, 1, { value: "a" })` → `{ 1: "a" }`.
3. Key `"b"`, value `1`: define the **same** key `1` again with value `"b"`, overwriting →
   `{ 1: "b" }`. Last wins.
4. Key `"c"`, value `3` → `{ 1: "b", 3: "c" }`.

For `invert({ a: "__proto__" })`: `defineProperty(result, "__proto__", { value: "a" })`
creates an own enumerable property named `"__proto__"`. `Object.getPrototypeOf(result)`
is still `Object.prototype`; with `result[value] = key` it would have become the string
`"a"` — a prototype corruption bug.

### Complexity

Time: `O(n)` for `n` own enumerable properties. Space: `O(n)` for the result (plus `O(1)`
extra per collision overwrite in `invert`).

### Edge Cases

- **Duplicate values** → last key wins; use `invertMany` when you must keep all.
- **`__proto__` value** → own property, never a prototype write.
- **Non-string values** are coerced: objects collide as `"[object Object]"`, `NaN` →
  `"NaN"`, `null`/`undefined` → `"null"`/`"undefined"`.
- **Symbol values** become symbol keys and are preserved.
- **Symbol keys in the source** invert fine, since `Reflect.ownKeys` includes them.
- **Integer-like values reorder** the result by ascending numeric key order.
- **Empty object** → `{}`.
- **`Object.create(null)` source** works; `Reflect.ownKeys` is prototype-independent.

### Interview Follow-ups

- **Collision handling**: return arrays (`invertMany`) or attach a `Symbol`-keyed list;
  discuss which is more useful for a permissions map.
- **Invert only selected keys**: compose with `pick(object, keys)` first.
- **Deep invert** a nested lookup table: recurse and invert each level; watch for
  collisions at the container levels.
- **`fromEntries` one-liner**:
  `Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]))` — shorter, but it
  silently loses symbol keys (`Object.entries` skips them) and is less explicit about
  collisions.

### Common Mistakes

- `result[value] = key` with a `"__proto__"` value, mutating the result's prototype.
- Using `Object.entries`, which drops symbol keys from the source.
- Forgetting that numeric values sort to the front of the result's key order.
- Assuming inversions are lossless — collisions overwrite silently.
- Expecting `invert(invert(obj))` to be the identity; collisions and coercion break it.

### Takeaway

`invert` swaps each value into the key slot with `ToPropertyKey` coercion. Collisions are
last-wins by default, symbol keys need `Reflect.ownKeys`, and the copy must go through
`CreateDataProperty` so a `"__proto__"` value cannot rewrite the prototype.

## Group an Array of Objects by Key

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `groupBy(array, keyFn)` that buckets an array's items into an object whose keys
are computed by `keyFn` and whose values are arrays of the matching items. This is the
workhorse behind "group orders by status", "group events by day", and every report UI.

Contract:

- `keyFn(item, index, array)` is called once per item with the same three arguments as
  `Array.prototype.map`/`filter`, and `this` is `undefined`.
- The returned key is coerced to a property key (`ToPropertyKey`): strings and symbols
  are preserved, numbers become strings, objects collapse to `"[object Object]"`.
- Group arrays preserve the **input order** of their items.
- Group keys appear in **first-seen** order (subject to ordinary key ordering for
  integer-like keys).
- The result must not be polluted by a key named `"__proto__"`.
- `keyFn` must be a function, else `TypeError`.

### Examples

```text
const people = [
  { name: "Ada",   dept: "eng" },
  { name: "Bao",   dept: "eng" },
  { name: "Cleo",  dept: "sales" },
];

groupBy(people, (p) => p.dept)
// => { eng: [{...Ada}, {...Bao}], sales: [{...Cleo}] }

groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? "even" : "odd"))
// => { odd: [1, 3], even: [2, 4] }

groupBy([1, 2, 3], (n, i, arr) => arr.length)   // => { 3: [1, 2, 3] }
groupBy([], (x) => x)                            // => {}
groupBy([{ k: "__proto__" }], (x) => x.k)        // key is a safe OWN property
groupBy([1], null)                               // => TypeError
```

### Approach

One pass, three decisions.

1. **Accumulator shape.** A plain `{}` inherits `Object.prototype`, so a key like
   `"__proto__"` or `"constructor"` collides with an inherited member: `result["constructor"]`
   is truthy (the `Object` function), so `result[key] ??= []` returns the wrong object and
   `.push` may throw. Two fixes: `Object.create(null)` (no prototype, so every key is a
   plain own slot — and a `"__proto__"` assignment on a null-prototype object creates an
   own data property, because there is no inherited `__proto__` setter), or a `Map`
   (no key coercion at all, and object keys keep their identity).
2. **Callback arguments.** Mirror the array-iterator contract: `(item, index, array)`.
   The accumulator itself is internal and must not be exposed — that is the difference
   from `reduce`, whose first callback argument *is* the accumulator.
3. **Group initialization.** `(result[key] ??= []).push(item)` creates the array on first
   sight and appends otherwise, keeping items in input order.

Prefer `Object.create(null)` when keys are known strings (cheap, JSON-serializable with a
careful `toJSON`), and `Map` when keys are objects, numbers you must not merge (`1` vs
`"1"`), or you need iteration/`.size`. If the caller expects a normal object, convert
with `Object.fromEntries(map)` — but then non-string keys get coerced.

### Implementation

```javascript
function groupBy(array, keyFn) {
  if (typeof keyFn !== "function") throw new TypeError("groupBy: keyFn must be a function");

  // Null prototype: "__proto__"/"constructor" become ordinary own keys.
  const result = Object.create(null);

  array.forEach((item, index) => {
    const key = keyFn(item, index, array);
    // ??= creates the bucket once; push preserves input order within a group.
    (result[key] ??= []).push(item);
  });

  return result;
}

// Map variant: no key coercion, so object/number keys keep exact identity.
function groupByMap(array, keyFn) {
  const result = new Map();
  array.forEach((item, index) => {
    const key = keyFn(item, index, array);
    const bucket = result.get(key);
    if (bucket === undefined) result.set(key, [item]);
    else bucket.push(item);
  });
  return result;
}
```

### Walkthrough

`groupBy(people, (p) => p.dept)` where `people` is Ada/eng, Bao/eng, Cleo/sales:

1. `result = Object.create(null)`.
2. Item `Ada`, index `0`: `key = "eng"`. `result["eng"]` is `undefined`, so `??=` assigns
   `[]` and `.push(ada)` → `eng: [ada]`.
3. Item `Bao`, index `1`: `key = "eng"` again. The bucket exists, so `??=` keeps it and
   `.push(bao)` → `eng: [ada, bao]`.
4. Item `Cleo`, index `2`: `key = "sales"` → new bucket → `sales: [cleo]`.

Result: `{ eng: [ada, bao], sales: [cleo] }`, in first-seen key order. With a plain `{}`,
a `"__proto__"` key would have hit the inherited setter rather than creating a bucket.

### Complexity

Time: `O(n)` — one `keyFn` call and one push per item. Space: `O(n)` for the buckets plus
`O(g)` keys for `g` distinct groups. The `Set`/`Map` lookups are `O(1)` amortized.

### Edge Cases

- **`"__proto__"`/`"constructor"` keys**: safe with `Object.create(null)`; a plain `{}`
  is the classic prototype-pollution bug.
- **Object keys collide** in the plain-object version (`"[object Object]"`); the `Map`
  version keeps them distinct.
- **Number vs string keys merge** (`1` and `"1"`) in the object version; distinct in `Map`.
- **Integer-like keys reorder** the result ascending, unlike first-seen insertion order.
- **Empty input** → `{}` / empty `Map`; still callable.
- **`keyFn` throws** → the error propagates and no partial result leaks (the accumulator
  is local).
- **Sparse input**: `forEach` skips holes, so holes produce no bucket; `for...of` would
  visit them as `undefined`.
- **Mutating the input inside `keyFn`** is observable because `forEach` reads live indices
  after a length snapshot.

### Interview Follow-ups

- **Match the spec**: "Now reimplement it as `Object.groupBy`" — the next problem adds the
  null-prototype detail, two-argument callback, and iterable input.
- **`Map.groupBy`** when keys must not coerce; note `Map` keys use SameValueZero
  (`NaN` groups with itself, `-0` joins `+0`).
- **Aggregate instead of collect**: replace `.push` with a fold — `sum`, `avg`, `count`,
  or `min/max` per group.
- **Multi-key grouping**: `keyFn` returns a composite string (`dept + "|" + seniority`) or
  use a nested `Map` of `Map`s.
- **Group then sort**: sort each bucket by a comparator without disturbing group order.

### Common Mistakes

- Starting from `{}` and writing `result[key] = result[key] || []` — breaks on
  `"constructor"`/`"toString"` (inherited truthy values) and on `"__proto__"`.
- Passing the accumulator to `keyFn` (that is `reduce`, not `groupBy`), so the callback
  signature is wrong.
- Using `Object.keys(result)` expecting insertion order and being surprised by numeric
  key sorting.
- Coercing object keys yourself with `String(key)` before grouping, guaranteeing
  collisions; use a `Map` instead.
- Growing a bucket with `concat` each time, turning `O(n)` into `O(n²)`.

### Takeaway

`groupBy` is one pass with an accumulator keyed by `ToPropertyKey(keyFn(item, index, array))`.
The only real trap is the accumulator: a null-prototype object (or a `Map`) prevents
`"__proto__"`/`"constructor"` collisions, and the callback never sees the accumulator.

## Implement an `Object.groupBy` Equivalent

`Difficulty: Medium` `Probability: High`

### Problem

Implement `myGroupBy(items, callback)` matching the standard `Object.groupBy` static
method, then explain how it relates to the native `Object.groupBy` / `Map.groupBy`.
The interesting part is spec fidelity: the accumulator's prototype, the callback's
argument list, and the input's iterability are all fixed by the standard.

Contract, in spec order:

1. `items` must be coercible to an object and **iterable**; a non-iterable object throws
   `TypeError` (`Object.groupBy({ a: 1 }, fn)` throws — it does not group its values).
2. `callback` must be callable, else `TypeError`.
3. Iterate with the iterator protocol; `callback(element, index)` is called with exactly
   **two** arguments (`g`: no third "array" argument) and `this === undefined`.
4. The key is `ToPropertyKey(callback(...))` — symbols stay symbols, everything else is
   coerced to a string.
5. The result is a **null-prototype** object (`OrdinaryObjectCreate(null)`); each value is
   a fresh ordinary array, and a repeated key appends to the existing array.
6. Groups appear in first-seen key order (ordinary key ordering for integer-like keys).

### Examples

```text
myGroupBy([1, 2, 3, 4], (n) => (n % 2 ? "odd" : "even"))
// => { odd: [1, 3], even: [2, 4] }   with NO prototype

myGroupBy(["a", "bb", "c"], (s) => s.length)
// => { 1: ["a", "c"], 2: ["bb"] }

myGroupBy([10], (v, i) => `${i}-${v}`)
// => { "0-10": [10] }                 (index is the second argument)

myGroupBy(new Set(["x", "x", "y"]), (v) => v)
// => { x: ["x"], y: ["y"] }           (any iterable; Set dedupes first)

Object.getPrototypeOf(myGroupBy([], (x) => x))   // => null
myGroupBy({ a: 1 }, (x) => x)                     // => TypeError (plain object not iterable)
myGroupBy([1], "nope")                            // => TypeError (callback not callable)
```

### Approach

Follow the spec's `GroupBy` steps rather than inventing a shape.

- **Iterate, don't index.** Use `for...of` (the iterator protocol), not `for (let i...)`.
  That is what makes `Set`, `Map`, generators, and strings valid inputs and makes a plain
  object throw naturally — you do not special-case it.
- **`Object.create(null)` is not a detail, it is the contract.** It removes the
  `Object.prototype` setter for `"__proto__"`, so `groups[key] = array` writes a data
  property even for that key. It also makes `key in groups` reflect only real groups.
- **Two callback arguments.** The spec calls `callback(value, index)`; there is no third
  `items` argument, unlike `Array.prototype.map`. Passing the array is a subtle deviation
  that a spec test would catch.
- **Key coercion is implicit.** `result[key]` performs `ToPropertyKey`. Because the target
  is null-prototype and we are doing a plain assignment, `"__proto__"` is safe.
- **Index is the iteration counter**, not the array index: for a `Set` or generator it is
  simply `0, 1, 2, ...` in iteration order.

Honest note on the native methods: `Object.groupBy(items, callback)` (ES2024) returns a
null-prototype object exactly as above. `Map.groupBy(items, callback)` runs the same
algorithm but returns a `Map`, so keys keep their **identity** instead of being coerced:
objects, `NaN`, and numbers are distinct keys, and `-0` normalizes to `+0`. Choose
`Object.groupBy` when keys are strings/enums and you want a serializable plain bag;
choose `Map.groupBy` when keys are objects or you cannot afford coercion collisions. A
full polyfill is only needed for engines older than the 2024 baseline; guard it with
`Object.groupBy ??= myGroupBy`.

### Implementation

```javascript
function myGroupBy(items, callback) {
  // 1) RequireObjectCoercible + callable check, in spec order.
  if (items === null || items === undefined) {
    throw new TypeError("myGroupBy: items is null or undefined");
  }
  if (typeof callback !== "function") {
    throw new TypeError("myGroupBy: callback must be a function");
  }

  // 2) OrdinaryObjectCreate(null): null prototype is part of the contract.
  const groups = Object.create(null);
  let index = 0;

  // 3) GetIterator(items): throws for non-iterable objects, exactly like the spec.
  for (const element of items) {
    const key = callback(element, index); // ToPropertyKey happens on assignment below
    const bucket = groups[key];

    if (bucket === undefined) {
      groups[key] = [element]; // assignment is safe on a null-prototype object
    } else {
      bucket.push(element); // same array reference is appended and already stored
    }
    index += 1;
  }

  return groups;
}

// Polyfill form for pre-ES2024 engines.
Object.groupBy ??= myGroupBy;
```

### Walkthrough

`myGroupBy(["a", "bb", "c"], (s) => s.length)`:

1. `"a"` is iterable, `callback` is callable. `groups = Object.create(null)`, `index = 0`.
2. Element `"a"`: `key = 1`. `groups[1]` is `undefined`, so `groups[1] = ["a"]`. The
   numeric key is stored as `"1"`. `index = 1`.
3. Element `"bb"`: `key = 2` → new bucket `["bb"]`. `index = 2`.
4. Element `"c"`: `key = 1` → `groups[1]` is `["a"]`, so `["a"].push("c")` → `["a", "c"]`.
   Because the array was stored by reference, mutating it is visible in `groups`.
5. Return `{ 1: ["a", "c"], 2: ["bb"] }` with prototype `null`.

Contrast the `Map` variant: `Map.groupBy(["a", "bb"], (s) => s.length)` returns
`Map { 1 => ["a"], 2 => ["bb"] }`; if two different objects both mapped to `"[object Object]"`
under `Object.groupBy`, they stay separate keys in the `Map`.

### Complexity

Time: `O(n)` — one callback call and one push per iterated element. Space: `O(n)` for the
buckets, plus `O(g)` for `g` distinct keys. Iteration is lazy, so an infinite iterator
never finishes.

### Edge Cases

- **Non-iterable input** (`{}`, a number, `null`) → `TypeError`, because `for...of`
  throws; no silent value-grouping.
- **Callback not callable** → `TypeError` before any iteration.
- **`"__proto__"` key** → own data property on the null-prototype result; no pollution.
- **Symbol keys** survive coercion (`Symbol` is already a property key).
- **Sparse array input** → the array iterator yields `undefined` for holes, so holes are
  grouped like explicit `undefined`.
- **Index is the iteration counter**, not the sparse index, so it is always `0..n-1`.
- **Duplicate objects/values** are pushed again; grouping does not dedupe.
- **Callback that throws** aborts the whole call; no partial result escapes.
- **Strings** are iterable, so `myGroupBy("aab", (c) => c)` groups characters.

### Interview Follow-ups

- **`Map.groupBy`**: same loop with `new Map()` and `map.get(key)`; explain identity vs
  coercion and that `Map` keys use SameValueZero.
- **Group by multiple fields**: return `keyFn` results as a `Map`-of-`Map` structure, or
  compose a composite string for the object version.
- **Async grouping**: the native API is synchronous; for streamed data accumulate into a
  `Map` inside an `async` loop and note that `Object.groupBy` cannot drive promises.
- **Why not `reduce`?** It can group, but the callback signature is
  `(accumulator, value, index, array)`, so it invites passing `items` where `index` is
  expected, and the accumulator handling is noisier than a direct loop.
- **Using it as an actual polyfill**: `Object.groupBy ??= myGroupBy` is safe because the
  native property is writable/configurable; never `=` it unconditionally.

### Common Mistakes

- Using `{}` instead of `Object.create(null)`, reintroducing the `"__proto__"`/`"constructor"`
  pollution bug that the spec explicitly designs around.
- Passing a third argument (`items`) to `callback`, a deviation from the standard.
- Writing `Object.groupBy({ a: 1 }, fn)` and expecting values to be grouped; plain objects
  are not iterable.
- Replacing the bucket on every hit (`groups[key] = [element]`) instead of appending, so
  only the last element per key survives.
- Assuming `index` is the array index for sparse arrays; it is the iterator position.

### Takeaway

`Object.groupBy` is: iterate the input with the iterator protocol, compute
`ToPropertyKey(callback(element, index))`, and append into a bucket on a
**null-prototype** result object. `Map.groupBy` is the same loop returning a `Map`, trading
property-key coercion for true key identity.

## Compare Two Objects and Return Changed Properties

`Difficulty: Medium` `Probability: High`

### Problem

Implement `diffObjects(a, b)` that returns the properties that differ between two objects,
each as `{ from, to }`. This is the core of dirty-checking a form, computing an update
payload, and rendering a change log.

Contract:

- Consider the **union** of own enumerable keys (`string` and `symbol`) of both objects;
  keys that appear only in `b` or only in `a` count as changes.
- Compare values with `Object.is`, not `===`: `NaN` equals `NaN`, and `+0` differs from
  `-0`.
- Distinguish **absent** from **present-but-`undefined`** using `Object.hasOwn`; a key
  removed from `b` is a change even when its value was `undefined`.
- Comparison is **shallow**: nested objects are compared by reference, so two structurally
  equal objects report as different. (Deep comparison is the next problem.)
- Only changed keys appear in the result; unchanged keys are omitted.
- Neither input is mutated; `null`/`undefined` are treated as empty objects.

### Examples

```text
diffObjects({ a: 1, b: 2 }, { a: 1, b: 3 })
// => { b: { from: 2, to: 3 } }

diffObjects({ a: 1, b: 2 }, { a: 1 })
// => { b: { from: 2, to: undefined } }

diffObjects({ a: 1 }, { a: 1, c: 4 })
// => { c: { from: undefined, to: 4 } }

diffObjects({ n: NaN }, { n: NaN })            // => {}         (Object.is)
diffObjects({ z: -0 }, { z: 0 })               // => { z: {from:-0,to:0} }
diffObjects({ a: 1 }, { a: 1 })                // => {}
diffObjects(null, { a: 1 })                    // => { a: { from: undefined, to: 1 } }
const o = { a: 1 };
diffObjects({ list: o }, { list: o })          // => {}         (same reference)
diffObjects({ list: { x: 1 } }, { list: { x: 1 } }) // => changed (different refs)
```

### Approach

A shallow diff is set arithmetic plus a value comparison.

- **`Object.hasOwn` vs `in`.** `in` walks the prototype chain, so `"toString" in {}` is
  true and would produce a phantom change for every object. `Object.hasOwn` answers
  "own property" and is not shadowable. Absence is represented as `undefined` in the
  result but detected separately, so removing a key whose value was already `undefined`
  still registers.
- **`Object.is` vs `===`.** `===` says `NaN !== NaN`, so a diff of two identical `NaN`
  fields never settles, and `0 === -0` hides a genuine sign change (which matters for
  `length`/`offset` style values). `Object.is` is the correct leaf comparison.
- **Union of keys** via a `Set`, seeded from `Reflect.ownKeys` of each side filtered to
  enumerable, so symbols participate.
- **Shallow on purpose.** Recursing here would conflate two problems (diff and equality);
  keep this one reference-based and delegate structure to `deepDiff`.

For the result, build `{ from, to }` with `Object.defineProperty` so a key named
`"__proto__"` is a data property rather than a prototype write.

### Implementation

```javascript
function hasOwnEnumerable(value, key) {
  if (value === null || value === undefined) return false;
  const descriptor = Object.getOwnPropertyDescriptor(Object(value), key);
  return descriptor !== undefined && descriptor.enumerable;
}

function enumerableOwnKeys(value) {
  if (value === null || value === undefined) return [];
  return Reflect.ownKeys(Object(value)).filter((key) => hasOwnEnumerable(value, key));
}

function diffObjects(a, b) {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...enumerableOwnKeys(left), ...enumerableOwnKeys(right)]);
  const changes = {};

  for (const key of keys) {
    const inLeft = hasOwnEnumerable(left, key);
    const inRight = hasOwnEnumerable(right, key);
    const from = inLeft ? Object(left)[key] : undefined;
    const to = inRight ? Object(right)[key] : undefined;

    // Different presence OR different value => a change.
    if (inLeft !== inRight || !Object.is(from, to)) {
      Object.defineProperty(changes, key, {
        value: { from, to }, writable: true, enumerable: true, configurable: true,
      });
    }
  }
  return changes;
}
```

### Walkthrough

`diffObjects({ a: 1, b: 2, n: NaN }, { a: 1, d: 4, n: NaN })`:

1. Keys union = `{ "a", "b", "n", "d" }`.
2. `"a"`: present both, `Object.is(1, 1)` → no change.
3. `"b"`: present in left only → `inLeft !== inRight` → change
   `b: { from: 2, to: undefined }`.
4. `"n"`: present both, `Object.is(NaN, NaN)` → `true` → **no change**. With `===` this
   would falsely report a change every time.
5. `"d"`: present in right only → change `d: { from: undefined, to: 4 }`.

Result: `{ b: { from: 2, to: undefined }, d: { from: undefined, to: 4 } }`. Now compare
`{ z: -0 }` and `{ z: 0 }`: `Object.is(-0, 0)` is `false` → change; `===` would have
hidden it.

### Complexity

Time: `O(k)` where `k` is the size of the key union (plus `O(1)` per read). Space:
`O(k)` for the union set and up to `O(k)` for the result. Shallow, so nested sizes do not
matter.

### Edge Cases

- **`NaN`** → no change (`Object.is`), unlike `===`.
- **`+0` / `-0`** → reported as different (`Object.is`), which is usually what you want
  for metrics but surprising if you expected `===`.
- **Added/removed keys** → changes with `from`/`to` equal to `undefined`; use the
  presence flags if a consumer must tell "absent" from "explicitly undefined".
- **Symbol keys** participate because `Reflect.ownKeys` includes them.
- **Getters** are evaluated for each side; a throwing getter throws the whole diff.
- **Non-enumerable properties** are ignored, matching spread/clone semantics.
- **Arrays** are objects here: `diffObjects([1,2],[1,2])` compares index references and
  reports no change only for primitives; nested objects inside arrays always differ.
- **Prototype properties** (`toString`) never appear, thanks to `Object.hasOwn`.
- **`null`/`undefined` inputs** are treated as `{}`.

### Interview Follow-ups

- **Deep diff**: recurse into plain objects and arrays — the next problem.
- **Three-way merge**: compute `base→ours` and `base→theirs`, then resolve conflicts where
  both changed the same key.
- **Apply a diff**: a `patch(object, changes)` that assigns each `to`, deleting keys whose
  `to` is `undefined` *and* which are absent.
- **Comparison strategy**: accept a custom equality (`(a, b) => boolean`) so callers can
  treat two `Date`s or `Model` instances as equal by value.
- **Structural sharing**: if `from`/`to` are large, store only a path and look the values
  up lazily rather than holding references.

### Common Mistakes

- Using `===`, so `NaN` fields always report as changed and `-0`/`0` changes are hidden.
- Using `key in object`, which counts inherited properties and adds phantom changes.
- Treating "value is `undefined`" as "key is absent", losing additions/removals.
- Mutating the input while diffing (e.g. deleting keys), breaking callers and often the
  diff itself.
- `JSON.stringify` comparison: key order dependent, drops `undefined`/functions/symbols,
  and throws on cycles.

### Takeaway

A shallow diff is the key union compared with `Object.is`, with presence tracked
separately from value so `undefined` is unambiguous. `Object.hasOwn` keeps inherited
properties out; `Object.is` makes `NaN` and `-0` behave.

## Find Differences Between Deeply Nested Objects

`Difficulty: Hard` `Probability: Medium`

### Problem

Implement `deepDiff(a, b)` that returns a flat list of the leaf-level differences between
two nested structures, each carrying the path where it occurs. This is what a config
auditor, a state-debugger ("why did this store re-render?"), or a test-failure reporter
needs.

Contract:

- Walk arrays and **plain objects** (`Object.prototype` or `null` prototype) recursively.
  Any other object (a `Date`, `Map`, `RegExp`, class instance) is a **leaf**, compared by
  reference.
- Leaves are compared with `Object.is`, so `NaN` equals `NaN` and `+0` differs from `-0`.
- An array is only walked against an array, and a plain object only against a plain
  object; a **kind change** is reported as a single `changed` entry at that path, not a
  deep walk.
- Each entry is `{ path, type, from, to }`, where `type` is `"added" | "removed" | "changed"`
  and `path` is a dotted/bracket string (e.g. `"server.ports[2]"`).
- **Cycles must not cause infinite recursion.** A `WeakMap` pairs already-compared
  `(left, right)` object identities and stops when a pair repeats.
- Own enumerable keys only; string and symbol keys both participate.

### Examples

```text
deepDiff(
  { server: { host: "a", ports: [80, 443] }, debug: false },
  { server: { host: "b", ports: [80, 8080, 443] }, debug: false },
)
// => [
//   { path: "server.host", type: "changed", from: "a", to: "b" },
//   { path: "server.ports[1]", type: "changed", from: 443, to: 8080 },
//   { path: "server.ports[2]", type: "added", from: undefined, to: 443 },
// ]

deepDiff({ a: 1 }, { a: 1 })                 // => []
deepDiff({ a: NaN }, { a: NaN })             // => []
deepDiff({ n: 1 }, { n: "1" })               // => changed at "n"
deepDiff({ list: [1] }, { list: { 0: 1 } })  // => changed at "list" (kind change)
const cyclic = {}; cyclic.self = cyclic;
deepDiff(cyclic, cyclic)                     // => []  (same reference short-circuits)
```

### Approach

Recursive structural comparison with two guards.

- **Leaf short-circuit first.** `Object.is(left, right)` at the top of `walk` handles
  identical references (including the same object twice, which also breaks cycles),
  primitives, `NaN`, and `±0` in one check. Only if that fails do we consider walking.
- **Walkability, not "is object".** Treating every object as walkable silently loses
  changes: two different `Date`s for the same instant have no own enumerable keys, so a
  naive walk reports nothing. Define walkable as array or plain object; everything else
  becomes a leaf.
- **Kind match required.** `[1]` and `{ 0: 1 }` are both "objects", but recursing would
  compare keys that mean different things. If exactly one side is an array (or one is
  plain and the other is not), emit a `changed` node and stop.
- **Presence vs value.** Partition the key union into removed, added, and shared, so a
  missing key is `removed`/`added` rather than a spurious `changed` to `undefined`.
- **Cycle guard is a pair set, not a visited set.** Diffing is a binary relation: the
  same `left` node can legitimately pair with different `right` nodes. Record
  `left → Set(right)` and stop when a pair repeats; a plain `WeakSet` of left nodes would
  wrongly skip valid comparisons and hide differences.

An optional `maxDepth` lets callers bound the walk for very deep trees (or convert the
recursion to an explicit stack) before the call stack overflows.

### Implementation

```javascript
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isWalkable(value) {
  return Array.isArray(value) || isPlainObject(value);
}

function enumerableOwnKeys(value) {
  return Reflect.ownKeys(value).filter(
    (key) => Object.getOwnPropertyDescriptor(value, key).enumerable,
  );
}

// "server.ports[2]", "a.b", "Symbol(id)" for symbol keys.
function formatPath(parentPath, key, parentIsArray) {
  const segment = String(key);
  if (parentIsArray) return `${parentPath}[${segment}]`;
  return parentPath === "" ? segment : `${parentPath}.${segment}`;
}

function deepDiff(a, b, { maxDepth = Infinity } = {}) {
  const changes = [];
  const compared = new WeakMap(); // left object -> Set of right objects already matched

  function walk(left, right, path, depth) {
    if (Object.is(left, right)) return; // identical ref, primitive, NaN, or ±0 pair

    const bothWalkable = isWalkable(left) && isWalkable(right);
    const sameKind = bothWalkable && Array.isArray(left) === Array.isArray(right);

    if (!sameKind || depth >= maxDepth) {
      changes.push({ path, type: "changed", from: left, to: right });
      return;
    }

    // Cycle guard: stop only if this exact pair has been entered before.
    let partners = compared.get(left);
    if (partners?.has(right)) return;
    if (!partners) compared.set(left, (partners = new Set()));
    partners.add(right);

    const keys = new Set([...enumerableOwnKeys(left), ...enumerableOwnKeys(right)]);
    for (const key of keys) {
      const keyPath = formatPath(path, key, Array.isArray(left));
      const inLeft = Object.hasOwn(left, key);
      const inRight = Object.hasOwn(right, key);

      if (inLeft && !inRight) {
        changes.push({ path: keyPath, type: "removed", from: left[key], to: undefined });
      } else if (!inLeft && inRight) {
        changes.push({ path: keyPath, type: "added", from: undefined, to: right[key] });
      } else {
        walk(left[key], right[key], keyPath, depth + 1);
      }
    }
  }

  walk(a, b, "", 0);
  return changes;
}
```

### Walkthrough

`deepDiff({ server: { host: "a", ports: [80, 443] } }, { server: { host: "b", ports: [80, 8080, 443] } })`:

1. Roots are different plain objects; record pair `(rootA → rootB)`.
2. Key `"server"`: present both; recurse with `path = "server"`. Record
   `(serverA → serverB)`.
3. Key `"host"`: `Object.is("a", "b")` is false and both are non-walkable → push
   `{ path: "server.host", type: "changed", from: "a", to: "b" }`.
4. Key `"ports"`: both arrays, same kind; record `(portsA → portsB)`. Key union is
   `{ "0", "1", "2" }` on the right, `{ "0", "1" }` on the left.
5. `"0"`: `Object.is(80, 80)` → return silently.
6. `"1"`: present both, `Object.is(443, 8080)` false, both numbers → push `changed`
   at `"server.ports[1]"`.
7. `"2"`: only on the right → push `{ path: "server.ports[2]", type: "added", from:
   undefined, to: 443 }`.
8. Return the three changes. A cycle would have hit the pair guard and returned instead
   of recursing forever.

### Complexity

Time: `O(V + E)` where `V` is the number of visited `(left, right)` node pairs and `E` the
key union edges — effectively `O(size of both trees)`. Space: `O(D)` recursion depth plus
`O(V)` for the pair map and `O(C)` for the output changes.

### Edge Cases

- **Cycles** are stopped by the `(left, right)` pair map; identical references short
  circuit before that.
- **Kind changes** (`array` vs `object`, plain vs class instance) report one `changed`
  node instead of walking mismatched keys.
- **Non-plain objects** (`Date`, `Map`, `Set`, `RegExp`, class instances) are leaves, so
  two equal-valued but distinct `Date`s report a change — say so rather than pretending.
- **`NaN` / `±0`** handled by `Object.is` at the leaf.
- **Sparse arrays / trailing holes** are invisible: `length` is non-enumerable, so
  `new Array(3)` and `[]` diff as equal. Compare `.length` explicitly if that matters.
- **Symbol keys** appear in the path as `"Symbol(description)"`, which is ambiguous if two
  symbols share a description — return the raw key segments alongside the string if a
  consumer needs them.
- **Getters** are read during the walk and can throw or mutate mid-traversal.
- **Very deep trees** overflow the stack; cap with `maxDepth` or convert `walk` to an
  explicit stack.
- **Prototype properties** are ignored (`Object.hasOwn`).

### Interview Follow-ups

- **Emit a JSON Patch (RFC 6902)**: map each change to `add`/`remove`/`replace` operations
  with JSON Pointer paths; arrays additionally need `move`/`copy`.
- **`applyPatch(object, changes)`**: walk each path and assign, deleting on `removed`;
  return a new object for immutability.
- **Short-circuit equality**: a sibling `deepEqual(a, b)` can reuse the same walk and
  return as soon as one leaf differs — usually the faster API when you only need a boolean.
- **Iterative version**: push `{ left, right, path }` frames onto a stack to avoid deep
  recursion; the pair map stays the same.
- **Custom leaf equality**: accept `(a, b) => boolean` so `Date`s compare by timestamp and
  `Model` instances by id.

### Common Mistakes

- Recursing into every object, so `Date`/`Map`/class instances with no enumerable keys
  silently report no change.
- Using a `WeakSet` of visited **left** nodes instead of pairs, which skips legitimate
  comparisons and hides differences.
- A cycle guard placed **after** the recursive call, which never executes because the
  stack overflows first.
- Reporting a `kind change` as a deep walk, producing meaningless indices/keys from the
  wrong shape.
- Comparing with `===` and thrashing on `NaN`, or `JSON.stringify` and losing `undefined`,
  symbol keys, and cycles (and becoming key-order sensitive).

### Takeaway

Deep diff is `Object.is` at the leaves and structural recursion at the containers, with a
`(left, right)` **pair** map for cycles and a plain-object/array walkability rule so exotic
objects stay leaves. Record added/removed separately from changed, and carry the path.

## Deep-Freeze an Object

`Difficulty: Medium` `Probability: High`

### Problem

Implement `deepFreeze(value)` that makes a value and everything reachable from it
immutable, in place, and returns the value. This is the standard hardening of a config
object, a cached constant, or a Redux-style state tree.

Contract:

- Freeze `value` itself and recurse into every **own** property's value.
- Traverse via **property descriptors**, not `for...in`/`Object.values`, so getters are
  never invoked and accessor properties are left alone.
- Handle **cycles** without infinite recursion (a `WeakSet` of visited objects).
- Skip subtrees that are already frozen — they are immutable by definition and this makes
  repeated calls cheap.
- Freeze functions too (they are objects), and freeze arrays.
- `Object.freeze` is **shallow**: it seals the object's own properties but does nothing to
  the prototype chain or to values held inside `Map`/`Set`/typed arrays.
- Mutating operations on the input after this call throw in strict mode (silently no-op in
  sloppy mode), because the properties become non-writable and the object non-extensible.

### Examples

```text
const config = { name: "app", nested: { port: 8080, list: [1, 2] } };
deepFreeze(config);

Object.isFrozen(config)                 // => true
Object.isFrozen(config.nested)          // => true
Object.isFrozen(config.nested.list)     // => true
config.nested.port = 3000               // throws in strict mode / silently ignored
config.nested.list.push(3)              // throws: frozen array is non-extensible

const again = deepFreeze(config);       // => same object, no error, cheap second pass
again === config                        // => true

const cyclic = { name: "c" };
cyclic.self = cyclic;
deepFreeze(cyclic);                     // terminates; cyclic.self === cyclic, frozen
```

### Approach

`deepFreeze` is a post-order walk over the graph, then a freeze at each node.

- **Recurse before freezing.** Freezing first still works for reads, but freezing after
  keeps the "children are frozen before the parent" invariant, which reads naturally and
  matches how `Object.freeze` propagates the guarantee downward.
- **Descriptors, not enumeration.** `Object.values(obj)` invokes getters and materializes
  arrays. Iterate `Reflect.ownKeys` and inspect each descriptor: only recurse when
  `"value" in descriptor`. Getter-only properties are skipped — you cannot freeze what
  they return, and invoking them can have side effects.
- **Cycle guard + already-frozen skip.** Keep a `WeakSet`. `if (seen.has(value) ||
  Object.isFrozen(value)) return value;` — the `isFrozen` check also prunes subtrees that
  a previous call already handled, so calling `deepFreeze` on an overlapping tree is
  `O(new nodes)`.
- **Functions are objects.** A function's own enumerable properties (and its `prototype`
  object, if any) are reachable, so recurse into it like any other object. Do **not** freeze
  `Function.prototype`, `Object.prototype`, or other built-ins — this only walks what is
  reachable from the input, which is why it is safe unless the input is a global.

Honest limits to state: `Object.freeze` does not stop `Map`/`Set` mutation (their entries
live in internal slots, not properties), does not freeze typed-array elements (and throws
on a typed array with elements), does not prevent `Object.setPrototypeOf` on a
non-extensible object only in the sense that it makes the object non-extensible, and does
not touch the prototype chain. If you need true immutability across those, use a
persistent `Map` or clone the structure with `structuredClone` and freeze the copy.

### Implementation

```javascript
function deepFreeze(value, seen = new WeakSet()) {
  // Only objects and functions can be frozen; primitives are already immutable.
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }

  if (seen.has(value) || Object.isFrozen(value)) return value; // cycle + memo guard
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // Data properties only: reading descriptor.value does not run getters.
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }

  return Object.freeze(value);
}
```

### Walkthrough

`const config = { name: "app", nested: { port: 8080, list: [1, 2] } }; deepFreeze(config)`:

1. `value = config` is an object, not seen, not frozen. Add to `seen`.
2. `Reflect.ownKeys` → `["name", "nested"]`.
   - `"name"` descriptor has `value: "app"`; recurse → primitive, returns immediately.
   - `"nested"` descriptor has an object value; recurse into `nested`.
3. Inside `nested`: keys `["port", "list"]`. `"port"` is a primitive. `"list"` is an
   array; recurse into `[1, 2]`.
4. Inside `list`: keys `["0", "1", "length"]`. Index descriptors hold primitives;
   `"length"` is a non-enumerable **data** property (`value: 2`) — its value is a number,
   so recursion returns immediately. `Object.freeze(list)` runs, making the array
   non-extensible and its indices non-writable.
5. Back in `nested`, `Object.freeze(nested)`. Back in `config`, `Object.freeze(config)`.
6. Return `config`. A second `deepFreeze(config)` hits `Object.isFrozen(config)` at step 0
   and returns immediately.

### Complexity

Time: `O(n)` for `n` reachable objects, each visited once. Space: `O(n)` for the `seen`
`WeakSet` plus `O(d)` recursion depth for a depth-`d` chain.

### Edge Cases

- **Cycles** → `seen` prevents infinite recursion; the back-reference is already frozen
  when the walk returns to it.
- **Already-frozen subtree** → pruned, so repeated/overlapping calls do not re-walk.
- **Getters** are not invoked (descriptor-based); accessor values are not frozen, and
  getters can still return mutable objects.
- **Functions** are frozen, including their own properties; their `prototype` object is
  walked if reachable as an own property.
- **Typed arrays with elements** throw `TypeError` on `Object.freeze` — catch or skip them
  deliberately.
- **`Map`/`Set`** freeze as objects, but `map.set(...)`/`set.add(...)` still work; their
  contents are not frozen.
- **Non-enumerable own properties** are frozen too, and the walk inspects every own key's
  descriptor regardless of enumerability, so hidden nested data objects are frozen as well.
- **Shared references** across branches are visited once thanks to `seen`.
- **Built-ins/globals** as input would freeze far more than intended; do not feed it
  `globalThis`.

### Interview Follow-ups

- **`deepSeal`**: replace `Object.freeze` with `Object.seal` (existing properties stay
  writable, no additions); the walk is identical.
- **Clone-then-freeze**: `deepFreeze(deepClone(input))` if the caller must keep the
  original mutable — pair with the cyclic-clone problem.
- **`Object.isFrozen` semantics**: it reports `true` for an empty non-extensible object,
  which is why the memo check is safe.
- **Proxies**: freezing a `Proxy` freezes the target's properties via traps; a proxy can
  also observe/lie about `isFrozen`, so the walk becomes observable.
- **Production**: `Object.freeze` plus `structuredClone` covers most needs; deep freeze is
  usually better expressed as a lint rule / type (`readonly`) than a runtime pass.

### Common Mistakes

- `Object.values(obj).forEach(deepFreeze)` — invokes getters and only sees enumerable
  properties.
- Forgetting the cycle guard, so `{ self: itself }` overflows the stack.
- Assuming freezing an object freezes the objects its properties point to — that is
  exactly what this function adds on top of `Object.freeze`.
- Expecting a frozen `Map`/`Set`/typed array to reject writes; it does not.
- Freezing `globalThis` or a module namespace transitively and breaking unrelated code.
- Re-walking an already-frozen graph on every call, making hot paths accidentally `O(n)`.

### Takeaway

`deepFreeze` is a descriptor-based, cycle-safe post-order walk that calls the shallow
`Object.freeze` at every node. It freezes own properties only, never invokes getters, and
cannot make `Map`/`Set`/typed-array contents immutable — those limits are part of the
answer.

## Safely Clone Cyclic Objects (No Infinite Recursion)

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `deepClone(value)` that returns a deep copy of any JSON-ish object graph and
**preserves cycles and shared references** without recursing forever. Handing someone a
clone whose `self` link points back at the original is the bug this problem exists to
prevent.

Contract:

- Primitives are returned as-is; functions are returned **by reference** (they are not
  cloneable in JS).
- Plain objects, arrays, `Date`, `RegExp`, `Map`, and `Set` are deep-cloned.
- The clone preserves the input's **prototype** (`Object.create(Object.getPrototypeOf(v))`),
  so `class Foo` instances come back as `Foo` instances.
- **Cycles and shared references are preserved**: if `a.self === a`, then
  `clone(a).self === clone(a)`, and if `a.x === a.y` then `clone(a).x === clone(a).y`.
- Own enumerable string and symbol properties are copied; non-enumerable properties are
  skipped (with one array `length` fix-up).
- Not cloneable: `WeakMap`/`WeakSet` keys, class **private fields**, DOM nodes, and
  functions. These should throw or be returned by reference — pick one and document it.

### Examples

```text
const a = { name: "a", tags: ["x"] };
const b = deepClone(a);
b !== a                    // => true
b.tags !== a.tags          // => true
b.tags[0] === "x"          // => true

const cyc = { name: "root" };
cyc.self = cyc;
const c = deepClone(cyc);
c.self === c               // => true   (points at the CLONE, not the original)
c !== cyc                  // => true

const shared = { s: 1 };
const graph = { left: shared, right: shared };
const g = deepClone(graph);
g.left === g.right         // => true   (sharing preserved)

deepClone(new Date(0)).getTime()          // => 0
deepClone(new Map([[1, { v: 1 }]]))       // => Map(1) { 1 => { v: 1 } }
deepClone(/ab+/gi).source                 // => "ab+"
```

### Approach

The one critical rule: **register the clone before recursing into its children.**

- Create the container (`[]`, `{}`, `new Map()`, ...), `seen.set(original, container)`,
  and only then copy children. When a child points back at an ancestor, the lookup finds
  the already-created container and returns it — that is how the cycle is closed and how
  shared references stay shared.
- The common bug is adding to `seen` **after** copying children (or only when exiting the
  frame). A self-reference then re-enters `deepClone` with the same object, `seen` misses,
  and the stack overflows.
- **Special types first.** `Date` and `RegExp` have no own enumerable keys, so a generic
  object copy would produce `{}`. Handle them explicitly, and clone `Map`/`Set` through
  their iterators so nested keys/values clone too (registered after creation, before
  iteration).
- **Prototype fidelity.** `Object.create(Object.getPrototypeOf(value))` keeps the chain.
  This does **not** run the constructor, so private fields and internal slots are lost —
  be honest about that limit. If you want plain objects only, create `{}` instead.
- **Descriptors.** Copy own enumerable properties with `Object.defineProperty` so a
  `"__proto__"` key is a data property, and so each value is read once.

For arrays, `Reflect.ownKeys` skips `length` (non-enumerable), so after copying indices set
`copy.length = value.length` to preserve trailing holes. `structuredClone(value)` is the
modern production answer: it handles cycles natively and also clones
`ArrayBuffer`/`Map`/`Set`/`Date`/`RegExp`, but it **throws `DataCloneError` on functions**
and does not preserve class prototypes or private fields.

### Implementation

```javascript
function deepClone(value, seen = new WeakMap()) {
  // Primitives pass through; functions are shared by reference (not cloneable).
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (typeof value === "function") return value;

  if (seen.has(value)) return seen.get(value); // cycle or previously cloned node

  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);

  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy); // register BEFORE copying entries
    for (const [k, v] of value) copy.set(deepClone(k, seen), deepClone(v, seen));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const item of value) copy.add(deepClone(item, seen));
    return copy;
  }

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy); // register BEFORE recursing, so back-references resolve

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable) continue; // skip hidden props, incl. array length
    Object.defineProperty(copy, key, {
      value: deepClone(value[key], seen),
      writable: true, enumerable: true, configurable: true,
    });
  }

  if (Array.isArray(value)) copy.length = value.length; // restore sparse length
  return copy;
}
```

### Walkthrough

`const cyc = { name: "root" }; cyc.self = cyc; const c = deepClone(cyc);`

1. `cyc` is an object, not seen. It is not Date/RegExp/Map/Set, so
   `copy = Object.create(Object.prototype)` and `seen.set(cyc, copy)` runs **before**
   the property loop.
2. Key `"name"`: value `"root"` is a primitive → `copy.name = "root"`.
3. Key `"self"`: value is `cyc`, which **is** in `seen`, so `seen.get(cyc)` returns the
   in-progress `copy`. `copy.self` is set to `copy` itself. No recursion, no overflow.
4. Return `copy`. Therefore `c.self === c` and `c !== cyc`.

Now the shared-reference case: `deepClone({ left: shared, right: shared })`. `left` runs
first, creates `leftCopy`, and registers `shared → leftCopy`. When `right` is cloned,
`seen.has(shared)` is true, so `right` gets the **same** `leftCopy`, preserving
`g.left === g.right`.

### Complexity

Time: `O(n + m)` for `n` nodes and `m` own keys (edges). Space: `O(n)` for the `WeakMap`
and the cloned graph, plus `O(d)` recursion depth for a depth-`d` chain.

### Edge Cases

- **Cycles** resolve to the in-progress clone; shared references stay shared.
- **Sparse arrays**: index keys copy as-is and `length` is restored, so trailing holes
  survive (`deepClone([, , ,])` keeps `length === 3`).
- **`Date`/`RegExp`** are handled explicitly; generic copying would yield `{}`.
- **`Map`/`Set`** clone their contents; object keys are cloned too, which changes key
  identity — a lookup by the original key no longer hits.
- **Class instances**: prototype preserved, but the constructor is **not** run, so private
  fields (`#x`) and closure state are absent; prototype methods that touch private fields
  will throw on the clone.
- **Functions** are shared by reference; a clone "containing" a function aliases it.
- **DOM nodes, `WeakMap`, `WeakSet`** are not deep-cloneable; this code would shallow-copy
  them into broken objects — guard or use `structuredClone`.
- **Non-enumerable properties** are dropped (only `Array.length` is restored).
- **Getters** are evaluated and flattened into data properties.
- **`structuredClone`** throws on functions and some host objects; it also does not keep
  prototypes.

### Interview Follow-ups

- **`structuredClone`**: the native answer for cycles, `Date`, `Map`, `Set`, typed arrays,
  and `ArrayBuffer`; discuss transferables and `DataCloneError`.
- **Clone with a transform**: `deepClone(v, seen, fn)` where `fn(node)` can replace nodes,
  e.g. redact or revive model instances.
- **Copy-on-write**: clone lazily down the mutated path instead of eagerly — the basis of
  immutable state libraries.
- **Preserve descriptors**: copy full property descriptors so non-enumerable and accessor
  properties survive; the trade-off is that getters then close over the original.
- **Why not `JSON.parse(JSON.stringify(v))`?** It throws on cycles, drops
  `undefined`/functions/symbols, turns `Date` into a string, converts `Map`/`Set` to `{}`,
  and throws on `BigInt`.

### Common Mistakes

- `seen.set` **after** recursing (or only on the way out), so cycles overflow the stack.
- Returning `seen.get(value)` but forgetting to register new containers, so shared
  references are cloned twice and identity is lost.
- A generic `Object.keys` copy that turns `Date`/`Map`/`RegExp` into `{}`.
- Using `structuredClone` on data with functions or class instances and being surprised by
  `DataCloneError` or prototype loss.
- Forgetting `copy.length = value.length` for sparse arrays, silently truncating holes.
- Assuming private class fields are cloned because the prototype is.

### Takeaway

Deep clone is a memoized traversal: create the container, **register it in a `WeakMap`
before copying children**, then copy. Registration order is the whole trick — it closes
cycles and preserves sharing. Handle `Date`/`RegExp`/`Map`/`Set` explicitly; reach for
`structuredClone` in production and know its limits.

## Implement Recursive Object Transformation (Map Every Leaf Value)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `mapLeaves(value, fn)` that walks a structure and returns a **new** structure of
the same shape where every leaf value has been replaced by `fn(leaf, path, key)`. This is
the generic "transform a config/state tree" primitive behind redaction, unit conversion,
i18n string extraction, and normalizing API responses.

Contract:

- A **container** is an array or a plain object (`Object.prototype`/`null` prototype).
  Everything else — primitives, `Date`, `Map`, `RegExp`, functions — is a **leaf**.
- Arrays stay arrays, plain objects stay plain objects; input shape and prototypes are not
  otherwise invented.
- `fn(leaf, path, key)` receives the current leaf, the array of keys from the root
  (`path`), and the immediate key. `this` is `undefined`.
- The result is a fresh structure: no container in the output is the same reference as any
  container in the input, though leaves may be returned unchanged by `fn`.
- Cycles are supported without infinite recursion (a `WeakMap` from original container to
  its output, registered before descending).
- Own enumerable string and symbol keys and array indices are preserved; the input is not
  mutated.

### Examples

```text
mapLeaves({ a: 1, b: { c: 2 } }, (n) => n * 10)
// => { a: 10, b: { c: 20 } }

mapLeaves({ a: [1, 2, 3] }, (n) => n + 1)
// => { a: [2, 3, 4] }

mapLeaves({ user: { name: "ada", age: 36 } }, (v, path) => (v === "ada" ? "REDACTED" : v))
// => { user: { name: "REDACTED", age: 36 } }

mapLeaves({ a: 1 }, (v, path) => path.join("."))   // => { a: "a" }
mapLeaves([], (v) => v)                            // => []
mapLeaves(new Date(0), (v) => v.getTime())         // => 0  (Date is a leaf)
mapLeaves({ n: null }, (v) => v ?? "none")         // => { n: "none" }

const cyc = { n: 1 };
cyc.self = cyc;
const out = mapLeaves(cyc, (v) => v);
out.self === out                                   // => true (cycle preserved)
```

### Approach

A shape-preserving recursive copy where the "copy" step is user-supplied at the leaves.

- **Classify first.** `Array.isArray` → array branch; otherwise check the prototype:
  `proto === Object.prototype || proto === null` → plain-object branch; otherwise it is a
  leaf. This keeps `Date`/`Map`/class instances atomic instead of silently turning them
  into `{}` (the same failure mode as a naive deep clone).
- **Register before descending.** `seen.set(original, output)` immediately after creating
  the container, then fill it. A cycle then resolves to the in-progress output, so the
  result mirrors the input's shape rather than exploding or dangling.
- **Preserve keys, including symbols.** Iterate `Reflect.ownKeys` filtered to enumerable
  and copy with `Object.defineProperty` for the `"__proto__"`-safety and single-read
  reasons seen in `pick`/`omit`.
- **Pass a path.** Building `[...path, key]` per child is `O(depth)` per node, so the walk is
  `O(n·d)` in the worst case; pass a mutable path array with push/pop and copy only when
  calling `fn` if that matters, or accept the simplicity.
- **`arr.map` vs manual loop.** `map` skips holes; a manual `for` over indices visits them.
  Use `map` for sparse preservation and restore `output.length = value.length`.

**In-place variant.** If the caller is the sole owner, `mutateLeaves(value, fn)` can recurse
and assign `object[key] = fn(...)` at leaves, returning nothing. It is faster and avoids
allocation, but it aliases and mutates shared subtrees, so make it an explicit, separately
named function rather than a flag on the pure one.

### Implementation

```javascript
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mapLeaves(value, fn, seen = new WeakMap(), path = []) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const output = [];
    seen.set(value, output); // register BEFORE descending (cycles)
    output.length = value.length; // preserve trailing holes up front
    value.forEach((item, index) => {
      output[index] = mapLeaves(item, fn, seen, [...path, index]);
    });
    return output;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return seen.get(value);
    const output = {};
    seen.set(value, output);
    for (const key of Reflect.ownKeys(value)) {
      if (!Object.getOwnPropertyDescriptor(value, key).enumerable) continue;
      Object.defineProperty(output, key, {
        value: mapLeaves(value[key], fn, seen, [...path, key]),
        writable: true, enumerable: true, configurable: true,
      });
    }
    return output;
  }

  // Date, Map, RegExp, functions, primitives: hand the value to the mapper.
  return fn(value, path, path[path.length - 1]);
}

// In-place variant for callers that own the tree outright.
function mutateLeaves(value, fn, seen = new WeakSet(), path = []) {
  if (Array.isArray(value) || isPlainObject(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (!Object.getOwnPropertyDescriptor(value, key).enumerable) continue;
      const child = value[key];
      value[key] = Array.isArray(child) || isPlainObject(child)
        ? mutateLeaves(child, fn, seen, [...path, key])
        : fn(child, [...path, key], key);
    }
    return value;
  }
  return fn(value, path, path[path.length - 1]);
}
```

### Walkthrough

`mapLeaves({ a: 1, b: { c: 2 } }, (n) => n * 10)`:

1. `value` is a plain object. `output = {}`, `seen.set(input, output)`.
2. Key `"a"`: `1` is not a container, so `fn(1, ["a"], "a")` → `10`. Define `output.a = 10`.
3. Key `"b"`: value is a plain object. `output.b = {}`, register `b → output.b`, recurse
   with `path = ["b"]`.
4. Inside `b`, key `"c"`: `2` is a leaf → `fn(2, ["b", "c"], "c")` → `20`. `output.b.c = 20`.
5. Return `{ a: 10, b: { c: 20 } }`. Every container is new; the mapper only saw leaves.

For the cyclic input, `seen.get(cyc)` at the `self` key returns the in-progress `output`, so
`out.self === out` — the transformed graph is cyclic exactly like the source.

### Complexity

Time: `O(n · d)` for `n` nodes and depth `d` due to `[...path, key]` copying (plus the cost
of `fn`); space: `O(n)` for the output graph and `O(d)` recursion plus the path copies.

### Edge Cases

- **Cycles / shared containers** are preserved via the `WeakMap` registered before descent.
- **Sparse arrays**: `forEach` skips holes and `output.length` is set first, so holes and
  trailing length survive; a plain `map` would also skip holes but not restore `length`.
- **`null`** is a leaf (`typeof null === "object"` is guarded by the explicit `null` check),
  so `fn` can map it (e.g. `?? "none"`).
- **`Date`/`Map`/`RegExp`/class instances** are leaves: `fn` decides what to do, instead of
  the traversal destroying them.
- **Functions** are leaves and are passed to `fn`.
- **Symbol keys** are traversed and preserved.
- **Getter properties** are read once and flattened to data properties.
- **`__proto__` keys** are written with `defineProperty`, so they stay data properties.
- **Deep trees** can overflow the stack; the iterative form uses an explicit stack and a
  parent-pointer path.
- **`fn` returning a container** is not re-descended into — the output embeds it verbatim.

### Interview Follow-ups

- **In-place `mutateLeaves`**: shown above — faster, but aliases and mutates; discuss when
  that is acceptable.
- **Leaf predicate as an argument**: `mapLeaves(value, fn, { isLeaf })` so callers can treat
  `Date`s as containers of their own or skip certain keys.
- **Key-aware mapping**: `transformValues(obj, (value, key) => ...)` mirrors
  `Object.fromEntries` but recursive; useful for renaming while transforming.
- **Async mapping**: for async `fn`, walk in two passes (collect leaves, `await` them) or
  return a tree of promises — the traversal itself cannot be trivially async due to cycles.
- **Immutable updates**: combine with `mapLeaves` to implement `setIn`/`updateIn` by
  returning a new value only along the target path.

### Common Mistakes

- Checking only `typeof value === "object"` for containers, so `Date`/`Map`/class instances
  get walked (and often reduced to `{}`).
- Registering in `seen` after descending, causing infinite recursion on `obj.self = obj`.
- Forgetting `null` is `typeof "object"` in JS and accidentally treating it as a container.
- Mutating the input when the function name promises a new structure, or vice versa.
- Copying only `Object.keys`, dropping symbol keys and non-index array data.
- Assuming `fn` runs on every node; by contract it runs only on leaves, so container-level
  decisions need a separate hook.

### Takeaway

`mapLeaves` is a shape-preserving recursive copy where only the leaves are delegated to
`fn`. Classify containers (array or plain object) explicitly, register the output in a
`WeakMap` **before** descending so cycles survive, and preserve keys with
`CreateDataProperty`. Keep the mutating variant a separate, clearly named function.




