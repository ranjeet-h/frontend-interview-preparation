## Implement a Hash Map (Separate Chaining)

`Difficulty: Medium` `Probability: High`

### Problem

Implement a hash map from scratch with `set(key, value)`, `get(key)`, `has(key)`, `delete(key)`,
a `size` count, and iteration via `keys()`, `values()`, and `entries()`. Use **separate chaining**
(each bucket holds a list of entries) and **resize/rehash** when the load factor crosses a
threshold so operations stay amortised `O(1)`.

The contract, stated before any code:

- `set` on an existing key **overwrites** the value and must **not** change `size`.
- `get` returns `undefined` for a missing key — indistinguishable from a stored `undefined`,
  exactly like `Map.prototype.get`.
- `delete` returns `true` if the key was present, `false` otherwise.
- `size` is maintained incrementally; it never walks the buckets.
- Keys here are normalised with `String(key)`, so they are compared as strings. A real `Map`
  compares keys with **SameValueZero** and treats distinct objects as distinct keys; this
  teaching implementation does not. Say this out loud in an interview.

### Examples

```text
const m = new HashMap();
m.set("a", 1).set("b", 2).set("a", 99);
m.size            // => 2        (overwrite did not grow it)
m.get("a")        // => 99
m.get("missing")  // => undefined
m.has("b")        // => true
m.delete("b")     // => true
m.delete("b")     // => false
[...m.keys()]     // => ["a"]
```

### Approach

A hash map is an **array of buckets** plus a hash function that maps a key to a bucket index.
Separate chaining stores, at each bucket, a small list of `[key, value]` pairs. Lookup hashes the
key, then scans that one chain comparing keys.

1. **Hash.** FNV-1a over the UTF-16 code units of `String(key)`. `Math.imul` keeps the multiply
   in 32-bit space, and `>>> 0` makes the result unsigned, so the modulo below is never negative.
2. **Index.** `hash % capacity`. Only use `hash & (capacity - 1)` when capacity is a power of two.
3. **Insert.** Scan the chain for an equal key: if found, overwrite; otherwise push a new pair and
   increment `size`.
4. **Resize.** When `size / capacity > loadFactor` (typically `0.75`), allocate a bucket array
   twice as large and **rehash** every entry, because a key's index depends on capacity.

The invariant: every live key appears in exactly one bucket at the index its hash resolves to, and
`size` equals the number of pairs across all buckets. A bounded load factor keeps chains short, so
the expected chain length is `O(1)`.

### Implementation

```javascript
class HashMap {
  constructor(initialCapacity = 8, loadFactor = 0.75) {
    this.capacity = initialCapacity; // number of buckets
    this.loadFactor = loadFactor;    // resize when size / capacity exceeds this
    this.buckets = Array.from({ length: initialCapacity }, () => []);
    this.size = 0;
  }

  // FNV-1a: cheap and well-distributed for short string keys.
  static hashString(str) {
    let hash = 2166136261;                 // 32-bit offset basis
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);    // FNV prime, wraps at 32 bits
    }
    return hash >>> 0;                     // unsigned, so % is non-negative
  }

  bucketIndex(key) {
    const normalized = typeof key === "string" ? key : String(key);
    return HashMap.hashString(normalized) % this.capacity;
  }

  set(key, value) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) {
        bucket[i][1] = value;              // overwrite: size is unchanged
        return this;
      }
    }
    bucket.push([key, value]);
    this.size += 1;
    if (this.size / this.capacity > this.loadFactor) this.#resize();
    return this;
  }


  get(key) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) return bucket[i][1];
    }
    return undefined;
  }

  has(key) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) return true;
    }
    return false;
  }

  delete(key) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) {
        bucket.splice(i, 1);               // O(chain length), not O(capacity)
        this.size -= 1;
        return true;
      }
    }
    return false;
  }

  *keys() {
    for (const bucket of this.buckets) for (const [key] of bucket) yield key;
  }
  *values() {
    for (const bucket of this.buckets) for (const [, value] of bucket) yield value;
  }
  *entries() {
    for (const bucket of this.buckets) for (const entry of bucket) yield entry;
  }
  [Symbol.iterator]() {
    return this.entries();
  }

  #resize() {
    const oldBuckets = this.buckets;
    this.capacity *= 2;
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.size = 0;                         // re-set entry by entry so the count is exact
    for (const bucket of oldBuckets) {
      for (const [key, value] of bucket) this.set(key, value);
    }
  }
}
```

### Walkthrough

Take `capacity = 4`, `loadFactor = 0.75` (resize when `size > 3`). With this FNV-1a, the indices at
capacity 4 are `"a" -> 0`, `"b" -> 1`, `"c" -> 2`, `"d" -> 3`.

1. `set("a", 1)` → bucket 0 empty → push; `size = 1`.
2. `set("b", 2)` → bucket 1; `size = 2`.
3. `set("c", 3)` → bucket 2; `size = 3`. `3 / 4 = 0.75`, which is **not** `> 0.75`, so no resize.
4. `set("d", 4)` → bucket 3; `size = 4`. `4 / 4 = 1 > 0.75` → `#resize`.
5. `#resize` doubles capacity to 8, empties the buckets, resets `size = 0`, and re-inserts all four
   keys. Their indices are recomputed modulo 8: `"a" -> 4`, `"b" -> 5`, `"c" -> 2`, `"d" -> 3`.

