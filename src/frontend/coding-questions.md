# Frontend Coding Questions

Fourteen problems from `Frontend_Coding_Questions.csv` — easy through hard, including React. Each one is written as a full **Format B** walkthrough: what the interviewer is testing, how a senior dev thinks before coding, the solution, a dry run, edge cases, follow-ups, and a memory hook.

Work one problem at a time. Cover the prompt, write your solution, then read only after you have an answer.

---

## Question index

| # | Level | Problem |
|---|---|---|
| 1 | Easy | [Implement debounce](#1-implement-debounce) |
| 2 | Easy | [Group array of objects by key](#2-group-array-of-objects-by-key) |
| 3 | Easy | [Reverse words in a string](#3-reverse-words-in-a-string) |
| 4 | Medium | [Predict event loop order](#4-predict-event-loop-order) |
| 5 | Medium | [Remove duplicates](#5-remove-duplicates) |
| 6 | Medium | [Flatten nested array](#6-flatten-nested-array) |
| 7 | Hard | [Implement Promise.all](#7-implement-promiseall) |
| 8 | Hard | [Promise.all rejection](#8-promiseall-rejection) |
| 9 | Hard | [Deep clone](#9-deep-clone) |
| 10 | Hard | [Memoization](#10-memoization) |
| 11 | Hard | [LRU cache](#11-lru-cache) |
| 12 | Hard | [Custom useFetch](#12-custom-usefetch) |
| 13 | Hard | [Pagination with caching](#13-pagination-with-caching) |
| 14 | Hard | [Route-based code splitting](#14-route-based-code-splitting) |

---

## 1. Implement debounce

### What the interviewer is really testing

Whether you understand **closures**, **timers**, and preserving `this`/arguments — the same building blocks behind search inputs, resize handlers, and autosave. This is not a string problem; it is a "can you wrap a function and control when it fires" problem.

### Think before you code

Naive approach: call `fn` on every keystroke — O(n) API calls for n keystrokes. We need to **reset a timer** on each call and only invoke `fn` after `delay` ms of silence. That means one `timerId` in a closure shared by every call to the returned wrapper. Preserve `this` and `args` with `fn.apply(this, args)` inside `setTimeout`.

### The solution — fully explained code

```javascript
function debounce(fn, delay) {
  let timerId;

  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

const search = debounce((q) => console.log('API:', q), 300);
search('a');
search('ab');
search('abc');
// Only "API: abc" logs, ~300ms after last call
```

Time: O(1) per call. Space: O(1) for one timer id.

### Dry run

`search('a')` → schedule T1 in 300ms. `search('ab')` → clear T1, schedule T2. `search('abc')` → clear T2, schedule T3. 300ms quiet → T3 fires → `fn('abc')`.

### Edge cases

Leading-edge debounce (fire immediately, then suppress). Returning a value from async debounce needs Promises. In React, stabilize the debounced function with `useRef` + `useCallback` so identity does not reset every render.

### Variations and follow-ups

**Throttle** — cap rate instead of waiting for quiet. **Cancel** — expose `debounced.cancel()` that clears the timer. **maxWait** — lodash debounce fires at least every N ms during continuous input.

### Memory hook

Debounce = reset the egg timer on every knock; only cook when they stop knocking.

---

## 2. Group array of objects by key

### What the interviewer is really testing

Whether you reach for **`reduce` + hash map** instead of nested loops when you need O(1) bucket lookup.

### Think before you code

Brute force: for each item, scan result arrays for matching key — O(n²). Better: one pass, object (or `Map`) keyed by `item[key]`, push into bucket arrays — O(n).

### The solution

```javascript
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const groupKey = item[key];
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});
}
```

Time: O(n). Space: O(n).

### Dry run

`[{id:1, age:25}, {id:2, age:30}, {id:3, age:25}]` keyed by `age` → `{ 25: [obj1, obj3], 30: [obj2] }`.

### Edge cases

Object keys stringify numbers (`25` → `"25"`). Use `Map` if you need number keys without coercion. `Object.groupBy` exists in modern JS but know the `reduce` version for interviews.

### Variations

Group by computed key: `groupBy(arr, x => x.age > 18 ? 'adult' : 'minor')` with a `Map`.

### Memory hook

One pass, one bucket per key — reduce into a map.

---

## 3. Reverse words in a string

### What the interviewer is really testing

String manipulation basics — trim, split, reverse, join — and whether you handle **multiple spaces** correctly.

### Think before you code

Split on whitespace, reverse array, join with single space. `trim()` + `/\s+/` avoids empty tokens from leading or double spaces.

### The solution

```javascript
function reverseWords(str) {
  return str.trim().split(/\s+/).reverse().join(' ');
}
```

Time/space: O(n).

### Dry run

`"hello world from JS"` → `['hello','world','from','JS']` → reversed → `"JS from world hello"`.

### Edge cases

Single word unchanged. Multiple spaces collapsed. Follow-up: reverse characters inside each word (different problem).

### Memory hook

Trim, split on whitespace runs, reverse, join — four moves.

---

## 4. Predict event loop order

### What the interviewer is really testing

Microtask vs macrotask ordering — core JavaScript runtime knowledge. Format C style but included here as a coding trace.

### Think before you code

Sync runs first to completion. Microtasks (promises) drain fully. Then one macrotask (`setTimeout`). Repeat.

### The code

```javascript
console.log('start');
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
console.log('end');
```

### The answer

```
start
end
promise
timeout
```

### Execution walkthrough

Log `start` (sync). Schedule timeout (macrotask). Schedule promise callback (microtask). Log `end` (sync). Stack empty → drain microtasks → `promise`. Next macrotask → `timeout`.

### Trap

People expect `timeout` before `promise` because `setTimeout` was registered first. Registration order ≠ execution order.

### Memory hook

Sync first, microtasks until empty, then next macrotask.

---

## 5. Remove duplicates

### What the interviewer is really testing

Knowing `Set` preserves insertion order and gives O(n) uniqueness.

### Think before you code

Nested loops O(n²). `Set` spread: `[...new Set(arr)]` — O(n).

### The solution

```javascript
function removeDuplicates(arr) {
  return [...new Set(arr)];
}
```

### Dry run

`[1,2,2,3,4,4,5]` → Set `{1,2,3,4,5}` → array same order.

### Edge cases

Objects dedupe by reference only. For structural dedupe, key by `id` with a `Set` of ids + `filter`. `NaN` treated as equal in Set.

### Variations

Sorted array two-pointer in-place. `uniqBy` from lodash pattern.

### Memory hook

Set = uniqueness with order; spread back to array.

---

## 6. Flatten nested array

### What the interviewer is really testing

Recursion vs iteration, and whether you know `flat(Infinity)` exists but can implement the loop.

### Think before you code

Production: `arr.flat(Infinity)`. Interview: recursive `reduce` or stack-based iterative to avoid stack overflow on deep nesting.

### The solution

```javascript
function flatten(arr) {
  return arr.reduce((acc, item) => {
    return Array.isArray(item)
      ? acc.concat(flatten(item))
      : acc.concat(item);
  }, []);
}
```

Time: O(total elements). Space: O(depth) recursion stack.

### Dry run

`[1,[2,[3]]]` → acc builds `[1,2,3]` as recursion unwinds.

### Edge cases

Very deep nesting overflows call stack — use iterative stack. `flat(1)` only one level. Sparse arrays — `flat` skips holes.

### Memory hook

If array, recurse and concat; else append — or `flat(Infinity)` in prod.

---

## 7. Implement Promise.all

### What the interviewer is really testing

Promise mechanics, preserving **result order** even when promises resolve out of order, and fail-fast rejection.

### Think before you code

Return new Promise. Counter for settled count. Array prefilled with results at index `i`. Each input wrapped in `Promise.resolve`. On all success → resolve array. On any reject → reject immediately.

### The solution

```javascript
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) return resolve([]);

    const results = new Array(promises.length);
    let remaining = promises.length;

    promises.forEach((p, i) => {
      Promise.resolve(p).then(
        (value) => {
          results[i] = value;
          remaining -= 1;
          if (remaining === 0) resolve(results);
        },
        reject
      );
    });
  });
}
```

Time: O(n) setup; wall clock = slowest promise. Space: O(n).

### Dry run

`[P1(100ms→'a'), P2(50ms→'b')]` — P2 finishes first but `results[0]='a'`, `results[1]='b'` at end.

### Edge cases

Empty array → `[]`. Non-promise values wrapped. First rejection wins; others still run but ignored.

### Variations

`Promise.allSettled`, `Promise.race`, `Promise.any`.

### Memory hook

Count down remaining; store at index i; reject on first failure.

---

## 8. Promise.all rejection

Same implementation as §7 — `reject` as second arg to `.then` handles fail-fast. First rejection settles the outer promise; later rejections are no-ops on an already-settled promise.

**Follow-up:** `Promise.allSettled` never rejects — returns `{status, value|reason}` per input.

**Memory hook:** `all` = fail fast; `allSettled` = wait for everyone and report.

---

## 9. Deep clone

### What the interviewer is really testing

Recursion, edge cases (cycles, dates, functions), and knowing `structuredClone` exists.

### Think before you code

`JSON.parse(JSON.stringify)` fails on cycles, `undefined`, functions, `Date`. Interview: recursive clone + `WeakMap` for cycles. Production: `structuredClone` when sufficient.

### The solution

```javascript
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  const cloned = Array.isArray(value) ? [] : {};
  seen.set(value, cloned);

  for (const key of Object.keys(value)) {
    cloned[key] = deepClone(value[key], seen);
  }
  return cloned;
}
```

### Dry run

`{a:1, b:{c:2}}` — clone `b` object, assign to `cloned.b`, primitives copy by value.

### Edge cases

`Date`, `Map`, `Set`, `RegExp` need special handling in full implementation. `structuredClone` handles most in modern runtimes.

### Memory hook

Walk the tree; WeakMap breaks cycles; primitives return as-is.

---

## 10. Memoization

### What the interviewer is really testing

Caching pure functions — foundation of `useMemo` thinking.

### Think before you code

`Map` keyed by serialized args. On hit return cached; on miss compute, store, return. Pure function only.

### The solution

```javascript
function memoize(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}
```

### Edge cases

`JSON.stringify` fails on circular args — custom key function. Unbounded cache grows forever → LRU (next problem).

### Memory hook

Pure function + Map + key = memoize.

---

## 11. LRU cache

### What the interviewer is really testing

Classic data structure design — O(1) get/put. In JS, `Map` insertion order trick beats hand-rolled doubly-linked list for interviews.

### Think before you code

`get`: if missing return -1; else delete+set to move to MRU end. `put`: delete if exists, set, if over capacity delete first key (LRU).

### The solution

```javascript
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.capacity) {
      const lruKey = this.cache.keys().next().value;
      this.cache.delete(lruKey);
    }
  }
}
```

### Dry run

cap=2: put(1,1), put(2,2), get(1) refreshes 1, put(3,3) evicts key 2.

### Memory hook

Map order = age; delete+set = "I just used this"; evict `keys().next()`.

---

## 12. Custom useFetch

### What the interviewer is really testing

React effects, race conditions, cleanup — the fetch-in-`useEffect` pattern done correctly.

### Think before you code

State: data, loading, error. `useEffect` on `url`. `AbortController` — abort on url change/unmount. Ignore `AbortError`. Check `res.ok`.

### The solution

```jsx
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [url]);

  return { data, loading, error };
}
```

### Trap

Without abort, fast url changes let stale responses overwrite fresh data.

### Follow-ups

TanStack Query for cache/dedupe. Retry with backoff. Generic `useFetch<T>` with TypeScript.

### Memory hook

Effect + AbortController cleanup = no stale fetch updates.

---

## 13. Pagination with caching

### What the interviewer is really testing

`useRef` for cache that should not trigger re-renders, plus same abort pattern as useFetch.

### Think before you code

`Map` in `useRef`: page → data. On page change, cache hit → set data sync; miss → fetch and store. Abort on page change.

### The solution

```jsx
function usePaginatedFetch(baseUrl, pageSize = 10) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cache = useRef(new Map());

  useEffect(() => {
    if (cache.current.has(page)) {
      setData(cache.current.get(page));
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${baseUrl}?page=${page}&limit=${pageSize}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        cache.current.set(page, json);
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [page, baseUrl, pageSize]);

  return { data, loading, error, page, setPage };
}
```

### Dry run

Visit page 1 → fetch, cache. Page 2 → fetch. Back to page 1 → instant from cache, no network.

### Edge cases

Invalidate cache on mutation. Prefetch page+1. Disable Next on last page when API returns total count.

### Memory hook

useRef Map = silent cache; page in deps = when to load.

---

## 14. Route-based code splitting

### What the interviewer is really testing

Whether you know `React.lazy` + `Suspense` and how bundlers split chunks.

### Think before you code

Each route component = dynamic `import()`. Wrap routes in `Suspense` with fallback. Optional `ErrorBoundary` for chunk load failure. Prefetch on nav hover for polish.

### The solution

```jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

function PageLoader() {
  return <p>Loading…</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### Trap

`lazy` requires default export. Chunk download failure needs ErrorBoundary, not only Suspense.

### Follow-ups

Prefetch: `onMouseEnter={() => import('./pages/Dashboard')}`. Named exports: `lazy(() => import('./x').then(m => ({ default: m.Named })))`.

### Memory hook

lazy = separate chunk; Suspense = while chunk downloads; route change triggers import.

---

## Study order

1. Easy 1–3 (closures, reduce, strings)
2. Medium 4–6 (event loop, Set, recursion)
3. Hard 7–11 (promises, clone, cache)
4. React 12–14 (effects, cache ref, lazy)

**Memory hook for the whole set:** Closures + timers (debounce), reduce/Set (data shaping), promises (all/LRU), effects + abort (fetch), lazy (split).
