# Arrays

Array problems test whether you can pick the right tool and state its cost. The patterns here repeat everywhere in frontend work: set operations with `Set`/`Map`, two-pointer and frequency-counting tricks, recursion for nested data, and the difference between mutating and copying methods. Learn the pattern, not the exact input.

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

## Rotate an Array Right by `k`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `rotateRight(array, k)` returning a new array shifted right by `k` positions:
every element moves `k` indices forward and wraps around the end. The contract:

- **Pure.** It returns a new array and never mutates the input.
- `k` is normalized modulo `array.length`, so `k` may exceed the length, and a negative
  `k` rotates **left**.
- The empty array returns an empty array (guard the modulo).

### Examples

```text
rotateRight([1, 2, 3, 4, 5], 2)   // => [4, 5, 1, 2, 3]
rotateRight([1, 2, 3, 4, 5], 0)   // => [1, 2, 3, 4, 5]
rotateRight([1, 2, 3, 4, 5], 5)   // => [1, 2, 3, 4, 5]
rotateRight([1, 2, 3, 4, 5], 12)  // => [4, 5, 1, 2, 3]  (12 % 5 === 2)
rotateRight([1, 2, 3, 4, 5], -1)  // => [2, 3, 4, 5, 1]  (negative k rotates left)
rotateRight([1], 100)             // => [1]
rotateRight([], 3)                // => []
rotateRight([1, 2], 1)            // => [2, 1]
```

### Approach

The whole problem is index arithmetic; the algorithm is a cut-and-paste.

1. Normalize the shift: `shift = ((k % n) + n) % n`. The extra `+ n` is what makes a
   negative `k` land in `[0, n)`. In JavaScript `-1 % 5` is `-1`, and any use of that raw
   value as a length silently produces the wrong answer — this step is the bug it prevents.
2. Split the array at `n - shift`: the **tail** (`slice(n - shift)`) becomes the new front
   and the **head** (`slice(0, n - shift)`) follows it.
3. Both halves are copies, so the result is `O(n)` time and space — unavoidable when the
   contract says "return a new array." If the interviewer wants `O(1)` extra space, that is
   the three-reversal trick in the Implementation section.

Two traps a naive solution hits:

- `array.slice(array.length - k)` looks right, but `slice` treats a negative start as
  "from the end," so `k > n` accidentally works for some values and fails for others
  (`k = 12, n = 5`). Normalize first and the special case disappears.
- Spreading (`[...a, ...b]`) iterates, so holes become explicit `undefined`; `concat`
  preserves holes. Pick one and say which.

### Implementation

```javascript
function rotateRight(array, k) {
  if (!Array.isArray(array)) throw new TypeError("rotateRight expects an array");
  if (!Number.isInteger(k)) throw new TypeError("k must be an integer");

  const n = array.length;
  if (n === 0) return [];                  // guard: n is a divisor, 0 would give NaN

  const shift = ((k % n) + n) % n;         // normalize: handles k > n and k < 0
  if (shift === 0) return array.slice();   // slice() is a copy, and keeps holes

  const cut = n - shift;
  return array.slice(cut).concat(array.slice(0, cut)); // concat preserves holes
}
```

The in-place variant, when extra space must be `O(1)` — reverse the whole array, then
reverse each part:

```javascript
function rotateRightInPlace(array, k) {
  const n = array.length;
  if (n === 0) return array;
  const shift = ((k % n) + n) % n;

  const reverse = (lo, hi) => {
    while (lo < hi) {
      [array[lo], array[hi]] = [array[hi], array[lo]];
      lo += 1;
      hi -= 1;
    }
  };

  reverse(0, n - 1);          // [1,2,3,4,5] -> [5,4,3,2,1]
  reverse(0, shift - 1);      //              -> [4,5,3,2,1]
  reverse(shift, n - 1);      //              -> [4,5,1,2,3]
  return array;
}
```

### Walkthrough

`rotateRight([1, 2, 3, 4, 5], 2)`:

1. `n = 5`, `k = 2` is an integer, so no throw.
2. `shift = ((2 % 5) + 5) % 5 = 2`.
3. `shift !== 0`, so `cut = 5 - 2 = 3`.
4. `array.slice(3)` → `[4, 5]`; `array.slice(0, 3)` → `[1, 2, 3]`.
5. `[4, 5].concat([1, 2, 3])` → `[4, 5, 1, 2, 3]`.

For `rotateRight([1, 2, 3, 4, 5], -1)`: `((-1 % 5) + 5) % 5 = 4`, so `cut = 1` and the
result is `slice(1)` + `slice(0, 1)` = `[2, 3, 4, 5, 1]` — a one-step left rotation,
exactly as promised.

### Complexity

Time: `O(n)` — the two slices touch every element once. Space: `O(n)` for the result. The
in-place variant is `O(n)` time and `O(1)` extra space, at the cost of mutating the array.

### Edge Cases

- `k = 0` or a multiple of `n`: `shift === 0`, and the shortcut returns a clean copy.
- `k > n`: modulo keeps it correct; an unnormalized `slice(length - k)` breaks once `k > 2n`.
- Negative `k`: the double-modulo converts it to the equivalent right rotation.
- Empty array: return before the modulo, avoiding `NaN`.
- Holes: `slice`/`concat` preserve them; spread would turn them into explicit `undefined`.
- `k` non-integer (`2.5`, `NaN`, `Infinity`): a fractional split index corrupts the result,
  so reject it up front.
- Large arrays: the copy doubles peak memory; the in-place version avoids that.

### Interview Follow-ups

- **Rotate left by `k`:** it is `rotateRight(array, -k)`, or `rotateRight(array, n - k % n)`.
- **Rotate in place, `O(1)` space:** the three-reversal algorithm; explain why reversing the
  halves after the full reversal restores internal order.
- **Rotate a linked list:** compute the new tail at `n - k % n`, cut, and reconnect the old
  tail to the old head.
- **Rotate repeatedly:** `k` single rotations cost `O(nk)`; prefer the split.
- **Why `slice(-k)` is a trap:** negative indices wrap, so the unnormalized form works for
  small `k` and fails for large `k` — it passes the first test and fails in production.

### Common Mistakes

- Forgetting to normalize `k`, producing slices in the wrong order for `k > n` or `k < 0`.
- Using `splice` and mutating the caller's array, violating the purity contract.
- Dividing by `array.length` before handling the empty array, yielding `NaN`.
- Using spread on a sparse array, silently converting holes to `undefined`.
- Assuming `k` is always within bounds because the example used `k = 2`.

### Takeaway

Rotation is `shift = ((k % n) + n) % n`, then `slice(n - shift).concat(slice(0, n - shift))`.
Normalizing `k` is the entire trick; the rest is a cut-and-paste.

## Chunk an Array

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `chunk(array, size = 1)` that splits an array into consecutive subarrays of
length `size`. The last chunk holds the remainder and may be shorter. The contract:

- Returns a **new** outer array of **new** subarrays; the input is neither mutated nor
  aliased by the output.
- Order is preserved and no element is dropped.
- `size` must be a positive integer; anything else (`0`, negative, fractional, `NaN`,
  `Infinity`, `"2"`) throws rather than looping forever or guessing.

### Examples

```text
chunk([1, 2, 3, 4, 5], 2)    // => [[1, 2], [3, 4], [5]]
chunk([1, 2, 3, 4, 5, 6], 3) // => [[1, 2, 3], [4, 5, 6]]
chunk([1, 2, 3], 5)          // => [[1, 2, 3]]   (size larger than the array)
chunk([1, 2, 3], 1)          // => [[1], [2], [3]]
chunk([], 2)                 // => []
chunk([1, 2, 3], 3)          // => [[1, 2, 3]]
chunk([1, 2, 3], 2)          // => [[1, 2], [3]]
chunk([1, 2, 3], 0)          // => RangeError
```

### Approach

Walk the array in strides of `size` and take `slice(i, i + size)` each time.

- The loop is `for (let i = 0; i < array.length; i += size)`. A `while` bounded by
  `i <= length - size` needs a second "leftover" chunk after the loop and is the usual
  source of off-by-one bugs; the stride form has no leftover case because `slice` clamps
  its end index.
- `slice` returns a fresh subarray, so the output does not alias the input. That matters:
  if you returned slices of shared storage, later mutation of the input would leak into the
  "chunked" result.
- Validate `size` **before** the loop. `size = 0` or `NaN` makes `i` never advance, so the
  loop never terminates; `Infinity` would silently produce one chunk.

`Number.isInteger(size)` rejects `2.5`, `NaN`, `Infinity`, `"2"`, and `null` in one call.

### Implementation

```javascript
function chunk(array, size = 1) {
  if (!Array.isArray(array)) throw new TypeError("chunk expects an array");
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("size must be a positive integer");
  }

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size)); // slice clamps at the end and copies
  }
  return chunks;
}
```

A lazy version for very large or infinite sequences, when the caller may stop early:

```javascript
function* chunkLazy(iterable, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("size must be a positive integer");
  }
  let bucket = [];
  for (const value of iterable) {
    bucket.push(value);
    if (bucket.length === size) {
      yield bucket;        // hand over a full chunk...
      bucket = [];         // ...then start a fresh one (never reuse the yielded array)
    }
  }
  if (bucket.length > 0) yield bucket; // the shorter tail chunk
}
```

### Walkthrough