The rehash is mandatory: `"a"` sat in bucket 0 at capacity 4 and must move to bucket 4 at capacity 8,
because the index is `hash % capacity`, not a fixed slot.

To see chaining, at capacity 8 the keys `"a"`, `"age"`, `"ega"`, and `"eman"` all hash to bucket 4.
`set` appends each as a new pair, and `get("ega")` walks bucket 4 comparing keys until it reaches
`"ega"` — three comparisons. With more keys, resize keeps that chain short.

### Complexity

Time: `set`/`get`/`has`/`delete` are **`O(1)` expected**, `O(n)` worst case when every key collides
into one chain. `#resize` is `O(n)`, but it happens after `Ω(capacity)` inserts, so the amortised
cost per insert is `O(1)`. Space: `O(n + capacity)` — `n` pairs plus the bucket array.

### Edge Cases

- **Object keys collapse.** `String({}) === "[object Object]"`, so all plain objects land in one
  bucket and overwrite each other. This version only claims string/number keys.
- **`NaN` keys break equality.** `String(NaN) === "NaN"` puts it in a bucket, but `NaN === NaN` is
  `false`, so `get(NaN)` never finds it. A real `Map` uses SameValueZero; fix with
  `a === b || (a !== a && b !== b)`.
- **`-0` and `0`** normalise to `"0"` and compare equal, matching SameValueZero (not `Object.is`).
- **Stored `undefined`** is indistinguishable from a missing key in `get`, just like `Map`. Use
  `has` to disambiguate.
- **Iteration order changes on resize.** Chaining yields bucket order, so entries jump around. A
  real `Map` guarantees insertion order; keep a linked list alongside the buckets if you need it.
- **Shrinking is not handled.** Deleting many keys leaves a large, sparse bucket array. Add
  `#resizeDown` when `size / capacity < 0.1`.
- **A chain longer than expected** means a weak hash or a hostile key set; consider a tree per
  bucket (Java-style) to bound the worst case at `O(log n)`.
- **`size` is a plain field**, so callers can corrupt it. A real implementation hides it behind a
  getter and a private counter.

### Interview Follow-ups

- **Open addressing instead of chaining:** probe linearly (`(index + i) % capacity`) and store the
  key in the slot itself; delete needs tombstones or you break probe chains.
- **LRU-ordered map:** thread a doubly linked list through the entries so `get` can move a key to
  the front in `O(1)` — this is exactly the next-but-one problem.
- **SameValueZero keys:** keep a wrapper object per key and compare with `===` (objects are unique),
  or store a `Map` of primitives.
- **Why 0.75?** Lower load factors mean shorter chains but more memory; 0.75 is the usual
  time/space compromise (`HashMap` in Java uses the same default).
- **Production:** use `Map`. Its hashing is native, ordered, and handles arbitrary keys.

### Common Mistakes

- Forgetting `>>> 0`, so a negative hash indexes `buckets[-3]` and silently vanishes.
- Using `& (capacity - 1)` without a power-of-two capacity.
- Recomputing `size` by scanning on every call instead of maintaining it.
- Resetting `size = 0` in `#resize` and then forgetting that `set` must re-count, ending at `0`.
- Comparing keys with `==`, which merges `1` and `"1"` inconsistently with the hash normalisation.

### Takeaway

A hash map is an array of chains plus a hash function and a load factor. `set` overwrites, `get`
scans one chain, and `#resize` rehashes everything because the index depends on capacity. Get the
SameValueZero and iteration-order caveats right and you have described `Map`.

## Implement a Set

`Difficulty: Easy` `Probability: High`

### Problem

Implement a `Set`: `add(value)`, `has(value)`, `delete(value)`, `clear()`, a `size` getter, and
iteration via `values()`/`keys()`/`forEach()`/`Symbol.iterator`. Membership must be `O(1)` on
average, duplicates must collapse, and the `add`/`delete` chaining style of the native API is worth
preserving.

Contract:

- `add` on a value that already exists is a **no-op** and does not change `size`.
- `add` returns the set, so `s.add(1).add(2)` chains; `delete` returns a boolean.
- `Set` has **no indices**, so `values()` and `keys()` are the same iterator (unlike `Map`).
- `forEach(callback, thisArg)` calls `callback.call(thisArg, value, value, set)`; the return value
  is ignored. The order is insertion order for a native `Set`.
- Membership uses **SameValueZero**: `NaN` equals `NaN`, and `-0` equals `0`.

Reuse the `HashMap` from the previous problem: a set is a map whose keys and values are the same
value. That is not a shortcut — it is how `Set` is specified relative to `Map`.

### Examples

```text
const s = new HashSet();
s.add(1).add(2).add(2);
s.size            // => 2       (duplicate ignored)
s.has(2)          // => true
s.delete(2)       // => true
s.delete(2)       // => false
[...s]            // => [1]

const a = new HashSet(); a.add(1); a.add(2);
const b = new HashSet(); b.add(2); b.add(3);
[...a.union(b)]        // => [1, 2, 3]
[...a.intersection(b)] // => [2]
[...a.difference(b)]   // => [1]
```

### Approach

A set is a map with no values, so delegate all membership work to `HashMap` and add only the set
vocabulary.

1. Store `key -> key` so the map's overwrite-on-existing behaviour *is* the set's no-op-on-duplicate
   behaviour, and `size` is maintained for free.
