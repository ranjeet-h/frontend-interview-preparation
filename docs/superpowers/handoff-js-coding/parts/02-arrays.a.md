## Remove Duplicates From an Array

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `unique(array)` returning a **new** array with duplicate values removed, keeping the
**first occurrence** of each value. The contract is what matters: membership uses **SameValueZero**
(`NaN` equals `NaN`; `+0` and `-0` collapse), objects and arrays compare **by reference** (two
`{ id: 1 }` literals are distinct), the input is not mutated, and output order is first-seen order.

### Examples

```text
unique([1, 2, 2, 3, 1])        // => [1, 2, 3]
unique(["a", "b", "a"])        // => ["a", "b"]
unique([NaN, NaN, 1])          // => [NaN, 1]        (SameValueZero)
unique([0, -0, +0])            // => [0]             (+0/-0 collapse)
unique([{}, {}, 1])            // => [{}, {}, 1]     (distinct references)
unique([])                     // => []
```

### Approach

The whole answer is `[...new Set(array)]`. The interview is about *why* that is correct and what the
alternatives get wrong.

`Set` uses **SameValueZero**: `new Set([NaN]).has(NaN)` is `true`, and `-0` is canonicalised to `+0`
on insertion. The classic `filter((x, i) => arr.indexOf(x) === i)` is wrong twice: it is `O(n²)`,
and `indexOf` uses strict equality, so every `NaN` fails to match itself and **all** `NaN`s survive.

Objects are the honest limit: a `Set` cannot dedupe `{ id: 1 }` against a second `{ id: 1 }`. That is
structural equality and the next question (dedupe by key) is the usual escalation. Serialising with
`JSON.stringify` is order-sensitive and drops functions, `undefined`, and cyclic references.

Shape caveat: spreading a **sparse** array runs its iterator, reading holes as `undefined`, so
`[1, , 2]` becomes dense `[1, undefined, 2]`. Say so if hole preservation matters.

### Implementation

```javascript
function unique(array) {
  if (!Array.isArray(array)) throw new TypeError("unique expects an array");
  return [...new Set(array)]; // SameValueZero membership + first-insertion order
}

// Manual version, same contract, if a Set is disallowed.
function uniqueManual(array) {
  const seen = new Set();
  const result = [];
  for (const value of array) {
    if (!seen.has(value)) {   // `has` is SameValueZero, so NaN is handled
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}
```

### Walkthrough

`unique([1, 2, 2, 3, 1])`: the `Set` is built by inserting `1`, `2`, `2` (already present, no
growth), `3`, `1` (present). Set iteration is insertion-ordered, so the spread yields `[1, 2, 3]`.

For `[NaN, NaN, 1]`: the first `NaN` is added; `new Set([NaN]).has(NaN)` is `true`, so the second is
dropped → `[NaN, 1]`. A nested loop using `===` keeps both, the classic tell that a candidate has
not thought about `SameValueZero`.


### Complexity

Time: `O(n)` — one insertion and one lookup per element. Space: `O(n)` for the `Set` plus `O(n)`
for the result array.

### Edge Cases

- `NaN` → deduped via SameValueZero; `indexOf`/`===`-based solutions keep every `NaN`.
- `+0` and `-0` → one value; the first inserted (`+0` after canonicalisation) is kept.
- Objects and arrays → compared by reference; equal-looking literals are both kept.
- Sparse arrays → `[...set]` renders holes as `undefined`; `filter` would preserve the hole shape.
- Non-array input → throws rather than silently coercing; relax to any iterable if preferred.
- Very large input → one `Set` allocation; never reach for the `O(n²)` `indexOf` scan.

### Interview Follow-ups

- **Dedupe by a key** (next problem): `uniqueBy(rows, "id")` — a property name or key function.
- **Structural object dedupe:** canonicalise each object (sorted keys) and hash the string; note the
  key-order, floating-point, and cycle limits.
- **Keep the last occurrence** instead of the first: build a `Map` from key to element, then take
  `map.values()`.
- **Dedupe nested arrays** (`[[1, 2], [1, 2]]`): a trie or a stable serialisation, not
  `JSON.stringify`.


### Common Mistakes

- `array.filter((x, i) => array.indexOf(x) === i)` — `O(n²)` and it fails to dedupe `NaN`.
- Assuming `new Set(...)` compares objects structurally; it compares references.
- Believing the `Set` is sorted. It is insertion-ordered; sorting is a separate step.
- Mutating the input "in place" when the caller expected a copy.

### Takeaway

"Duplicate" means SameValueZero, and `Set` implements exactly that: `O(n)`, `NaN`-safe, and
first-occurrence ordered. Structural object equality is a different question with a different answer.

## Remove Duplicates From an Array of Objects by a Property

`Difficulty: Medium` `Probability: High`

### Problem

Implement `uniqueBy(array, keyOrFn)` returning a **new** array with at most one element per distinct
key. `keyOrFn` is either a property name or a function `(item) => key`; the **first** occurrence of
each key is kept. Keys are compared with **SameValueZero** (via `Set`/`Map`), so `NaN` keys dedupe
and `-0`/`0` collapse. The input array and its elements are not mutated.

### Examples

```text
const rows = [
  { id: 1, tag: "a" },
  { id: 1, tag: "b" },
  { id: 2, tag: "c" },
];

uniqueBy(rows, "id")                        // => [{ id: 1, tag: "a" }, { id: 2, tag: "c" }]
uniqueBy(rows, (r) => r.tag)                // => all three rows (tags are distinct)
uniqueBy([{ id: NaN }, { id: NaN }], "id")  // => [{ id: NaN }]   (SameValueZero)
uniqueBy([{ id: 1 }, { id: 1 }], "missing") // => [{ id: 1 }]     (both keys are undefined)
uniqueBy([], "id")                          // => []
```


### Approach

One pass with a `Set` of keys. Normalise `keyOrFn`: a string becomes `(item) => item?.[key]`. Check
`seen.has(key)` *before* pushing, which preserves the first occurrence. For last-occurrence
semantics, use a `Map` from key to element and take `values()`: re-setting a key overwrites the value
but keeps its original insertion position.

