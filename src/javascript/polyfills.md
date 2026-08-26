# JavaScript Polyfills

> For implementation challenges beyond polyfills → [DSA Implementations](../dsa/implementations.md).
> Canonical theory on Promises → [Core Concepts](concepts/promises.md).

---

## How to Study This Page

Every polyfill group below follows **Format B** — the same structure an interviewer expects you to demonstrate on a whiteboard:

1. What the interviewer is *actually* testing
2. How a senior engineer thinks before writing a single line
3. The complete, explained solution with comments on *why*
4. A dry-run so you can trace it yourself
5. Edge cases and follow-up questions

Work through each group in order. The Array section teaches the shared mental model. Everything after reinforces it.

---

## Part 1 — Array Method Polyfills

### `Array.prototype.map`

#### 1. What the Interviewer Is Really Testing

On the surface this looks like "do you know map?" — but what the interviewer is actually checking is whether you understand how `Array.prototype` methods work at the contract level: the `this` binding, the sparse-array `in` check, `thisArg` forwarding, and the unsigned-integer length cast. They want to see if you can implement an API to spec without relying on the native version.

#### 2. Think Before You Code — The Senior Dev Thought Process

My first instinct is to just loop and push. But before I do that, I ask: *what are the invariants of the real `map`?*

- `map` is called as `arr.map(fn, ctx)`. That means inside the polyfill, `this` is the array — not a parameter.
- The spec coerces `this` to an Object, so `null` or `undefined` must throw.
- The callback receives three arguments: `element`, `index`, `originalArray`.
- An optional `thisArg` sets the `this` context inside the callback.
- The returned array must be *the same length* as the original — including holes in sparse arrays. Holes should be copied as holes, not as `undefined`.
- The sparse-array hole check is `i in obj` — this returns `false` for holes (no own property at that index) but `true` for `undefined` values (own property exists with value `undefined`).
- `length >>> 0` converts the length to an unsigned 32-bit integer, handling non-numeric or negative length values on array-like objects.

Brute force: just loop and collect. The insight: don't forget `thisArg` and `i in obj`.

#### 3. The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myMap) {
  Array.prototype.myMap = function (callback, thisArg) {
    // Guard. 'this' is set by how the method is called, e.g. arr.myMap(...).
    // null/undefined 'this' means someone called it on null directly.
    if (this == null) {
      throw new TypeError("Array.prototype.myMap called on null or undefined");
    }
    if (typeof callback !== "function") {
      throw new TypeError(callback + " is not a function");
    }

    // Coerce to Object so array-like objects (NodeList, arguments) work too.
    const obj = Object(this);

    // >>> 0 converts length to Uint32. Handles NaN, -1, "3", etc.
    const len = obj.length >>> 0;

    // Pre-allocate the result array at the same length.
    // This means holes stay holes — we only write indices that exist.
    const result = new Array(len);

    for (let i = 0; i < len; i++) {
      // Sparse-array check. 'i in obj' returns false for holes.
      // This preserves the hole instead of writing undefined.
      if (i in obj) {
        // .call() forwards thisArg and passes (element, index, originalArray)
        // exactly as the spec requires.
        result[i] = callback.call(thisArg, obj[i], i, obj);
      }
    }

    return result;
  };
}
```

**Time complexity:** O(n) — one pass through the array.
**Space complexity:** O(n) — allocates a new array of the same length.

#### 4. Dry Run — Walk Through a Real Example

```javascript
const arr = [1, 2, 3];
arr.myMap((x) => x * 2);
// obj = [1, 2, 3], len = 3, result = new Array(3) = [<3 empty>]

// i = 0: 0 in obj → true. callback(1, 0, arr) = 2.  result[0] = 2
// i = 1: 1 in obj → true. callback(2, 1, arr) = 4.  result[1] = 4
// i = 2: 2 in obj → true. callback(3, 2, arr) = 6.  result[2] = 6

// Returns: [2, 4, 6] ✓
```

Sparse array case:
```javascript
const sparse = [1, , 3]; // index 1 is a hole
sparse.myMap((x) => x * 10);
// i = 0: 0 in sparse → true.  result[0] = 10
// i = 1: 1 in sparse → false. result[1] stays a hole (not undefined)
// i = 2: 2 in sparse → true.  result[2] = 30
// Returns: [10, <1 empty>, 30] ✓  (NOT [10, undefined, 30])
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**`NaN` and holes.** `[1,,3].map(fn)` must skip index 1. A naive `for` loop that always writes `result[i] = fn(arr[i])` would write `undefined` instead of leaving a hole.

**`thisArg` ignored.** Forgetting `callback.call(thisArg, ...)` and writing `callback(obj[i], i, obj)` makes `this` inside the callback `undefined` (strict mode) or `window` (sloppy) — a subtle bug when methods are passed as callbacks.

**Array-like objects.** Because we use `Object(this)` and a manual loop, this polyfill works on `{ 0: 'a', 1: 'b', length: 2 }` too, just like the native.

**Mutation during iteration.** If the callback mutates the original array, the polyfill still uses the current value at each index when it reaches it. This matches native behaviour.

#### 6. Variations and Follow-ups

> *"Can you implement `filter` next?"* — Same skeleton. Difference: push to result only when `callback.call(...)` returns truthy. Don't pre-allocate at `len`; push instead.

