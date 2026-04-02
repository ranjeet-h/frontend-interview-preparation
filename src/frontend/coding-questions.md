# Frontend Coding Questions

Imported from `Frontend_Coding_Questions.csv`. Exact duplicate prompts were removed during generation.

## Question index

| # | Category | Question |
|---|---|---|
| 1 | EASY | [Implement a debounce function](#1-implement-a-debounce-function) |
| 2 | EASY | [Group array of objects by key](#2-group-array-of-objects-by-key) |
| 3 | EASY | [Reverse words in a string](#3-reverse-words-in-a-string) |
| 4 | MEDIUM | [Predict event loop execution order](#4-predict-event-loop-execution-order) |
| 5 | MEDIUM | [Remove duplicates efficiently](#5-remove-duplicates-efficiently) |
| 6 | MEDIUM | [Flatten a nested array](#6-flatten-a-nested-array) |
| 7 | HARD | [Implement Promise.all](#7-implement-promise-all) |
| 8 | HARD | [Implement Promise.all (rejection case)](#8-implement-promise-all-rejection-case) |
| 9 | HARD | [Deep clone an object](#9-deep-clone-an-object) |
| 10 | HARD | [Implement memoization](#10-implement-memoization) |
| 11 | HARD | [Implement LRU Cache](#11-implement-lru-cache) |
| 12 | HARD - React/Frontend | [Custom useFetch hook](#12-custom-usefetch-hook) |
| 13 | HARD - React/Frontend | [Pagination with caching](#13-pagination-with-caching) |
| 14 | HARD - React/Frontend | [Route-based code splitting](#14-route-based-code-splitting) |

---

## EASY

### 1. Implement a debounce function

**Problem summary**

A debounced function delays invoking `fn` until `delay` ms have elapsed since the last call. Rapid consecutive calls reset the timer — only the final call actually executes.

**Approach**

Maintain a `timerId` reference in the closure. On every call, clear any existing timer and schedule a new one. The inner function captures `this` and `arguments` so the debounced wrapper works as a transparent proxy.

**Implementation**

```js
function debounce(fn, delay) {
  let timerId;

  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// Usage
const log = debounce(() => console.log("API called"), 300);
log(); log(); log(); log(); log();
// → "API called" printed exactly once, 300 ms after the 5th call
```

**Complexity**

- Time: O(1) per invocation  
- Space: O(1) — one timer reference

**Explanation / edge cases**

- **Leading-edge variant**: call immediately on first invocation, then suppress until quiet. Add a `leading` flag if needed.
- **Returning the result**: `setTimeout` can't return a value; if the caller needs a result, use `Promise`-based debounce.
- **React usage**: wrap in `useRef` or `useMemo` to keep identity stable across renders.

```js
// React-safe debounce
import { useRef, useCallback } from "react";

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);

  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}
```

---

### 2. Group array of objects by key

**Problem summary**

Given an array of objects, partition them into groups where each group shares the same value for a specified key. Return an object whose keys are the distinct values and whose values are arrays of matching items.

**Approach**

Use `Array.prototype.reduce`. For each item read the grouping key, create the bucket array if it does not exist, then push the item.

**Implementation**

```js
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const groupKey = item[key];
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});
}

// Usage
const people = [
  { id: 1, age: 25 },
  { id: 2, age: 30 },
  { id: 3, age: 25 },
];

console.log(groupBy(people, "age"));
// {
//   25: [{ id: 1, age: 25 }, { id: 3, age: 25 }],
//   30: [{ id: 2, age: 30 }]
// }
```

**Complexity**

- Time: O(n)  
- Space: O(n)

**Explanation / edge cases**

- Keys are coerced to strings when used as object properties — numeric keys like `25` become `"25"`. Use `Map` if you need strict type preservation.
- Works with any primitive key value (string, number, boolean).
- `Object.groupBy(arr, item => item[key])` is now stage-4 but not yet universally available — use the `reduce` version for interview code.

---

### 3. Reverse words in a string

**Problem summary**

Reverse the order of words in a sentence. Individual characters within each word stay in order; only the word positions are swapped.

**Approach**

Split on whitespace, reverse the resulting array, then join back with a single space. Handle leading/trailing spaces by trimming first.

**Implementation**

```js
function reverseWords(str) {
  return str.trim().split(/\s+/).reverse().join(" ");
}

// Usage
console.log(reverseWords("hello world from JavaScript"));
// → "JavaScript from world hello"
```

**Complexity**

- Time: O(n) — split, reverse, and join are all O(n)  
- Space: O(n)

**Explanation / edge cases**

- `/\s+/` collapses multiple consecutive spaces into one split — safer than `split(" ")`.
- `trim()` removes leading/trailing whitespace so you don't get empty strings at the array edges.
- Single-word input returns the word unchanged.
- To also reverse characters within each word: `str.trim().split(/\s+/).map(w => [...w].reverse().join("")).reverse().join(" ")`.

---

## MEDIUM

### 4. Predict event loop execution order

**Problem summary**

Understand how the JavaScript event loop schedules synchronous code, microtasks (Promises), and macrotasks (setTimeout) and predict the exact console output order.

**Approach**

JavaScript has a single call stack. Tasks are queued in three categories:

1. **Synchronous** — runs immediately, before anything else.
2. **Microtask queue** — `.then` / `queueMicrotask` callbacks, drained completely after every task.
3. **Macrotask queue** — `setTimeout`, `setInterval`, I/O callbacks, processed one-at-a-time.

**Implementation**

```js
console.log("start");                                    // 1 — sync

setTimeout(() => console.log("timeout"), 0);             // 4 — macrotask

Promise.resolve().then(() => console.log("promise"));    // 3 — microtask

console.log("end");                                      // 2 — sync
```

**Output**

```
start
end
promise
timeout
```

**Complexity**

Not applicable — this is a conceptual/tracing question.

**Explanation / edge cases**

| Step | Queue | Why |
|------|-------|-----|
| `"start"` | Call stack | Direct synchronous call |
| `setTimeout(…, 0)` | Macrotask scheduled | Browser minimum clamp (~4 ms) exists; fires after current task + microtasks |
| `Promise.resolve().then(…)` | Microtask scheduled | `.then` callbacks are microtasks |
| `"end"` | Call stack | Direct synchronous call |
| `"promise"` | Microtask queue drained | Microtasks run before the browser picks the next macrotask |
| `"timeout"` | Macrotask queue | Finally dequeued |

- **Nested microtasks**: a `.then` that schedules another `.then` still runs before any `setTimeout`.
- **`async/await`**: `await` is syntactic sugar for `.then` — code after `await` is a microtask.

```js
async function demo() {
  console.log("async start");
  await Promise.resolve();
  console.log("after await"); // microtask — before setTimeout
}
demo();
setTimeout(() => console.log("timeout"), 0);
// → async start, after await, timeout
```

---

### 5. Remove duplicates efficiently

**Problem summary**

Return a new array containing only the unique elements of the input array, preserving insertion order, without mutating the original.

**Approach**

Use `Set`, which stores only unique values and remembers insertion order. Spread the Set back into a new array.

**Implementation**

```js
function removeDuplicates(arr) {
  return [...new Set(arr)];
}

// Usage
console.log(removeDuplicates([1, 2, 2, 3, 4, 4, 5]));
// → [1, 2, 3, 4, 5]
```

**Complexity**

- Time: O(n) — Set insertion and iteration are amortised O(1) each  
- Space: O(n)

**Explanation / edge cases**

- `Set` uses **SameValueZero** equality (`NaN === NaN` is `true` inside a Set).
- Objects are compared **by reference** — `{ a: 1 }` and `{ a: 1 }` are two different objects and both kept. For structural deduplication, serialize to a key first:

```js
function dedupeByKey(arr, keyFn) {
  const seen = new Set();
  return arr.filter(item => {
    const k = keyFn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

dedupeByKey([{ id: 1 }, { id: 2 }, { id: 1 }], x => x.id);
// → [{ id: 1 }, { id: 2 }]
```

- **Alternative without Set** (O(n²)): `arr.filter((v, i) => arr.indexOf(v) === i)` — acceptable only for tiny arrays.

---

### 6. Flatten a nested array

**Problem summary**

Convert an arbitrarily deep nested array into a single flat array, preserving element order.

**Approach**

Three idiomatic approaches are shown below. The recursive approach is the most educational; `Array.flat(Infinity)` is the production choice.

**Implementation**

```js
// --- Option A: built-in (preferred in production) ---
const flatA = arr => arr.flat(Infinity);

// --- Option B: recursive ---
function flatB(arr) {
  return arr.reduce((acc, item) => {
    return Array.isArray(item) ? acc.concat(flatB(item)) : acc.concat(item);
  }, []);
}

// --- Option C: iterative with a stack (no call-stack overflow risk) ---
function flatC(arr) {
  const stack = [...arr];
  const result = [];
  while (stack.length) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item); // spread sub-array back onto the stack
    } else {
      result.unshift(item); // maintain original left-to-right order
    }
  }
  return result;
}

// Usage
console.log(flatA([1, [2, [3, [4]]]])); // → [1, 2, 3, 4]
console.log(flatB([1, [2, [3, [4]]]])); // → [1, 2, 3, 4]
console.log(flatC([1, [2, [3, [4]]]])); // → [1, 2, 3, 4]
```

**Complexity**

- Time: O(n) where n is the total number of elements across all nesting levels  
- Space: O(d) recursive stack depth (Option B) / O(n) for the iterative stack (Option C)

**Explanation / edge cases**

- `flat(Infinity)` skips holes in sparse arrays.
- Very deep nesting (thousands of levels) can overflow the call stack with Option B — use Option C in that scenario.
- To flatten only one level: `arr.flat()` or `[].concat(...arr)`.

---

## HARD

### 7. Implement Promise.all

**Problem summary**

`Promise.all` accepts an iterable of promises and returns a single promise that resolves with an array of resolved values (in input order) once **all** promises settle successfully.

**Approach**

Iterate the input array, attach a `.then` handler to each promise that stores the resolved value at the correct index and decrements a counter. When the counter hits zero, resolve the outer promise. Any rejection immediately rejects the outer promise.

**Implementation**

```js
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) return resolve([]);

    const results = new Array(promises.length);
    let remaining = promises.length;

    promises.forEach((p, i) => {
      Promise.resolve(p).then(value => {
        results[i] = value;
        remaining -= 1;
        if (remaining === 0) resolve(results);
      }, reject); // second arg of .then is the rejection handler
    });
  });
}

// Usage
promiseAll([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)])
  .then(console.log); // → [1, 2, 3]
```

**Complexity**

- Time: O(n) to set up handlers; total wall-clock time equals the slowest promise  
- Space: O(n) for the results array

**Explanation / edge cases**

- Wrapping each item in `Promise.resolve(p)` handles non-promise values (plain numbers, strings) transparently.
- Empty array resolves immediately with `[]`.
- Order of resolution does **not** affect output order — the index `i` is captured by closure.

---

### 8. Implement Promise.all (rejection case)

**Problem summary**

`Promise.all` must **fail fast**: the moment any input promise rejects, the returned promise rejects immediately with that reason, regardless of remaining promises.

**Approach**

The same implementation from Q7 already handles this correctly because `reject` is passed directly as the rejection handler. The first `.then(..., reject)` call that fires with a rejection wins the race.

**Implementation**

```js
// Same implementation as Q7 — rejection is already handled
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) return resolve([]);

    const results = new Array(promises.length);
    let remaining = promises.length;

    promises.forEach((p, i) => {
      Promise.resolve(p).then(value => {
        results[i] = value;
        remaining -= 1;
        if (remaining === 0) resolve(results);
      }, reject); // ← first rejection calls reject(); subsequent ones are no-ops
    });
  });
}

// Usage — rejection case
promiseAll([Promise.resolve(1), Promise.reject("Error"), Promise.resolve(3)])
  .catch(err => console.log(err)); // → "Error"
```

**Complexity**

- Same as Q7: O(n) setup, O(1) on rejection path

**Explanation / edge cases**

- Once a `Promise` is settled (resolved or rejected), it cannot be settled again — so calling `reject` multiple times is safe; only the first call takes effect.
- The other promises **still run** (they are already in-flight); `Promise.all` just ignores their outcomes.
- `Promise.allSettled` is the variant that waits for every promise and never rejects — useful when you need all outcomes regardless of failure:

```js
Promise.allSettled([p1, p2]).then(results => {
  // results: [{ status: "fulfilled", value: 1 }, { status: "rejected", reason: "Error" }]
});
```

---

### 9. Deep clone an object

**Problem summary**

Create a completely independent copy of a nested object so that mutations to the clone do not affect the original, and vice-versa.

**Approach**

Multiple strategies exist with different trade-offs. The recursive approach is the most instructive for interviews. `structuredClone` is the modern production choice.

**Implementation**

```js
// --- Option A: structuredClone (modern, handles most built-ins) ---
const cloneA = obj => structuredClone(obj);

// --- Option B: recursive (interview favourite) ---
function deepClone(value) {
  if (value === null || typeof value !== "object") return value; // primitives
  if (Array.isArray(value)) return value.map(deepClone);        // arrays

  const cloned = {};
  for (const key of Object.keys(value)) {
    cloned[key] = deepClone(value[key]);
  }
  return cloned;
}

// --- Option C: JSON round-trip (quick but limited) ---
const cloneC = obj => JSON.parse(JSON.stringify(obj));

// Usage
const original = { a: 1, b: { c: 2 } };
const clone = deepClone(original);
clone.b.c = 99;

console.log(original.b.c); // → 2  (untouched)
console.log(clone.b.c);    // → 99
```

**Complexity**

- Time: O(n) where n is the total number of nodes  
- Space: O(d) call-stack depth + O(n) for the new object tree

**Explanation / edge cases**

| Issue | Option A | Option B (basic) | Option C |
|-------|----------|-----------------|----------|
| Circular refs | ✅ handled | ❌ infinite loop | ❌ throws |
| `Date`, `RegExp` | ✅ | ❌ becomes plain object | ❌ Date → string |
| `undefined`, functions | ❌ dropped | ❌ dropped | ❌ dropped |
| `Map`, `Set` | ✅ | ❌ | ❌ |

For the interview, implement Option B and mention these caveats. Add circular-reference handling with a `WeakMap`:

```js
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value); // break circular ref

  const cloned = Array.isArray(value) ? [] : {};
  seen.set(value, cloned);

  for (const key of Object.keys(value)) {
    cloned[key] = deepClone(value[key], seen);
  }
  return cloned;
}
```

---

### 10. Implement memoization

**Problem summary**

Wrap any pure function so that results for previously seen argument combinations are returned from a cache rather than recomputed.

**Approach**

Maintain a `Map` (or plain object) keyed on a serialized form of the arguments. On each call, check the cache first; compute and store only on a miss.

**Implementation**

```js
function memoize(fn) {
  const cache = new Map();

  return function (...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      console.log("cache hit:", key);
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

// Usage
const add = memoize((a, b) => {
  console.log("computing...");
  return a + b;
});

console.log(add(2, 3)); // computing... → 5
console.log(add(2, 3)); // cache hit: [2,3] → 5  (no recomputation)
console.log(add(1, 4)); // computing... → 5  (different args, different cache entry)
```

**Complexity**

- Time: O(1) on cache hit; O(fn) on cache miss  
- Space: O(u × s) where u = unique call signatures, s = average result size

**Explanation / edge cases**

- `JSON.stringify` fails for arguments that contain circular references or non-serialisable values (functions, `undefined`). For those, use a `WeakMap`-based trie or require callers to provide a custom `keyFn`.
- **React `useMemo`** is not memoizing a function — it memoizes the **result** of an expression. For memoizing callbacks use `useCallback`; for memoizing expensive computations use `useMemo`.

```js
// React example: memoized selector
const expensiveList = useMemo(() => data.filter(heavyFilter), [data]);
```

- **Cache invalidation**: a simple `Map`-based cache grows forever. For bounded caches see Q11 (LRU).

---

### 11. Implement LRU Cache

**Problem summary**

Design a data structure with `get(key)` and `put(key, value)` both running in O(1) time. When capacity is exceeded, evict the **least recently used** item.

**Approach**

Combine a `Map` (for O(1) key lookup) with the fact that `Map` preserves insertion order. On access or insertion, delete and re-insert the key so it moves to the "most recently used" end. Evict the first key (oldest) when over capacity.

**Implementation**

```js
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map(); // Map preserves insertion order
  }

  get(key) {
    if (!this.cache.has(key)) return -1;

    // Refresh: move to the end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) this.cache.delete(key); // remove stale entry
    this.cache.set(key, value);                       // insert at end (MRU)

    if (this.cache.size > this.capacity) {
      // Delete the first key (LRU — least recently used)
      const lruKey = this.cache.keys().next().value;
      this.cache.delete(lruKey);
    }
  }
}

// Usage
const lru = new LRUCache(2);
lru.put(1, 1);  // cache: {1=1}
lru.put(2, 2);  // cache: {1=1, 2=2}
lru.get(1);     // returns 1, refreshes key 1 → cache: {2=2, 1=1}
lru.put(3, 3);  // capacity exceeded, evicts key 2 → cache: {1=1, 3=3}

console.log(lru.get(2)); // → -1 (evicted)
console.log(lru.get(1)); // → 1
console.log(lru.get(3)); // → 3
```

**Complexity**

- `get`: O(1)  
- `put`: O(1)  
- Space: O(capacity)

**Explanation / edge cases**

- The classic alternative uses a **doubly-linked list + HashMap**. The `Map`-based approach is more idiomatic in JS and achieves the same complexity with less code.
- `put` on an **existing key** must update the value and refresh its recency (delete + re-insert).
- `get` on a **missing key** must return `-1` (LeetCode convention) or `undefined` depending on the spec.
- For a **read-through cache** (fetches missing values automatically), extend `get` to call an async loader.

---

## HARD - React/Frontend

### 12. Custom useFetch hook

**Problem summary**

Build a reusable `useFetch` hook that handles loading/error state and correctly cancels stale requests when the URL changes before the previous fetch completes. Only the most-recent request should update component state.

**Approach**

Use `useEffect` with `AbortController`. When the URL changes, the effect cleanup function calls `controller.abort()`, which causes the in-flight `fetch` to reject with an `AbortError` — caught and silently ignored. State is only updated if the request was not aborted.

**Implementation**

```jsx
import { useState, useEffect } from "react";

function useFetch(url) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        if (err.name === "AbortError") return; // stale request — ignore
        setError(err.message);
        setLoading(false);
      });

    // Cleanup: abort the in-flight request when url changes or component unmounts
    return () => controller.abort();
  }, [url]);

  return { data, loading, error };
}

// Usage
function UserList() {
  const { data, loading, error } = useFetch("/api/users");

  if (loading) return <p>Loading…</p>;
  if (error)   return <p>Error: {error}</p>;
  return <ul>{data?.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

**Complexity**

- Renders: 3 per fetch lifecycle (initiated → settled → -)
- Network: only the latest URL fires a live request; previous ones are aborted at the OS level

**Explanation / edge cases**

- **Race condition without abort**: user types fast → multiple requests in flight → whichever responds last "wins" even if it's stale data. `AbortController` prevents this.
- **Unmount safety**: if the component unmounts while fetching, the cleanup aborts the request and the subsequent state updates are skipped (`AbortError` is caught), avoiding the "can't update state on unmounted component" warning.
- **Caching**: for production, prefer `SWR` or `TanStack Query` which add deduplication, revalidation, and a global cache on top of this pattern.
- **Retry logic**: wrap the fetch in a loop with exponential back-off, checking `controller.signal.aborted` before each attempt.

---

### 13. Pagination with caching

**Problem summary**

Build a paginated data view where previously visited pages are served from a local cache, eliminating redundant network requests when navigating back.

**Approach**

Store fetched pages in a `useRef`-backed `Map` (cache survives re-renders without causing them). On page change, check the cache first; only fetch from the network on a cache miss.

**Implementation**

```jsx
import { useState, useEffect, useRef, useCallback } from "react";

function usePaginatedFetch(baseUrl, pageSize = 10) {
  const [page, setPage]       = useState(1);
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const cache = useRef(new Map()); // { pageNumber → data[] }

  useEffect(() => {
    if (cache.current.has(page)) {
      setData(cache.current.get(page)); // instant cache hit
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${baseUrl}?page=${page}&limit=${pageSize}`, { signal: controller.signal })
      .then(r => r.json())
      .then(json => {
        cache.current.set(page, json);
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [page, baseUrl, pageSize]);

  const goTo = useCallback(n => setPage(n), []);

  return { data, loading, error, page, goTo };
}

// Component
function PaginatedList() {
  const { data, loading, error, page, goTo } = usePaginatedFetch("/api/items");

  return (
    <div>
      {loading && <p>Loading page {page}…</p>}
      {error   && <p>Error: {error}</p>}

      <ul>
        {data.map(item => <li key={item.id}>{item.name}</li>)}
      </ul>

      <button onClick={() => goTo(p => Math.max(1, p - 1))} disabled={page === 1}>
        ← Prev
      </button>
      <span> Page {page} </span>
      <button onClick={() => goTo(p => p + 1)}>
        Next →
      </button>
    </div>
  );
}
```

**Complexity**

- Cache hit: O(1) lookup, zero network round-trips  
- Cache miss: O(n) for n items per page  
- Space: O(p × n) for p cached pages of n items each

**Explanation / edge cases**

- **`useRef` vs `useState` for cache**: `useRef` mutations do not trigger re-renders — exactly what we want for a transparent cache.
- **Cache invalidation**: add a `maxAge` timestamp per entry or call `cache.current.clear()` when data changes server-side.
- **Total pages**: include `totalCount` in the API response; derive `totalPages = Math.ceil(totalCount / pageSize)` to disable the Next button on the last page.
- **Prefetching**: after loading page N, silently prefetch page N+1 in the background using the same cache pattern.

---

### 14. Route-based code splitting

**Problem summary**

In a React SPA, load each route's component bundle **on demand** (lazy load) so the initial JavaScript payload is as small as possible. The Dashboard bundle should only be downloaded when the user navigates to `/dashboard`.

**Approach**

Use `React.lazy` to dynamically import the component and `Suspense` to show a fallback while the chunk downloads. Pair with `react-router-dom` v6 for route matching.

**Implementation**

```jsx
// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";

// Each lazy() call creates a separate webpack/Vite chunk
const Home      = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard")); // loaded only on /dashboard
const Profile   = lazy(() => import("./pages/Profile"));

function PageLoader() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile"   element={<Profile />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

```jsx
// src/pages/Dashboard.jsx  — this file becomes its own JS chunk
export default function Dashboard() {
  return <h1>Dashboard</h1>;
}
```

**Complexity**

- Initial bundle: excludes all lazy-loaded routes  
- Per-route chunk: O(component size)  
- Network waterfall: 1 extra round-trip per new route visit (chunk download)

**Explanation / edge cases**

- **`React.lazy` requirements**: the import must be a default export. For named exports, re-export as default in the page file.
- **Error boundaries**: network failures during chunk download throw. Wrap `Suspense` with an `ErrorBoundary` component to show a "Failed to load page" message with a retry button instead of a blank screen.

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() { return { hasError: true }; }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <p>Failed to load page.</p>
          <button onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage
<ErrorBoundary>
  <Suspense fallback={<PageLoader />}>
    <Routes>…</Routes>
  </Suspense>
</ErrorBoundary>
```

- **Prefetching on hover**: call `import("./pages/Dashboard")` inside a `onMouseEnter` handler on the nav link to start downloading the chunk before the user clicks — eliminating the perceived loading delay.
- **Vite / webpack**: both bundlers automatically create separate `.js` chunks for each `lazy()` call. Name chunks with the magic comment `/* webpackChunkName: "dashboard" */` for readable network panel debugging.