`chunk([1, 2, 3, 4, 5], 2)`:

1. `size = 2` passes validation.
2. `i = 0`: `slice(0, 2)` → `[1, 2]`; `chunks = [[1, 2]]`; `i` becomes `2`.
3. `i = 2`: `slice(2, 4)` → `[3, 4]`; `chunks = [[1, 2], [3, 4]]`; `i` becomes `4`.
4. `i = 4`: `slice(4, 6)` → `[5]` (the end index is clamped); `chunks` becomes
   `[[1, 2], [3, 4], [5]]`; `i` becomes `6`.
5. `6 < 5` is false, so the loop stops.

The lazy version on the same input yields `[1, 2]`, then `[3, 4]`, then `[5]` only when the
consumer asks for the third value.

### Complexity

Time: `O(n)` — one visit per element. Space: `O(n)` for the chunks, since the subarrays
collectively hold every element. The lazy version uses `O(size)` at a time.

### Edge Cases

- `size >= length` → a single chunk holding the whole array; never an empty chunk.
- `size = 1` → one chunk per element.
- Empty input → `[]`, not `[[]]`; the loop body never runs.
- Sparse input: `slice` preserves holes, so `chunk([1, , 3], 2)` is `[[1, <hole>], [3]]`.
- `size` of `0`, `NaN`, `Infinity`, `2.5`, `"2"`, `null` → rejected before any work.
- Iterables (strings, `Set`, generators) have no `length` or indexed access; use the lazy
  generator, or convert with `Array.from` first.
- Huge `size` near `2^53` is technically an integer; `size >= n` means one chunk, so it is
  fine, but a huge `size` with a huge array would still be one allocation.

### Interview Follow-ups

- **Chunk a string:** `[...str]` (code points, not code units) then join each chunk.
- **Pad the last chunk** to `size`: after the loop, `last.push(...Array(size - last.length).fill(filler))`.
- **Lazy chunking** (generator above) is the answer for streams and infinite input.
- **Sliding windows** overlap and are a different problem; plain chunking partitions, so
  every element appears exactly once.
- **Mutation during iteration:** the loop reads the live `array`, so an element pushed
  mid-loop gets chunked; copy the input first if that is undesirable.

### Common Mistakes

- `array.slice(i, size)` — using `size` as an absolute end index; it works only for the
  first chunk. The end must be `i + size`.
- `array.splice(0, size)` in a loop, which empties the caller's array.
- Looping with `i <= array.length` and pushing a trailing empty chunk.
- Skipping validation, so `size = 0` or `NaN` hangs the loop.
- Returning aliased views instead of `slice` copies, then wondering why editing a chunk
  changes the original.

### Takeaway

`for (let i = 0; i < n; i += size) push(array.slice(i, i + size))`. The stride loop plus
`slice`'s clamped end index removes the "leftover" case entirely; validate `size` first and
the rest is mechanical.

## Flatten a Nested Array Recursively

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `flattenDeep(array)` that returns a new, fully flattened array: every nested
array at any depth is replaced by its elements, in order, and only actual arrays are
recursed into. The contract:

- Returns a new array; the input is not mutated.
- `Array.isArray` is the recursion test, so strings, plain objects, typed arrays,
  `arguments`, and other array-likes are **leaf values**, not containers.
- Holes behave like the native `Array.prototype.flat`: they are **removed** rather than
  kept as `undefined`.

### Examples

```text
flattenDeep([1, [2, [3, [4]], 5]])        // => [1, 2, 3, 4, 5]
flattenDeep([[1, 2], [3, 4]])             // => [1, 2, 3, 4]
flattenDeep([1, [2, [3, [4, [5]]]]])      // => [1, 2, 3, 4, 5]
flattenDeep([])                           // => []
flattenDeep([[], [[]]])                   // => []
flattenDeep([1, "ab", { a: 1 }])          // => [1, "ab", { a: 1 }]
flattenDeep([1, , 3])                     // => [1, 3]  (holes dropped, like flat)
```

### Approach

Depth-first traversal with a single shared accumulator:

- Walk each array with an index loop. For each **present** index, if the value is an array,
  recurse; otherwise push it. The accumulator is created once, so the result is built in one
  pass instead of allocating a new array per level.
- Use `Array.isArray`, not `typeof value === "object"` (also true for `null` and plain
  objects) and not duck-typing on `.length`.
- Skip holes with `!(i in source)` to match `flat`, which removes empty slots. A `for...of`
  loop would instead yield `undefined` for each hole.

Why not `reduce((acc, value) => acc.concat(flattenDeep(value)))`? `concat` allocates a new
array on every merge, so the total work becomes quadratic in the number of nested arrays.
The single accumulator stays linear.

Why not `flat(Infinity)`? If the interview allows it, that is the one-liner — but the
exercise is to build it, and the native version also drops holes, which the hand-written
version must match.

Recursion depth is the one real weakness: JavaScript has no tail-call optimization, so
input nested tens of thousands deep overflows the stack. The iterative form keeps an
explicit stack (see Follow-ups and the second implementation).

### Implementation

```javascript
function flattenDeep(array) {
  if (!Array.isArray(array)) throw new TypeError("flattenDeep expects an array");

  const result = [];
  (function walk(source) {
    for (let i = 0; i < source.length; i += 1) {
      if (!(i in source)) continue;          // skip holes, matching Array.prototype.flat
      const value = source[i];
      if (Array.isArray(value)) walk(value); // only real arrays are containers
      else result.push(value);
    }
  })(array);

  return result;
}
```

Iterative version with an explicit stack, for pathologically deep input:

```javascript
function flattenDeepIterative(array) {
  if (!Array.isArray(array)) throw new TypeError("flattenDeep expects an array");

  const result = [];
  const stack = [{ source: array, index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.source.length) {
      stack.pop();                            // this level is finished
      continue;
    }
    const i = frame.index++;
    if (!(i in frame.source)) continue;
    const value = frame.source[i];
    if (Array.isArray(value)) stack.push({ source: value, index: 0 });
    else result.push(value);
  }
  return result;
}
```

### Walkthrough

`flattenDeep([1, [2, [3, [4]], 5]])`:

1. `walk([1, [2, [3, [4]], 5]])`: `i = 0`, `1` is not an array → push `1`.
2. `i = 1`, `[2, [3, [4]], 5]` is an array → `walk` it.
   1. `i = 0` → push `2`.
   2. `i = 1`, `[3, [4]]` is an array → `walk` it.
      1. `i = 0` → push `3`.
      2. `i = 1`, `[4]` is an array → `walk` it → push `4`.
   3. `i = 2` → push `5`.
3. The recursion unwinds; `result` is `[1, 2, 3, 4, 5]`.

The order is pre-order and left-to-right, exactly what `flat(Infinity)` produces.

### Complexity

Time: `O(N)` where `N` counts every element and every nested array — each is visited once.
Space: `O(n)` for the output plus `O(d)` recursion depth. The iterative version swaps the
`O(d)` call stack for an `O(d)` heap stack, so it survives depths the recursive one cannot.

### Edge Cases

- `[]` and `[[], [[]]]` → `[]`; emptiness is "contains no leaves."
- Holes are dropped: `[1, , 3]` → `[1, 3]`, matching `flat` and unlike `for...of`.
- `null` is a leaf: `[1, [null]]` → `[1, null]`, because `Array.isArray(null)` is false.
- Array-likes (`{0: 1, length: 1}`, `arguments`, typed arrays) are leaves, not containers.
- Cyclic input (`a.push(a)`) recurses forever and throws `RangeError: Maximum call stack
  size exceeded`; guard with a `WeakSet` of ancestors if cycles are possible.
- Deep nesting (~10⁴ levels) overflows the recursive version; the iterative one survives
  until heap memory runs out.
- Non-array input throws rather than silently being wrapped in an array.

### Interview Follow-ups

- **Flatten to a depth limit** — the next problem; carry a `remaining` counter down.
- **`flatMap`:** map, then flatten one level; or transform and flatten in a single pass.
- **Lazy flatten with a generator:** `yield` leaves as reached, so a deeply nested (or
  infinite) structure works when the consumer stops early.
- **Cycle handling:** keep a `WeakSet` of arrays on the current path; add on entry and
  delete on exit so a shared (DAG) subarray can still be flattened twice.
- **`structuredClone` on nested data** shares the same recursion-depth hazard, which is why
  the platform implementation is iterative.

### Common Mistakes

- `reduce` + `concat`, which is quadratic in nested-array count and allocates per level.
- `typeof value === "object"` as the recursion test — recurses into `null`, or treats plain
  objects as containers.
- Using `for...of`, which visits holes as `undefined` and breaks `flat` parity.
- Returning a fresh array from each recursive call and spreading/concatenating at every
  level instead of pushing into one accumulator.
- Ignoring cycles, then blaming the engine when the stack overflows.

### Takeaway

Flattening is a depth-first walk with one accumulator and `Array.isArray` as the only
recursion test. Push into the accumulator rather than concatenating sub-results, and be
explicit about holes (dropped, like `flat`) and depth (the recursion stack is your limit).

## Flatten an Array to a Specified Depth

`Difficulty: Medium` `Probability: High`

### Problem

Implement `flattenDepth(array, depth = 1)` matching `Array.prototype.flat`: flatten nested
arrays up to `depth` levels, and leave anything deeper intact. The contract:

- Returns a new array; the input is not mutated.
- `depth` follows `ToIntegerOrInfinity`: `undefined` defaults to `1`, `NaN` and negatives
  become `0` (a shallow copy), fractions truncate toward zero, and `Infinity` fully flattens.
- Holes are removed, as `flat` does.

### Examples

```text
flattenDepth([1, [2, [3, [4]]]], 1)        // => [1, 2, [3, [4]]]
flattenDepth([1, [2, [3, [4]]]], 2)        // => [1, 2, 3, [4]]
flattenDepth([1, [2, [3, [4]]]], 0)        // => [1, [2, [3, [4]]]]
flattenDepth([1, [2, [3, [4]]]])           // => [1, 2, [3, [4]]]      (default 1)
flattenDepth([1, [2, [3, [4]]]], Infinity) // => [1, 2, 3, 4]
flattenDepth([1, [2, [3, [4]]]], -3)       // => [1, [2, [3, [4]]]]    (no flattening)
flattenDepth([1, [2, [3, [4]]]], 1.9)      // => [1, 2, [3, [4]]]      (truncates to 1)
flattenDepth([1, , [2]], 1)                // => [1, 2]
```

### Approach

The same depth-first walk as full flattening, plus a budget.

- Each recursive call receives `remaining`. A value is flattened only when it is an array
  **and** `remaining > 0`; otherwise it is pushed as a leaf. Passing `remaining - 1` down by
  value gives each element its own budget, so siblings are independent.
- Normalize `depth` once, before the walk, with `ToIntegerOrInfinity` semantics:
  `Number(depth)` → `NaN` becomes `0` → truncate toward zero → clamp negatives to `0`.
  `Infinity` survives `Math.trunc` as `Infinity`, so `remaining - 1` stays `Infinity` and
  everything flattens.
- The subtle bug is a **shared** counter (`remaining--` on a closure variable or an outer
  `let`): the first deep branch exhausts the budget and later siblings stop flattening. Pass
  the depth by value.

The previous problem is this one with `depth = Infinity`, which is exactly why `flat` takes
an argument and why `flatMap` is equivalent to `flat(1)` after a map.

### Implementation

```javascript
function flattenDepth(array, depth = 1) {
  if (!Array.isArray(array)) throw new TypeError("flattenDepth expects an array");

  // ToIntegerOrInfinity: NaN -> 0, negatives -> 0, fractions truncate, Infinity stays.
  const numeric = Number(depth);
  const limit = Number.isNaN(numeric) ? 0 : Math.max(0, Math.trunc(numeric));

  const walk = (source, remaining) => {
    const output = [];
    for (let i = 0; i < source.length; i += 1) {
      if (!(i in source)) continue;                  // holes dropped, as in flat
      const value = source[i];
      if (Array.isArray(value) && remaining > 0) {
        output.push(...walk(value, remaining - 1));  // remaining is passed by value
      } else {
        output.push(value);                          // at the limit, or not an array
      }
    }
    return output;
  };

  return walk(array, limit);
}
```

A variant that pushes into one accumulator instead of spreading sub-results:

```javascript
function flattenDepthInto(array, depth = 1) {
  const numeric = Number(depth);
  const limit = Number.isNaN(numeric) ? 0 : Math.max(0, Math.trunc(numeric));

  const result = [];
  const walk = (source, remaining) => {
    for (let i = 0; i < source.length; i += 1) {
      if (!(i in source)) continue;
      const value = source[i];
      if (Array.isArray(value) && remaining > 0) walk(value, remaining - 1);
      else result.push(value);
    }
  };

  walk(array, limit);
  return result;
}
```

### Walkthrough

`flattenDepth([1, [2, [3, [4]]]], 2)`: `limit = 2`.

1. `walk(outer, 2)`: `i = 0`, `1` is not an array → push `1`.
2. `i = 1`: `[2, [3, [4]]]` is an array and `2 > 0` → `walk(inner, 1)`.
   1. `i = 0` → `2` is not an array → push `2`.
   2. `i = 1`: `[3, [4]]` is an array and `1 > 0` → `walk(deeper, 0)`.
      1. `i = 0` → `3` is not an array → push `3`.
      2. `i = 1`: `[4]` is an array but `0 > 0` is false → push `[4]` **as a leaf**.
3. Result: `[1, 2, 3, [4]]`.

With `depth = Infinity`, `remaining` never reaches `0`, so the inner branch also recurses and
the result is `[1, 2, 3, 4]`.

### Complexity

Time: `O(N)` over visited values and arrays, bounded by the depth limit. Space: `O(n)` output
plus `O(d)` recursion depth. The spread version allocates one array per nested level; the
accumulator version does not.

### Edge Cases

- `depth = 0` or negative → a shallow copy that still drops holes.
- `depth = undefined` → `1`, the native default (not `0`; a common mistake).
- Fractional `1.9` → `1`; `NaN` → `0`; `Infinity` → full flatten.
- Holes dropped at every level: `[1, , [2]]` with depth `1` → `[1, 2]`.
- A hole-only array `[, ,]` with depth `0` → `[]`.
- Deeply nested input with a large `depth` can overflow the stack; the limit bounds how
  much is flattened, not how deep the structure is.
- Non-array input throws; `depth` as a numeric string (`"2"`) works because of `Number`.

### Interview Follow-ups

- **Implement `flat` as a prototype method** with `Symbol.species`, so a subclass instance
  flattens to the subclass; that detail separates a full polyfill from a helper.
- **`flatMap`:** implement it as map-then-flatten-one-level and compare with a native
  single-pass version; note that `flatMap` also receives `thisArg`.
- **Iterative depth-limited flatten:** push `{ value, remaining }` frames on an explicit
  stack instead of using the call stack.
- **Preserve holes** (a deliberately different contract): test `i in source` to choose
  between pushing a hole and pushing `undefined`.
- **Coercion:** the native `flat` accepts `"2"` and `1.9`; an implementation that insists on
  integers diverges from the spec.

### Common Mistakes

- Decrementing a shared counter instead of passing `remaining - 1` by value, so siblings
  flatten inconsistently.
- Treating a missing `depth` as `0`; the native default is `1`.
- Forgetting to clamp negatives, leaving `remaining < 0` and muddying the condition.
- Using `for...of`, which turns holes into `undefined` instead of dropping them.
- Spreading sub-results at every level, turning a linear walk into repeated allocations.

### Takeaway

Depth-limited flatten is full flatten with a per-element budget: flatten when the value is an
array **and** budget remains, and pass `remaining - 1` by value so siblings cannot steal each
other's depth. Normalize `depth` once with `ToIntegerOrInfinity` semantics.

## Find Missing Number(s) From a Sequence

`Difficulty: Medium` `Probability: High`

### Problem

Two related tasks:

- `findMissing(nums)` — given `nums`, a permutation of `1..n` with exactly one value
  removed, return the missing value.
- `findMissingMany(nums, lower, upper)` — given integers and an inclusive range, return every
  value in `[lower, upper]` that is absent, ascending.

Contract for both: `nums` is unsorted. The single-missing version assumes **distinct**
values and the range `1..nums.length + 1` (so the sequence length is `nums.length + 1`, and
the missing value may be an endpoint). Empty `nums` under that assumption means the range is
`1..1` and the answer is `1`. State the precondition out loud: without "distinct and within
range," the problem has no well-defined answer.

### Examples

```text
findMissing([1, 2, 4, 5])          // => 3   (range 1..5)
findMissing([1, 2, 3])             // => 4   (missing at the top end)
findMissing([2, 3, 4])             // => 1   (missing at the bottom end)
findMissing([1])                   // => 2
findMissing([])                    // => 1
findMissing([5, 3, 1, 2])          // => 4   (unsorted is fine)

findMissingMany([1, 2, 4, 6], 1, 6) // => [3, 5]
findMissingMany([1, 2, 3], 1, 3)    // => []
findMissingMany([], 4, 6)           // => [4, 5, 6]
findMissingMany([7, 7, 8], 6, 9)    // => [6, 9]  (duplicates ignored)
```

### Approach

**Single missing value — XOR.** XOR is associative and commutative, and `x ^ x = 0`, so XOR
everything in `1..n` together with everything in `nums`: every present value cancels, leaving
the missing one. This sidesteps the precision worry of the arithmetic-sum trick
(`n * (n + 1) / 2 - sum`), which loses integer accuracy once `n` exceeds
`Number.MAX_SAFE_INTEGER`.

The catch with XOR in JavaScript: `^` coerces both operands to **int32**, so it is correct
only for values inside `[-2^31, 2^31)`. For larger inputs, use the sum method with `BigInt`,
or state the bound. Say this out loud — it is the kind of platform detail that scores points.

**Many missing values — a `Set`.** Build a set of the present values, then scan
`lower..upper` and collect the gaps. `Set.has` is average `O(1)`, so the scan is linear in
the range size; without the set you would run a linear `includes` inside a loop.

Sorting is the alternative: sort `nums` and walk both sequences. It is `O(n log n)` but avoids
allocating a set proportional to the range — useful when the range is enormous and the gaps
are few (a "missing from the logs" query).

### Implementation

