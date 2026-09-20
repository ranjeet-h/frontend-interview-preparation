## Fisher–Yates Shuffle (In Place, Unbiased)

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `shuffle(array)` that permutes `array` in place using the Fisher–Yates (Knuth) algorithm. The contract is statistical, not just functional:

- Every one of the `n!` permutations must be equally likely. "Unbiased" *is* the requirement.
- It mutates and returns the **same** array reference, for chaining.
- Each draw must use the shrinking range, not the full length.

The bug to avoid: `for (i = 0; i < n; i++) { j = randInt(n); swap(i, j) }`. That version has `n` choices at each of `n` steps → `n^n` outcomes, and `n^n` is not divisible by `n!`, so some permutations must be more likely than others.

### Examples

```text
const a = [1, 2, 3];
shuffle(a)          // mutates a and returns it; e.g. [2, 3, 1]
a === shuffle(a)    // => true   (same reference)

shuffle([])         // => []
shuffle([1])        // => [1]

// Distribution (300k trials on [1,2,3]): each of the 6 perms ≈ 16.67%
```

### Approach

Fisher–Yates walks **from the end down**, maintaining the invariant that everything after index `i` is already a fixed, uniformly random selection from the whole array:

1. At step `i` (starting at `n - 1`), choose `j` uniformly in `[0, i]` — that is `Math.floor(Math.random() * (i + 1))`.
2. Swap `a[i]` and `a[j]`. Slot `i` is now final; it had `i + 1` equally likely candidates.
3. Decrement `i` and repeat until `i === 0`.

Unbiasedness, precisely: at step `i` there are exactly `i + 1` choices, so the total number of paths is `n · (n-1) · … · 2 · 1 = n!`, and each path yields a distinct permutation. Uniform over `n!` paths means uniform over permutations. The **forward** variant (`j ∈ [i, n-1]`, swapping forward) is equally correct. The wrong one is `j ∈ [0, n-1]` at every step.

Randomness source: `Math.random()` has ~53 bits of entropy — fine for interviews. For anything with stakes, use `crypto.getRandomValues`, and if you reduce it modulo `max` do rejection sampling; naive `% max` has modulo bias.

For a non-mutating variant: `const copy = [...array]; shuffle(copy); return copy;` — but the contract here is in place.

### Implementation

```javascript
function shuffle(array) {
  // Fisher–Yates: walk from the end, swap with a uniform index in [0, i].
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1)); // inclusive [0, i]
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array; // same reference, mutated in place
}

// Unbiased integer in [0, max) via crypto; rejection sampling avoids modulo bias.
function randomIntCrypto(max) {
  const limit = Math.floor(0x100000000 / max) * max; // largest multiple of max
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit); // reject the biased tail
  return value % max;
}

// Non-mutating wrapper.
function shuffled(array) {
  return shuffle([...array]);
}
```

### Walkthrough

`shuffle([A, B, C, D])` — one concrete run:

1. `i = 3`: `j = floor(random * 4)` → say `1`; swap indices 3 and 1 → `[A, D, C, B]`. `B` is final.
2. `i = 2`: `j = floor(random * 3)` → say `0`; swap 2 and 0 → `[C, D, A, B]`. `A` is final.
3. `i = 1`: `j = floor(random * 2)` → say `1`; swap 1 with itself → no change. `D` is final.
4. `i = 0`: `i > 0` is false, so the loop stops; `C` is final by elimination.

Each original element had probability `1/4`, then `1/3`, then `1/2`, then `1` of landing in the remaining slot: `4 · 3 · 2 · 1 = 24 = 4!` equally likely paths, so every permutation has probability `1/24`.

Contrast the biased version on `[A, B, C]`: it has `3^3 = 27` outcomes, and `27` is not divisible by `6`, so uniformity is impossible. Empirically `A` stays first roughly 37% of the time instead of 33%.

### Complexity

Time: `O(n)` — exactly `n - 1` swaps and `n - 1` random draws. Space: `O(1)` extra; the algorithm is in place, so the only storage is the array itself.

### Edge Cases

- Empty array: the loop never runs; returns `[]`.
- Single element: `i` starts at `0`, so the loop never runs; returns the same array.
- Sparse arrays: `a[i]` reads `undefined` and plain assignment creates a real element, so holes become `undefined` — document it.
- Array-like (`arguments`, `NodeList`): the swap logic works structurally, but a read-only `NodeList` should be copied first.
- Frozen array: the swap throws `TypeError` in strict mode; copy instead.
- `Math.random()` is not cryptographically secure — use `crypto` when fairness matters.
- `getRandomValues` reduced with `% max` without rejection introduces modulo bias.

### Interview Follow-ups

- **Shuffle only the first `k`** (partial shuffle): run `i` from `n - 1` down to `n - k`; this is exactly the reservoir trick behind problem 10.
- **Shuffle two arrays in the same order**: shuffle an index array `[0..n-1]`, then map both arrays through it.
- **Weighted shuffle**: give each item the key `-Math.log(U) / weight` (Efraimidis–Spirakis) and sort, or build a prefix-sum table and binary-search a random point.
- **Seedable shuffle**: swap `Math.random` for a seeded PRNG (e.g. mulberry32) so tests are reproducible.
- **Why is `sort(() => Math.random() - 0.5)` wrong?** `sort` assumes a consistent comparator; this one is inconsistent, so engines produce biased, engine-dependent results.

### Common Mistakes

- Drawing `j` from the full range `[0, n - 1]` at every step — biased.
- Re-rolling until `j !== i`: the self-swap is a legitimate outcome and excluding it skews the distribution.
- `sort(() => Math.random() - 0.5)` — the classic; biased and nondeterministic across engines.
- Off-by-one in the multiplier: `Math.random() * i` can never produce `i`, so the last slot can never receive the last element.
- Returning a fresh array when the contract says in place, or mutating when the caller expected a copy.

### Takeaway

Fisher–Yates is unbiased because the `k`-th draw comes from a range of size exactly `k`: `n!` equally likely paths, one per permutation. Any variant that uses the full length at every step is biased, however random it looks.

## Partition an Array by a Predicate

`Difficulty: Easy` `Probability: High`

### Problem

Implement `partition(array, predicate, thisArg)` returning `[matched, unmatched]` — a stable split, like `Array.prototype.filter` run twice but in a single pass.

The predicate signature matches `filter`: `(value, index, array)`, called once per present index, in order. The result is coerced with `Boolean`, so any truthy return counts as "matched." The input is not mutated, and the predicate's relative order is preserved in both output arrays.

### Examples

```text
partition([1, 2, 3, 4], (n) => n % 2 === 0)   // => [[2, 4], [1, 3]]
partition([], () => true)                     // => [[], []]
partition([0, "", "a", null, "b"], Boolean)   // => [["a", "b"], [0, "", null]]
partition([1, 2, 3], () => false)             // => [[], [1, 2, 3]]

const users = [{ active: true, n: "A" }, { active: false, n: "B" }, { active: true, n: "C" }];
partition(users, (u) => u.active).map((g) => g.map((u) => u.n))
// => [["A", "C"], ["B"]]
```

### Approach

One pass, two output arrays, push into `matched` or `unmatched` based on `Boolean(predicate(...))`. The contract points a naive answer misses:

- The predicate result is coerced with `Boolean` — exactly like `filter` — so returning `1`, `"x"`, or an object means "matched."
- Forward all three arguments `(value, index, array)` so the function is a drop-in for `filter`-style callbacks.
- Honour `thisArg` via `predicate.call(thisArg, ...)` for full parity with `filter`.
- Use one loop, not `array.filter(p)` plus `array.filter((x) => !p(x))`: two filters evaluate the predicate twice per element and can disagree if it is impure or expensive.

A `reduce` version reads compactly — `array.reduce(([m, u], v, i) => (predicate(v, i, array) ? (m.push(v), [m, u]) : (u.push(v), [m, u])), [[], []])` — but it allocates a tuple per element, so prefer the loop.

Holes: native `filter` skips them. If you iterate with a plain index loop and read `array[i]`, holes become `undefined` and get partitioned. Add an `in` guard (or use `for...of`, which also yields `undefined` for holes) and state which policy you chose.

### Implementation

```javascript
function partition(array, predicate, thisArg) {
  if (typeof predicate !== "function") {
    throw new TypeError("predicate must be a function");
  }

  const matched = [];
  const unmatched = [];

  for (let i = 0; i < array.length; i += 1) {
    if (!(i in array)) continue; // match filter: skip holes
    const value = array[i];
    // Boolean coercion matches filter: any truthy return counts as matched.
    if (predicate.call(thisArg, value, i, array)) {
      matched.push(value);
    } else {
      unmatched.push(value);
    }
  }

  return [matched, unmatched];
}
```

### Walkthrough

`partition([0, "", "a", null, "b"], Boolean)`:

| `i` | `value` | `Boolean(value)` | `matched` | `unmatched` |
|-----|---------|------------------|-----------|-------------|
| 0 | `0` | `false` | `[]` | `[0]` |
| 1 | `""` | `false` | `[]` | `[0, ""]` |
| 2 | `"a"` | `true` | `["a"]` | `[0, ""]` |
| 3 | `null` | `false` | `["a"]` | `[0, "", null]` |
| 4 | `"b"` | `true` | `["a", "b"]` | `[0, "", null]` |

Result: `[["a", "b"], [0, "", null]]`. `Boolean` is passed as the *predicate* and the `if` re-coerces its already-boolean return — harmless, and the same double truthiness `filter(Boolean)` performs.

Order is stable: `"a"` before `"b"`, and `0` before `""` before `null`.

### Complexity

Time: `O(n)` — one predicate call per present element. Space: `O(n)` for the two outputs; the input is not copied. Two `filter` calls would be `O(2n)` predicate evaluations.

### Edge Cases

- Empty array → `[[], []]`; the loop never runs.
- Predicate always `true` or always `false` → one side is `[]`; never assume both are non-empty.
- Hole in the input → skipped by the `in` guard, matching `filter`.
- Predicate throws → the exception propagates immediately; nothing is returned.
- Predicate mutates `array` → this implementation reads `array.length` live; snapshot `const n = array.length` for `filter`'s snapshot semantics.
- Predicate not a function → `TypeError` before any iteration.
- `thisArg` supplied → forwarded via `.call`; irrelevant for arrow predicates.
- Outputs are dense because they are built with `push`, even if the input was sparse.

### Interview Follow-ups

- **`Object.groupBy` / `Map.groupBy`** (ES2024): bucket by a key function; a partition is `groupBy(arr, (x) => (p(x) ? 1 : 0))`.
- **Three-way partition** (Dutch national flag): split into `< pivot`, `== pivot`, `> pivot` in one pass with `O(1)` extra space — the core of quicksort.
- **Partition into `k` buckets**: generalize the two arrays to an array of arrays indexed by key.
- **Lazy partition** for large or streamed input: yield two iterators/async generators instead of materializing.
- **Why not two `filter` calls?** The predicate runs twice, which is wrong for impure or expensive predicates; `O(2n)` is also wasteful.

### Common Mistakes

- Two `filter` calls, invoking an impure predicate twice.
- Testing `predicate(...) === true` instead of truthiness, which breaks `Boolean`-style and `0`/`1` predicates.
- Losing order, e.g. by using `unshift`.
- Mutating the input while partitioning.
- Returning `undefined` for the empty side instead of `[]`.

### Takeaway

Partition is `filter` and its complement in one pass. Truthiness coercion, full argument forwarding, a stable order, and an explicit hole policy are what make it a reusable primitive rather than a one-off.

## Group Array Items by a Property

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `groupBy(array, keyOrFn)` that buckets items into a dictionary keyed by a property name or a key function. The contract matches `Object.groupBy` (ES2024):

- Returns a **null-prototype** object, so keys like `"__proto__"`, `"constructor"`, and `"toString"` cannot collide with `Object.prototype`.
- Property keys are coerced to strings (symbols stay symbols); a key function's return value is coerced with `ToPropertyKey`.
- Items whose key is `undefined` are grouped under the string `"undefined"`.
- Order inside each bucket follows input order (stable). The input is not mutated.

`Map.groupBy` is the alternative when keys are objects, so identity is preserved and insertion order holds for any key type.

### Examples

```text
groupBy([{ t: "a", v: 1 }, { t: "b", v: 2 }, { t: "a", v: 3 }], "t")
// => { a: [{t:"a",v:1}, {t:"a",v:3}], b: [{t:"b",v:2}] }

groupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? "odd" : "even"))
// => { odd: [1, 3, 5], even: [2, 4] }

groupBy([{ id: 1 }, { id: 2 }], "missing")
// => { undefined: [{id:1}, {id:2}] }

groupBy(["a", "b"], "length") // => { 1: ["a", "b"] }
```

### Approach

Support the two shapes — a string/symbol property name and a key function — then run one loop. The spec details a naive `obj[key] ||= []` misses:

1. **Prototype collisions.** With a normal `{}`, `obj["toString"]` is the inherited function, so a truthiness check thinks the bucket exists and `push` throws; and `obj["__proto__"] = []` sets the prototype instead of adding a key. `Object.create(null)` removes the whole class of bugs, which is why the spec mandates it for `Object.groupBy`.
2. **`ToPropertyKey`.** A key function may return a number; `obj[1]` and `obj["1"]` are the same slot, which is what callers expect (grouping by `length` or `id`). Symbols are preserved.
3. **Incremental build.** `(bucket[key] ??= []).push(item)` is the concise form; on a null-prototype object there are no inherited truthy values to confuse it.

Use `Object.defineProperty` only if you need particular descriptor flags; `??=` is fine here.

### Implementation

```javascript
function groupBy(array, keyOrFn) {
  const toKey = typeof keyOrFn === "function"
    ? (item, i, arr) => keyOrFn(item, i, arr)
    : (item) => item?.[keyOrFn]; // optional chaining: null items yield undefined

  const groups = Object.create(null); // no Object.prototype collisions

  for (let i = 0; i < array.length; i += 1) {
    const key = toKey(array[i], i, array); // ToPropertyKey happens on indexing
    (groups[key] ??= []).push(array[i]);
  }

  return groups;
}

// Map variant: preserves key identity (objects/Symbols) and insertion order.
function groupByMap(array, keyOrFn) {
  const toKey = typeof keyOrFn === "function" ? keyOrFn : (item) => item?.[keyOrFn];
  const groups = new Map();
  for (let i = 0; i < array.length; i += 1) {
    const key = toKey(array[i], i, array);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(array[i]);
  }
  return groups;
}
```