Do **not** key on `JSON.stringify(item)`. Key order is not canonical, so `{a:1,b:2}` and `{b:2,a:1}`
produce different keys; functions, `undefined`, and cyclic references are mishandled too. If
structural dedupe is genuinely required, canonicalise explicitly (sort keys, break cycles) and
document the limits rather than pretending JSON handles it.

A key function that returns objects dedupes by **reference**, exactly like problem 1. And
`Object.groupBy`/`Map.groupBy` group rather than dedupe — you could group and pick the first, but a
`Set` is clearer and cheaper.

### Implementation

```javascript
function uniqueBy(array, keyOrFn) {
  if (!Array.isArray(array)) throw new TypeError("uniqueBy expects an array");

  const keyFn = typeof keyOrFn === "function"
    ? keyOrFn
    : (item) => item?.[keyOrFn]; // property shorthand; `?.` tolerates null items

  const seen = new Set();
  const result = [];
  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {  // SameValueZero: NaN keys and -0/0 collapse correctly
      seen.add(key);
      result.push(item);
    }
  }
  return result; // references to the originals, not clones
}

// Last-occurrence semantics: Map.set overwrites the value, not the position.
function uniqueByLast(array, keyOrFn) {
  const keyFn = typeof keyOrFn === "function" ? keyOrFn : (item) => item?.[keyOrFn];
  const byKey = new Map();
  for (const item of array) byKey.set(keyFn(item), item);
  return [...byKey.values()];
}
```


### Walkthrough

`uniqueBy(rows, "id")` above: `keyFn` is `(r) => r.id`. Row 1 key `1` is unseen → push. Row 2 key `1`
is seen → skip. Row 3 key `2` is unseen → push. The result is row 1 and row 3: the first object with
`id: 1`, and the object with `id: 2`.

For `uniqueBy([{ id: 1 }, { id: 1 }], "missing")`, both keys evaluate to `undefined`, so the second
object is skipped even though it is a different reference. The key, not the object, defines identity.

### Complexity

Time: `O(n)` key extractions and hash lookups, plus the cost of `keyFn` itself. Space: `O(n)` for the
key set and the result; the kept elements are shared by reference, not copied.

### Edge Cases

- Missing/nullish property → all such items share the key `undefined` and collapse to one.
- `null`/`undefined` items → the `?.` shorthand survives; a strict key function may throw.
- Object-valued keys → reference identity only, never structural equality.
- `NaN` keys → deduped by SameValueZero.
- `1` and `"1"` keys → distinct, because a `Set` does not coerce.
- Stability → first occurrence wins; use the `Map` variant for last.
- Kept elements are not cloned, so mutating one later mutates the input too.

### Interview Follow-ups

- **Keep the last occurrence** and explain the Map "overwrite value, keep position" trick.
- **Composite key:** pack fields with a separator (`[a, b].join("\u0000")`) or nest `Map`s; note
  separator-collision risk.
- **Dedupe a stream larger than memory:** sort-based or probabilistic (a Bloom filter); exact linear
  dedupe fundamentally needs `O(distinct)` memory.
- **Case-insensitive keys:** normalise inside `keyFn` (`(s) => s.toLowerCase()`), not after hashing.

### Common Mistakes

- Using `JSON.stringify(item)` as the key — order-dependent and fragile.
- Comparing keys with `===` instead of a `Set`, losing `NaN` handling.
- Forgetting to normalise a string key into a function.
- Assuming two `{ id: 1 }` literals are "the same object."
- Cloning elements under the belief that dedupe requires it.

### Takeaway

Dedupe by key, not by serialisation: normalise how you extract the key, hash keys with a `Set`, and
keep the first occurrence. The key you choose *is* the definition of identity.

## Find Duplicate Values

`Difficulty: Easy` `Probability: High`

### Problem