```javascript
function findMissing(nums) {
  if (!Array.isArray(nums)) throw new TypeError("findMissing expects an array");

  const n = nums.length + 1;          // the full sequence is 1..n
  let xor = 0;

  for (let value = 1; value <= n; value += 1) xor ^= value;

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) throw new RangeError("holes are not valid input");
    xor ^= nums[i];                   // present values cancel out
  }

  return xor;                          // only the missing value survives
}

function findMissingMany(nums, lower, upper) {
  if (!Array.isArray(nums)) throw new TypeError("findMissingMany expects an array");

  const present = new Set(nums);
  const missing = [];
  for (let value = lower; value <= upper; value += 1) {
    if (!present.has(value)) missing.push(value);
  }
  return missing;
}
```

The sum alternative, with its limit made explicit:

```javascript
// Exact only while n(n+1)/2 stays a safe integer (n up to about 1.34e8).
function findMissingBySum(nums) {
  const n = nums.length + 1;
  const expected = (n * (n + 1)) / 2;
  const actual = nums.reduce((total, value) => total + value, 0);
  return expected - actual;
}
```

### Walkthrough

`findMissing([1, 2, 4, 5])`:

1. `n = 4 + 1 = 5`, so the full sequence is `1, 2, 3, 4, 5`.
2. XOR of `1..5`: `1 ^ 2 = 3`, `3 ^ 3 = 0`, `0 ^ 4 = 4`, `4 ^ 5 = 1` → `xor = 1`.
3. XOR in `nums`: `1 ^ 1 = 0`; `0 ^ 2 = 2`; `2 ^ 4 = 6`; `6 ^ 5 = 3` → `xor = 3`.
4. Return `3`.

Every value except `3` appeared twice (once from the range, once from `nums`) and cancelled;
`3` appeared once and survived.

For `findMissingMany([1, 2, 4, 6], 1, 6)`: `present = {1, 2, 4, 6}`; scanning `1..6` gives
`1 ✓, 2 ✓, 3 ✗, 4 ✓, 5 ✗, 6 ✓` → `[3, 5]`.

### Complexity

Single value: time `O(n)`, space `O(1)`. Many values: time `O(range + n)`, space `O(n)` for
the set. The sorted alternative is time `O(n log n)`, space `O(n)` for the copy.

### Edge Cases

- A missing endpoint (`1` or `n`) is found; the range is `1..length + 1`, so the top of the
  range is the "extra" value.
- Empty input → `1` under the stated assumption; if the range is unknown, the function is
  undefined and the contract must say so explicitly.
- Duplicates violate the single-missing invariant and produce garbage rather than an
  exception; validate with a set, or document the precondition.
- Holes in `nums` are not allowed; `for...of` would turn a hole into `undefined` and poison
  the XOR, so the index loop throws instead.
- An out-of-range value (say `8` in a `1..5` range) XORs a bit back into the result and
  returns a plausible-looking wrong answer — another reason to state preconditions.
- Above `2^31`, `^` truncates to int32; switch to the sum method with `BigInt`.
- `findMissingMany` with `lower > upper` → `[]`; a huge range makes the scan dominate.

### Interview Follow-ups

- **Two missing values:** XOR everything to get `a ^ b`, pick a set bit, partition both the
  range and the array by that bit, then XOR each partition to recover `a` and `b`.
- **Read-only array of size `n - 1`, no extra space:** the XOR method is already `O(1)`
  space.
- **Find the duplicate instead:** `arraySum - n(n + 1)/2` gives the repeated value; XOR
  does too.
- **Arithmetic progression with step `d`:** use the series formula for `[a, a + d, ...]` or
  fall back to the set scan.
- **Streaming input:** a set buffers everything; XOR cannot detect *multiple* gaps. Choose
  based on whether the number of missing values is known.

### Common Mistakes

- Using `n = nums.length` instead of `nums.length + 1`, getting the top of the range wrong.
- Assuming the input is sorted and binary-searching an invariant that does not exist.
- `includes` inside a loop for the multi-value case, giving `O(n · range)`.
- Believing the sum method is exact for huge `n`; floating point loses integer precision past
  `2^53`.
- Forgetting that `^` is int32 and silently truncating large values.

### Takeaway

The single missing value is the XOR of `1..n` with the array — everything cancels but the gap.
For many gaps, hold the present values in a `Set` and scan the range. Always state the
precondition (`1..n`, distinct, no holes) and the int32 limit of `^`.

## Find a Pair Whose Sum Equals a Target

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `findPair(nums, target)` returning one pair `[a, b]` whose values sum to `target`,
or `null` when no such pair exists. The contract:

- The two elements must be at **distinct indices**; one element cannot be used twice.
- "First" means the pair whose **second** element has the smallest index — the result of a
  single left-to-right scan, returned as `[earlier value, later value]`.
- Duplicate values are allowed: `[3, 3]` with target `6` returns `[3, 3]`.

### Examples

```text
findPair([2, 7, 11, 15], 9)   // => [2, 7]
findPair([3, 2, 4], 6)        // => [2, 4]   (not [3, 3]; one element serves once)
findPair([3, 3], 6)           // => [3, 3]   (two distinct indices)
findPair([1, 2, 3], 100)      // => null
findPair([], 5)               // => null
findPair([-3, 4, 3, 90], 0)   // => [-3, 3]
findPair([5], 10)             // => null
findPair([2, 2, 3], 5)        // => [2, 3]
```

### Approach

One forward pass with a `Map` from value to its earliest index.

- For each value, compute `complement = target - value`. If the complement has been seen, we
  have a pair and can stop; otherwise record the value.
- Because the complement check happens **before** the insert, the current element can never
  pair with itself — that single ordering is what makes `[3]` with target `6` return `null`
  while `[3, 3]` returns `[3, 3]`.
- This finds the pair whose **second** element has the smallest index, a deterministic
  reading of "first." A nested double loop would find the pair with the smallest **first**
  index instead — the same pairs, different tie-break. Say which one you are returning.
- `O(n)` time instead of the `O(n²)` double loop, at the cost of `O(n)` space.

Alternative: if the input may be sorted (or already is), two pointers from both ends is
`O(1)` extra space after an `O(n log n)` sort. The trade is explicit: a hash map when you
want `O(n)` and indices, two pointers when space matters and sorting is acceptable.

`Map.has`/`get` use SameValueZero, so `NaN` matches `NaN` and `-0` matches `0` — useful
behavior that `===` and `indexOf` do not share. Storing only the first occurrence of each
value keeps the reported index correct; later occurrences would change nothing else.

### Implementation

```javascript
function findPair(nums, target) {
  if (!Array.isArray(nums)) throw new TypeError("findPair expects an array");

  const firstIndex = new Map();        // value -> earliest index seen

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) continue;        // holes are not values
    const value = nums[i];
    const complement = target - value;

    if (firstIndex.has(complement)) {
      return [complement, value];      // [earlier, later] in index order
    }
    if (!firstIndex.has(value)) firstIndex.set(value, i);
  }

  return null;                          // no pair sums to target
}
```

The sorted two-pointer version, when `O(1)` extra space matters:

```javascript
function findPairSorted(nums, target) {
  const sorted = nums.slice().sort((a, b) => a - b); // copy: mutate nothing
  let lo = 0;
  let hi = sorted.length - 1;

  while (lo < hi) {
    const sum = sorted[lo] + sorted[hi];
    if (sum === target) return [sorted[lo], sorted[hi]];
    if (sum < target) lo += 1;          // too small: raise the floor
    else hi -= 1;                       // too big: lower the ceiling
  }
  return null;
}
```

### Walkthrough

`findPair([2, 7, 11, 15], 9)`:

1. `i = 0`, `value = 2`, `complement = 7`. The map is empty, so record `2 -> 0`.
2. `i = 1`, `value = 7`, `complement = 2`. `firstIndex.has(2)` is `true` → return `[2, 7]`.

`findPair([3, 2, 4], 6)`:

1. `i = 0`, `value = 3`, `complement = 3`. Not seen → record `3 -> 0`. The element cannot
   pair with itself because the check ran before the insert.
2. `i = 1`, `value = 2`, `complement = 4`. Not seen → record `2 -> 1`.
3. `i = 2`, `value = 4`, `complement = 2`. Seen at index `1` → return `[2, 4]`.

`findPair([3, 3], 6)`: `i = 0` records `3 -> 0`; `i = 1` sees complement `3` → `[3, 3]`, two
distinct indices.

### Complexity

Time: `O(n)` — one pass with average `O(1)` map operations. Space: `O(n)` for the map. The
sorted version is `O(n log n)` time and `O(n)` for the copy (or `O(1)` extra if the caller
allows sorting in place).

### Edge Cases

- Empty or single-element input → `null`; there are no two distinct indices.
- Duplicate values: `[3, 3]` works because the check precedes the insert.
- Negatives and zero need no special handling — only subtraction and equality are used.
- The same element cannot be reused: `[3]` with target `6` → `null`.
- `-0` and `0`: SameValueZero makes a stored `0` match a `-0` complement.
- `NaN` with a `NaN` target: `Map` stores and matches `NaN`, unlike `indexOf` or `===`.
- Holes are skipped, not stored as `undefined`.
- Mixed types are a contract decision: `"1"` and `1` are different keys, yet `target - "1"`
  coerces to a number and can match a stored number.

### Interview Follow-ups

- **Return indices instead of values:** the map already holds them — `[firstIndex.get(complement), i]`.
- **Count all pairs:** accumulate combinations from a frequency map, handling the `a === b`
  case specially; the next problem does unique pairs.