### Walkthrough

`groupBy([{t:"a",v:1}, {t:"b",v:2}, {t:"a",v:3}], "t")`:

1. `keyOrFn` is a string, so `toKey = (item) => item?.["t"]`.
2. `groups = Object.create(null)`.
3. `i = 0`: key `"a"` → `groups.a` is `undefined` → `??=` sets `[]` → push `{t:"a",v:1}`.
4. `i = 1`: key `"b"` → new bucket `[]` → push `{t:"b",v:2}`.
5. `i = 2`: key `"a"` → `groups.a` already exists → push `{t:"a",v:3}`.
6. Result: `{ a: [{t:"a",v:1}, {t:"a",v:3}], b: [{t:"b",v:2}] }`.

Now `groupBy([{ k: "toString" }], "k")`: with `Object.create(null)` the bucket is created normally. With `{}`, `groups["toString"]` is the inherited function, `??=` skips initialization, and `...push` throws `push is not a function` — the bug the null prototype prevents.

### Complexity

Time: `O(n)` — one key computation and one amortized `O(1)` push per item. Space: `O(n)` for the buckets plus `O(k)` keys, where `k` is the number of distinct keys.

### Edge Cases

- `__proto__` / `constructor` / `toString` keys → safe with a null prototype, broken with `{}`.
- `undefined`/`null` item with a string key → optional chaining yields `undefined`, bucketed under `"undefined"`.
- Missing property → same `"undefined"` bucket.
- Numeric keys (`"1"`, `"2"`) → stringified; objects iterate integer-like keys first in ascending order, then the rest in insertion order.
- Symbol keys → preserved in the object (symbols are valid property keys).
- Empty array → an empty null-prototype object.
- Key function throws → the exception propagates.
- **Object keys** → `String(obj)` collapses distinct objects to `"[object Object]"`; use the `Map` variant for identity.

### Interview Follow-ups

- **`Object.groupBy` / `Map.groupBy` (ES2024)**: production code should use these; describe how `Object.groupBy` returns a null-prototype object while `Map.groupBy` keeps any key type and insertion order.
- **Group and aggregate in one pass**: bucket and compute `sum`/`count`/`max` simultaneously instead of materializing arrays.
- **Group by multiple keys**: join with a delimiter that cannot collide, e.g. `[a, b].join("\u0000")`, or nest `Map`s.
- **Ordering**: object keys reorder integer-like strings ascending, so return a `Map` when order must match insertion.
- **Deep grouping**: recursively group along a path such as `["country", "city"]`.

### Common Mistakes

- Using `{}` and hitting `__proto__` or `toString` collisions.
- `groups[key].push(item)` without initializing the bucket → `undefined.push`.
- Assuming key order follows insertion order for numeric string keys.
- Coercing object keys to strings when identity grouping was wanted (use a `Map`).
- Mutating items while grouping.

### Takeaway

`groupBy` is a single pass into a dictionary keyed by `ToPropertyKey`. The null-prototype object and the `??=` bucket initializer are the two details that separate a correct implementation from one that breaks on `"__proto__"` or `"toString"`.

## Convert an Array into an Object Indexed by ID

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `indexById(array, idKey = "id", transform = (item) => item)` returning an object that maps each item's id to the item (or to a transformed projection). This is the normalize/`byId` shape used by Redux and every client-side cache.

- Keys are `String(item[idKey])`; numeric ids become numeric keys.
- **Duplicate ids: last write wins** — state it, because first-wins is equally defensible and the caller must know.
- Items missing the key are skipped. (The alternative is an `"undefined"` bucket, as in `groupBy`.)
- The input array is not mutated and items are shared by reference, not cloned.

It is `Object.fromEntries(array.map((x) => [x.id, x]))` with the duplicate and missing-key policy made explicit.

### Examples

```text
const users = [{ id: 1, name: "Ada" }, { id: 2, name: "Bob" }];
indexById(users) // => { 1: {id:1,name:"Ada"}, 2: {id:2,name:"Bob"} }

indexById([{ id: "a", v: 1 }, { id: "a", v: 2 }])
// => { a: { id: "a", v: 2 } }   (last wins)

indexById([{ id: 1 }, { name: "no id" }]) // => { 1: {id:1} }   (missing id skipped)
indexById([], "id")                       // => {}
indexByIdMap(users)                        // => Map { 1 => {...}, 2 => {...} }
```

### Approach

Start by choosing the container:

- **Object** — right for string/number ids and JSON-friendly state. Build with a loop and `indexed[key] = value`, or `Object.fromEntries` for a one-liner. Use `Object.create(null)` if an id could be `"__proto__"`.
- **`Map`** — right when ids are objects or symbols, or when insertion order matters. It also sidesteps the `"__proto__"` problem and exposes a real `.size`.

Then pin down three semantics:

- **Key coercion.** `object[item.id]` runs `ToPropertyKey`, so `1` and `"1"` collide (usually desirable). A `Map` does not coerce, so `1` and `"1"` stay distinct.
- **Duplicate policy.** `indexed[key] = item` overwrites (last wins); `if (!(key in indexed)) indexed[key] = item` keeps the first. Say which one out loud.
- **Missing/sparse items.** `item[idKey]` on `null`/`undefined` throws, so guard with `item == null` or optional chaining.

Use `id === undefined` for the skip test, **not** `!id`, which would silently drop valid ids of `0` and `""`.

### Implementation

```javascript
function indexById(array, idKey = "id", transform = (item) => item) {
  const indexed = Object.create(null); // safe for "__proto__" ids

  for (let i = 0; i < array.length; i += 1) {
    const item = array[i];
    if (item == null) continue;             // skip null/undefined entries
    const id = item[idKey];
    if (id === undefined) continue;         // no id -> not indexable (0 and "" are kept)
    indexed[id] = transform(item, i, array); // last write wins; ToPropertyKey on assign
  }

  return indexed;
}

// Map variant: preserves key identity (objects/Symbols) and insertion order.
function indexByIdMap(array, idKey = "id") {
  const indexed = new Map();
  for (const item of array) {
    if (item == null || item[idKey] === undefined) continue;
    indexed.set(item[idKey], item);
  }
  return indexed;
}
```

### Walkthrough

`indexById([{ id: "a", v: 1 }, { id: "b" }, { id: "a", v: 2 }])`:

1. `indexed = Object.create(null)`.
2. `i = 0`: `id = "a"` → `indexed["a"] = { id: "a", v: 1 }`.
3. `i = 1`: `id = "b"` → `indexed["b"] = { id: "b" }`.
4. `i = 2`: `id = "a"` already present → overwrite → `indexed["a"] = { id: "a", v: 2 }`.
5. Result: `{ a: { id: "a", v: 2 }, b: { id: "b" } }`. The duplicate resolved last-wins, and the first object is no longer referenced.

For first-wins, change the assignment to `if (!(id in indexed)) indexed[id] = transform(item, i, array);`.

### Complexity

Time: `O(n)` — one lookup and one assignment per item. Space: `O(n)` for the result; items are shared by reference, not cloned.