2. `values()` `yield*` the map's keys; `keys()` is an alias, because a set has no separate index.
3. `forEach` mirrors the native signature `(value, value, set)` and honours `thisArg` with `.call`.
4. `[Symbol.iterator]` returns `values()`, which is what makes `[...set]`, `for...of`, and `new
   Set(iterable)` work.
5. Bulk operations reuse iteration: `union` adds both sides, `intersection` iterates the **smaller**
   set and probes the larger one (fewer lookups), `difference` keeps values the other set lacks.

The alternative — a plain object keyed by `String(value)` — collapses `1` and `"1"`, cannot represent
`NaN`, and is vulnerable to prototype keys. Delegating to the hash map is the honest design; the
cost is the same normalisation caveat noted in that problem.

### Implementation

```javascript
class HashSet {
  constructor(initialCapacity = 8) {
    this.map = new HashMap(initialCapacity); // key -> key
  }

  get size() {
    return this.map.size;
  }

  add(value) {
    this.map.set(value, value); // overwriting is the duplicate no-op
    return this;
  }

  has(value) {
    return this.map.has(value);
  }

  delete(value) {
    return this.map.delete(value);
  }

  clear() {
    this.map = new HashMap();
    return this;
  }


  *values() {
    yield* this.map.keys(); // a set keeps no values of its own
  }

  keys() {
    return this.values(); // native Set.keys === Set.values
  }

  forEach(callback, thisArg) {
    for (const value of this.values()) {
      callback.call(thisArg, value, value, this); // (value, value, set)
    }
  }

  [Symbol.iterator]() {
    return this.values();
  }

  union(other) {
    const result = new HashSet();
    for (const value of this) result.add(value);
    for (const value of other) result.add(value);
    return result;
  }

  intersection(other) {
    const result = new HashSet();
    // Iterate the smaller set so total lookups are min(|a|, |b|).
    const [small, large] = this.size <= other.size ? [this, other] : [other, this];
    for (const value of small) if (large.has(value)) result.add(value);
    return result;
  }

  difference(other) {
    const result = new HashSet();
    for (const value of this) if (!other.has(value)) result.add(value);
    return result;
  }
}
```

### Walkthrough

`s.add(1).add(2).add(2)` with capacity 8: FNV-1a puts `1` in some bucket and `2` in another.

1. `add(1)` → `map.set(1, 1)` → bucket empty → push; `map.size = 1`; `add` returns `s`.
2. `add(2)` → new key → push; `map.size = 2`.
3. `add(2)` again → `set` finds the existing pair, overwrites the value (`2 -> 2`), returns without
   incrementing, so `s.size` stays `2` and the set has no duplicate.

Now `intersection`: `a = {1, 2}`, `b = {2, 3}`, both size 2, so `small = a`. The loop probes
`b.has(1)` → `false` (skip), then `b.has(2)` → `true` (add). Result iterates as `[2]`.

### Complexity

Time: `add`/`has`/`delete` are `O(1)` expected (delegated to the hash map), `O(n)` worst case on hash
collisions. `forEach`/`values` are `O(capacity + n)`. `union` is `O(n + m)`, `intersection` and
`difference` are `O(min(n, m))` lookups. Space: `O(n)`.

### Edge Cases

- **Duplicate adds are no-ops** — guaranteed by the map's overwrite path, not by an extra `has`
  check (which would double the hashing cost).
- **`NaN` and `-0`:** the set inherits the map's caveat. Native `Set` stores `NaN` once and treats
  `-0`/`0` as one value; this version cannot until the key comparison uses SameValueZero.
- **Object values collapse** to one entry because `String({})` is constant. Fine for primitive
  membership, wrong for object identity.
- **`forEach` mutation:** adding during iteration may or may not be visited, depending on buckets
  and resize. Native `Set` visits values added before iteration ends; do not rely on it.
- **`clear()` replaces the backing map**, so iterators created before the call keep yielding from
  the old buckets — again unlike native, where they finish against the live set.
- **`new HashSet(iterable)`** is not implemented; a native-style constructor would loop the iterable
  and `add` each element.
- **Empty set operations:** `union` with an empty set copies the other side; `intersection` with an
  empty set is `O(1)` because the smaller side has size 0.

### Interview Follow-ups

- **`new HashSet(iterable)` + `size` from a getter** is most of the native constructor; add the
  loop and you can consume any iterable.
- **`isSubsetOf` / `isSupersetOf`:** iterate the candidate subset and probe the other set, returning
  early on the first miss.
- **Symmetric difference:** `union` minus `intersection`, or iterate both sets and add values the
  other lacks.
- **Object identity without SameValueZero:** assign each object a `Symbol`/`WeakMap` id, or keep a
  `Map` keyed by the object itself.
- **Production:** use native `Set`; it is ordered, handles arbitrary keys, and its bulk methods
  (`union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`) exist in ES2025.

### Common Mistakes

- Reimplementing membership with `indexOf`, which is `O(n)` and uses `===` (so `NaN` never matches).
- Adding a `has` check before `add` — redundant, because `add` already dedupes.
- Using an object keyed by `value` without guarding `__proto__`, `constructor`, and `toString`.
- Forgetting that `Set.keys` and `Set.values` are the same function.
- Building `union`/`intersection` with array methods, silently allowing duplicates.

### Takeaway