- **Three-sum:** sort, then reduce to two-sum per element — `O(n²)` overall, or `O(n²)` with
  duplicate skipping for unique triplets.
- **Already-sorted input:** two pointers, `O(n)` time and `O(1)` space — which is why sorting
  first is a real option, not just trivia.
- **Memory-constrained huge input:** external sort plus two pointers, because the map will not
  fit.
- **Pair in a row/column-sorted matrix:** start at the top-right corner and move based on the
  comparison, `O(rows + cols)`.

### Common Mistakes

- Reusing one index in a nested loop (`i !== j` forgotten), so `[3]` pairs with itself.
- `includes`/`indexOf` inside a loop, making it `O(n²)` while claiming `O(n)`.
- Testing `firstIndex.has(value)` instead of `has(complement)`, which never finds anything.
- Inserting before checking, which breaks single-element pairs and duplicates.
- Sorting in place without telling the caller, mutating their array as a side effect.

### Takeaway

One pass with `complement = target - value` and a `Map` of seen values gives `O(n)`: check
before you insert, so an element cannot pair with itself and duplicates still work. Sorting
plus two pointers is the `O(1)`-extra-space alternative when `n log n` and mutation are
acceptable.

## Find All Unique Pairs Whose Sum Equals a Target

`Difficulty: Medium` `Probability: High`

### Problem

Implement `findAllPairs(nums, target)` returning **every distinct value pair** `[a, b]` with
`a + b === target`, each pair once, ascending within the pair and across the list. The
contract:

- Pairs are values, not indices: `[1, 1, 2]` with target `3` yields `[1, 2]` once.
- A pair may use two **equal** values only if the input actually holds two copies: `[2, 2]`
  with target `4` → `[[2, 2]]`, but `[2]` with target `4` → `[]`.
- No pair is repeated and no reversed duplicate (`[a, b]` and `[b, a]`) appears.
- The input is not mutated.

### Examples

```text
findAllPairs([1, 1, 2, 3, 4, 5, 5], 6) // => [[1, 5], [2, 4]]
findAllPairs([1, 2, 3, 4, 5], 7)       // => [[2, 5], [3, 4]]
findAllPairs([2, 2], 4)                // => [[2, 2]]
findAllPairs([2], 4)                   // => []
findAllPairs([1, 2, 3], 100)           // => []
findAllPairs([], 0)                    // => []
findAllPairs([-1, 0, 1, 2], 1)         // => [[-1, 2], [0, 1]]
findAllPairs([0, 0, 0], 0)             // => [[0, 0]]
```

### Approach

Sort a copy, walk two pointers inward, and skip duplicate values.

- Sorting puts equal values adjacent, so `[a, b]` can be discovered once and both pointers can
  then jump past every copy of `a` and every copy of `b`. That skip is what makes the output
  unique.
- The two-pointer invariant: if `sorted[lo] + sorted[hi]` is too small, every pair for `lo`
  is too small (`hi` is the largest partner available), so advance `lo`. If it is too big,
  every pair for `hi` is too big, so retreat `hi`. That is why the walk is linear after the
  sort.
- `a === b` needs two distinct elements, and `lo < hi` enforces exactly that: `[2, 2]`
  matches, `[2]` does not.

Two details decide correctness:

1. **Sort with a numeric comparator.** The default `sort` is lexicographic — `[10, 2, 1]`
   becomes `[1, 10, 2]` — and the walk then returns nonsense. This is the most common failure.
2. **Skip duplicates on both sides after recording a pair.** Advancing `lo` without skipping
   re-finds `[a, b]` for every duplicate `a`; the `hi` side has the same problem.

The frequency-map alternative preserves the order of first appearance instead of sorting, at
the cost of a hash map and a canonical-key guard to avoid emitting both `[a, b]` and `[b, a]`.
Both are `O(n log n)` or better; sorting is usually simpler.

### Implementation

```javascript
function findAllPairs(nums, target) {
  if (!Array.isArray(nums)) throw new TypeError("findAllPairs expects an array");

  // Copy values (dropping holes) and sort numerically, not lexicographically.
  const values = [];
  for (let i = 0; i < nums.length; i += 1) {
    if (i in nums) values.push(nums[i]);
  }
  values.sort((a, b) => a - b);

  const pairs = [];
  let lo = 0;
  let hi = values.length - 1;

  while (lo < hi) {
    const sum = values[lo] + values[hi];

    if (sum === target) {
      pairs.push([values[lo], values[hi]]);
      const left = values[lo];
      const right = values[hi];
      while (lo < hi && values[lo] === left) lo += 1;   // skip duplicate a's
      while (lo < hi && values[hi] === right) hi -= 1;  // skip duplicate b's
    } else if (sum < target) {
      lo += 1;                                          // too small: raise the floor
    } else {
      hi -= 1;                                          // too big: lower the ceiling
    }
  }

  return pairs;
}
```

The `Map`-based version, which keeps the order of first appearance:

```javascript
function findAllPairsByFrequency(nums, target) {
  const counts = new Map();
  for (let i = 0; i < nums.length; i += 1) {
    if (i in nums) counts.set(nums[i], (counts.get(nums[i]) ?? 0) + 1);
  }

  const pairs = [];
  const used = new Set();                 // canonical keys already emitted
  for (const [value, count] of counts) {
    const complement = target - value;
    if (!counts.has(complement)) continue;

    if (value === complement) {
      if (count >= 2) pairs.push([value, complement]); // needs two copies
      continue;
    }

    const key = value < complement ? `${value}|${complement}` : `${complement}|${value}`;
    if (!used.has(key)) {
      used.add(key);
      pairs.push(value < complement ? [value, complement] : [complement, value]);
    }
  }
  return pairs;
}
```

### Walkthrough

`findAllPairs([1, 1, 2, 3, 4, 5, 5], 6)`:

1. Sorted copy: `[1, 1, 2, 3, 4, 5, 5]` (indices `0..6`).
2. `lo = 0` (`1`), `hi = 6` (`5`): sum `6 === target` → push `[1, 5]`. Skip `1`s: `lo` moves
   `0 → 1 → 2`, stopping at `2`. Skip `5`s: `hi` moves `6 → 5 → 4`, stopping at `4`.
3. `lo = 2` (`2`), `hi = 4` (`4`): sum `6` → push `[2, 4]`. Skip `2`s: `lo` moves to `3`.
   Skip `4`s: `hi` moves to `3`.
4. `lo = 3`, `hi = 3`, so `lo < hi` is false → done. Result `[[1, 5], [2, 4]]`.

For `[2, 2]` with target `4`: `lo = 0`, `hi = 1`, sum `4` → push `[2, 2]`; the skip loops stop
immediately because `lo < hi` becomes false. For `[2]`, the loop never runs and the result is
`[]`.

### Complexity

Time: `O(n log n)`, dominated by the sort; the walk is `O(n)`. Space: `O(n)` for the sorted
copy and the output. The map version is `O(n)` expected time and `O(n)` space.

### Edge Cases

- Equal-value pairs need two copies (`[2, 2]` yes, `[2]` no), enforced by `lo < hi`.
- Duplicates collapse: `[1, 1, 2]` yields `[1, 2]` once.
- No pairs or empty input → `[]`.
- Negatives and zero work because of the numeric comparator; the default lexicographic sort
  would place `-1` after `10`.
- `NaN` never satisfies `sum === target`, so `NaN` values are ineligible — document it.
- `-0` and `0` compare equal and sum to `0`, so they can form a pair; which one is reported
  depends on the comparator and input order.
- Holes are dropped before sorting. Sorting a sparse array natively moves holes to the end,
  where they compare as `undefined`, corrupting the walk — hence the manual copy.
- The caller's array is untouched because we sort a copy.

### Interview Follow-ups

- **Return all index pairs:** decide whether uniqueness is over values or over index pairs;
  the latter can be much larger and needs a different guard.
- **Count unique pairs without listing them:** the same two-pointer skipping, incrementing a
  counter.
- **Unique triplets (three-sum):** fix each first element, skip duplicates, then two-pointer
  the remainder — the same skipping discipline one level deeper.
- **k-sum:** reduce recursively to two-sum; `O(n^(k-1))`.
- **Preserve original order:** use the frequency-map version or a hash set of canonical pair
  keys rather than sorting.
- **Very large input with many duplicates:** sort-and-skip is often faster in practice than a
  map because it avoids hashing every element.

### Common Mistakes

- Sorting with the default comparator, so `10` sorts before `2` and the walk is wrong.
- Forgetting to skip duplicates, so `[1, 1, 2, 3]` with target `3` emits `[1, 2]` twice.
- Using `lo <= hi`, which emits `[k, k]` for a single `k` (self-pairing).
- Emitting both `[a, b]` and `[b, a]` in the map version by not tracking a canonical key.
- Mutating the caller's array with `sort`, violating the purity contract.
- Sorting a sparse array directly and leaving holes at the end.

### Takeaway

Unique pairs are "sort numerically, converge two pointers, skip every duplicate value on both
sides." The skipping — not the walk — makes the output unique, and the numeric comparator is
what makes the walk correct in the first place.

## Find the Maximum Subarray Sum (Kadane's Algorithm)

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `maxSubarraySum(nums)` returning the largest sum of any **non-empty** contiguous
subarray. The contract:

- The subarray must be non-empty, so an all-negative array returns its largest (least
  negative) element, **not** `0`.