### Edge Cases

- Duplicate ids → last wins (first wins with the `in` guard); state the policy.
- Missing id → skipped; an alternative is an `"undefined"` bucket.
- `id: 0` or `id: ""` → valid keys; the `=== undefined` test keeps them, `!id` would drop them.
- `null`/`undefined` entries → skipped by the `item == null` guard.
- Non-string ids → coerced by an object; use a `Map` to keep identity.
- `"__proto__"` id → safe with `Object.create(null)`, silently sets the prototype with `{}`.
- Very large arrays → fine at typical scale; a `Map` scales better past ~100k keys.
- Mutating an item after indexing → visible, because the dictionary holds the same reference.

### Interview Follow-ups

- **Index by several keys at once**: build `byId` and `byEmail` in one pass, or return `{ byId, byEmail }`.
- **Normalized state (Redux)**: `{ byId, allIds }`, where `allIds` preserves render order and `byId` is this function.
- **Why `Object.create(null)`?** Assigning `"__proto__"` on `{}` mutates the prototype instead of adding an own key; a null-prototype object makes every string a plain key.
- **`Map` vs object**: `Map` for arbitrary keys, guaranteed insertion order, and `O(1)` `size`; object for JSON serialization and structural sharing.
- **Rebuild vs patch**: for incremental updates, mutate the existing index under a copy-on-write discipline rather than re-indexing the whole array.

### Common Mistakes

- `Object.fromEntries` on non-unique ids without stating the last-wins policy.
- `if (!id) continue` — drops `0` and `""`.
- Using `{}` when an id can be `"__proto__"`, silently setting the prototype.
- Deep-cloning every item (expensive) when references were enough.
- Forgetting the `null` guard and throwing on `item[idKey]`.

### Takeaway

Indexing is a single pass from id to item. The real decisions are the duplicate policy, the key type (object vs `Map`), and the null-prototype guard — not the loop.

## Find the Frequency of All Elements

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `frequency(array)` returning a dictionary that counts how many times each value appears.

- Use `SameValueZero` keying, matching `Map`/`Set`: `NaN` counts as a key (unlike an object key or `indexOf`), and `-0`/`0` are the same key.
- Objects and arrays as elements are keyed by **identity** in a `Map`, not by value.
- Single pass, no mutation of the input.

### Examples

```text
frequency([1, 2, 2, 3, 3, 3]) // => Map { 1 => 1, 2 => 2, 3 => 3 }
frequency(["a", "b", "a"])    // => Map { "a" => 2, "b" => 1 }

const m = frequency([NaN, NaN, 0, -0]);
m.get(NaN) // => 2
m.get(0)   // => 2   (0 and -0 share a key)

frequency([])       // => Map {}
frequencyObject([1, "1"]) // => { 1: 2 }   (object coerces keys; Map keeps them distinct)
```

### Approach

The whole problem is picking the right dictionary and the right key semantics.

- **`Map`** is the correct general answer. It keys by `SameValueZero` (so `NaN` works), preserves insertion order, allows any key type, and has a real `size`. The increment is `map.set(v, (map.get(v) ?? 0) + 1)`.
- **Object** is fine when all values are strings or numbers and you want JSON — but `NaN` becomes the string `"NaN"`, `-0` becomes `"0"`, `1` and `"1"` collide, and every object becomes `"[object Object]"`. Use `Object.create(null)` to avoid prototype collisions.
- **`Object.groupBy(array, (x) => x)` plus `.length`** is the ES2024 functional form, but it builds buckets you immediately discard, so it is two passes of work for one pass of information.

Iterate with `for...of` so strings and other iterables work and holes yield `undefined`; for a bare array-like without an iterator, fall back to an index loop.

If you only need the mode or the top-`k`, keep a running maximum instead of materializing the whole map — that is the next problem.

### Implementation

```javascript
function frequency(array) {
  const counts = new Map(); // SameValueZero keys: NaN works, any type allowed
  for (const value of array) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

// Object-shaped version for string/number keys, JSON-friendly.
function frequencyObject(array) {
  const counts = Object.create(null); // no prototype collisions
  for (const value of array) {
    const key = value; // ToPropertyKey: objects collapse to "[object Object]"
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
```

### Walkthrough

`frequency([1, 2, 2, NaN, NaN, "1"])` (Map version):

1. `value = 1` → `get(1)` is `undefined` → `set(1, 1)`.
2. `value = 2` → `undefined` → `set(2, 1)`.
3. `value = 2` → `1` → `set(2, 2)`.
4. `value = NaN` → `get(NaN)` is `undefined` (no entry yet) → `set(NaN, 1)`.
5. `value = NaN` → `get(NaN)` is `1`, because `NaN` **is** a valid `Map` key → `set(NaN, 2)`.
6. `value = "1"` → distinct from the number `1` in a `Map` → `set("1", 1)`.

Result: `Map { 1 => 1, 2 => 2, NaN => 2, "1" => 1 }`. The object version would merge `1` and `"1"` into `{ "1": 2 }` and key `NaN` under the string `"NaN"`.

### Complexity

Time: `O(n)` — one `get` and one `set` per element. Space: `O(u)` where `u` is the number of distinct values; `u ≤ n`.

### Edge Cases

- `NaN` → a valid key in a `Map`; in an object it becomes `"NaN"`.
- `0` and `-0` → the same key under `SameValueZero` and under string coercion.
- `1` and `"1"` → distinct in a `Map`, merged in an object.
- Objects/arrays as elements → identity keys in a `Map`; every object becomes `"[object Object]"` in an object.
- Holes → `for...of` yields `undefined`, so a hole is counted as one `undefined`.
- Empty array → an empty `Map`/object.
- `null`/`undefined` values → ordinary `Map` keys.
- String input → iterates code points, not the string as one element.

### Interview Follow-ups

- **Mode or top-`k`** without a full map: track a running max for `k = 1`; a heap for larger `k`.
- **`Object.groupBy` one-liner**: `Object.groupBy(arr, (x) => x)`, then read `.length` per bucket.
- **Count by a derived key**: `frequency(array.map((u) => u.role))`.
- **Value-equality for object elements**: canonicalize with `JSON.stringify` (key order matters) or a structural hash, and document the cost and collisions.
- **Memory**: a map of `n` keys is `O(n)`; sort-then-count is `O(n log n)` time but `O(1)` extra space when the input may be mutated.

### Common Mistakes

- Using `{}` with `counts[v]++` → the first occurrence evaluates `undefined + 1` to `NaN`, and `"__proto__"` collides.
- Ignoring `NaN` because `NaN !== NaN`, when `Map` handles it for free.
- Assuming objects are counted by value; a `Map` counts them by identity.
- Merging `1` and `"1"` in an object without realizing it.
- Sort-then-count with a final run left uncounted.

### Takeaway

Counting is one `get`/`set` per element. The interview meat is key semantics: `SameValueZero`, prototype-safe dictionaries, and whether `NaN`, `-0`, and objects behave as the caller expects.

## Find the Most Frequent Element

`Difficulty: Medium` `Probability: High`

### Problem

Implement `mostFrequent(array)` returning the value that occurs most often. The interesting part is the contract around ties and edge cases:

- **Ties**: the first value to reach the maximum count wins (input order), stated explicitly.
- Empty array: return `undefined`.
- `SameValueZero` semantics via `Map`, so `NaN` counts and `-0`/`0` merge.
- One pass; no sorting.

### Examples

```text
mostFrequent([1, 3, 3, 7, 7, 7, 2]) // => 7
mostFrequent(["a", "b", "b", "a"])  // => "a"   (tie: first to reach 2)
mostFrequent([NaN, NaN, 1])         // => NaN
mostFrequent([1, 2, 3])             // => 1     (all tie at 1; first wins)
mostFrequent([])                    // => undefined
```

### Approach

One pass with two pieces of state: a `Map<value, count>` and the current best `(bestValue, bestCount)`. On each element, increment its count and, if it now strictly exceeds `bestCount`, promote it. Strict `>` gives "first to reach the max wins" for free, because a later equal count does not displace the incumbent.

Why this beats sorting: sorting is `O(n log n)` and needs a comparator that puts equal values adjacent; the map is `O(n)` and never reorders. Sorting is only better when extra space must be `O(1)` and mutating the input is allowed.

Why a `Map` and not an object: `NaN` must count, and `1` versus `"1"` should stay distinct unless the caller says otherwise.

The top-`k` generalization uses a bucket sweep (`O(n)` time and space) or a min-heap (`O(n log k)` time, `O(k)` space). This problem is `k = 1`, where the heap degenerates to the single best pair.

### Implementation

```javascript
function mostFrequent(array) {
  const counts = new Map();
  let bestValue;
  let bestCount = 0;

  for (const value of array) {
    const next = (counts.get(value) ?? 0) + 1;
    counts.set(value, next);
    if (next > bestCount) {   // strict `>`: first value to reach the max wins ties
      bestCount = next;
      bestValue = value;
    }
  }

  return bestCount === 0 ? undefined : bestValue;
}

// Top-k via a bucket sweep: O(n) time and space, no heap needed.
function topKFrequent(array, k) {
  const counts = new Map();
  for (const value of array) counts.set(value, (counts.get(value) ?? 0) + 1);

  const buckets = Array.from({ length: array.length + 1 }, () => []);
  for (const [value, count] of counts) buckets[count].push(value);

  const result = [];
  for (let count = buckets.length - 1; count > 0 && result.length < k; count -= 1) {
    for (const value of buckets[count]) {
      result.push(value);
      if (result.length === k) break;
    }
  }
  return result;
}
```

### Walkthrough

`mostFrequent([1, 3, 3, 7, 7, 7, 2])`:

| step | value | count after | `next > bestCount`? | best |
|------|-------|-------------|---------------------|------|
| 1 | `1` | 1 | `1 > 0` yes | `1` / 1 |
| 2 | `3` | 1 | `1 > 1` no | `1` / 1 |
| 3 | `3` | 2 | `2 > 1` yes | `3` / 2 |
| 4 | `7` | 1 | `1 > 2` no | `3` / 2 |
| 5 | `7` | 2 | `2 > 2` no | `3` / 2 |
| 6 | `7` | 3 | `3 > 2` yes | `7` / 3 |
| 7 | `2` | 1 | `1 > 3` no | `7` / 3 |

Result `7`. Step 3 shows `3` displacing `1` on reaching 2; step 5 shows `7` reaching 2 and *not* displacing `3`, because the comparison is strict — that is the tie rule in action.

### Complexity

Time: `O(n)` — one pass with `O(1)` map operations. Space: `O(u)` for the map, where `u` is the number of distinct values (`O(1)` when the domain is small). The bucket top-`k` is `O(n)` time and space.

### Edge Cases

- Empty array → `undefined`, guarded by `bestCount === 0`.
- All distinct → every count is 1, so the first element wins, consistent with the tie rule.
- Ties → first to reach the max wins, deterministically.
- `NaN` → counts correctly (a `Map` key).
- `0` / `-0` → the same key.
- `1` vs `"1"` → distinct in a `Map`.
- Holes → `for...of` yields `undefined`, so holes count as `undefined`.
- Objects/arrays → counted by identity; two structurally equal objects are different keys.
- Large `n` with few distinct values → still `O(n)` time and small space.

### Interview Follow-ups

- **Top-`k` frequent**: bucket sort by count (`O(n)`) or a min-heap (`O(n log k)`); prefer the heap when `k ≪ u` or the input streams.
- **Majority element (`> n/2`)**: Boyer–Moore voting is `O(n)` time and `O(1)` space, but it yields only a candidate, so a second pass must verify the count.
- **Streaming/approximate**: Misra–Gries or a Count-Min sketch when the distinct set does not fit in memory.
- **Stable tie-break by value**: replace on `next > bestCount || (next === bestCount && value < bestValue)`.
- **Why not `reduce`?** You can, but the running-max state reads more clearly as a loop, and a `reduce` with a tuple allocates per step.

### Common Mistakes

- Using `>=`, so the last value to reach the max wins and the documented tie rule is violated.
- Counting with `Object.entries` and sorting by count with an unstable comparator, making ties nondeterministic.
- Missing the empty case and returning `undefined` implicitly from a `reduce` with no initial value.
- Counting objects by structure when the contract is identity.
- Assuming the mode is unique and not documenting the tie-break.

### Takeaway

The mode is a running maximum over a frequency map: one pass, `O(n)`, with strict `>` encoding "first to reach the max wins ties." The usual follow-up is top-`k`, which is the same counting pass plus a heap or bucket sweep.

## Implement Array Pagination

`Difficulty: Medium` `Probability: High`

### Problem

Implement `paginate(array, page, pageSize)` returning the slice for a 1-based page together with the metadata a UI control strip needs:

```javascript
paginate(items, page, pageSize)
// => { data, page, pageSize, totalItems, totalPages,
//      startIndex, endIndex, hasPrev, hasNext }
```

Contract decisions a bare `slice` misses:

- **1-based pages**: page `1` is the first page, so page `0` is invalid.
- `pageSize` must be a positive integer; reject otherwise rather than producing nonsense.
- An out-of-range page returns an **empty `data` array**, never `undefined` or an error.
- `totalPages = Math.ceil(totalItems / pageSize)`, which is `0` for an empty input.
- `startIndex`/`endIndex` follow `slice` semantics: `endIndex` is exclusive and clamped to `totalItems`.

### Examples

```text
const items = ["a", "b", "c", "d", "e", "f", "g"];

paginate(items, 1, 3)
// => { data: ["a","b","c"], page: 1, totalPages: 3, totalItems: 7,
//      startIndex: 0, endIndex: 3, hasPrev: false, hasNext: true }

paginate(items, 3, 3)
// => { data: ["g"], page: 3, hasPrev: true, hasNext: false, startIndex: 6, endIndex: 7 }

paginate(items, 4, 3) // => { data: [], page: 4, hasPrev: true, hasNext: false }
paginate([], 1, 10)   // => { data: [], totalItems: 0, totalPages: 0, hasPrev: false, hasNext: false }
paginate(items, 0, 3) // => RangeError (page must be >= 1)
paginate(items, 1, 0) // => RangeError (pageSize must be >= 1)
```

### Approach

The arithmetic is one line; the contract is the work.