A set is a map with the value doubling as the key: dedupe and `size` come from the map's overwrite
rule, and iteration comes from its keys. The only genuinely set-specific decisions are SameValueZero
key comparison and the `(value, value, set)` `forEach` signature.

## Implement an LRU Cache

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `LRUCache(capacity)` with `get(key)` and `put(key, value)`, both **`O(1)`**. The cache
holds at most `capacity` entries; `get` returns the value (or `-1` when absent) and marks the key as
**most recently used**; `put` inserts or updates and marks the key most recent, evicting the
**least recently used** key when the cache is full.

Contract:

- `capacity` must be a positive integer; otherwise throw.
- `get` on a missing key returns `-1` and does **not** disturb recency.
- `put` on an existing key updates the value and promotes it; it must not evict.
- Eviction removes exactly one key, the least recently used, only when inserting a **new** key into
  a full cache.
- Both operations are `O(1)` — no scanning to find the LRU.

The trick is that JavaScript's `Map` **preserves insertion order**, so the oldest key is always the
first one the iterator yields.

### Examples

```text
const lru = new LRUCache(2);
lru.put(1, 1);   // cache: {1=1}
lru.put(2, 2);   // cache: {1=1, 2=2}
lru.get(1);      // => 1     (1 becomes most recent: {2=2, 1=1})
lru.put(3, 3);   // evicts 2 (LRU)          -> {1=1, 3=3}
lru.get(2);      // => -1
lru.get(3);      // => 3
lru.put(3, 30);  // update, no eviction     -> {1=1, 3=30}
lru.put(4, 4);   // evicts 1                -> {3=30, 4=4}
```

### Approach

`Map` is a hash table **plus a linked list of entries in insertion order**, so iteration is ordered
and `delete`/`set` are `O(1)`. Use that order as the recency order: the first iterated key is the
least recently used, the last is the most recently used.

- **Why `Map` preserves insertion order:** the spec stores entries in `[[MapData]]`, an ordered
  list. `Map.prototype.set` on a **new** key appends an entry; on an **existing** key it updates the
  value in place and leaves the position untouched. Iteration (`keys`, `values`, `entries`,
  `forEach`, `Symbol.iterator`) walks that list start to end. So reordering requires removing and
  re-adding the key — you cannot promote an existing key by calling `set` again.
- **The re-insertion trick:** to mark a key most recent, `delete` it, then `set` it again. The fresh
  entry is appended at the end, which is the MRU end. This is the whole LRU mechanism.
- **Eviction:** when a new key arrives at capacity, read `cache.keys().next().value` — the first key
  in insertion order, i.e. the LRU — and `delete` it.
- Do the `has` check for `get` rather than comparing `get(...) === undefined`, because a stored
  `undefined` is a legitimate value.

The alternative — a doubly linked list of nodes plus a hash map from key to node — does the same in
`O(1)` with explicit pointers and is what you write when the language has no ordered map. Mention it;
the `Map` version is shorter and just as correct.

### Implementation

```javascript
class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.capacity = capacity;
    this.cache = new Map(); // key -> value; insertion order = LRU ... MRU
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    const value = this.cache.get(key);
    this.cache.delete(key); // drop the old, older position ...
    this.cache.set(key, value); // ... and append at the MRU end
    return value;
  }


  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key); // remove so the re-insert lands at the MRU end
    } else if (this.cache.size >= this.capacity) {
      const lru = this.cache.keys().next().value; // first iterated key = least recent
      this.cache.delete(lru);
    }
    this.cache.set(key, value);
  }

  // Handy for debugging and tests: LRU -> MRU.
  keys() {
    return [...this.cache.keys()];
  }
}
```

### Walkthrough

`new LRUCache(2)`, then `put(1, 1)`, `put(2, 2)`, `get(1)`, `put(3, 3)`:

1. `put(1, 1)`: not present, `size(0) < 2` → `set` appends. Map order `1`.
2. `put(2, 2)`: not present, `size(1) < 2` → append. Map order `1, 2`.
3. `get(1)`: present → `delete(1)` then `set(1, 1)`; the entry is appended after `2`. Order `2, 1`.
   `1` is now MRU, `2` is LRU.
4. `put(3, 3)`: new key and `size(2) >= 2`, so evict `keys().next().value` = `2`. Order `1`, then
   append `3` → `1, 3`.
5. `get(2)` → `-1`; `get(3)` → `3`; `put(3, 30)` finds `3` present, deletes and re-adds it, so no
   eviction and order becomes `1, 30`; `put(4, 4)` evicts `1` and yields `3, 4`.

The recency list is exactly `Map`'s insertion order at every step — no extra bookkeeping.

### Complexity

Time: `get` and `put` are `O(1)` expected — `Map.has/get/set/delete` are `O(1)`, and
`keys().next()` is `O(1)`. Space: `O(capacity)` entries.

### Edge Cases

- **Capacity 1:** `put` on a new key first evicts the single resident, then inserts; every `put` of
  a new key replaces the cache.
- **Updating an existing key** must not evict: the `has` branch removes the old entry, bringing the
  size to `capacity - 1` before the insert.
- **Stored `undefined`:** `get` uses `has`, so `get(k)` returns `undefined` for a present key and
  `-1` for a miss. Returning `undefined` for a miss (as `Map.get` would) loses that distinction.
- **`NaN`, `-0`, object keys:** `Map` uses SameValueZero, so all three behave natively — one of the
  reasons to prefer `Map` over a hand-rolled hash map here.