> *"What if you couldn't use `.call()`?"* — You'd need another way to set `this`. Temporarily assigning the function as a property of `thisArg` and calling it as a method is the classic trick (covered in the `call`/`apply` section below).

#### 7. 🧠 The Memory Hook

Every Array prototype polyfill has the same skeleton: `Object(this)`, `length >>> 0`, `i in obj` for holes, and `.call(thisArg, element, index, array)`. Learn that skeleton once and you can implement any of them.

---

### `Array.prototype.filter`

#### 1. What the Interviewer Is Really Testing

Same underlying contract as `map` — but now the test is whether you understand that `filter` returns a **new, shorter array** containing only elements for which the predicate is truthy. The length of the result is unknown upfront, so you can't pre-allocate at `len`.

#### 2. Think Before You Code — The Senior Dev Thought Process

Same `Object(this)`, `length >>> 0`, `i in obj` skeleton. The difference: instead of `result[i] = transformed`, we `push` only when the predicate passes. We never pre-allocate because we don't know how many elements will pass.

#### 3. The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myFilter) {
  Array.prototype.myFilter = function (callback, thisArg) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof callback !== "function") throw new TypeError(callback + " is not a function");

    const obj = Object(this);
    const len = obj.length >>> 0;
    const result = []; // unknown final length — push, don't index

    for (let i = 0; i < len; i++) {
      if (i in obj) {
        // Only push if predicate returns truthy.
        // We push obj[i], not the return value of the callback (that's map's job).
        if (callback.call(thisArg, obj[i], i, obj)) {
          result.push(obj[i]);
        }
      }
    }

    return result;
  };
}
```

**Time:** O(n). **Space:** O(k) where k is the number of passing elements.

#### 4. Dry Run — Walk Through a Real Example

```javascript
[1, 2, 3, 4].myFilter((x) => x % 2 === 0);
// i=0: callback(1) = false. skip.
// i=1: callback(2) = true.  result = [2]
// i=2: callback(3) = false. skip.
// i=3: callback(4) = true.  result = [2, 4]
// Returns: [2, 4] ✓
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**Returning the callback's return value instead of the element.** `result.push(callback(...))` would push `true`/`false`, not the original element.

**Empty array** returns `[]` — the loop body never runs.

#### 6. Variations and Follow-ups

> *"What's the difference between `filter(Boolean)` and `filter(x => x)`?"* — Identical in behaviour. Both remove falsy values. `Boolean` is just the built-in function used as the predicate.

#### 7. 🧠 The Memory Hook

`filter` returns the *element*, not the callback's return value. Use `push`, not pre-allocation.

---

### `Array.prototype.reduce`

#### 1. What the Interviewer Is Really Testing

`reduce` is the most complex of the Array polyfills. The extra difficulty is the `initialValue` handling: when no initial value is provided, the first *non-hole* element becomes the accumulator and iteration starts at the *next* element. Getting that wrong is the most common failure.

#### 2. Think Before You Code — The Senior Dev Thought Process

Two cases:
1. **`initialValue` provided** (`arguments.length >= 2`): `accumulator = initialValue`, iterate from index 0.
2. **No `initialValue`**: skip holes to find the first real element, use it as `accumulator`, start the loop one index later. If the array is entirely empty and no initial value, throw `TypeError`.

The `arguments.length >= 2` check (not `initialValue !== undefined`) is critical — `reduce([1,2], (a,b)=>a+b, undefined)` provides an explicit `undefined` as the initial value, which is valid.

#### 3. The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myReduce) {
  Array.prototype.myReduce = function (callback, initialValue) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof callback !== "function") throw new TypeError(callback + " is not a function");

    const obj = Object(this);
    const len = obj.length >>> 0;
    let i = 0;
    let accumulator;

    if (arguments.length >= 2) {
      // Explicit initial value provided — use it.
      accumulator = initialValue;
    } else {
      // No initial value: find the first non-hole element.
      while (i < len && !(i in obj)) {
        i++;
      }
      if (i >= len) {
        // Exhausted the array (empty or all holes) with no initial value.
        throw new TypeError("Reduce of empty array with no initial value");
      }
      // First real element becomes the seed; next iteration starts after it.
      accumulator = obj[i];
      i++;
    }

    for (; i < len; i++) {
      if (i in obj) {
        // The callback's RETURN VALUE becomes the new accumulator on each step.
        accumulator = callback(accumulator, obj[i], i, obj);
      }
    }

    return accumulator;
  };
}
```

**Time:** O(n). **Space:** O(1) — just tracks the accumulator.

#### 4. Dry Run — Walk Through a Real Example

```javascript
[1, 2, 3].myReduce((acc, val) => acc + val);
// No initialValue → first real element = 1. i starts at 1.
// i=1: acc = callback(1, 2) = 3
// i=2: acc = callback(3, 3) = 6
// Returns: 6 ✓

[1, 2, 3].myReduce((acc, val) => acc + val, 10);
// initialValue = 10. i starts at 0.
// i=0: acc = callback(10, 1) = 11
// i=1: acc = callback(11, 2) = 13
// i=2: acc = callback(13, 3) = 16
// Returns: 16 ✓
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**Single-element array with no initial value** — returns that element immediately without calling the callback. This matches native behaviour.

**`initialValue !== undefined` vs `arguments.length >= 2`** — always use `arguments.length >= 2`. Checking `initialValue !== undefined` breaks when someone passes `undefined` as an explicit initial value.