Implement `findDuplicates(array)` returning the values that occur **more than once**, each reported
**once**, in the order their duplication is detected (the order of each value's second occurrence).
Use SameValueZero so `NaN` and `-0`/`0` behave sensibly. Do not mutate the input.

### Examples

```text
findDuplicates([1, 2, 3, 1, 2, 1])   // => [1, 2]
findDuplicates(["a", "b", "a"])      // => ["a"]
findDuplicates([1, 1, 1])            // => [1]
findDuplicates([1, 2, 3])            // => []
findDuplicates([NaN, NaN])           // => [NaN]
findDuplicates([0, -0])              // => [0]        (SameValueZero; -0 canonicalised)
```

### Approach

Two sets. `seen` records first sightings; `duplicates` records values already known to repeat. For
each element, if it is in `seen`, add it to `duplicates`; otherwise add it to `seen`. The second set
is what keeps the output distinct — without it, `[1, 1, 1]` yields `[1, 1, 1]`.

If counts are wanted, use a single `Map` from value to count (or to a list of indices). The two-set
solution is the minimum work for the stated contract.

Avoid `array.filter((x, i) => array.indexOf(x) !== i)`: it is `O(n²)`, returns every repeated
*occurrence* rather than each duplicated value once, and `indexOf` misses `NaN`. The
`indexOf(x) !== lastIndexOf(x)` idiom has the same three problems.


### Implementation

```javascript
function findDuplicates(array) {
  if (!Array.isArray(array)) throw new TypeError("findDuplicates expects an array");

  const seen = new Set();       // first occurrence of every value
  const duplicates = new Set(); // values seen at least twice, reported once
  for (const value of array) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates]; // insertion order = order of each value's second sighting
}

// Counts, for the follow-up that asks for them.
function countOccurrences(array) {
  const counts = new Map();
  for (const value of array) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
```

### Walkthrough

`findDuplicates([1, 2, 3, 1, 2, 1])`: `1` unseen → `seen = {1}`. `2` unseen → `seen = {1, 2}`. `3`
unseen → `seen = {1, 2, 3}`. `1` seen → `duplicates = {1}`. `2` seen → `duplicates = {1, 2}`. `1`
seen again → `duplicates` already holds `1`, so nothing changes. The result is `[1, 2]`, ordered by
second sighting, not by value.

### Complexity

Time: `O(n)` — one `has` plus one `add` per element. Space: `O(n)` worst case for `seen`, plus the
output set of at most `O(distinct)` values.


### Edge Cases

- Each duplicated value is reported exactly once.
- `NaN` works because of SameValueZero; `indexOf`-based answers miss it.
- `0` and `-0` are equal, and the value stored is the canonical `+0`.
- Sparse arrays → iteration reads holes as `undefined`, so two holes register as a duplicate
  `undefined`; `forEach` skips holes and would not.
- Objects/arrays → duplicated only if the **same reference** appears twice.
- Ordering is by second occurrence — not sorted, and not first-occurrence order.

### Interview Follow-ups

- **Values with counts:** `Map`, then filter entries with `count > 1`.
- **First duplicate only:** return as soon as `seen.has(value)` is true (early exit).
- **All repeated occurrences** (not distinct values): push the element whenever `seen.has(value)`,
  and drop the `duplicates` set.
- **Sorted input, `O(1)` extra space:** compare adjacent elements and skip runs of equal values.
- **Indexes of duplicates:** `Map` from value to an array of indices.

### Common Mistakes

- Omitting the `duplicates` set, so `[1, 1, 1]` reports `1` three times.
- `filter` + `indexOf` returning occurrences rather than distinct duplicated values.
- `indexOf(x) !== lastIndexOf(x)` — `O(n²)` and blind to `NaN`.
- Comparing with `===` in a manual loop and silently dropping `NaN`.

### Takeaway

Keep two sets: one for "have I seen this," one for "have I already reported it." That second set is
the whole difference between listing occurrences and listing distinct duplicates.

## Find the Intersection of Two Arrays

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `intersection(a, b)` returning the values present in **both** arrays, each once, ordered by
their first occurrence in `a`. Membership uses SameValueZero, so `NaN` matches. Neither input is
mutated. The member set is symmetric (`intersection(a, b)` and `intersection(b, a)` agree), but the
**order** is not: it follows the first argument.

### Examples

```text
intersection([1, 2, 2, 3], [2, 3, 4])   // => [2, 3]
intersection([1, 2], [3, 4])            // => []
intersection([], [1])                   // => []
intersection([1, 1], [1])               // => [1]
intersection([NaN], [NaN])              // => [NaN]
intersection([1, "1"], [1])             // => [1]     (no coercion)
```

### Approach

Build a `Set` from one array for `O(1)` membership, then iterate the other. Which one do you iterate?
Iterate the array whose **order you want to preserve** (`a`) and build the lookup from the other
(`b`). Use a second `Set` for the result so duplicates in `a` contribute once.

`Set.has` is SameValueZero, so `NaN` matches. `Array.prototype.includes` is also SameValueZero (it
fixes `NaN`), but it is `O(m)` per lookup, so `a.filter((x) => b.includes(x))` degrades to `O(n·m)`.
`indexOf` is worse still: `O(m)` **and** strict equality, so `NaN` never matches.

If duplicates in `a` should each appear in the output, drop the result `Set` and push directly — but
state that contract explicitly, because it changes the answer.


### Implementation

```javascript
function intersection(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError("intersection expects two arrays");
  }

  const lookup = new Set(b);   // O(m) build, SameValueZero membership
  const result = new Set();    // dedupes output while preserving `a` order
  for (const value of a) {
    if (lookup.has(value)) result.add(value);
  }
  return [...result];
}

// N-ary: values present in every array. Build each set once.
function intersectionAll(...arrays) {
  if (arrays.length === 0) return [];
  const sets = arrays.map((arr) => new Set(arr));
  return [...sets[0]].filter((value) => sets.every((set) => set.has(value)));
}
```

### Walkthrough

`intersection([1, 2, 2, 3], [2, 3, 4])`: `lookup = {2, 3, 4}`. Read `1` → not present. Read `2` →
present, add to `result` (`{2}`). Read `2` again → already in `result`. Read `3` → add (`{2, 3}`).
Result `[2, 3]`, in `a`'s order.

### Complexity

Time: `O(n + m)` — one pass to build the lookup, one to scan `a`. Space: `O(n + m)` for the sets and
result. The naive `a.filter((x) => b.includes(x))` is `O(n·m)` and duplicates its output.


### Edge Cases

- Either array empty → `[]` (the lookup or the scan is empty).
- `NaN` matches via `Set` and via `includes`, but not via `indexOf`.
- Duplicates in `a` contribute a single result because of the result `Set`.
- Order follows `a`; swapping arguments yields the same members in a different order.
- Objects/arrays match by reference only.
- Sparse arrays → iteration yields `undefined` for holes, so a hole can "match" an explicit
  `undefined` in the other array.
- `1` vs `"1"` → distinct; there is no coercion anywhere in this solution.
- Memory: build the lookup from the **smaller** array when order is not tied to it.

### Interview Follow-ups

- **N arrays:** reduce pairwise, or build count/lookup sets once and keep values present in every set.
- **Sorted arrays, two pointers:** `O(n + m)` time, `O(1)` extra space excluding the output.
- **Multiset intersection:** keep `min(countA, countB)` copies of each value using two count maps.
- **ES2025 `Set` methods:** `new Set(a).intersection(new Set(b))` exists (`union`, `difference`,
  `symmetricDifference`, `isSubsetOf` too); the operands must be real `Set`s — check support.

### Common Mistakes

- `a.filter((x) => b.includes(x))` — `O(n·m)` and duplicate output.
- Using `indexOf`, so `NaN` never matches.
- Forgetting to dedupe the result.
- Mutating `a` or `b`.
- Assuming the result is sorted — it follows the first argument's order.

### Takeaway

Turn one side into a `Set` for membership, iterate the other for order, and use a result `Set` so
duplicates cannot leak. `O(n + m)` is the target; a per-element `includes`/`indexOf` is the trap.

## Find the Union of Two Arrays

`Difficulty: Easy` `Probability: High`

### Problem

Implement `union(a, b)` returning all unique values from both arrays, in first-occurrence order: every
element of `a` (deduped), then values that appear only in `b`, in `b`'s order. Membership uses
SameValueZero; the inputs are not mutated.

### Examples

```text
union([1, 2, 3], [3, 4, 5])   // => [1, 2, 3, 4, 5]
union([1, 1], [1, 2])         // => [1, 2]
union([], [1, 2])             // => [1, 2]
union([1, 2], [])             // => [1, 2]
union([NaN], [NaN, 1])        // => [NaN, 1]
union([1, "1"], [])           // => [1, "1"]   (no coercion)
```

### Approach

Union is dedupe over concatenation. `[...new Set([...a, ...b])]` is correct, but it materialises the
concatenated array first. Seeding a `Set` with `a` and then `add`-ing each element of `b` avoids that
intermediate allocation and makes the ordering rule obvious: a `Set` keeps first-insertion position,
and adding an existing value does not move it.

Order is a contract, not an accident: `a`'s elements come first (deduped in place), then `b`'s new
values in `b`'s order. A `Set` is **insertion-ordered, not sorted** — if the caller wants sorted
output, sort explicitly and say so.

`Set.prototype.add` returns the set, so chaining compiles, but a plain loop reads better and avoids
surprising side effects in review.


### Implementation

```javascript
function union(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError("union expects two arrays");
  }
  const result = new Set(a);                 // insertion order starts as `a`, deduped
  for (const value of b) result.add(value);  // existing values keep their original position
  return [...result];
}

// Variadic: union(...arrays)
function unionAll(...arrays) {
  const result = new Set();
  for (const arr of arrays) {
    for (const value of arr) result.add(value); // no intermediate concatenation
  }
  return [...result];
}
```

### Walkthrough

`union([1, 2, 3], [3, 4, 5])`: `new Set([1, 2, 3])` → `{1, 2, 3}`. Adding `3` finds it already
present, so its position is unchanged. Add `4` → `{1, 2, 3, 4}`. Add `5` → `{1, 2, 3, 4, 5}`. Spread
yields `[1, 2, 3, 4, 5]`. Note that `3` appears in both inputs but once in the output, at the position
it first occupied from `a`.

### Complexity

Time: `O(n + m)`. Space: `O(n + m)` for the set and result. The `[...a, ...b]` variant adds a
throwaway array of `n + m` elements.


### Edge Cases

- Duplicates within either input collapse to one.
- `NaN` dedupes via SameValueZero; `0` and `-0` collapse to `0`.
- Order is deterministic: all of `a` first, then the new values from `b`.
- Sparse arrays → holes iterate as `undefined`, so a hole and an explicit `undefined` collapse.
- Objects/arrays dedupe by reference, never structurally.
- If `a` and `b` are the **same reference**, the result is a deduped copy of it.
- Non-array inputs throw; relax to any iterable if that is part of the contract.

### Interview Follow-ups

- **Variadic union:** rest parameters plus one `Set`, as in `unionAll`.
- **Large arrays, limited memory:** sort-merge or an external/streaming pass instead of a hash set.
- **Concatenation vs union:** `[...a, ...b]` keeps duplicates — name the difference out loud.
- **Union by key for objects:** `uniqueBy([...a, ...b], keyFn)` from problem 2.
- **Sorted union without a hash structure:** two pointers, `O(n + m)`, `O(1)` extra space.
- **ES2025 `new Set(a).union(new Set(b))`:** same semantics; both operands must be `Set`s.

### Common Mistakes

- `a.concat(b)` and calling it a union — that is concatenation, duplicates and all.
- Forgetting that a `Set` is insertion-ordered, not sorted.
- Assuming the result is sorted and depending on it downstream.
- Building `[...a, ...b]` for huge inputs when seeding a `Set` would avoid the copy.
- Coercing values to strings so that `1` and `"1"` silently collapse.

### Takeaway

Union is dedupe over concatenation, and `Set` supplies both the dedupe and the stable
first-occurrence order in one pass: seed with `a`, add `b`, spread out.

## Find the Difference Between Two Arrays

`Difficulty: Easy` `Probability: High`

### Problem

Implement `difference(a, b)` returning the values that are in `a` but **not** in `b`, each once,
ordered by first occurrence in `a`. This is the relative complement of `b` in `a`, and it is
**asymmetric**: `difference([1, 2], [2, 3])` is `[1]`, while `difference([2, 3], [1, 2])` is `[3]`.
Membership uses SameValueZero; inputs are not mutated.

### Examples

```text
difference([1, 2, 3], [2, 3, 4])  // => [1]
difference([1, 1, 2], [2])        // => [1]          (deduped)
difference([1, 2], [])            // => [1, 2]
difference([1, 2], [1, 2])        // => []
difference([], [1])               // => []
difference([NaN, 1], [NaN])       // => [1]          (SameValueZero)
difference([1], [2])              // => [1]
```

### Approach

It is the intersection with the predicate inverted: build a `Set` of `b`, iterate `a`, keep the values
the set does **not** contain. The result `Set` dedupes, which is what makes `difference([1, 1], [])`
return `[1]` rather than `[1, 1]`.

Because the operation is asymmetric, state the direction as part of the contract, or name it
`without(a, b)` / "values in `a` missing from `b`." Some libraries make `difference` variadic: remove
everything in the later arrays from the first. That is the pairwise version reduced.

If multiplicities must survive (each extra copy of `1` in `a` is kept), drop the result `Set` — but
then it is a **multiset** difference, not a set difference, and the function name should say so.


### Implementation

```javascript
function difference(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError("difference expects two arrays");
  }
  const exclude = new Set(b);   // SameValueZero membership
  const result = new Set();
  for (const value of a) {
    if (!exclude.has(value)) result.add(value);
  }
  return [...result];           // `a` order, deduped
}

// Variadic: remove every value found in any later array from the first.
function differenceAll(first, ...rest) {
  const exclude = new Set();
  for (const arr of rest) for (const value of arr) exclude.add(value); // no flattening
  return [...new Set(first)].filter((value) => !exclude.has(value));
}
```

### Walkthrough

`difference([1, 2, 3], [2, 3, 4])`: `exclude = {2, 3, 4}`. Read `1` → not excluded, add to `result`.
Read `2` → excluded. Read `3` → excluded. Result `[1]`, in `a`'s order. Reversing the arguments builds
`exclude = {1, 2, 3}`, scans `[2, 3, 4]`, and returns `[4]` — the asymmetry in action.

### Complexity

Time: `O(n + m)` — one pass to build the exclusion set, one to scan `a`. Space: `O(n + m)`. The
`a.filter((x) => !b.includes(x))` version is `O(n·m)` and keeps duplicates.


### Edge Cases

- Asymmetry: `difference([1, 2], [2, 3])` is `[1]`; `difference([2, 3], [1, 2])` is `[3]`.
- `NaN` is correctly excluded when it appears in `b` (the `Set` uses SameValueZero).
- Duplicates in `a` are collapsed by the result `Set`; only a multiset variant keeps them.
- Object/array values compare by reference.
- Sparse arrays → holes read as `undefined`, so `b` containing an explicit `undefined` excludes them.
- Empty `b` → a deduped copy of `a`; empty `a` → `[]`.
- `difference(a, a)` → `[]` when `a` is not sparse.

### Interview Follow-ups

- **Symmetric difference** (next problem): combine both one-sided differences.
- **Sorted arrays, two pointers:** `O(n + m)` time, `O(1)` extra space.
- **Multiset difference:** count `b`, decrement per element of `a`, and keep values with a positive
  remaining count.
- **Custom comparator:** `differenceWith(a, b, eq)` for structural equality.
- **Variadic "without":** remove any value present in any of the later arrays (see `differenceAll`).

### Common Mistakes

- Treating it as symmetric and returning the XOR of the two arrays.
- `a.filter((x) => !b.includes(x))` → `O(n·m)` and duplicate output.
- `indexOf(x) === -1` for exclusion, which drops `NaN` handling.
- Returning duplicates and calling it a set difference.
- Mutating `a` (or `b`) instead of building a new array.

### Takeaway

Left difference is "in `a`, not in `b`," and a `Set` of `b` makes it linear. The direction is part of
the contract, and duplicates are removed unless you explicitly opt into multiset semantics.

## Find the Symmetric Difference

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `symmetricDifference(a, b)` returning the values present in **exactly one** of the two
arrays, each once, ordered as `a`'s exclusive values first (in `a`'s order), then `b`'s exclusive
values (in `b`'s order). Membership uses SameValueZero; inputs are unchanged.

### Examples

```text
symmetricDifference([1, 2, 3], [2, 3, 4])  // => [1, 4]
symmetricDifference([1, 2], [1, 2])        // => []
symmetricDifference([1, 1, 2], [2])        // => [1]
symmetricDifference([NaN], [NaN])          // => []
symmetricDifference([1], [])               // => [1]
symmetricDifference([], [1, 2])            // => [1, 2]
```

### Approach

Two equivalent framings:

1. `(A ∪ B) − (A ∩ B)`: build the union, then remove values that are in both.
2. Both one-sided differences combined: `[...difference(a, b), ...difference(b, a)]`.

The direct version with two sets is clearest. Convert each side to a `Set` first — that collapses
duplicates within each input, so `[1, 1, 2]` against `[2]` yields `[1]`, not `[1, 1]` — then add each
`A`-only value and each `B`-only value. Because the two lists are disjoint by construction, the
concatenation needs no further dedupe.

This is the symmetric difference of **sets**. On multisets, `[1, 1]` vs `[1]` has a multiplicity
difference of one `1`; if the caller wants that, they need a count-map implementation and an explicit
contract change. The naive `[...a, ...b].filter(...)` shorthand is easy to get subtly wrong; prefer
the two explicit passes.


### Implementation

```javascript
function symmetricDifference(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError("symmetricDifference expects two arrays");
  }
  const setA = new Set(a);   // dedupe each side first
  const setB = new Set(b);
  const result = new Set();

  for (const value of setA) if (!setB.has(value)) result.add(value); // A-only
  for (const value of setB) if (!setA.has(value)) result.add(value); // B-only
  return [...result];
}

// Elements of `a` that are absent from `b`; the two one-sided lists are disjoint.
function oneSided(a, b) {
  const exclude = new Set(b);
  return [...new Set(a)].filter((value) => !exclude.has(value));
}
// Symmetric difference = [...oneSided(a, b), ...oneSided(b, a)]  (already deduped)
```

### Walkthrough

`[1, 2, 3]` vs `[2, 3, 4]`: `setA = {1, 2, 3}`, `setB = {2, 3, 4}`. The A-only pass reads `1` (not in
`B`) → add, then `2` and `3` (in `B`) → skip. The B-only pass reads `2` and `3` (in `A`) → skip, then
`4` (not in `A`) → add. The result is `[1, 4]`: `a`'s exclusive value first, then `b`'s.

### Complexity

Time: `O(n + m)` — two set builds and two linear passes. Space: `O(n + m)` for the two sets plus the
result set.


### Edge Cases

- Identical arrays → `[]`.
- Duplicates collapse within each input: `[1, 1, 2]` vs `[2]` → `[1]`.
- `NaN` on both sides → excluded (SameValueZero); `NaN` on only one side → included.
- `0` and `-0` count as the same value.
- Objects/arrays compare by reference.
- Ordering: all `a`-only values first, then all `b`-only values.
- Empty on either side → a deduped copy of the other side.

### Interview Follow-ups

- **N-ary symmetric difference:** fold left; on sets it is associative. On multisets it is not, so
  define the semantics before coding.
- **ES2025 `Set` method:** `new Set(a).symmetricDifference(new Set(b))` returns a `Set` directly.
- **Via union and intersection:** `union(a, b).filter((v) => !intersection(a, b).includes(v))`.
- **Multiset symmetric difference:** count both sides and keep `|countA − countB|` copies of each
  value.

### Common Mistakes

- Computing only `difference(a, b)` and mislabelling it symmetric.
- Using `a.filter((x) => !b.includes(x))` without the reverse pass.
- Failing to dedupe, so repeated values leak into the output.
- Confusing set symmetric difference with an XOR of multiplicities.
- Assuming the result is sorted.

### Takeaway

Symmetric difference is `(A ∪ B) − (A ∩ B)`, equivalently both one-sided differences combined. Two
sets, two passes, with each input deduped first — and the two halves are disjoint, so no third step is
needed.

## Find the Second-Largest Number

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `secondLargest(array)` returning the second-largest **distinct** value, or `null` when no
such value exists (fewer than two distinct values). Pin the contract down explicitly: with
duplicates, "second largest" almost always means the second-largest distinct value, so `[5, 5, 4]`
returns `4`. Aim for one pass and `O(1)` extra space.

### Examples

```text
secondLargest([3, 1, 4, 1, 5, 9, 2, 6])  // => 6
secondLargest([5, 5, 4])                 // => 4        (distinct values)
secondLargest([7, 7])                    // => null     (no second distinct value)
secondLargest([2])                       // => null
secondLargest([])                        // => null
secondLargest([-3, -1, -2])              // => -2
secondLargest([1, 1, 1, 2])              // => 1
secondLargest([-Infinity, -1, -2])       // => -2       (sentinels must not be -Infinity)
```

### Approach

Track two running values, `largest` and `second`, in a single pass. For each `value`:

- if `value > largest`: `second = largest; largest = value`;
- else if `value < largest && value > second`: `second = value`.

The strict `value < largest` is the whole trick for duplicates: a value equal to `largest` can never
become `second`, so `[5, 5, 4]` correctly yields `4`. Using `>=` or an unguarded `value > second` is
the classic bug that returns `5`.

Use `undefined` as the "not set yet" marker rather than `-Infinity`. A `-Infinity` sentinel breaks
when the maximum itself is `-Infinity`: no value is `> -Infinity`, so nothing is ever recorded.
`NaN` values never satisfy a comparison and are therefore ignored — decide whether that is acceptable
and say so.

The sort alternative (`[...new Set(array)].sort((a, b) => b - a)[1]`) is `O(n log n)` and allocates,
fine as a first answer. `Math.max(...array)` fails on large arrays because of spread argument limits.


### Implementation

```javascript
function secondLargest(array) {
  if (!Array.isArray(array)) throw new TypeError("secondLargest expects an array");

  let largest; // undefined = not seen yet
  let second;  // undefined = no second distinct value yet

  for (const value of array) {
    if (largest === undefined || value > largest) {
      second = largest;   // demote the previous maximum
      largest = value;
    } else if (value < largest && (second === undefined || value > second)) {
      second = value;     // strictly smaller, so duplicates of the max are skipped
    }
  }
  return second === undefined ? null : second;
}

// Readable O(n log n) fallback: dedupe, sort descending, take index 1.
function secondLargestSorted(array) {
  const values = [...new Set(array)].sort((a, b) => b - a); // numeric comparator is required
  return values.length < 2 ? null : values[1];
}
```

### Walkthrough

`secondLargest([3, 1, 4, 5, 5, 2])`: `3` → largest `3`, second `undefined`. `1` → `1 < 3`, so second is
`1`. `4` → `4 > 3`, so second becomes `3` and largest becomes `4`. `5` → second `4`, largest `5`. The
second `5` is neither `> 5` nor `< 5`, so it is skipped. `2` is `< 5` but not `> 4`, so it is skipped
too. Result `4`.

Without the strict `< largest` guard, the second `5` would overwrite `second` and the answer would
wrongly be `5` — which is the bug interviewers are watching for.

### Complexity

Time: `O(n)` for the single scan. Space: `O(1)` extra — two variables, no allocation. The sorted
alternative is `O(n log n)` time and `O(n)` space.


### Edge Cases

- Duplicates of the maximum never become second, thanks to the strict `< largest` guard.
- All values equal → `null`; fewer than two distinct values → `null`.
- Negative values and `-Infinity` work because the sentinels are `undefined`, not `-Infinity`.
- `NaN` entries are ignored (every comparison with `NaN` is `false`); all-`NaN` → `null`.
- Holes read as `undefined`, which the comparisons ignore.
- `null` entries are ignored for the same reason.
- `[1, 1, 1, 2]` → largest `2`, second `1`: the first `1` is demoted when `2` arrives.
- `[5, 4, 5]` → largest `5`, second `4`; the trailing `5` is skipped.

### Interview Follow-ups

- **k-th largest:** generalise with a min-heap of size `k` or quickselect (next problem).
- **Second smallest:** mirror the logic, or negate the values and reuse this function.
- **Duplicates counted positionally:** sort and take index `1` without deduping.
- **Streaming input:** the two-variable scan already works over any iterator with `O(1)` memory.
- **Empty/short-input contract:** returning `null` versus throwing — choose one and stay consistent.

### Common Mistakes

- `else if (value > second)` with no `value < largest` guard → a duplicate of the maximum wins.
- Initialising `second = -Infinity` for all-negative arrays or `-Infinity` inputs → wrong answer.
- Sorting and taking index `1` without deduping → a duplicate of the max.
- `Math.max(...array)` on a huge array → spread argument-limit errors.
- Leaving "distinct" undefined, so `[5, 5, 4]` is genuinely ambiguous.

### Takeaway

Track two running maxima in one pass using **strict** inequalities; the `value < largest` guard is
what collapses duplicates. Define "second" over distinct values, and never use `-Infinity` as the
unset sentinel.

## Find the k-th Largest Value

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `kthLargest(array, k)` returning the k-th largest **distinct** value, where `k` is 1-based
(`k = 1` is the maximum). Return `null` when `k` is out of range. Decide and document whether
duplicates are counted positionally or collapsed — the default here is collapsed, so the answer is
defined over distinct values.

### Examples

```text
kthLargest([3, 1, 4, 1, 5, 9, 2, 6], 1)  // => 9
kthLargest([3, 1, 4, 1, 5, 9, 2, 6], 2)  // => 6
kthLargest([3, 1, 4, 1, 5, 9, 2, 6], 3)  // => 5
kthLargest([5, 5, 4], 2)                 // => 4     (distinct values)
kthLargest([1, 2], 3)                    // => null  (k out of range)
kthLargest([], 1)                        // => null
kthLargest([7], 1)                       // => 7
kthLargest([1, 2, 3], 0)                 // => RangeError
```

### Approach

Three answers, each with a different trade-off:

1. **Dedupe, sort descending, index.** `[...new Set(array)].sort((a, b) => b - a)[k - 1]`. Simple and
   correct, `O(n log n)`. The comparator must be numeric — the default `sort()` compares strings, so
   `[10, 9, 2].sort()` yields `[10, 2, 9]`.
2. **Min-heap of size `k`.** Keep the `k` largest distinct values seen; the root is the answer when the
   scan ends. `O(n log k)` time, `O(k)` space, and it works on a stream. When the heap is full, skip
   values `<= heap[0]`, which collapses duplicates for free.
3. **Quickselect.** Average `O(n)`, worst `O(n²)`. Partition a copy until index `k - 1` is final; use a
   random pivot to avoid adversarial inputs.

Say the trade-off out loud: sorting is simplest to get right; a heap is right when `n` is huge or the
input streams; quickselect is right when average speed matters and a copy is acceptable.

The implementation below takes the heap route: keep a min-heap of exactly the `k` largest
values seen so far, so the root is always the current answer.

### Implementation

```javascript
function kthLargest(nums, k) {
  if (!Array.isArray(nums) || nums.length === 0) {
    throw new TypeError("kthLargest expects a non-empty array");
  }
  if (!Number.isInteger(k) || k < 1 || k > nums.length) {
    throw new RangeError("k must be an integer between 1 and the array length");
  }

  // Min-heap of the k largest values seen so far; heap[0] is the kth largest.
  const heap = [];
  const swap = (i, j) => {
    [heap[i], heap[j]] = [heap[j], heap[i]];
  };
  const siftUp = (i) => {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent] <= heap[i]) break;
      swap(parent, i);
      i = parent;
    }
  };
  const siftDown = (i) => {
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && heap[left] < heap[smallest]) smallest = left;
      if (right < heap.length && heap[right] < heap[smallest]) smallest = right;
      if (smallest === i) break;
      swap(smallest, i);
      i = smallest;
    }
  };

  for (const value of nums) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new TypeError("kthLargest expects an array of numbers");
    }
    if (heap.length < k) {
      heap.push(value);
      siftUp(heap.length - 1);
    } else if (value > heap[0]) {
      heap[0] = value; // evict the smallest of the current top-k
      siftDown(0);
    }
    // Values <= heap[0] cannot be in the top k, so they are ignored.
  }

  return heap[0];
}
```

### Walkthrough

For `kthLargest([3, 2, 1, 5, 6, 4], 2)` the heap holds the 2 largest values seen:

1. `3` → heap `[3]`; `2` → heap `[2, 3]` (sifted, root is the smaller).
2. `1` → `1 > 2` is false, ignored. `5` → `5 > 2`, so replace the root: `[5, 3]` → sift down → `[3, 5]`.
3. `6` → `6 > 3`, replace root: `[6, 5]` → already valid (6 > 5? No: root 6, children 5 — min-heap needs root smallest. `[6, 5]` violates it, so sift down swaps → `[5, 6]`).
4. `4` → `4 > 5` is false, ignored. Return `heap[0]` → `5`. // => 5

### Complexity

Time: `O(n log k)` — each of the `n` values does at most one `O(log k)` heap operation.
Space: `O(k)` for the heap. When `k` is small relative to `n` this beats sorting's
`O(n log n)` time, at the cost of more code.

### Edge Cases

- `k = 1` → the maximum; `k = nums.length` → the minimum. Both fall out naturally.
- `k` out of range (`0`, negative, non-integer, larger than length) throws `RangeError`.
- `NaN` in the input throws: comparisons with `NaN` are unordered, so silently keeping or dropping it would be a lie.
- Duplicates are fine: `[5, 5, 5]` with `k = 2` returns `5`.
- The input array is never mutated; the heap is the only extra structure.

### Interview Follow-ups

- **Do it by sorting:** `[...nums].sort((a, b) => b - a)[k - 1]` — simplest, `O(n log n)`.
- **Do it with quickselect:** partition until index `k - 1` is final; average `O(n)`.
- **Stream version:** the heap loop already works on a stream — `k` memory, one pass.
- **kth smallest:** symmetric — keep a *max*-heap of size `k`.

### Common Mistakes

- Using a max-heap of *all* `n` values and popping `k` times (`O(n + k log n)` memory and code for no benefit).
- Forgetting that `heap[0]` must be compared with strict `>` so equal values don't churn.
- Sorting the input in place and mutating the caller's array.
- Returning the whole heap instead of `heap[0]`.

### Takeaway

kth largest is a bounded-selection problem: a min-heap of size `k` holds exactly the
answer at its root in one pass and `O(k)` space. Name the sort/heap/quickselect trade-off
before you code.

## Move All Zeros to the End (Stable)

`Difficulty: Easy` `Probability: High`

### Problem

Implement `moveZeros(array)` that moves every `0` to the end **without changing the
relative order of the other elements**. Decide the mutation contract up front and state
it: the classic interview version sorts the array **in place**; the safer utility version
returns a **new** array. This implementation does it in place and returns the same array
for chaining, and the follow-ups cover the copy version.

### Examples

```text
moveZeros([0, 1, 0, 3, 12])  // => [1, 3, 12, 0, 0]  (same reference)
moveZeros([0, 0, 1])         // => [1, 0, 0]
moveZeros([1, 2, 3])         // => [1, 2, 3]          (no zeros: untouched)
moveZeros([0, 0, 0])         // => [0, 0, 0]
moveZeros([])                // => []
```

### Approach

Two pointers with one invariant: everything before `write` is a settled non-zero, in
original order. `read` scans every element; when `array[read]` is non-zero, copy it to
`write` and advance both. When the scan ends, positions `write..end` are stale, so fill
them with `0`. Each element is written at most twice, the order of non-zeros never
changes, and no extra array is allocated.

The trap is `splice` inside a loop: removing a zero shifts every later element, which is
`O(n)` per removal and easy to get the index bookkeeping wrong. The two-pointer version
is one pass and obviously stable.

### Implementation

```javascript
function moveZeros(array) {
  if (!Array.isArray(array)) throw new TypeError("moveZeros expects an array");

  let write = 0; // next position for a non-zero value
  for (let read = 0; read < array.length; read += 1) {
    if (array[read] !== 0) {
      array[write] = array[read];
      write += 1;
    }
  }
  // Everything from write onward is stale: fill it with zeros.
  for (let i = write; i < array.length; i += 1) {
    array[i] = 0;
  }
  return array;
}
```

### Walkthrough

For `[0, 1, 0, 3, 12]`:

1. `read=0` (`0`): skip. `read=1` (`1`): copy to `write=0` → `[1, 1, 0, 3, 12]`, `write=1`.
2. `read=2` (`0`): skip. `read=3` (`3`): copy to `write=1` → `[1, 3, 0, 3, 12]`, `write=2`.
3. `read=4` (`12`): copy to `write=2` → `[1, 3, 12, 3, 12]`, `write=3`.
4. Fill from `write=3`: positions 3 and 4 become `0` → `[1, 3, 12, 0, 0]`.

### Complexity

Time: `O(n)` — one read pass plus one fill pass. Space: `O(1)` — in place, two indices.

### Edge Cases

- No zeros → the copy loop writes every element onto itself; harmless.
- All zeros → `write` stays `0` and the fill loop rewrites zeros.
- `-0` is `=== 0`, so it moves too; state whether that matters for the caller.
- Only *`0`* moves — `false`, `""`, `null`, `undefined`, and `NaN` stay where they are.
  A "move all falsy" variant needs a different predicate (see the falsy-removal problem).
- Holes: reading a hole yields `undefined` (not zero), so it is treated as a keeper.

### Interview Follow-ups

- **Return a new array instead:** `[...array.filter((x) => x !== 0), ...array.filter((x) => x === 0)]`, or one pass with two output arrays.
- **Move zeros to the front:** same algorithm, fill from the start — or scan from the right.
- **Minimise writes:** only assign when `write !== read`; already-optimal inputs then cost zero writes.

### Common Mistakes

- `splice` in a forward loop: indices shift under you and zeros get skipped; also `O(n²)`.
- `sort` with a comparator: destroys the stability requirement and is `O(n log n)`.
- `filter` + `push` confusion: `filter` returns a new array, so the caller's array is unchanged unless you assign it back.
- Treating all falsy values as zero.

### Takeaway

Stable partitioning is a two-pointer scan: `read` finds keepers, `write` places them, and
the tail is filled afterwards. One pass, in place, order preserved.

## Rotate an Array Left by `k`

`Difficulty: Easy` `Probability: High`

### Problem

Implement `rotateLeft(array, k)` that moves the first `k` elements to the end, preserving
their order: `[1, 2, 3, 4, 5]` rotated left by `2` becomes `[3, 4, 5, 1, 2]`. Normalise
`k` first — rotations repeat every `length`, so `k = length` is a no-op and negative `k`
means rotation in the opposite direction. This implementation returns a **new** array and
leaves the input untouched.

### Examples

```text
rotateLeft([1, 2, 3, 4, 5], 2)   // => [3, 4, 5, 1, 2]
rotateLeft([1, 2, 3, 4, 5], 0)   // => [1, 2, 3, 4, 5]
rotateLeft([1, 2, 3, 4, 5], 5)   // => [1, 2, 3, 4, 5]  (full cycle)
rotateLeft([1, 2, 3, 4, 5], 7)   // => [3, 4, 5, 1, 2]  (7 mod 5 = 2)
rotateLeft([1, 2, 3, 4, 5], -1)  // => [5, 1, 2, 3, 4]  (right by 1)
rotateLeft([], 3)                // => []
```

### Approach

Normalise, then slice. `k = ((k % n) + n) % n` maps every integer — positive, negative,
or larger than the array — into `0..n-1` (the double-modulo handles JavaScript's negative
remainder). After that the answer is two slices: `array.slice(k).concat(array.slice(0, k))`.
No loop, no index arithmetic, and the input is never mutated.

The in-place follow-up (reversal algorithm) exists for when allocation is forbidden, but
the slice version is the right default: it is obviously correct and `O(n)`.

### Implementation

```javascript
function rotateLeft(array, k) {
  if (!Array.isArray(array)) throw new TypeError("rotateLeft expects an array");
  if (!Number.isInteger(k)) throw new TypeError("k must be an integer");

  const n = array.length;
  if (n === 0) return [];
  const steps = ((k % n) + n) % n; // normalise into 0..n-1
  if (steps === 0) return [...array];
  return [...array.slice(steps), ...array.slice(0, steps)];
}
```

### Walkthrough

For `rotateLeft([1, 2, 3, 4, 5], 7)`: `n = 5`, `7 % 5 = 2`, `(2 + 5) % 5 = 2`, so
`steps = 2`. `array.slice(2)` is `[3, 4, 5]` and `array.slice(0, 2)` is `[1, 2]`;
spread together → `[3, 4, 5, 1, 2]`.

For `k = -1`: `-1 % 5` is `-1` in JavaScript (remainder keeps the sign), `(-1 + 5) % 5`
is `4`, so `steps = 4` — a left rotation by 4, which equals a right rotation by 1.

### Complexity

Time: `O(n)` — two slices that together visit every element once. Space: `O(n)` for the
new array.

### Edge Cases

- Empty array returns `[]` before any modulo (avoids division by zero).
- `k = 0` or any multiple of `length` returns a copy, not the same reference.
- Negative `k` rotates right; non-integer `k` throws rather than truncating silently.
- The input is never mutated — the result is always a fresh array.
- Sparse arrays: `slice` preserves holes, so they survive in their rotated positions.

### Interview Follow-ups

- **Rotate right by `k`:** `rotateLeft(array, -k)`, or normalise directly.
- **In place with `O(1)` space:** the reversal algorithm — reverse the whole array,
  then reverse the two segments.
- **Rotate a string:** identical logic on code points (`[...str]`), then `join("")`.

### Common Mistakes

- Forgetting the modulo, so `k > length` over-rotates or `slice` gets a junk index.
- Using `k % n` directly for negative `k` and getting a negative index (`slice` would then count from the end — a different answer).
- Repeatedly `push(shift())` in a loop: correct but `O(n·k)` because `shift` re-indexes.
- Mutating the input when the caller expected a copy (or vice versa).

### Takeaway

Rotation is normalisation plus two slices: `((k % n) + n) % n` tames every `k`, and the
answer is `tail.concat(head)`. Remember that JavaScript's `%` keeps the sign.