- Empty input has no subarray: return `-Infinity`, the identity for a maximum, and say so out
  loud — some interviewers expect `0` or `null`, so agree on the behavior before coding.
- Negatives, zeros, and single elements are all valid inputs.

### Examples

```text
maxSubarraySum([-2, 1, -3, 4, -1, 2, 1, -5, 4]) // => 6   (subarray [4, -1, 2, 1])
maxSubarraySum([1, 2, 3, 4])                     // => 10
maxSubarraySum([-1, -2, -3])                     // => -1  (largest single element)
maxSubarraySum([5])                              // => 5
maxSubarraySum([0])                              // => 0
maxSubarraySum([-3, 0, -2])                      // => 0
maxSubarraySum([])                               // => -Infinity
```

### Approach

Kadane's algorithm carries two values:

- `current`: the best sum of a subarray that **ends at the current element**. Either extend
  the previous subarray (`current + value`) or start fresh at this element (`value`).
  `Math.max(value, current + value)` is that choice.
- `best`: the largest `current` ever seen — the global answer.

The non-empty requirement lives in that `Math.max(value, ...)`: "start fresh" is always
available, so a negative value never forces `current` below the value itself. Writing
`Math.max(0, current + value)` is the classic bug — it silently permits an **empty** subarray,
so an all-negative array returns `0` instead of the largest element.

The invariant to state in an interview: **`current` is optimal for subarrays ending at `i`,
and `best` is optimal overall.** Because every non-empty subarray ends somewhere, one pass
suffices. A negative prefix never helps: if `current + value < value`, the prefix was negative
and dropping it is strictly better.

Tracking the subarray itself is a small extension: when the `value` branch wins, reset
`start = i`; whenever `current` beats `best`, record `bestStart = start` and `bestEnd = i`.

### Implementation

```javascript
function maxSubarraySum(nums) {
  if (!Array.isArray(nums)) throw new TypeError("maxSubarraySum expects an array");
  if (nums.length === 0) return -Infinity;    // no non-empty subarray exists

  let current = 0;        // best sum of a subarray ending at the previous index
  let best = -Infinity;   // best sum over all subarrays seen so far

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) continue;               // treat holes as absent
    const value = Number(nums[i]);
    current = Math.max(value, current + value); // extend, or restart here
    best = Math.max(best, current);             // non-empty by construction
  }

  return best;
}
```

The version that also returns the winning range, which is what an interviewer usually asks
for next:

```javascript
function maxSubarrayRange(nums) {
  let current = 0;
  let best = -Infinity;
  let start = 0;
  let bestStart = 0;
  let bestEnd = 0;

  for (let i = 0; i < nums.length; i += 1) {
    if (!(i in nums)) continue;
    const value = Number(nums[i]);

    if (value > current + value) {
      current = value;          // restarting here beats extending
      start = i;
    } else {
      current += value;
    }

    if (current > best) {
      best = current;
      bestStart = start;        // record the range that produced this best
      bestEnd = i;
    }
  }

  return { sum: best, start: bestStart, end: bestEnd }; // nums.slice(start, end + 1)
}
```

### Walkthrough

`maxSubarraySum([-2, 1, -3, 4, -1, 2, 1, -5, 4])`:

```text
i=0 value=-2  current=max(-2, -2)=-2   best=-2
i=1 value= 1  current=max( 1, -1)= 1   best= 1
i=2 value=-3  current=max(-3, -2)=-2   best= 1
i=3 value= 4  current=max( 4,  2)= 4   best= 4
i=4 value=-1  current=max(-1,  3)= 3   best= 4
i=5 value= 2  current=max( 2,  5)= 5   best= 5
i=6 value= 1  current=max( 1,  6)= 6   best= 6   <-- answer
i=7 value=-5  current=max(-5,  1)= 1   best= 6
i=8 value= 4  current=max( 4,  5)= 5   best= 6
```

The best is `6`, from the subarray `[4, -1, 2, 1]` at indices `3..6`. At `i = 3`, extending
the negative prefix would give `2`, so the algorithm restarts at `4`. At `i = 4`, extending is
better (`3 > -1`), so `-1` stays in the subarray — a negative can belong to the best answer if
the surrounding positives outweigh it.

For `[-1, -2, -3]`: `current` becomes `-1`, then `max(-2, -3) = -1`, then `max(-3, -2) = -1`,
and `best` stays `-1` — the largest single element.

### Complexity

Time: `O(n)` — one pass. Space: `O(1)` — two scalars, plus three more for the range version.
The divide-and-conquer alternative is `O(n log n)` time and `O(log n)` stack.

### Edge Cases

- All negatives → the maximum single element, the correct non-empty answer.
- Single element → that element, even when negative.
- Empty input → `-Infinity`; document the choice because "no subarray" has no numeric answer.
- Zeros → `best` may be `0` when a zero beats the surrounding negatives.
- `NaN` poisons the running sum: `Math.max(-Infinity, NaN)` is `NaN`. Validate or document.
- Numeric strings are coerced with `Number`; other mixed types otherwise surprise.
- Holes are skipped, so they do not break a run of values — a deliberate choice.
- Floating point: sums may drift, so comparing against an expected value with `===` is risky.
- Very large arrays: the running sum can pass `Number.MAX_SAFE_INTEGER` and lose precision
  before it loses magnitude.

### Interview Follow-ups

- **Return the subarray, not just the sum:** the range version above; the extra work is
  resetting `start` on restart and recording the bounds when `best` improves.
- **Maximum circular subarray:** the answer is either the ordinary max or
  `total - minSubarray`; handle the all-negative case explicitly, or the "wrap" becomes the
  whole array.
- **Maximum product subarray:** track both the running max and the running min, because
  multiplying by a negative flips which is which.
- **Maximum sum of a fixed window of size `k`:** a sliding window in `O(n)`; Kadane is not
  the right tool when the length is fixed.
- **Maximum-sum submatrix:** fix pairs of rows and run Kadane on the column sums,
  `O(rows² · cols)`.
- **Divide and conquer:** best of left, right, and crossing the midpoint — good practice in
  invariants, though `O(n log n)`.

### Common Mistakes

- `current = Math.max(0, current + value)`, which permits an empty subarray and returns `0`
  for all-negative input.
- Initializing `best = 0`, with the same all-negative bug.
- Resetting `current` to `0` on a negative value instead of to the value itself.
- Forgetting the non-empty requirement entirely and claiming `0` is correct.
- Range tracking that records `bestStart`/`bestEnd` without resetting `start` when the restart
  branch wins, so the reported indices point at the wrong elements.

### Takeaway

Kadane is `current = max(value, current + value); best = max(best, current)`. The
`max(value, ...)` — not `max(0, ...)` — is what makes the subarray non-empty, and that single
character difference is the difference between the correct all-negative answer and the classic
`0` bug.

## Merge Two Sorted Arrays

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `mergeSorted(a, b)` returning a new array with every element of both inputs in
ascending order. The contract:

- Both inputs are already sorted ascending.
- The merge is **stable**: when elements compare equal, the one from `a` comes first.
- Returns a new array; neither input is mutated.
- Linear time `O(m + n)`. Concatenating and calling `.sort()` is `O((m+n) log(m+n))` and throws
  away the fact that both halves are already ordered.

### Examples

```text
mergeSorted([1, 3, 5, 7], [2, 4, 6]) // => [1, 2, 3, 4, 5, 6, 7]
mergeSorted([1, 2], [3, 4])          // => [1, 2, 3, 4]
mergeSorted([3, 4], [1, 2])          // => [1, 2, 3, 4]
mergeSorted([], [1, 2])              // => [1, 2]
mergeSorted([1, 2], [])              // => [1, 2]
mergeSorted([], [])                  // => []
mergeSorted([1, 2, 2], [2, 3])       // => [1, 2, 2, 2, 3]
```

### Approach

Two read pointers and one write pointer — the merge step from merge sort.

- `i` walks `a`, `j` walks `b`, and `k` writes into `merged`, preallocated to `m + n`.
- Take `a[i]` when `a[i] <= b[j]`, otherwise `b[j]`. The `<=` (not `<`) is what makes the merge
  **stable**: on a tie, `a`'s element is written first, preserving the relative order of equal
  values. With `<` and non-numeric records, ties would be reordered.
- After the main loop one side still has elements. Only one cleanup loop runs, and it needs no
  comparisons — the remainder is already sorted and is at least as large as everything
  written.
- Preallocating `new Array(m + n)` and writing by index is faster than `push` in hot code and
  guarantees the final length; the fill is complete because the cleanup loops cover the
  leftovers.

Do not `shift()` the inputs inside the loop: `shift` is `O(n)`, which makes the merge
quadratic. Index pointers keep it linear.

This function is exactly merge sort's merge. Getting the stability (`<=`) and the cleanup
loops right here is the prerequisite for the sort problem later in this chapter.

### Implementation

```javascript
function mergeSorted(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError("mergeSorted expects two arrays");
  }

  const merged = new Array(a.length + b.length);
  let i = 0; // read pointer into a
  let j = 0; // read pointer into b
  let k = 0; // write pointer into merged

  while (i < a.length && j < b.length) {
    // `<=` keeps the merge stable: on ties, a's element is written first.
    merged[k++] = a[i] <= b[j] ? a[i++] : b[j++];
  }

  // Exactly one of these runs; the leftover side needs no comparisons.
  while (i < a.length) merged[k++] = a[i++];
  while (j < b.length) merged[k++] = b[j++];

  return merged;
}
```