**Sparse array with no initial value** — the while-loop skips holes to find the first real seed. A naive `accumulator = obj[0]` would use `undefined` for a sparse hole.

#### 6. Variations and Follow-ups

> *"Implement `reduceRight`"* — Same logic but iterate from `len - 1` down to `0`. Initial value seed comes from the last real element.

#### 7. 🧠 The Memory Hook

`reduce` is just a loop that replaces the accumulator with the callback's return value each step. The only tricky part: no initial value means the first *real* element is the seed and the loop skips it.

---

### `Array.prototype.forEach`

#### 1. What the Interviewer Is Really Testing

`forEach` is the simplest of the group. The test is: do you know that `forEach` **always returns `undefined`**, and do you know *not* to create or return a results array?

#### 3. The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myForEach) {
  Array.prototype.myForEach = function (callback, thisArg) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof callback !== "function") throw new TypeError(callback + " is not a function");

    const obj = Object(this);
    const len = obj.length >>> 0;

    for (let i = 0; i < len; i++) {
      if (i in obj) {
        callback.call(thisArg, obj[i], i, obj);
        // No return value captured. forEach always returns undefined.
      }
    }
    // Implicit return undefined.
  };
}
```

#### 7. 🧠 The Memory Hook

`forEach` is `map` with the result array removed. Call the callback, return nothing.

---

### `Array.prototype.flat`

#### 1. What the Interviewer Is Really Testing

`flat` tests whether you can write a *depth-limited recursive* algorithm. The key insight is that a default depth of `1` is not "infinite" — you must actually track the recursion depth.

#### 2. Think Before You Code — The Senior Dev Thought Process

I need a recursive helper that accepts `(arr, currentDepth)`. At each level, if an element is an array *and* `currentDepth < maxDepth`, recurse deeper. Otherwise push the element. I'll push into a shared outer `result` array rather than creating arrays at each recursion level.

#### 3. The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myFlat) {
  Array.prototype.myFlat = function (depth) {
    // Default depth is 1. Infinity means flatten completely.
    const maxDepth = depth === undefined ? 1 : Math.floor(depth);

    if (maxDepth < 1) {
      // depth 0 → shallow copy, no flattening.
      return Array.prototype.slice.call(this);
    }

    const result = [];

    function flatten(arr, currentDepth) {
      for (let i = 0; i < arr.length; i++) {
        if (i in arr) {
          const el = arr[i];
          // Only recurse if the element is an array AND we haven't hit max depth.
          if (Array.isArray(el) && currentDepth < maxDepth) {
            flatten(el, currentDepth + 1);
          } else {
            result.push(el);
          }
        }
      }
    }

    flatten(this, 0);
    return result;
  };
}
```

#### 4. Dry Run — Walk Through a Real Example

```javascript
[[1, 2], [3, [4, 5]]].myFlat();
// maxDepth = 1. flatten(arr, 0)
// i=0: el=[1,2], isArray && 0 < 1 → flatten([1,2], 1)
//   i=0: el=1, not array → push(1)
//   i=1: el=2, not array → push(2)
// i=1: el=[3,[4,5]], isArray && 0 < 1 → flatten([3,[4,5]], 1)
//   i=0: el=3, not array → push(3)
//   i=1: el=[4,5], isArray && 1 < 1? NO → push([4,5])
// result = [1, 2, 3, [4, 5]] ✓
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**`depth = 0`** — should return a shallow copy, not the original reference.

**`depth = Infinity`** — `currentDepth < Infinity` is always true, so it flattens completely. No special case needed.

**Sparse arrays** — the `i in arr` guard preserves holes.

#### 7. 🧠 The Memory Hook

Track a `currentDepth` counter alongside `maxDepth`. Only recurse when the element is an array *and* you haven't hit the limit yet.

---

### `Array.prototype.includes`

#### 1. What the Interviewer Is Really Testing

The gotcha is **`NaN`**. `[NaN].indexOf(NaN)` returns `-1` because `indexOf` uses strict equality (`===`), and `NaN !== NaN`. But `[NaN].includes(NaN)` returns `true` because `includes` uses the **SameValueZero** algorithm, which treats `NaN` as equal to itself.

#### 3. The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myIncludes) {
  Array.prototype.myIncludes = function (searchElement, fromIndex) {
    if (this == null) throw new TypeError("called on null or undefined");

    const obj = Object(this);
    const len = obj.length >>> 0;

    if (len === 0) return false;

    // fromIndex can be negative (search from end).
    const n = fromIndex | 0;
    let k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

    while (k < len) {
      const el = obj[k];
      // SameValueZero: NaN equals NaN, -0 equals +0.
      // The NaN check: NaN !== NaN is the only case where el !== searchElement
      // but they should be considered equal.
      if (
        el === searchElement ||
        (searchElement !== searchElement && el !== el)
      ) {
        return true;
      }
      k++;
    }

    return false;
  };
}
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**`NaN` search** — `el !== el` is only true when `el` is `NaN`. Combined with `searchElement !== searchElement`, both must be `NaN` for this branch to be true.

**Negative `fromIndex`** — `fromIndex = -2` on a 5-element array starts searching from index `3` (5 - 2). Clamp to 0 if the result is negative.

#### 7. 🧠 The Memory Hook

`includes` uses SameValueZero: it finds `NaN` where `indexOf` can't. The `NaN` self-inequality trick: `x !== x` is only true when `x` is `NaN`.

---

### `Array.prototype.find` and `Array.prototype.findIndex`

These two are identical in structure — `find` returns the *element*, `findIndex` returns the *index*.

```javascript
if (!Array.prototype.myFind) {
  Array.prototype.myFind = function (predicate, thisArg) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");

    const obj = Object(this);
    const len = obj.length >>> 0;

    for (let i = 0; i < len; i++) {
      if (i in obj) {
        if (predicate.call(thisArg, obj[i], i, obj)) {
          return obj[i]; // return the element itself
        }
      }
    }
    return undefined; // not found
  };
}