- **`get` on a miss does not reorder** the cache; only hits promote.
- **Double lookup in `get`:** `has` + `get` hashes twice. If values are never `undefined`, a single
  `get` plus an `undefined` check is faster, at the cost of the ambiguity above.
- **Eviction callback:** production caches often need `onEvict(key, value)`; call it from the
  `delete(lru)` branch.
- **Large `capacity`** does not preallocate; `Map` grows on demand.

### Interview Follow-ups

- **Doubly linked list + hash map:** store `{key, value, prev, next}` nodes and a `head`/`tail`
  sentinel; `get` unlinks and relinks to the tail, eviction drops the head. Same `O(1)`, and it is
  the expected answer when the interviewer forbids relying on `Map` order.
- **LFU instead of LRU:** keep a frequency count per key (a min-heap or frequency buckets) and evict
  the least frequently used, breaking ties by recency.
- **TTL + LRU:** add an expiry timestamp per entry and check it in `get`; this is the next problem.
- **Resizing capacity:** shrinking must evict from the LRU end until `size <= capacity`.
- **Concurrency:** a single-threaded event loop makes JS LRU caches race-free per tick, but async
  `onEvict` handlers can interleave — note that if asked.

### Common Mistakes

- Using an array with `push`/`shift`: `shift` is `O(n)`, so `put` becomes `O(n)`.
- Relying on `map.set` to promote an existing key — it does **not** change insertion order, so
  recency silently stops updating.
- Forgetting to promote on `get`, which degrades the cache to FIFO.
- Finding the LRU by iterating (`for (const k of map.keys()) last = k`), which is `O(n)`.
- Checking `this.cache.get(key) === undefined` and therefore treating a stored `undefined` as a miss.
- Evicting before checking whether the key already exists.

### Takeaway

`Map`'s insertion order is a ready-made recency list, and `delete` + `set` is the `O(1)` "move to
most recent" operation. Get the promotion and eviction order right and the whole cache is ten lines.

## Implement a TTL Cache

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `TTLCache(ttlMs)` where every entry expires `ttlMs` after it is written. Support
`set(key, value, ttl?)`, `get(key)`, `has(key)`, `delete(key)`, `clear()`, a `size` getter, and
`sweep()` to proactively drop expired entries. Set `ttl` per entry, defaulting to the cache's TTL.

Contract:

- An entry is **expired** when `Date.now() >= expiresAt` (`<=` in the "expiresAt is past" sense);
  pick one boundary and keep it consistent.
- `get` on an expired key removes the entry and returns `undefined`; `has` returns `false` and also
  removes it. Expiry is enforced on **access** even if `sweep` never runs.
- `size` is the raw map size, so it may count entries that are expired but not yet removed. Call
  `sweep()` first if the caller needs a live count.
- `set` on an existing key **resets** its deadline (new value, new expiry, new position).

Two strategies, and you should name both: **lazy expiry** (check the timestamp whenever a key is
read, delete on the spot) and **eager expiry** (a timer calls `sweep()` periodically so memory is
bounded even for keys nobody reads). Production caches usually combine them.

### Examples

```text
const cache = new TTLCache(1000);        // entries live 1000 ms
cache.set("a", 1);                        // at t = 0    -> expires at 1000
cache.set("b", 2, 5000);                  // at t = 0    -> expires at 5000
cache.get("a");                           // => 1        (t = 900, still live)
cache.get("a");                           // => undefined (t = 1100, expired + removed)
cache.has("b");                           // => true
cache.size;                               // => 1
cache.sweep();                            // => 0 removed (b is still live)
cache.set("c", 3, 0);                     // ttl 0 -> already expired on next access
```

### Approach

Store a wrapper per entry: `{ value, expiresAt }`. `expiresAt` is an absolute timestamp, computed
once when the entry is written — never a countdown that you decrement, which would drift and touch
every entry on every tick.

1. **Absolute deadlines.** `expiresAt = Date.now() + ttl`. Absolute values compare in `O(1)` and do
   not need per-entry maintenance.
2. **Lazy check on read.** `get`/`has` compute `Date.now()` and compare. Expired entries are deleted
   in place, so the common path stays `O(1)` and a read-heavy cache reaches a steady state.
3. **Sweep for the untouched.** A key nobody reads would otherwise live forever. `sweep()` walks the
   map once (deleting the current entry during `Map` iteration is safe) and removes the stale ones.
   Drive it from a timer in production: `setInterval(() => cache.sweep(), intervalMs)`.
4. **`maxSize` as a backstop.** A shallow sweep cannot bound a flood of writes to never-read keys;
   evict FIFO once the map exceeds `maxSize` (combine with LRU for full semantics).

Clock honesty: `Date.now()` is wall-clock and can jump backwards (NTP, manual change), making an
entry live longer or expire early. `performance.now()` is monotonic and better for durations, but it
is relative to the process, so data persisted across reloads still needs `Date.now()`. State the
choice.

### Implementation