- `startIndex = (page - 1) * pageSize`, `endIndex = startIndex + pageSize`, and `data = array.slice(startIndex, endIndex)`. `slice` already clamps a past-the-end start to `[]` and clamps `end` past `length`, so out-of-range pages fall out naturally.
- **Validate before dividing**: `Number.isInteger(page) && page >= 1`, `Number.isInteger(pageSize) && pageSize >= 1`. Otherwise `0`, `-1`, `2.5`, `NaN`, and `Infinity` silently produce nonsense — notably `pageSize = 0` gives `totalPages = Infinity` and `startIndex = 0` for every page.
- `totalPages = Math.ceil(totalItems / pageSize)`; for `totalItems === 0` that is `Math.ceil(0) = 0`.
- Derive `hasNext` from `page < totalPages`, not from `endIndex < totalItems`. They agree for valid pages, but the page-based form stays correct after clamping and is easier to reason about.
- Report `endIndex` clamped with `Math.min(endIndex, totalItems)` so a UI rendering "6–7 of 7" is accurate.

Convention note: many table components are 0-based while HTTP pagination is 1-based. Pick one, document it, and return `pageIndex = page - 1` if callers need it.

A common extension is **cursor pagination** for infinite scroll — `{ data, nextCursor }` where the cursor is the last id — which trades random access for stability when items are inserted.

### Implementation

```javascript
function paginate(array, page, pageSize) {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError("page must be an integer >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("pageSize must be an integer >= 1");
  }

  const totalItems = array.length;
  const totalPages = Math.ceil(totalItems / pageSize); // 0 when empty
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;             // exclusive, like slice

  return {
    data: array.slice(startIndex, endIndex),          // [] when page is out of range
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex: Math.min(endIndex, totalItems),
    hasPrev: page > 1 && totalPages > 0,
    hasNext: page < totalPages,
  };
}
```

### Walkthrough

`paginate(["a","b","c","d","e","f","g"], 3, 3)`:

1. `page = 3` and `pageSize = 3` pass the guards.
2. `totalItems = 7`; `totalPages = Math.ceil(7 / 3) = 3`.
3. `startIndex = (3 - 1) * 3 = 6`; `endIndex = 9`.
4. `slice(6, 9)` returns `["g"]` — `slice` clamps `9` to the array length.
5. The reported `endIndex` is `Math.min(9, 7) = 7`, so "6–7 of 7" is correct.
6. `hasPrev = 3 > 1 && 3 > 0 = true`; `hasNext = 3 < 3 = false`.

Now `page = 4`: `startIndex = 9`, so `slice(9, 12)` → `[]`; `hasPrev` is still `true` and `hasNext` is `false`. Keeping `hasPrev` true lets the user navigate back; some APIs instead clamp `page` to `totalPages`, which is also defensible if documented.

### Complexity

Time: `O(pageSize)` for the `slice` copy — not `O(n)`; the guards and arithmetic are `O(1)`. Space: `O(pageSize)` for `data`.

### Edge Cases

- Empty array → `data: []`, `totalPages: 0`, both flags `false`.
- `page` beyond the last → empty `data` with `hasPrev: true`; never `undefined`.
- `page = 0`, negative, fractional, `NaN`, `Infinity` → `RangeError`.
- `pageSize = 0` → `RangeError`; otherwise division by zero yields `Infinity` pages.
- `pageSize` larger than the array → a single page containing everything.
- `pageSize` fractional → rejected; `slice` would silently truncate it.
- Sparse array → `slice` preserves holes.
- `array` not an array → `slice` throws; add `Array.isArray` if the contract requires a clearer error.

### Interview Follow-ups

- **Cursor/infinite-scroll pagination**: return `nextCursor = lastItem.id` and fetch "after" it; stable under inserts and `O(1)` per page server-side.
- **Server-side pagination**: the same metadata with `?page=&pageSize=`, plus `totalItems` from a `COUNT(*)`; discuss the cost of counting.
- **Clamping vs empty page**: when a filter shrinks the list so the current page no longer exists, either clamp `page = totalPages` or return empty and let the UI reset — decide explicitly.
- **Windowed page numbers**: build `[1, "…", 4, 5, 6, "…", 20]` for the control strip instead of rendering every button.
- **`slice` vs `splice`**: `slice` copies and leaves the input alone; `splice` mutates. Pagination must never mutate.

### Common Mistakes

- `(page - 1) * pageSize` with a 0-based `page`, which drops the first page.
- Dividing by `pageSize` without rejecting `0` → `totalPages: Infinity`.
- Returning `undefined` for an out-of-range page so `data.map` throws in the UI.
- Reporting `endIndex` as the raw `start + size` (e.g. `9` for a 7-item array) and rendering "7–9 of 7".
- Confusing `slice` (copy) with `splice` (mutate).

### Takeaway

Pagination is `slice((page - 1) * size, page * size)` plus metadata. Correctness lives in validating `page`/`pageSize`, deriving the "next" flag from `totalPages`, and always returning an array — never `undefined` — for an empty page.

## Implement Sliding-Window Chunks

`Difficulty: Medium` `Probability: High`

### Problem

Implement `windowed(array, size, step = 1, { partial = false } = {})` returning overlapping subarrays of length `size`, advancing by `step` each time:

- `size` is the window length; `step` is the stride. Both must be integers `>= 1`.
- `step = size` degenerates to non-overlapping chunks; `step = 1` is the classic sliding window.
- By default only **full** windows are returned; the trailing partial window is dropped. Pass `{ partial: true }` to include the short tail.
- The input is not mutated, and each window is an independent copy.

This is the windowed counterpart to `chunk`: `chunk([1,2,3,4], 2) => [[1,2],[3,4]]`, while `windowed([1,2,3,4], 2, 1) => [[1,2],[2,3],[3,4]]`.

### Examples

```text
windowed([1, 2, 3, 4, 5], 3)    // => [[1,2,3], [2,3,4], [3,4,5]]
windowed([1, 2, 3, 4, 5], 3, 2) // => [[1,2,3], [3,4,5]]
windowed([1, 2, 3, 4, 5], 2, 2) // => [[1,2], [3,4]]        (== chunk)
windowed([1, 2, 3, 4, 5], 10)   // => []                    (size > length)
windowed([], 3)                 // => []
windowed([1, 2], 2, 1)          // => [[1, 2]]

windowed([1, 2, 3, 4], 3, 1, { partial: true })
// => [[1,2,3], [2,3,4], [3,4], [4]]
windowed([1, 2, 3], 0)          // => RangeError
```

### Approach

The loop bound is the entire problem. A window starting at `start` reads up to `start + size - 1`, so it is complete only when `start + size <= array.length`. Iterate `for (let start = 0; start + size <= length; start += step)`.

Three contract points:

1. **Full windows by default.** The bound `start + size <= length` (not `start < length`) drops the short tail, which matches fixed-size consumers that cannot accept a short window. The `partial` branch instead loops while `start < length` and lets `slice(start, start + size)` clamp, producing a short tail.
2. **Validate `size` and `step`.** A zero or negative `size` makes the naive `while (start < length)` form emit infinitely many empty windows, and `step = 0` never advances. Both must be integers `>= 1`. With `step >= 1`, `start` strictly increases, so the loop always terminates.
3. **Copy semantics.** `array.slice(start, start + size)` returns a fresh array, so callers can mutate a window without corrupting the input or its siblings. Never reuse one buffer across iterations.