if (!Array.prototype.myFindIndex) {
  Array.prototype.myFindIndex = function (predicate, thisArg) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");

    const obj = Object(this);
    const len = obj.length >>> 0;

    for (let i = 0; i < len; i++) {
      if (i in obj) {
        if (predicate.call(thisArg, obj[i], i, obj)) {
          return i; // return the index, not the element
        }
      }
    }
    return -1; // not found → -1, unlike find which returns undefined
  };
}
```

**`find` not found → `undefined`. `findIndex` not found → `-1`.** That asymmetry is the only thing worth remembering.

---

### `Array.prototype.some` and `Array.prototype.every`

These are logical duals of each other. `some` short-circuits on the first `true`. `every` short-circuits on the first `false`.

```javascript
if (!Array.prototype.mySome) {
  Array.prototype.mySome = function (callback, thisArg) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof callback !== "function") throw new TypeError(callback + " is not a function");

    const obj = Object(this);
    const len = obj.length >>> 0;

    for (let i = 0; i < len; i++) {
      if (i in obj) {
        if (callback.call(thisArg, obj[i], i, obj)) {
          return true; // short-circuit: at least one passes
        }
      }
    }
    return false;
  };
}

if (!Array.prototype.myEvery) {
  Array.prototype.myEvery = function (callback, thisArg) {
    if (this == null) throw new TypeError("called on null or undefined");
    if (typeof callback !== "function") throw new TypeError(callback + " is not a function");

    const obj = Object(this);
    const len = obj.length >>> 0;

    for (let i = 0; i < len; i++) {
      if (i in obj) {
        if (!callback.call(thisArg, obj[i], i, obj)) {
          return false; // short-circuit: at least one fails
        }
      }
    }
    return true;
  };
}
```

**Empty array:** `[].some(fn)` → `false` (no element ever returned true). `[].every(fn)` → `true` (vacuous truth — no element failed).

---

## Part 2 — Function Method Polyfills

### `Function.prototype.bind`

#### 1. What the Interviewer Is Really Testing

`bind` is one of the most common polyfill questions because it tests `this`, closures, and partial application all at once. The interviewer wants to know: can you capture context and pre-supply arguments using a closure?

#### 2. Think Before You Code — The Senior Dev Thought Process

`fn.bind(ctx, a, b)` returns a new function. When that new function is called later with `(c, d)`, it behaves as if `fn.call(ctx, a, b, c, d)` was called. Two sets of arguments: the ones given at *bind time*, and the ones given at *call time*.

The mechanism is a closure:
1. Capture `this` (the original function) as `originalFunc`.
2. Capture `ctx` as `boundThis`.
3. Capture any extra bind-time arguments as `boundArgs`.
4. Return a new function. When *that* function is called, concatenate `boundArgs` with the new call-time arguments and use `originalFunc.apply(boundThis, combined)`.

#### 3. The Solution — Fully Explained Code

```javascript
if (!Function.prototype.myBind) {
  Function.prototype.myBind = function (thisArg) {
    const originalFunc = this;

    if (typeof originalFunc !== "function") {
      throw new TypeError("myBind must be called on a function");
    }

    // Arguments provided at bind-time (after thisArg).
    const boundArgs = Array.prototype.slice.call(arguments, 1);

    const boundFunction = function () {
      // Arguments provided at call-time.
      const callArgs = Array.prototype.slice.call(arguments);

      // Merge: bind-time args come first, then call-time args.
      return originalFunc.apply(thisArg, boundArgs.concat(callArgs));
    };

    // Preserve the prototype chain so the bound function
    // can be used with `new` (simplified version).
    if (originalFunc.prototype) {
      boundFunction.prototype = Object.create(originalFunc.prototype);
    }

    return boundFunction;
  };
}
```

**Time/Space:** O(1) to create the bound function. O(n+m) when invoked, where n is bound args and m is call args.

#### 4. Dry Run — Walk Through a Real Example

```javascript
function greet(greeting, punctuation) {
  return `${greeting}, ${this.name}${punctuation}`;
}

const sayHi = greet.myBind({ name: "Alice" }, "Hi");
// originalFunc = greet, thisArg = {name:"Alice"}, boundArgs = ["Hi"]

sayHi("!"); // callArgs = ["!"], full args = ["Hi", "!"]
// greet.apply({name:"Alice"}, ["Hi", "!"]) → "Hi, Alice!" ✓
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**Partial application:** `bind` can be called with no extra args (`fn.bind(ctx)`) — `boundArgs` is empty, all args come at call time.

**`new` with bound functions:** In the real spec, when a bound function is used with `new`, `thisArg` is ignored and `new` gets its own object. Full spec compliance for this requires an `instanceof` check inside `boundFunction`.

#### 6. Variations and Follow-ups