```javascript
class TTLCache {
  constructor(ttlMs, { maxSize = Infinity, onExpire } = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("ttlMs must be a positive number");
    }
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;   // FIFO backstop so unread keys cannot grow forever
    this.onExpire = onExpire;
    this.entries = new Map(); // key -> { value, expiresAt }
  }

  #isExpired(entry, now = Date.now()) {
    return entry.expiresAt <= now;
  }


  set(key, value, ttlMs = this.ttlMs) {
    this.entries.delete(key); // re-insert so the position is fresh
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.entries.size > this.maxSize) {
      this.#evict(this.entries.keys().next().value); // FIFO backstop
    }
    return this;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;   // absent
    if (this.#isExpired(entry)) {                // present but stale
      this.#evict(key);
      return undefined;
    }
    return entry.value;                          // note: entry is always an object,
  }                                              // so `undefined` unambiguously means "absent"

  has(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    if (this.#isExpired(entry)) {
      this.#evict(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size; // may include expired, unswept entries
  }

  sweep() {
    const now = Date.now(); // one clock read for the whole pass
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key); // deleting the current entry mid-iteration is safe
        this.onExpire?.(key, entry.value);
        removed += 1;
      }
    }
    return removed;
  }

  #evict(key) {
    const entry = this.entries.get(key);
    if (entry !== undefined) {
      this.entries.delete(key);
      this.onExpire?.(key, entry.value);
    }
  }
}
```

### Walkthrough

`const cache = new TTLCache(1000)` and a running clock:

1. At `t = 0`, `set("a", 1)` → `entries` holds `"a" -> { value: 1, expiresAt: 1000 }`.
2. At `t = 0`, `set("b", 2, 5000)` → `"b" -> { value: 2, expiresAt: 5000 }`; the per-entry TTL
   overrides the default.
3. At `t = 900`, `get("a")`: `#isExpired` compares `1000 <= 900` → `false`, so it returns `1` and
   leaves the entry in place.
4. At `t = 1100`, `get("a")`: `1000 <= 1100` → `true`, so `#evict("a")` removes it and `get`
   returns `undefined`.
5. At `t = 1100`, `size` is `1` — `"b"` remains — and `sweep()` finds `5000 <= 1100` false, so it
   removes nothing and returns `0`.
6. `set("c", 3, 0)` sets `expiresAt = now + 0`, so the very next `get("c")` sees `now <= now` and
   removes it. A non-positive per-entry TTL is an entry that expires immediately, not an error.

If `maxSize` were `2`, step 6 would first evict `"b"` (the oldest insertion) because inserting `"c"`
would push `size` to `3`.

### Complexity

Time: `set`, `get`, `has`, `delete` are `O(1)` expected (one `Map` operation plus one clock read).
`sweep` is `O(n)`. Space: `O(n)` for live entries, and unbounded in principle until `sweep` or
`maxSize` runs.

### Edge Cases

- **Expired but unswept keys still count in `size`.** Lazy expiry only removes what is accessed; call
  `sweep()` before trusting `size`, or track a live counter.
- **Boundary condition:** `expiresAt <= now` makes an entry expire at exactly its deadline. Using
  `<` makes it live one millisecond longer. Pick one and test the boundary.
- **`ttl <= 0`:** rejected in the constructor, but allowed per entry, where it means "expire on the
  next access."
- **`Date.now()` moves backwards** (NTP correction, DST is irrelevant since it is UTC epoch
  milliseconds, but manual changes matter). Entries can outlive their TTL. `performance.now()` is
  monotonic; use it for duration, `Date.now()` when the expiry must survive a reload.
- **Interval leak:** an eager `setInterval` keeps a Node process alive. Call `.unref()` in Node and
  `clearInterval` in `clear()`/`dispose()`. Browsers have no `unref`.
- **Storing `undefined` as a value** is fine here: the map holds an entry *object*, so
  `entries.get(key) === undefined` means "absent", never "present with `undefined`".
- **`onExpire` throwing** propagates out of `get`/`sweep`; wrap it if the cache must stay alive.
- **Many short-lived keys** can grow the map faster than sweeping; enforce `maxSize`.

### Interview Follow-ups

- **Combine TTL with LRU:** order by recency for eviction and check the deadline on read, so hot keys
  survive and stale ones die.
- **Sliding expiration:** on `get`, if the entry is live, push `expiresAt` forward — turns a fixed
  TTL into an idle timeout.
- **Clock abstraction:** inject `now: () => number` so tests can advance time without real timers.
- **Bounded memory without a timer:** cap `maxSize` and sweep probabilistically every `k` writes
  (sampled expiry), the trick Redis uses.
- **`WeakRef`/`FinalizationRegistry`:** only for object-keyed caches; do not use finalizers for
  correctness-critical eviction.

### Common Mistakes

- Decrementing a countdown per tick instead of storing an absolute `expiresAt`.
- Using one shared `setTimeout` whose delay equals the first TTL, then expecting later entries to
  expire on time.
- Never deleting expired entries, so the "cache" leaks memory for keys nobody reads.
- Computing `Date.now()` once at module load and comparing against a frozen `now`.
- Forgetting that `size` counts expired entries, and reporting unbounded growth.
- Trusting `Date.now()` for durations across reloads or suspend/resume.

### Takeaway

Store an absolute `expiresAt` per entry, enforce it lazily on access, and sweep periodically so
keys nobody touches can still die. State your clock and boundary choices, and add `maxSize` as the
backstop that makes memory provably bounded.

## Implement a Trie

`Difficulty: Medium` `Probability: High`

### Problem

Implement a `Trie` with `insert(word)`, `search(word)`, and `startsWith(prefix)`.

Contract:

- `insert` adds a word, creating one node per character; the node reached by the last character is
  flagged as a **word terminator**.