For very large inputs or streams, the eager array-of-arrays doubles memory. A generator yields one window at a time and composes into a pipeline: `for (const w of windowedGen(arr, 3)) { ... }`.

### Implementation

```javascript
function windowed(array, size, step = 1, { partial = false } = {}) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("size must be an integer >= 1");
  }
  if (!Number.isInteger(step) || step < 1) {
    throw new RangeError("step must be an integer >= 1");
  }

  const result = [];
  const length = array.length;

  if (partial) {
    // Include the trailing short windows: clamp at the end.
    for (let start = 0; start < length; start += step) {
      result.push(array.slice(start, start + size));
    }
    return result;
  }

  // Full windows only: the last start that still fits a whole window.
  for (let start = 0; start + size <= length; start += step) {
    result.push(array.slice(start, start + size)); // fresh copy, never shared
  }
  return result;
}

// Lazy variant: O(size) memory per window, ideal for large/streamed input.
function* windowedGen(array, size, step = 1) {
  for (let start = 0; start + size <= array.length; start += step) {
    yield array.slice(start, start + size);
  }
}
```

### Walkthrough

`windowed([1, 2, 3, 4, 5], 3, 2)`:

1. Guards pass (`size = 3`, `step = 2`).
2. `start = 0`: `0 + 3 <= 5` yes → push `slice(0, 3)` = `[1, 2, 3]`; `start` becomes `2`.
3. `start = 2`: `2 + 3 <= 5` yes → push `slice(2, 5)` = `[3, 4, 5]`; `start` becomes `4`.
4. `start = 4`: `4 + 3 = 7 <= 5` no → stop.
5. Result: `[[1,2,3], [3,4,5]]`. The windows overlap at `3`, and the partial window at `start = 4` is dropped.

With `{ partial: true }`, `start = 4 < 5` so `slice(4, 7)` = `[5]` is appended, giving `[[1,2,3], [3,4,5], [5]]`. Those windows have lengths 3 and 1, so a consumer must handle variable lengths.

Contrast `windowed([1,2,3,4,5], 2, 2)` → `[[1,2],[3,4]]`; `5` is dropped because only full windows count.

### Complexity

Time: `O((n / step) · size)` copying — `O(n · size)` worst case when `step = 1`, `O(n)` when `step = size`. Space: `O((n / step) · size)` for the output; the generator version is `O(size)` per window.

### Edge Cases

- `size > length` → `[]` (full) or one short window (`partial`).
- `size === length` → exactly one window.
- `step === size` → non-overlapping chunks.
- `step > size` → gaps: `windowed([1,2,3,4,5,6], 2, 3) => [[1,2], [4,5]]`.
- `step >= 1` guarantees termination; `step = 0` or `size = 0` throws before the loop.
- Empty array → `[]` regardless of options.
- Sparse array → `slice` preserves holes inside each window.
- Mutating a returned window cannot affect the input or a sibling, thanks to `slice`.

### Interview Follow-ups

- **Moving average / rolling sum**: maintain a running sum (add the incoming element, drop the outgoing one) for `O(n)` overall instead of `O(n · size)`.
- **Sliding-window maximum**: a monotonic deque gives `O(n)` — the canonical hard version of this problem.
- **Variable-size window** (two pointers): expand `right` and shrink `left` to find the longest/shortest window satisfying a predicate; the basis of "longest substring without repeats."
- **Streaming**: an async generator that yields a window every `size` bytes and flushes a partial tail at the end.
- **Why full windows by default?** Fixed-size consumers (batching, model input) cannot handle a short tail; `partial` breaks the "every window is `size` long" invariant.

### Common Mistakes

- Looping `start < array.length` with `slice` and no `partial` flag, silently emitting short trailing windows while claiming fixed size.
- Reusing a single window array (`result.push(window)` after mutating `window`), so every entry aliases the last.
- Allowing `step = 0`, which never advances and loops forever.
- Forgetting the `start + size <= length` bound and reading `undefined` past the end.
- Mutating the input with `splice` instead of copying with `slice`.

### Takeaway

A sliding window is `slice(start, start + size)` with `start` stepping by `step` while `start + size <= length`. The two things to say out loud are the full-window convention and that each window is an independent copy — plus validating `size`/`step` so the loop cannot run forever.

## Remove Falsy Values Without `filter(Boolean)`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `compact(array)` returning a new array with all falsy values removed, **without** using `.filter(Boolean)` or any `filter` that hides the truthiness test.

The falsy set is exactly eight values: `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, and `NaN`. The result is a new array, order-preserving, and the input is not mutated. "Falsy" is not "empty": `[]`, `{}`, `"0"`, and `" "` are all truthy and must be kept.

### Examples

```text
compact([0, 1, false, 2, "", 3, null, undefined, NaN]) // => [1, 2, 3]
compact(["a", "", "b"])   // => ["a", "b"]
compact([[], {}, " ", "0"]) // => [[], {}, " ", "0"]   (all truthy)
compact([false])          // => []
compact([])               // => []
compact([0n, 1n])         // => [1n]   (0n is falsy)
compact([1, , 3])         // => [1, 3] (holes skipped; for...of yields undefined)
```

### Approach

The interviewer is checking two things: that you can enumerate the falsy set precisely, and that you can express the filter without leaning on `Boolean` as a crutch.

- **`if (value)`** *is* the truthiness test — exactly what `filter(Boolean)` does under the hood (`ToBoolean`). Writing it explicitly is the point of the exercise.
- **`value != null`** removes only `null`/`undefined`. That is a *different* requirement ("remove nullish") which keeps `0`, `""`, `false`, and `NaN`.
- **`value === false || value === 0 || ...`** is an exhaustive allowlist, but it is brittle and misses `-0`, `0n`, and `NaN` unless you special-case them.
- **`!!value`** is the canonical double-negation form; **`filter((x) => x)`** is the minimal, honest predicate.

Iterate with `for...of` and `push`. Do not build a string or reach for `reduce` on a simple filter — clarity wins. Keep "remove nullish" as a separate function rather than a mode flag, because the semantics genuinely differ.

### Implementation

```javascript
function compact(array) {
  const result = [];
  for (const value of array) {
    if (value) result.push(value); // truthiness === ToBoolean; removes all 8 falsy values
  }
  return result;
}

// Explicit named predicate; identical semantics.
function isTruthy(value) {
  return !!value; // double negation is the canonical truthiness coercion
}

function compactWith(array, keep = isTruthy) {
  const result = [];
  for (const value of array) {
    if (keep(value)) result.push(value);
  }
  return result;
}