> *"What's the difference between `bind` and partial application?"* — `bind` does both: it fixes `this` and can pre-fill arguments. Partial application libraries usually only pre-fill arguments and don't touch `this`.

#### 7. 🧠 The Memory Hook

`bind` = "save this context and these arguments in a box; hand the box back as a function. When the box is opened (called), add any new arguments and call the original."

---

### `Function.prototype.call` and `Function.prototype.apply`

#### 1. What the Interviewer Is Really Testing

**Important nuance:** A true polyfill for `call` and `apply` is not possible in JavaScript — they are fundamental engine operations. Implementing them would require using them, creating a circular dependency. Interviewers know this. What they're actually testing: *do you understand the `this` mechanism well enough to simulate the behaviour?*

#### 2. Think Before You Code — The Senior Dev Thought Process

How does JavaScript set `this` when you call `obj.method()`? It sets `this` to `obj`. So if I temporarily attach my target function *as a property of the context object*, calling it as a method will set `this` correctly. Then delete the temporary property to clean up.

The difference between `call` and `apply` is only the argument format:
- `call(ctx, a, b, c)` — individual args
- `apply(ctx, [a, b, c])` — array of args

#### 3. The Solution — Fully Explained Code

```javascript
// Demonstration — not a true polyfill (would need call/apply internally anyway).
if (!Function.prototype.myCall) {
  Function.prototype.myCall = function (thisArg, ...args) {
    // Handle null/undefined thisArg → in sloppy mode, defaults to global object.
    const context = thisArg == null ? globalThis : Object(thisArg);

    // Temporarily attach the function to the context object.
    // Using Symbol prevents property name collisions.
    const tempKey = Symbol("temp");
    context[tempKey] = this;

    // Calling it as a method sets 'this' to context inside the function.
    const result = context[tempKey](...args);

    // Clean up: remove the temporary property.
    delete context[tempKey];

    return result;
  };
}

if (!Function.prototype.myApply) {
  Function.prototype.myApply = function (thisArg, argsArray) {
    const context = thisArg == null ? globalThis : Object(thisArg);
    const tempKey = Symbol("temp");
    context[tempKey] = this;

    // The only difference from myCall: args come as an array.
    const result = argsArray
      ? context[tempKey](...argsArray)
      : context[tempKey]();

    delete context[tempKey];
    return result;
  };
}
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**`null` or `undefined` as context:** In sloppy mode, `fn.call(null)` sets `this` to the global object. In strict mode, `this` stays `null`. Use `globalThis` as the fallback for a simplified sloppy-mode simulation.

**Non-object `thisArg`:** `Object(thisArg)` wraps primitives in their wrapper objects (numbers, strings, etc.), matching spec behaviour.

#### 7. 🧠 The Memory Hook

`call` and `apply` work by temporarily attaching your function to the target object so that calling it as a property sets `this` correctly. The difference is individual args vs an array.

---

## Part 3 — Promise and Async Polyfills

### `Promise` (Simplified Core)

#### 1. What the Interviewer Is Really Testing

This is a senior-level question. The interviewer wants to know if you understand Promise internals: **three states** (pending, fulfilled, rejected), **state transitions are one-way**, and the **subscriber queue** pattern — callbacks registered before the promise settles get queued and run when it does, while callbacks registered after get run immediately (asynchronously).

#### 2. Think Before You Code — The Senior Dev Thought Process

A Promise is a state machine with a subscriber list.

- **State:** `pending` → `fulfilled` or `rejected` (one-way, one-time).
- **Value/reason:** stored once when state transitions.
- **Subscriber queues:** `.then(onFulfilled, onRejected)` registers callbacks. If already settled, schedule them asynchronously via `setTimeout(..., 0)` (simulating microtask behaviour). If still pending, push to the queue and fire when it settles.
- **Executor:** called immediately with `resolve` and `reject` functions.

#### 3. The Solution — Fully Explained Code

```javascript
function MyPromise(executor) {
  this.state = "pending";
  this.value = undefined;
  this.reason = undefined;
  this.onFulfilledCallbacks = [];
  this.onRejectedCallbacks = [];

  const resolve = (value) => {
    if (this.state !== "pending") return; // one-way state machine
    this.state = "fulfilled";
    this.value = value;
    // Drain the queue: run all registered onFulfilled callbacks.
    this.onFulfilledCallbacks.forEach((fn) => fn(this.value));
  };

  const reject = (reason) => {
    if (this.state !== "pending") return;
    this.state = "rejected";
    this.reason = reason;
    this.onRejectedCallbacks.forEach((fn) => fn(this.reason));
  };

  try {
    // The executor runs synchronously. If it throws, the promise rejects.
    executor(resolve, reject);
  } catch (err) {
    reject(err);
  }
}