- `search(word)` is `true` only when the walk consumes every character **and** the final node is a
  terminator. `"app"` is not a word just because `"apple"` was inserted.
- `startsWith(prefix)` is `true` when the walk consumes every character, regardless of the
  terminator — it only asks whether the path exists.
- The **terminator flag** is the whole difference between the two queries. Without it, a trie cannot
  distinguish "this is a word" from "this is a prefix of a longer word".
- Use `for...of` (code points), not `split("")` (UTF-16 units), so an emoji is one node. Combining
  and ZWJ sequences still need `Intl.Segmenter` if you claim grapheme correctness.

### Examples

```text
const t = new Trie();
t.insert("app").insert("apple").insert("apt");

t.search("app")       // => true
t.search("ap")        // => false   (path exists, but no terminator)
t.search("apple")     // => true
t.search("apples")    // => false
t.startsWith("ap")    // => true
t.startsWith("aq")    // => false
t.search("")          // => false   (empty string was never inserted)
t.startsWith("")      // => true    (the empty prefix always has a path)
```

### Approach

A trie is a tree where each edge is one character and each node represents the prefix spelled by the
path from the root. The root is the empty prefix.

1. **Node shape.** `children: Map<char, TrieNode>` plus `isEnd: boolean`. A `Map` avoids prototype
   keys entirely — using a plain object means a word containing `"__proto__"` or `"constructor"` can
   hit the prototype rather than a child. `Map` also keeps children insertion-ordered.
2. **`insert`.** Walk from the root, creating a child node whenever the next character has none, then
   set `isEnd = true` on the final node. Intermediate nodes are never terminators.
3. **`search` vs `startsWith`.** Factor out a `#walk(str)` helper that returns the node at the end of
   the path or `undefined` if it breaks. `search` requires `node && node.isEnd`; `startsWith`
   requires only `node !== undefined`. Both are the same loop with a different final test.
4. **Why the flag, not a sentinel.** Some implementations store a `"$"` child as a terminator. That
   works until a real word contains `"$"`, and it conflates edges with metadata. A boolean is
   explicit and costs one field per node.
5. **Iteration unit.** `for...of` walks code points, so an astral character (`"😀"`) is a single edge,
   matching user expectations better than `split("")`.

Invariant: the path from the root to any node spells that node's prefix, and `isEnd` is true exactly
at nodes that end an inserted word.

### Implementation

```javascript
class TrieNode {
  constructor() {
    this.children = new Map(); // char -> TrieNode (Map: no prototype keys, ordered)
    this.isEnd = false;
  }
}

class Trie {
  #root = new TrieNode();

  insert(word) {
    if (typeof word !== "string") throw new TypeError("Trie.insert expects a string");
    let node = this.#root;
    for (const char of word) { // code points: astral characters are single edges
      if (!node.children.has(char)) node.children.set(char, new TrieNode());
      node = node.children.get(char);
    }
    node.isEnd = true;
  }

  #walk(str) {
    let node = this.#root;
    for (const char of str) {
      node = node.children.get(char);
      if (node === undefined) return undefined; // the path breaks here
    }
    return node;
  }

  search(word) {
    if (typeof word !== "string") return false;
    const node = this.#walk(word);
    return node !== undefined && node.isEnd; // full word, not just a prefix
  }

  startsWith(prefix) {
    if (typeof prefix !== "string") return false;
    return this.#walk(prefix) !== undefined; // any surviving path counts
  }
}
```

### Walkthrough

```javascript
const t = new Trie();
t.insert("apple");
t.insert("app");
t.search("apple")     // => true  (path exists, isEnd set by insert("apple"))
t.search("app")       // => true  (isEnd set by insert("app") — a word and a prefix)
t.search("appl")      // => false (path exists, but isEnd is false)
t.search("apples")    // => false (no "s" edge after "apple")
t.startsWith("ap")    // => true  (the path survives)
t.startsWith("aq")    // => false (breaks at "q")
```

Inserting `"apple"` then `"app"` shares the `a-p-p` nodes; the second insert only flips
`isEnd` on the existing `"app"` node. `search("appl")` walks to a live node whose
`isEnd` is still `false` — the exact case the flag exists for.

### Complexity

Time: `insert`/`search`/`startsWith` are each `O(m)` for a string of `m` characters —
one `Map` step per character. Space: `O(total characters)` across all nodes in the
worst case (no shared prefixes); shared prefixes are stored once, which is the point.

### Edge Cases

- Empty string: `insert("")` sets `isEnd` on the root; `search("")` is then `true`,
  `startsWith("")` is always `true`. Decide and document this.
- Words that are prefixes of other words (`"app"` vs `"apple"`) — the `isEnd` flag is
  what distinguishes them.
- `"__proto__"`, `"constructor"`, `"$"` as input: safe, because children live in a
  `Map`, not a plain object.
- Non-string input: `insert` throws; `search`/`startsWith` return `false`.
- Unicode: `for...of` iterates code points, so `"😀"` is one edge, not two surrogates.

### Interview Follow-ups

- **Autocomplete:** `startsWith(prefix)` to find the node, then DFS below it collecting
  words — `O(p + k)` for prefix length `p` and `k` results.
- **Delete a word:** unset `isEnd`, then prune childless non-terminal nodes bottom-up.
- **Count words with a prefix:** store a `passCount` on each node, incremented on insert.
- **Why not a `Set` of words?** Prefix queries would scan everything; the trie answers
  them in `O(p)`.