// "Remove nullish only" is a DIFFERENT function; do not conflate the two.
function compactNullish(array) {
  return array.filter((value) => value != null); // keeps 0, "", false, NaN
}
```

### Walkthrough

`compact([0, 1, false, 2, "", 3, null, undefined, NaN])`:

| `value` | `if (value)` | `result` |
|---------|--------------|----------|
| `0` | falsy | `[]` |
| `1` | truthy | `[1]` |
| `false` | falsy | `[1]` |
| `2` | truthy | `[1, 2]` |
| `""` | falsy | `[1, 2]` |
| `3` | truthy | `[1, 2, 3]` |
| `null` | falsy | `[1, 2, 3]` |
| `undefined` | falsy | `[1, 2, 3]` |
| `NaN` | falsy | `[1, 2, 3]` |

Result `[1, 2, 3]`. `NaN` is removed by the very same truthiness test that removes `null` — no `Number.isNaN` check is needed, which is the elegance of the truthiness formulation.

For `[0n, 1n]`: `Boolean(0n)` is `false` and `Boolean(1n)` is `true`, so the result is `[1n]`; a hand-written `value === 0` check would have missed the bigint.

### Complexity

Time: `O(n)` — one truthiness test and one push per element. Space: `O(n)` for the result in the worst case (everything truthy); the input is not copied wholesale.

### Edge Cases

- All eight falsy values: `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, `NaN`.
- `[]` and `{}` are **truthy** — a classic interview trap; keep them.
- `"0"` and `" "` are truthy strings; keep them.
- `0n` (BigInt zero) is falsy; a hand-rolled `=== 0` check misses it.
- Holes → `for...of` yields `undefined` (falsy), so holes are removed; `filter` skips holes, but the result is dense either way, so the observable output matches.
- `document.all` → the only "falsy object": `Boolean(document.all)` is `false` while `typeof document.all === "undefined"`. `if (value)` handles it; a `value === undefined` check would not.
- Input is a string/`Set` → `for...of` handles iterables; a bare array-like without `Symbol.iterator` throws.
- `null`/`undefined` input itself → `for...of` throws; guard if the contract allows it.

### Interview Follow-ups

- **`filter(Boolean)` vs `filter((x) => x)`**: identical; the arrow form does not depend on a global that can be shadowed and makes the coercion obvious.
- **Remove only nullish** (`value != null`): keeps `0`, `""`, `false`, `NaN`; explain how it differs from falsy.
- **Remove `NaN` only**: `Number.isNaN(value)` — note it does not coerce strings, unlike the global `isNaN`.
- **No-`filter` functional form**: `array.flatMap((x) => (x ? [x] : []))` uses only `flatMap`.
- **In-place variant**: compact with a write pointer and truncate `array.length`, avoiding the allocation entirely.

### Common Mistakes

- Believing `[]` and `{}` are falsy — only the eight values above are falsy.
- Writing `value !== null && value !== undefined` and calling it "remove falsy," which keeps `0` and `""`.
- Checking `value === 0` to catch zero but missing `-0`, `0n`, and `NaN`.
- Using `array.filter(Boolean)` when the task explicitly forbids it.
- Mutating the input while compacting.

### Takeaway

There are exactly eight falsy values, and `if (value)`/`!!value` implements `ToBoolean` precisely. "Remove falsy" and "remove nullish" are different operations; saying which one the caller wants is the actual answer, and `document.all` is the trivia that proves you understand the coercion.

## Randomly Select `N` Unique Elements

`Difficulty: Medium` `Probability: High`

### Problem

Implement `sample(array, n)` returning `n` distinct elements chosen uniformly at random. "Uniform" means every subset of size `n` is equally likely, so each element has probability `n / length` of inclusion.

- `n <= array.length`; reject `n > length` (and negative/fractional `n`).
- Result order is random, not required to match input order.
- `n = 0` → `[]`; `n = array.length` → a uniformly random permutation of the whole array.
- The input is not mutated.

The naive `shuffle(array).slice(0, n)` is correct and `O(length)`. The partial Fisher–Yates is better when `n ≪ length`: `O(n)` time, touching only the slots it needs.

### Examples

```text
sample([1, 2, 3, 4, 5], 2)  // => e.g. [4, 1]   (2 distinct elements)
sample([1, 2, 3], 0)        // => []
sample([1, 2, 3], 3)        // => e.g. [2, 3, 1] (a full permutation)
sample([1, 2, 3], 5)        // => RangeError (n exceeds length)
sample([], 0)               // => []
sample([1, 2], -1)          // => RangeError
```

### Approach

This is a partial Fisher–Yates: run the shuffle loop for only the first `n` positions,
then take those positions. After `i` iterations, `copy[0..i]` holds a uniform random
`i`-subset in random order, so stopping early is exactly correct — no need to shuffle
the tail you will discard. Validate `n` up front (`0 <= n <= length`, integer), copy the
input so the caller's array is untouched, and use `crypto.getRandomValues()` instead of
`Math.random()` when the stakes need it.

The tempting wrong answers: picking random indices with replacement (duplicates), or
`sort(() => Math.random() - 0.5).slice(0, n)` (the biased shuffle from the previous
page, inherited wholesale).

### Implementation

```javascript
function sample(array, n) {
  if (!Array.isArray(array)) throw new TypeError("sample expects an array");
  if (!Number.isInteger(n) || n < 0 || n > array.length) {
    throw new RangeError("n must be an integer between 0 and the array length");
  }

  const copy = [...array];
  // Partial Fisher–Yates: after iteration i, copy[0..i] is a uniform random subset.
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
```

### Walkthrough

For `sample([10, 20, 30, 40], 2)`:

1. `copy = [10, 20, 30, 40]`. `i = 0`: pick `j` uniformly in `0..3`, say `2` → swap →
   `[30, 20, 10, 40]`. Position 0 is now a uniform pick from all four.
2. `i = 1`: pick `j` uniformly in `1..3`, say `3` → swap → `[30, 40, 10, 20]`.
   Position 1 is a uniform pick from the remaining three.
3. Stop (`i = n`) and return `copy.slice(0, 2)` → `[30, 40]`. The tail is never touched.

### Complexity

Time: `O(n)` — exactly `n` iterations with `O(1)` work each, regardless of array size.
Space: `O(n)` for the copy (the input is never mutated).

### Edge Cases

- `n = 0` returns `[]`; `n = length` returns a full uniform permutation.
- `n` negative, non-integer, or larger than length throws `RangeError`.
- The input array is never mutated; repeated calls are independent.
- Sparse arrays: the spread densifies holes into `undefined`, which can then be sampled —
  state this if hole preservation matters.
- `Math.random()` is fine for tests and UI; use `crypto.getRandomValues()` for anything
  adversarial.

### Interview Follow-ups

- **Sample from a stream (reservoir sampling):** keep `n` items; the `i`th arrival
  replaces a random slot with probability `n/i`.
- **Weighted sampling:** map weights to a prefix-sum array and binary-search a random
  threshold — `O(log n)` per pick after `O(n)` setup.
- **Shuffle vs sample:** sampling is the prefix of a shuffle; if you need the whole
  permutation, run the loop to the end.

### Common Mistakes

- Sampling *with* replacement (random index per pick) and returning duplicates.
- `sort(() => Math.random() - 0.5).slice(0, n)` — biased, and `O(n log n)` for an
  `O(n)` job.
- Mutating the caller's array with an in-place shuffle.
- Looping "pick until you have `n` unique" — correct but unbounded time when `n` is
  close to the array length (coupon-collector slowdown).

### Takeaway

Random sampling is a partial Fisher–Yates: shuffle only the first `n` positions and slice.
Uniform, `O(n)`, no duplicates, input untouched.