MyPromise.prototype.then = function (onFulfilled, onRejected) {
  if (this.state === "fulfilled") {
    // Already settled — schedule callback asynchronously.
    setTimeout(() => onFulfilled(this.value), 0);
  } else if (this.state === "rejected") {
    setTimeout(() => onRejected(this.reason), 0);
  } else {
    // Still pending — queue the callbacks.
    if (typeof onFulfilled === "function") this.onFulfilledCallbacks.push(onFulfilled);
    if (typeof onRejected === "function") this.onRejectedCallbacks.push(onRejected);
  }
  // Note: a full Promises/A+ implementation returns a new promise for chaining.
};
```

#### 5. Edge Cases — The Ones That Break Naive Solutions

**Calling `resolve` multiple times:** The `if (this.state !== 'pending') return` guard prevents any state change after the first settlement.

**Executor throwing synchronously:** The `try/catch` around `executor(resolve, reject)` ensures a thrown error rejects the promise rather than propagating as an uncaught exception.

**`.then` returning a new promise (chaining):** Omitted above for clarity. A production-grade polyfill must return a new `MyPromise` from `.then` whose `resolve`/`reject` are connected to `onFulfilled`/`onRejected`.

#### 7. 🧠 The Memory Hook

A Promise is just a state machine (`pending → settled`) with a subscriber list. If you call `.then` before it settles, your callback goes in the queue. If you call it after, it fires immediately (async).

---

### `Promise.all`

#### 1. What the Interviewer Is Really Testing

Can you write a fan-out/fan-in pattern: dispatch N promises in parallel, collect all results *in order*, resolve only when all succeed, but reject immediately on the first failure?

#### 3. The Solution — Fully Explained Code

```javascript
if (!Promise.myAll) {
  Promise.myAll = function (promises) {
    return new Promise((resolve, reject) => {
      const results = [];
      let completed = 0;
      const total = promises.length;

      if (total === 0) {
        resolve(results); // edge case: empty array resolves immediately
        return;
      }

      promises.forEach((p, index) => {
        // Wrap in Promise.resolve() to handle non-promise values.
        Promise.resolve(p)
          .then((value) => {
            // Store at the ORIGINAL index, not in push order.
            // This preserves order even though promises settle at different times.
            results[index] = value;
            completed++;
            if (completed === total) {
              resolve(results); // all done
            }
          })
          .catch(reject); // first rejection → fail fast
      });
    });
  };
}
```

**Key insight:** `results[index] = value` (not `results.push(value)`) preserves order regardless of which promise settles first.

#### 7. 🧠 The Memory Hook

`Promise.all` is fan-out/fan-in with a counter. Track results *by index* (not push order) and resolve when `completed === total`. First rejection short-circuits everything.

---

### `Promise.race`, `Promise.allSettled`, `Promise.any`

```javascript
// race — first to settle (fulfill OR reject) wins.
if (!Promise.myRace) {
  Promise.myRace = function (promises) {
    return new Promise((resolve, reject) => {
      // Whichever settles first calls resolve or reject.
      // Because a promise can only settle once, subsequent calls are no-ops.
      promises.forEach((p) => Promise.resolve(p).then(resolve, reject));
    });
  };
}

// allSettled — wait for everyone, never reject, report status of each.
if (!Promise.myAllSettled) {
  Promise.myAllSettled = function (promises) {
    // Map each promise to a "safe" promise that always fulfills with a status object.
    const wrapped = promises.map((p) =>
      Promise.resolve(p)
        .then((value) => ({ status: "fulfilled", value }))
        .catch((reason) => ({ status: "rejected", reason }))
    );
    // Since none of the wrapped promises can reject, Promise.all never rejects here.
    return Promise.all(wrapped);
  };
}

// any — first to FULFILL wins. Rejects only if ALL reject (AggregateError).
if (!Promise.myAny) {
  Promise.myAny = function (promises) {
    return new Promise((resolve, reject) => {
      const errors = [];
      let rejectedCount = 0;
      const total = promises.length;

      if (total === 0) {
        reject(new AggregateError([], "All promises were rejected"));
        return;
      }

      promises.forEach((p, index) => {
        Promise.resolve(p).then(resolve).catch((err) => {
          errors[index] = err;
          rejectedCount++;
          if (rejectedCount === total) {
            reject(new AggregateError(errors, "All promises were rejected"));
          }
        });
      });
    });
  };
}
```

**The cheat-sheet:**

| Method | Resolves when | Rejects when |
|---|---|---|
| `Promise.all` | All fulfill | Any one rejects |
| `Promise.race` | Any one settles first | Any one rejects first |
| `Promise.allSettled` | All settle (never rejects) | Never |
| `Promise.any` | Any one fulfills | All reject (AggregateError) |

---

### `fetch` (via `XMLHttpRequest`)

#### 1. What the Interviewer Is Really Testing

`fetch` is a browser host API, not an ECMAScript feature. Writing a polyfill shows you understand both the modern Promise-based API and the older XHR-based one, and can bridge between them.

#### 3. The Solution — Fully Explained Code

```javascript
if (!window.fetch) {
  window.fetch = function (url, options) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const method = (options && options.method) || "GET";

      xhr.open(method, url, true); // true = asynchronous

      xhr.onload = function () {
        // Build a response object that mirrors the Fetch API's Response.
        const response = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          // Fetch Response methods are also async (return Promises).
          json: () => Promise.resolve(JSON.parse(xhr.responseText)),
          text: () => Promise.resolve(xhr.responseText),
        };
        resolve(response);
      };

      xhr.onerror = function () {
        // Real fetch rejects with TypeError on network failure, not HTTP errors.
        reject(new TypeError("Network request failed"));
      };

      if (options && options.headers) {
        Object.keys(options.headers).forEach((key) => {
          xhr.setRequestHeader(key, options.headers[key]);
        });
      }

      xhr.send(options ? options.body : null);
    });
  };
}
```

**Important:** Real `fetch` does not reject on HTTP error status codes (404, 500). It only rejects on network failures. The `ok` property is how you check for HTTP-level success. This polyfill mirrors that behaviour.

#### 7. 🧠 The Memory Hook

`fetch` is just XHR wrapped in a Promise. `onload` → resolve. `onerror` → reject with TypeError. HTTP errors (4xx, 5xx) don't reject — they resolve with `ok: false`.

---

### `async/await` — Transpilation via Generators

#### 1. What the Interviewer Is Really Testing

This is a trick question. `async/await` is **syntax**, not a runtime feature you can polyfill. It's implemented by **transpilation** — Babel transforms `async` functions into generator-based code at build time. The question tests whether you understand how that transformation works under the hood.

#### 2. Think Before You Code — The Senior Dev Thought Process

An `async` function is a generator function where `yield` plays the role of `await`. A "runner" function drives the generator: it calls `generator.next()`, gets back a `{ value: Promise, done: boolean }` pair, waits for the Promise to settle, then sends the result back into the generator with the next `generator.next(result)`.

#### 3. The Solution — Fully Explained Code

```javascript
// asyncToGenerator: the runner Babel produces when it transpiles async/await.
function asyncToGenerator(generatorFn) {
  return function () {
    const gen = generatorFn.apply(this, arguments);

    return new Promise((resolve, reject) => {
      function step(fn) {
        let result;
        try {
          result = fn();
        } catch (err) {
          return reject(err);
        }

        const { value, done } = result;

        if (done) {
          return resolve(value); // generator returned — the async fn is done
        }

        // value is (presumably) a promise. Wait for it, then resume.
        Promise.resolve(value).then(
          (resolved) => step(() => gen.next(resolved)),   // send result back in
          (err) => step(() => gen.throw(err))             // throw error back in
        );
      }

      step(() => gen.next(undefined)); // kick off the first step
    });
  };
}