The classic in-place variant: `a` holds `m` real elements followed by `n` spare slots, and `b`
holds `n` elements. Write from the back so unread data is never overwritten:

```javascript
function mergeInto(a, m, b, n) {
  let i = m - 1;      // last real element of a
  let j = n - 1;      // last element of b
  let k = m + n - 1;  // last slot of a

  while (j >= 0) {
    // Compare only while a has unread elements; otherwise take from b.
    a[k--] = i >= 0 && a[i] > b[j] ? a[i--] : b[j--];
  }
  return a;
}
```

### Walkthrough

`mergeSorted([1, 3, 5, 7], [2, 4, 6])`:

```text
i=0 j=0  a[i]=1 <= b[j]=2  -> merged[0]=1  i=1
i=1 j=0  a[i]=3 <= b[j]=2  -> no;  merged[1]=2  j=1
i=1 j=1  a[i]=3 <= b[j]=4  -> merged[2]=3  i=2
i=2 j=1  a[i]=5 <= b[j]=4  -> no;  merged[3]=4  j=2
i=2 j=2  a[i]=5 <= b[j]=6  -> merged[4]=5  i=3
i=3 j=2  a[i]=7 <= b[j]=6  -> no;  merged[5]=6  j=3   (j exhausted)
cleanup: merged[6]=7  i=4
```

Result `[1, 2, 3, 4, 5, 6, 7]`. The `j` cleanup loop never runs because `j` reached `b.length`
first.

In-place variant with `a = [1, 3, 5, 0, 0, 0]`, `m = 3`, `b = [2, 4, 6]`, `n = 3`: start
`k = 5`, `i = 2`, `j = 2`. `5 > 6`? No → `a[5] = 6`, `j = 1`. `5 > 4`? Yes → `a[4] = 5`,
`i = 1`. `3 > 4`? No → `a[3] = 4`, `j = 0`. `3 > 2`? Yes → `a[2] = 3`, `i = 0`. `1 > 2`? No →
`a[1] = 2`, `j = -1`. The loop ends → `[1, 2, 3, 4, 5, 6]`.

### Complexity

Time: `O(m + n)` — each element is written once and compared at most once. Space: `O(m + n)`
for the result; the in-place variant is `O(1)` extra space. Concatenate-then-sort is
`O((m+n) log(m+n))` and allocates a third array.

### Edge Cases

- One or both inputs empty → the result is a copy of the other.
- Cross-array duplicates are all kept; stability decides the order of equals.
- Stability matters when the arrays hold records sorted by one key and ties must keep source
  order — a common real-world merge of event logs.
- `NaN`: every comparison with `NaN` is false, so it is taken from `b` when sitting in `a`'s
  slot, and its final position is arbitrary. Document it.
- Strings: `<=` is lexicographic for strings (fine if both sides are strings); mixing numbers
  and strings triggers coercion surprises.
- Holes: indexing reads a hole as `undefined`, so the result contains `undefined`; filter or
  document. Native `sort` would move holes to the end instead.
- Frozen inputs are safe? yes for `mergeSorted`, which never mutates; the in-place variant
  mutates `a` by design.
- Huge arrays: two inputs plus the output triple peak memory, which is what the in-place
  variant exists to avoid.

### Interview Follow-ups

- **Merge in place** where `a` has trailing capacity (above) — writing backwards is the whole
  insight, and the interviewer is checking that you see it.
- **Merge `k` sorted arrays:** a min-heap of heads is `O(N log k)`; pairwise divide-and-conquer
  merging is the same complexity with a smaller constant.
- **Merge two sorted linked lists:** the same two-pointer walk, reusing nodes rather than
  allocating, with a dummy head to remove the empty-list special case.
- **One array much larger than the other:** galloping/binary insertion cuts the work from
  `O(m + n)` to `O(m log n)` when `m ≪ n`.
- **Custom comparator:** accept `(x, y) => number` and replace `<=` with `compare(x, y) <= 0`,
  keeping the tie rule for stability.
- **Why not `.concat().sort()`?** Correct output, but `O((m+n) log(m+n))`, an extra allocation,
  and it needs a numeric comparator or it sorts lexicographically.

### Common Mistakes

- Forgetting a cleanup loop, so the tail of the longer array is dropped.
- `a[i] < b[j]` instead of `<=`, breaking stability on ties.
- `shift()` on the inputs, making the merge `O(n²)` and mutating the caller's arrays.
- Writing `merged[k] = ...` without incrementing `k`, or preallocating the wrong length.
- In the in-place variant, writing from the front and overwriting unread elements of `a`.
- Assuming the inputs are sorted without checking; an unsorted input silently produces a wrong
  order.

### Takeaway

The merge is two read pointers plus one write pointer, taking from `a` on `<=` ties to stay
stable and draining the leftover tail with no comparisons. It is linear, and it is exactly the
merge inside merge sort — get the stability and the cleanup loops right and both problems fall
out.

## Sort an Array Without Using `.sort()`

`Difficulty: Hard` `Probability: Very High`

### Problem

Implement `sortArray(array, compare?)` returning a new array sorted ascending, **without**
calling `Array.prototype.sort`. The contract:

- Returns a new array; the input is not mutated.
- The optional comparator `(a, b) => number` matches the sort spec: negative puts `a` first,
  positive puts `b` first, and `0` or `NaN` means "equal."
- The sort is **stable** — elements comparing equal keep their original relative order (native
  `sort` has been stable since ES2019).

Which algorithm? Merge sort is the safe answer: `O(n log n)` **guaranteed**, stable by
construction, and easy to prove. Quicksort is faster in practice but needs a random or
median-of-three pivot to avoid `O(n²)` on sorted input, and its classic in-place partition is
not stable. State the choice; the reasoning is part of the answer.

### Examples

```text
sortArray([5, 2, 9, 1, 5, 6])         // => [1, 2, 5, 5, 6, 9]
sortArray([3, 1, 2])                  // => [1, 2, 3]
sortArray([])                         // => []
sortArray([7])                        // => [7]
sortArray([2, 1, 1, 2])               // => [1, 1, 2, 2]
sortArray([3, 1, 2], (a, b) => b - a) // => [3, 2, 1]  (comparator honoured)
sortArray([10, 2, 1])                 // => [1, 2, 10] (numeric, not lexicographic)
```

### Approach

Merge sort in three parts:

1. **Base case:** an array of length `0` or `1` is already sorted; return it to stop the
   recursion.
2. **Divide:** split at `mid = length >> 1` and recursively sort both halves. The halves are
   disjoint, so each is independently sorted.
3. **Merge:** the `mergeSorted` walk from the previous problem. Using `compare(...) <= 0` keeps
   ties in left-before-right order, which is exactly stability.

Why merge sort over quicksort here:

- **Guaranteed** `O(n log n)`; quicksort degrades to `O(n²)` on already-sorted input unless
  the pivot is randomized.
- **Stable** with no extra bookkeeping; a classic in-place quicksort partition is not, and
  making it stable means tagging each element with its original index.
- The merge is the function you just wrote, so the code stays short and the invariant is easy
  to state.

Comparator handling must mirror the spec: coerce with `Number` and treat `NaN` as `0` (a
comparator returning `NaN` means "equal"). Skipping that turns a broken comparator into
arbitrary output instead of deterministic output.

Numbers gotcha: the **default** `Array.prototype.sort` compares strings, so `[10, 2, 1]` sorts
to `[1, 10, 2]`. Our default comparator is numeric (`a < b ? -1 : a > b ? 1 : 0`), which is
what an interviewer usually wants; say so explicitly so it is not read as a bug.

### Implementation

```javascript
const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // numeric, NaN -> 0

function sortArray(array, compare = defaultCompare) {
  if (!Array.isArray(array)) throw new TypeError("sortArray expects an array");
  if (typeof compare !== "function") throw new TypeError("compare must be a function");

  // Normalize the comparator once: Number(...), and NaN -> 0 per the sort spec.
  const order = (a, b) => {
    const result = Number(compare(a, b));
    return Number.isNaN(result) ? 0 : result < 0 ? -1 : result > 0 ? 1 : 0;
  };

  const merge = (left, right) => {
    const merged = new Array(left.length + right.length);
    let i = 0;
    let j = 0;
    let k = 0;

    while (i < left.length && j < right.length) {
      // `<= 0` keeps the sort stable: equal elements stay in original order.
      merged[k++] = order(left[i], right[j]) <= 0 ? left[i++] : right[j++];
    }
    while (i < left.length) merged[k++] = left[i++];
    while (j < right.length) merged[k++] = right[j++];
    return merged;
  };

  const divide = (items) => {
    if (items.length <= 1) return items;       // base case: already sorted
    const mid = items.length >> 1;             // integer half
    return merge(divide(items.slice(0, mid)), divide(items.slice(mid)));
  };

  return divide(array.slice());                // copy: the caller's array is untouched
}
```

Quicksort for contrast — average `O(n log n)`, worst `O(n²)`, **not stable**, but `O(log n)`
stack and fast in practice:

```javascript
function quickSort(array, compare = defaultCompare) {
  const items = array.slice();

  const partition = (lo, hi) => {
    // Random pivot so sorted or reverse-sorted input cannot trigger the quadratic case.
    const pivotIndex = lo + Math.floor(Math.random() * (hi - lo + 1));
    [items[pivotIndex], items[hi]] = [items[hi], items[pivotIndex]];
    const pivot = items[hi];

    let store = lo;
    for (let i = lo; i < hi; i += 1) {
      if (compare(items[i], pivot) < 0) {
        [items[store], items[i]] = [items[i], items[store]];
        store += 1;
      }
    }
    [items[store], items[hi]] = [items[hi], items[store]];
    return store;
  };

  const sort = (lo, hi) => {
    if (lo >= hi) return;                      // base case: 0 or 1 element
    const pivot = partition(lo, hi);
    sort(lo, pivot - 1);
    sort(pivot + 1, hi);
  };

  sort(0, items.length - 1);
  return items;
}
```

### Walkthrough

`sortArray([5, 2, 9, 1])` (`mid = 4 >> 1 = 2` at the top):

1. `divide([5, 2, 9, 1])`: `mid = 2` → `divide([5, 2])` and `divide([9, 1])`.
2. `divide([5, 2])`: `mid = 1` → `divide([5])` = `[5]`, `divide([2])` = `[2]`; merge:
   `order(5, 2) = 1 > 0`, so take `2`, then `5` → `[2, 5]`.
3. `divide([9, 1])`: merge `[9]` and `[1]`: `order(9, 1) = 1 > 0`, take `1`, then `9` →
   `[1, 9]`.
4. `merge([2, 5], [1, 9])`: `order(2, 1) = 1 > 0` → take `1`; `order(2, 9) = -1 <= 0` → take
   `2`; `order(5, 9) = -1 <= 0` → take `5`; `left` is exhausted → copy `9`. Result
   `[1, 2, 5, 9]`.

Stability check with `[{ k: 1, n: "a" }, { k: 1, n: "b" }]` and `compare = (x, y) => x.k - y.k`:
`order` returns `0`, the `<= 0` branch takes the left element first, so `"a"` stays before
`"b"` — the property a naive quicksort loses.

### Complexity

Merge sort: time `O(n log n)` in **all** cases; space `O(n)` for the merged arrays plus
`O(log n)` recursion depth. Quicksort: `O(n log n)` expected, `O(n²)` worst, `O(log n)` stack,
but not stable. Insertion sort is `O(n²)` yet the fastest for tiny `n`, which is why real
implementations switch strategies below a threshold.

### Edge Cases

- Empty and single-element arrays hit the base case immediately; no merge runs.
- All-equal elements: every comparison is `0`, the stable `<= 0` branch preserves order, and
  the sort is still `O(n log n)`.
- Already sorted: merge sort does not degrade, unlike a fixed-pivot quicksort.
- Reverse sorted: same complexity, just different merge choices.
- `NaN` with the default comparator → `order` returns `0`, so `NaN` compares "equal" to
  everything and is not part of a total order. Document it; `Array.prototype.sort` behaves the
  same way.
- Holes: `array.slice()` keeps holes, and recursion turns them into `undefined` values at
  merge time. Native `sort` moves holes to the end; match that if it matters.
- A throwing comparator propagates mid-recursion, but the caller's array is untouched because
  we sort a copy.
- Large arrays: many small allocations; production merge sort reuses one scratch buffer.
- `-0` vs `0`: the default comparator treats them as equal, so stability keeps input order —
  unlike `Object.is`, which distinguishes them.

### Interview Follow-ups

- **Quicksort with a random pivot** (above), and why randomization defeats the adversarial
  sorted-input case.
- **Three-way partition (Dutch national flag):** handles many duplicates in `O(n)` per
  partition, avoiding quicksort's duplicate pathology.
- **Insertion sort below a threshold** (`n <= 16`): the hybrid strategy behind Timsort, which is
  what V8 actually uses.
- **Heap sort:** `O(1)` extra space and `O(n log n)` guaranteed, but not stable and less
  cache-friendly.
- **Non-comparison sorts:** counting sort and radix sort are `O(n + k)` for bounded integers —
  faster than `O(n log n)` when the key range is small.
- **Stable quicksort:** tag elements with their original index and break comparator ties by
  index.

### Common Mistakes

- No base case (`length <= 1`), causing infinite recursion and a stack overflow.
- `mid = items.length / 2` (fractional), so `slice` splits oddly; use `>> 1` or `Math.floor`.
- Spreading `[...left, ...right]` inside the merge instead of a preallocated write, or
  re-sorting the halves instead of merging them.
- Using `< 0` in the merge tie-break, silently losing stability.
- Forgetting `array.slice()`, so the caller's array is mutated or partially sorted.
- Assuming `Array.prototype.sort`'s default is numeric; it is lexicographic, which is why
  `[10, 2, 1]` needs a comparator.
- Claiming quicksort is `O(n log n)` worst case without the pivot caveat.

### Takeaway

Merge sort is the interview-safe answer: split at the midpoint, sort both halves, merge with
`compare(...) <= 0` so equals keep their order — guaranteed `O(n log n)` and stable. Keep `<=`
versus `<` straight, handle the base case, and copy before you touch anything.

## Shuffle an Array (Why the Naive Version Is Biased)

`Difficulty: Medium` `Probability: High`

### Problem

Implement `naiveShuffle(array)` using the famous one-liner — `[...array].sort(() =>
Math.random() - 0.5)` — and then explain precisely **why it is biased** and what to use
instead. This problem is half coding, half analysis: interviewers ask it to see whether
you understand the contract a comparison sort requires, not whether you can recite
Fisher–Yates (which is the next problem on this page).

### Examples

```text
naiveShuffle([1, 2, 3]) // => e.g. [2, 1, 3] (a permutation, but not a uniform one)
```

Over many runs with three elements, some of the six permutations appear far more often
than others. With V8's TimSort, `[1, 2, 3]` yields `[1, 3, 2]`-style outcomes with
measurably uneven frequencies — the exact skew depends on the engine's sort, which is
itself part of the lesson.

### Approach

A comparison sort is only correct if the comparator defines a **consistent ordering**:
it must be antisymmetric (`cmp(a,b)` and `cmp(b,a)` must disagree in sign) and
transitive. A random comparator violates both on every call — the sort asks "is `a`
before `b`?", gets "yes", asks again later, and gets "no". The algorithm then takes a
path through its decision tree that was never designed to be taken, and different
engines (merge sort, quicksort, TimSort, different array sizes) take *different* broken
paths, so the bias is engine-dependent and unfixable from the outside.

The empirical test is a chi-squared or even a plain frequency table: shuffle `[1, 2, 3]`
60,000 times, count the six permutations, and watch them diverge from 10,000 each.
The correct replacement is Fisher–Yates: each position `i` swaps with a uniformly random
position in `0..i`, giving every permutation probability exactly `1/n!`.

### Implementation

```javascript
function naiveShuffle(array) {
  if (!Array.isArray(array)) throw new TypeError("naiveShuffle expects an array");
  // Deliberately biased — kept here so the skew can be measured, not shipped.
  return [...array].sort(() => Math.random() - 0.5);
}

function shuffleFrequencies(array, runs = 60000) {
  const counts = new Map();
  for (let i = 0; i < runs; i += 1) {
    const key = naiveShuffle(array).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
```

### Walkthrough

For `shuffleFrequencies([1, 2, 3])`: each run produces one of the six permutations and
tallies it. A uniform shuffle would show each near `runs / 6` (≈10,000). The naive
version instead shows a spread — some permutations several thousand above expectation,
some below — and the pattern changes between engines and array lengths, because the
bias lives in the interaction between the random answers and the sort's internals,
not in any single coin flip.

### Complexity

Time: whatever the host sort costs (`O(n log n)` comparisons) plus `O(n)` randomness —
but the output distribution is wrong, so the complexity is moot. Space: `O(n)` for the
copy. The frequency harness is `O(runs · n log n)` time and `O(n!)` space for the table.

### Edge Cases

- Empty and single-element arrays shuffle to themselves under any implementation.
- The bias is invisible on tiny samples — you need thousands of runs to see it, which is
  exactly why it ships to production unnoticed.
- `Math.random()` itself is not cryptographically strong; for gambling or security,
  `crypto.getRandomValues()` is the randomness source, Fisher–Yates is still the algorithm.
- A *consistent* random key per element (`map` to `{key: Math.random(), value}`,
  `sort` by key, `map` back) is uniform — but it is `O(n log n)` where Fisher–Yates is
  `O(n)`, and equal keys need a tiebreak.

### Interview Follow-ups

- **Prove the bias:** run the frequency harness and explain which sort invariant breaks.
- **Implement Fisher–Yates:** the next problem — uniform, in place, `O(n)`.
- **Shuffle a stream (reservoir sampling):** keep `k` items, replace item `j` with
  probability `k/i` for the `i`th arrival.

### Common Mistakes

- Shipping the one-liner because "it looks random" — randomness of the comparator is
  not uniformity of the permutation.
- "Fixing" it with `sort(() => 0.5 - Math.random())` — same violation, same bias.
- Testing with ten runs and concluding it works.
- Confusing a bad *source* of randomness with a bad *algorithm* — here the algorithm is
  the problem even with perfect coin flips.

### Takeaway

`sort` with a random comparator breaks the consistency contract every comparison sort
depends on, so the result is biased in an engine-dependent way. Measure with a frequency
table, then replace it with Fisher–Yates.

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