### Common Mistakes

- Using a plain object for children and colliding with `"__proto__"`.
- Returning `true` from `search` when the path merely exists (forgetting `isEnd`).
- Marking intermediate nodes as terminators during `insert`.
- Splitting with `split("")`, which breaks astral characters into surrogate halves.
- A `"$"` sentinel child instead of a boolean flag.

### Takeaway

A trie trades one `Map` per node for `O(m)` insert, exact search, and prefix search.
`Map` children plus an `isEnd` flag, one shared `#walk`, and code-point iteration.

## Implement a Min Heap / Max Heap

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `MinHeap` with `push(value)`, `pop()` (remove and return the smallest),
`peek()` (smallest without removing), and `size`. The contract is the heap invariant:
every parent is `<=` its children, so the minimum is always at index `0`. Store the
tree in an array (`children of i at 2i+1, 2i+2`) and restore the invariant with
sift-up on insert and sift-down on removal. A `MaxHeap` is the same code with the
comparisons flipped — say so, and implement one.

### Examples

```text
const h = new MinHeap();
h.push(5); h.push(3); h.push(8); h.push(1);
h.peek()  // => 1
h.pop()   // => 1
h.pop()   // => 3
h.peek()  // => 5
h.size    // => 2
h.pop(); h.pop();
h.pop()   // => undefined (empty)
h.peek()  // => undefined (empty)
```

### Approach

Two operations, mirror images. **Sift up** (after `push`): the new leaf may be smaller
than its parent, so compare and swap upward until the parent is smaller or you reach
the root. **Sift down** (after `pop`): move the last leaf into the root hole, then
repeatedly swap it with its *smaller* child until both children are larger or it is a
leaf. The "smaller child" choice is the detail people miss — swapping with the larger
child can leave a smaller value above a larger one, breaking the invariant.

`pop` on an empty heap returns `undefined` (no throw — state the choice). `peek` is a
pure read of index `0`.

### Implementation

```javascript
class MinHeap {
  #data = [];

  get size() { return this.#data.length; }

  peek() {
    return this.#data.length === 0 ? undefined : this.#data[0];
  }

  push(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new TypeError("MinHeap expects numbers (NaN has no ordering)");
    }
    const data = this.#data;
    data.push(value);
    let i = data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (data[parent] <= data[i]) break;
      [data[parent], data[i]] = [data[i], data[parent]];
      i = parent;
    }
  }

  pop() {
    const data = this.#data;
    if (data.length === 0) return undefined;
    const top = data[0];
    const last = data.pop();
    if (data.length > 0) {
      data[0] = last; // fill the hole, then restore downward
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < data.length && data[left] < data[smallest]) smallest = left;
        if (right < data.length && data[right] < data[smallest]) smallest = right;
        if (smallest === i) break;
        [data[smallest], data[i]] = [data[i], data[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}
```

### Walkthrough

`push(5); push(3); push(8); push(1)`:

1. `[5]`. Push `3` → `[5, 3]` → parent `5 > 3`, swap → `[3, 5]`.
2. Push `8` → `[3, 5, 8]` → parent `3 <= 8`, stop.
3. Push `1` → `[3, 5, 8, 1]` → parent of index 3 is index 1 (`5 > 1`), swap →
   `[3, 1, 8, 5]` → parent of index 1 is index 0 (`3 > 1`), swap → `[1, 3, 8, 5]`.

`pop()` → returns `1`; move last (`5`) to root → `[5, 3, 8]` → smaller child of root
is `3`, swap → `[3, 5, 8]` → children of index 1 don't exist. Stop. Root is `3`. // => 1

### Complexity

Time: `push`/`pop` are `O(log n)` — the height of the tree; `peek`/`size` are `O(1)`.
Space: `O(n)` for the array. Building a heap by repeated `push` is `O(n log n)`;
heapify from an array is `O(n)` (follow-up).

### Edge Cases

- Empty heap: `pop`/`peek` return `undefined` rather than throwing (documented choice).
- Single element: `pop` takes the `data.length > 0` skip path correctly.
- Duplicates: `<=` / strict `<` choices keep equal values stable-enough; heaps are not
  stable structures and must not promise to be.
- `NaN` is rejected: it has no ordering, so it would corrupt every comparison.
- One child missing on the last level: the bounds checks handle a lone left child.

### Interview Follow-ups

- **MaxHeap:** flip every comparison (`>=`, `>`), or take a `compare` function in the
  constructor and use it everywhere.
- **Heapify in `O(n)`:** sift down from the last parent to the root instead of pushing.
- **kth largest / top-k:** a min-heap of size `k` (used in the Arrays page).
- **Priority queue:** store `{ priority, value }` and compare on `priority`.

### Common Mistakes

- Sifting down against the *larger* child, silently breaking the invariant.
- Forgetting the `data.length > 0` guard after popping the last element (writes `last`
  back into an empty array).
- Off-by-one parent/child index math (`(i-1)>>1`, `2i+1`, `2i+2` — write them once,
  correctly).
- `peek` throwing on empty instead of returning `undefined`.
- Claiming the heap is sorted — only the root is guaranteed; use `pop` in a loop
  (heapsort) for order.

### Takeaway

A heap is an array plus two restores: sift the new leaf **up** on insert, sift the
replacement root **down** against its *smaller* child on removal. `O(log n)` both ways,
minimum always at index `0`.