// How Babel conceptually transforms async code:

// Original:
// async function fetchUser(id) {
//   const user = await getUser(id);
//   const posts = await getPosts(user.id);
//   return posts;
// }

// Transpiled:
const fetchUser = asyncToGenerator(function* (id) {
  const user = yield getUser(id);   // 'yield' becomes 'await'
  const posts = yield getPosts(user.id);
  return posts;
});
```

#### 7. 🧠 The Memory Hook

`async/await` is a generator with a driver loop. `await` = `yield`. The driver calls `.next()`, waits for the yielded Promise, then sends the resolved value back into the generator with the next `.next(value)`.

---

### `setTimeout` and `setInterval` — Why You Cannot Polyfill Them

An interviewer who asks this is testing whether you'll confidently say "it's not possible and here's why" rather than bluffing.

`setTimeout` and `setInterval` are **host objects** — provided by the browser (or Node.js) environment, not by the JavaScript language spec. They are directly wired into the environment's event loop scheduler. You cannot access or replicate the event loop from within JavaScript.

Any "polyfill" attempt would either:
1. **Call the original `setTimeout`** → circular, not a polyfill.
2. **Use a busy-wait loop** (`while (Date.now() < deadline)`) → blocks the entire main thread for the duration. This is the opposite of what timers do.

**The correct interview answer:** *"setTimeout and setInterval are host environment features, not ECMAScript features. They can't be polyfilled from within JavaScript because they depend on the environment's own event loop machinery. Any attempt is either circular or blocks the thread."*

---

## Part 4 — Other Common Polyfills

### `Object.create`

#### 1. What the Interviewer Is Really Testing

This tests whether you understand JavaScript's prototypal inheritance at the pre-ES5 level. `Object.create(proto)` creates a new object whose `[[Prototype]]` is set to `proto`. The classic trick for doing this before `Object.create` existed was a temporary constructor function.

#### 3. The Solution — Fully Explained Code

```javascript
if (typeof Object.create !== "function") {
  Object.create = function (proto, propertiesObject) {
    if (typeof proto !== "object" && typeof proto !== "function") {
      throw new TypeError("Object prototype may only be an Object or null: " + proto);
    }

    // The classic trick: create a temporary constructor,
    // set its prototype, and instantiate it.
    // 'new F()' creates an object whose __proto__ is F.prototype.
    function F() {}
    F.prototype = proto;
    const obj = new F();

    // Handle the second argument (property descriptors), if provided.
    if (propertiesObject !== undefined) {
      Object.defineProperties(obj, propertiesObject);
    }

    return obj;
  };
}
```

#### 4. Dry Run — Walk Through a Real Example

```javascript
const animal = { breathe() { return "breathing"; } };
const dog = Object.create(animal);
dog.bark = function() { return "woof"; };

dog.bark();    // "woof"      — own property
dog.breathe(); // "breathing" — inherited via prototype chain ✓
```

#### 7. 🧠 The Memory Hook

`Object.create(proto)` = create an empty constructor, set its `.prototype` to `proto`, return `new Constructor()`. The new instance's `__proto__` points to `proto`.

---

### `requestAnimationFrame`

#### 1. What the Interviewer Is Really Testing

`rAF` is a browser API for scheduling animation callbacks. The test: do you know *why* it's better than `setTimeout(fn, 16)` for animations, and can you fall back to `setTimeout` when `rAF` doesn't exist?

**`rAF` advantages over `setTimeout(fn, 16)`:**
- Synchronized with the browser's display refresh (typically 60Hz or 120Hz).
- Automatically pauses when the tab is hidden (battery savings).
- No drift accumulation — each callback is tied to an actual paint frame.

#### 3. The Solution — Fully Explained Code

```javascript
(function () {
  // Check vendor-prefixed versions first (older Chrome/Firefox/IE).
  const vendors = ["ms", "moz", "webkit", "o"];
  for (let i = 0; i < vendors.length && !window.requestAnimationFrame; i++) {
    window.requestAnimationFrame = window[vendors[i] + "RequestAnimationFrame"];
    window.cancelAnimationFrame =
      window[vendors[i] + "CancelAnimationFrame"] ||
      window[vendors[i] + "CancelRequestAnimationFrame"];
  }

  // If still missing, fall back to setTimeout targeting ~60fps.
  if (!window.requestAnimationFrame) {
    let lastFrameTime = 0;

    window.requestAnimationFrame = function (callback) {
      const now = Date.now();
      // Aim for 16.7ms between frames (60fps). Clamp to at least 0.
      const delay = Math.max(0, 16 - (now - lastFrameTime));

      const id = window.setTimeout(function () {
        callback(lastFrameTime + delay); // pass DOMHighResTimeStamp approximation
      }, delay);

      lastFrameTime = now + delay;
      return id;
    };
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }
})();
```

#### 7. 🧠 The Memory Hook

`rAF` polyfill = vendor prefix check → `setTimeout` targeting 16ms (60fps). Real `rAF` is always better for animations; the `setTimeout` version just keeps things working in old browsers.

---

### `localStorage` (via Cookies)

#### 1. What the Interviewer Is Really Testing

More architectural awareness than implementation skill. The question is: do you know the limitations of cookies as a storage fallback (4KB limit, sent with every HTTP request, no native key-value API) and can you build a compatible API on top of them?

#### 3. The Solution — Fully Explained Code

```javascript
(function () {
  // First, check if localStorage actually works (private browsing can break it).
  try {
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return; // localStorage works fine, no polyfill needed.
  } catch (e) {
    // Fall through to polyfill.
  }

  const CookieStorage = {
    setItem(key, value) {
      // Cookies expire far in the future to mimic localStorage persistence.
      document.cookie =
        encodeURIComponent(key) +
        "=" +
        encodeURIComponent(String(value)) +
        "; expires=Fri, 31 Dec 2099 23:59:59 GMT; path=/";
    },

    getItem(key) {
      const name = encodeURIComponent(key) + "=";
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const c = cookies[i].trim();
        if (c.startsWith(name)) {
          return decodeURIComponent(c.substring(name.length));
        }
      }
      return null; // localStorage returns null for missing keys, not undefined.
    },

    removeItem(key) {
      // To delete a cookie, set its expiry to the past.
      document.cookie =
        encodeURIComponent(key) +
        "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    },

    clear() {
      document.cookie.split(";").forEach((c) => {
        const key = c.split("=")[0].trim();
        this.removeItem(decodeURIComponent(key));
      });
    },
  };

  window.localStorage = CookieStorage;
})();
```

**Limitations of this polyfill (worth mentioning in an interview):**
- Cookies are capped at ~4KB per cookie. `localStorage` supports ~5–10MB.
- Cookie values are sent with every HTTP request — `localStorage` values are not.
- Cookie keys cannot contain certain characters without URL-encoding.

#### 7. 🧠 The Memory Hook

`localStorage` polyfill = cookie-based key-value store. Same API surface (`setItem`, `getItem`, `removeItem`, `clear`) but limited by cookie size and HTTP transmission overhead.

---

## Summary Table — All Polyfills at a Glance

| Polyfill | Type | Key Contract |
|---|---|---|
| `Array.map` | Array | Transform each element; return same-length array; preserve holes |
| `Array.filter` | Array | Keep elements where predicate is truthy; push, don't pre-allocate |
| `Array.reduce` | Array | Accumulate; handle missing `initialValue` with a skip-hole scan |
| `Array.forEach` | Array | Side-effects only; always returns `undefined` |
| `Array.flat` | Array | Recursive depth-limited flattening; track `currentDepth` |
| `Array.includes` | Array | SameValueZero — finds `NaN`; `indexOf` cannot |
| `Array.find` | Array | Returns element or `undefined` |
| `Array.findIndex` | Array | Returns index or `-1` |
| `Array.some` | Array | Short-circuit on first `true` |
| `Array.every` | Array | Short-circuit on first `false`; empty → `true` |
| `Function.bind` | Function | Closure over context + partial args |
| `Function.call` | Function | Temp property trick to set `this` (not a true polyfill) |
| `Function.apply` | Function | Same as `call` but takes arg array |
| `Promise` (core) | Async | State machine + subscriber queues |
| `Promise.all` | Async | Fan-out, track by index, fail-fast |
| `Promise.race` | Async | First to settle wins |
| `Promise.allSettled` | Async | Never rejects; status objects for each |
| `Promise.any` | Async | First to fulfill wins; AggregateError if all reject |
| `fetch` | Browser | XHR wrapped in Promise; HTTP errors don't reject |
| `async/await` | Transpile | Generator + runner loop (not a runtime polyfill) |
| `setTimeout/Interval` | Impossible | Host objects — cannot be polyfilled |
| `Object.create` | Object | Temp constructor → `new` → prototype set |
| `requestAnimationFrame` | Browser | Vendor prefix fallback → `setTimeout(fn, ~16ms)` |
| `localStorage` | Browser | Cookie-based storage; 4KB limit, HTTP overhead |
