# JavaScript Polyfills

> For implementation challenges beyond polyfills → [DSA Implementations](../dsa/implementations.md).
> Canonical Promise theory → [Core Concepts](concepts/promises.md).

Polyfill questions are not really about recreating the standard library from memory. They test whether you can recover an API's contract, identify the runtime behavior hidden behind the friendly method name, and implement only what JavaScript can actually control.

The examples below are interview-sized implementations. They remain readable, but they also respect the details that separate a convincing answer from a loop that merely works for `[1, 2, 3]`: `this`, callback arguments, sparse arrays, `SameValueZero`, one-way Promise settlement, ordering, and host-environment boundaries.

## 1. Array iteration methods: one contract, several policies

### What the Interviewer Is Really Testing

This group tests whether you can see the shared machinery behind `map`, `filter`, `forEach`, `find`, `some`, and `every`. The shared contract is: convert the receiver to an object, snapshot its length before iterating, call the callback with `(value, index, object)`, and honor `thisArg`. `map`, `filter`, `forEach`, `some`, and `every` skip missing indices; `find` and `findIndex` are the important exception and call the predicate for every index, reading a hole as `undefined`. Each method then differs in what it does with the callback result.

### Think Before You Code — The Senior Dev Thought Process

I separate the invariant from the policy. The invariant is the iteration skeleton; the policy is “write a transformed value,” “keep the value,” “stop when true,” or “stop when false.” I avoid `for...of` because it is value-oriented and does not expose the same sparse-array contract. For the hole-skipping methods, `index in object` preserves the distinction between a hole and an explicit `undefined`; for `find` and `findIndex`, I deliberately omit that guard because their contract reads every index. I snapshot `length` once because native methods do not keep discovering newly appended indices during the same call.

### The Solution — Fully Explained Code

```javascript
function toObject(value) {
  if (value == null) throw new TypeError("Cannot convert null or undefined to an object");
  return Object(value);
}

function toLength(value) {
  // Number(1n) would silently coerce a BigInt; the relevant ECMAScript
  // abstract operations must throw instead.
  if (typeof value === "bigint") throw new TypeError("Cannot convert a BigInt to a number");
  const number = Number(value);
  if (Number.isNaN(number) || number <= 0) return 0;
  return Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER);
}

function toIntegerOrInfinity(value) {
  if (typeof value === "bigint") throw new TypeError("Cannot convert a BigInt to a number");
  const number = Number(value);
  if (Number.isNaN(number) || number === 0) return 0;
  if (number === Infinity || number === -Infinity) return number;
  return number < 0 ? Math.ceil(number) : Math.floor(number);
}

if (!Array.prototype.myMap) {
  Array.prototype.myMap = function (callback, thisArg) {
    const object = toObject(this);
    if (typeof callback !== "function") throw new TypeError("callback must be a function");
    const length = toLength(object.length); // Snapshot before callbacks can mutate length.
    const result = new Array(length);
    for (let index = 0; index < length; index += 1) {
      if (index in object) {
        // Write only existing indices so holes stay holes in the result.
        result[index] = callback.call(thisArg, object[index], index, object);
      }
    }
    return result;
  };
}

if (!Array.prototype.myFilter) {
  Array.prototype.myFilter = function (callback, thisArg) {
    const object = toObject(this);
    if (typeof callback !== "function") throw new TypeError("callback must be a function");
    const length = toLength(object.length);
    const result = [];
    for (let index = 0; index < length; index += 1) {
      if (index in object && callback.call(thisArg, object[index], index, object)) {
        // Filter returns the original value, not true/false from the predicate.
        result.push(object[index]);
      }
    }
    return result;
  };
}

if (!Array.prototype.myForEach) {
  Array.prototype.myForEach = function (callback, thisArg) {
    const object = toObject(this);
    if (typeof callback !== "function") throw new TypeError("callback must be a function");
    const length = toLength(object.length);
    for (let index = 0; index < length; index += 1) {
      if (index in object) callback.call(thisArg, object[index], index, object);
    }
    // Deliberately no return: native forEach always returns undefined.
  };
}

if (!Array.prototype.myFind) {
  Array.prototype.myFind = function (predicate, thisArg) {
    const object = toObject(this);
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    const length = toLength(object.length);
    for (let index = 0; index < length; index += 1) {
      // find is intentionally different: a hole is visited as undefined.
      if (predicate.call(thisArg, object[index], index, object)) return object[index];
    }
    return undefined;
  };
}

if (!Array.prototype.myFindIndex) {
  Array.prototype.myFindIndex = function (predicate, thisArg) {
    const object = toObject(this);
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    const length = toLength(object.length);
    for (let index = 0; index < length; index += 1) {
      // findIndex also visits holes, so predicate receives undefined for one.
      if (predicate.call(thisArg, object[index], index, object)) return index;
    }
    return -1;
  };
}

if (!Array.prototype.mySome) {
  Array.prototype.mySome = function (predicate, thisArg) {
    const object = toObject(this);
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    const length = toLength(object.length);
    for (let index = 0; index < length; index += 1) {
      if (index in object && predicate.call(thisArg, object[index], index, object)) return true;
    }
    return false;
  };
}

if (!Array.prototype.myEvery) {
  Array.prototype.myEvery = function (predicate, thisArg) {
    const object = toObject(this);
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    const length = toLength(object.length);
    for (let index = 0; index < length; index += 1) {
      if (index in object && !predicate.call(thisArg, object[index], index, object)) return false;
    }
    return true;
  };
}
```

**Complexity:** all six methods are O(n) in the worst case. `map` uses O(n) result space; `filter` uses O(k), where `k` is retained values; the others use O(1) auxiliary space.

### Dry Run — Walk Through a Real Example

```javascript
const sparse = [10, , 30];
sparse.myMap((value, index) => value + index);
// length = 3. Index 0 writes 10; index 1 is absent and stays a hole; index 2 writes 32.
// => [10, <empty>, 32], not [10, undefined, 32].

const seen = [];
[, 2].myFind((value, index) => { seen.push([value, index]); return false; });
// find does not skip index 0: seen is [[undefined, 0], [2, 1]].

[].mySome(() => true);   // false: nothing can satisfy the predicate.
[].myEvery(() => false); // true: nothing violated the predicate.
```

### Edge Cases — The Ones That Break Naive Solutions

- **Using `this.length` every iteration:** a callback can change `length`; native methods use the initial snapshot.
- **Treating a hole as `undefined`:** `1 in [ , ]` is false, while `1 in [undefined]` is true.
- **Returning a result from `forEach`:** callback results are ignored and the method returns `undefined`.
- **Forgetting short-circuiting:** `some`, `every`, `find`, and `findIndex` stop as soon as the answer is known.
- **Assuming the receiver must be an Array:** `Object(this)` makes the methods generic for array-like objects too.

### Variations and Follow-ups

`reduce` uses the same iteration skeleton but has a special accumulator-seeding rule, so it deserves its own challenge. `reduceRight` is the same algorithm in reverse. A generic method can be called with `Array.prototype.myMap.call(arrayLike, callback)`.

### Interview Questions

**Q: Do `find` and `findIndex` skip holes the way `map` does?**

No. `map`, `filter`, `forEach`, `some`, and `every` perform a `HasProperty` check and skip an absent index. `find` and `findIndex` perform a `Get` for every index below the snapshotted length, so a hole is passed to the predicate as `undefined`. That is why the implementation deliberately has no `index in object` guard for those two methods. Confusing these two families is a common sign that the implementation was copied from a generic loop without checking each API’s contract.

**Q: Why snapshot length but check property existence during the loop?**

Length is snapshotted so an append cannot extend the current traversal. Property existence is checked at the moment an index is reached because an earlier callback can delete or create a later property. The method therefore has a fixed boundary but a live view of indices inside that boundary.

### 🧠 The Memory Hook

Every array iterator is “snapshot the length, visit only indices that exist, call with value/index/object.” After that, the method’s personality is transform, keep, observe, find, or short-circuit.

## 2. `reduce`: the accumulator is the whole problem

### What the Interviewer Is Really Testing

The loop is easy. The real test is whether you understand the two starting modes: an explicit `initialValue`, or the first present element when no initial value is supplied. It also tests whether you distinguish an omitted argument from an explicitly supplied `undefined`.

### Think Before You Code — The Senior Dev Thought Process

I record `arguments.length >= 2`. If true, index zero is eligible and the accumulator starts with the supplied value. If false, I scan for the first present index, use that element as the accumulator, and begin after it. An empty or all-hole array without a seed must throw; there is no honest accumulator to return.

### The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myReduce) {
  Array.prototype.myReduce = function (callback, initialValue) {
    const object = toObject(this);
    if (typeof callback !== "function") throw new TypeError("callback must be a function");
    const length = toLength(object.length);
    let index = 0;
    let accumulator;

    if (arguments.length >= 2) {
      accumulator = initialValue; // Explicit undefined is still a real seed.
    } else {
      while (index < length && !(index in object)) index += 1;
      if (index >= length) throw new TypeError("Reduce of empty array with no initial value");
      accumulator = object[index];
      index += 1; // The seed is not passed to the callback a second time.
    }

    for (; index < length; index += 1) {
      if (index in object) accumulator = callback(accumulator, object[index], index, object);
    }
    return accumulator;
  };
}
```

**Complexity:** O(n) time and O(1) auxiliary space.

### Dry Run — Walk Through a Real Example

```javascript
[ , 2, 3].myReduce((sum, value) => sum + value);
// Skip the hole at 0; seed with 2 at index 1; callback(2, 3) returns 5.

[1, 2].myReduce((sum, value) => sum + value, undefined);
// The seed is explicitly undefined, so callback(undefined, 1) runs.
```

### Edge Cases — The Ones That Break Naive Solutions

- `[42].reduce(fn)` returns `42` without calling `fn`.
- `[].reduce(fn)` and `[ , ].reduce(fn)` throw without an initial value.
- Checking `initialValue !== undefined` is wrong; check `arguments.length`.
- The callback’s return value replaces the accumulator. Forgetting to return turns the next accumulator into `undefined`.

### Variations and Follow-ups

`reduceRight` scans downward and seeds from the last present element. For grouping records, use an object or `Map` as an explicit accumulator so empty input still has a defined result.

### Interview Questions

**Q: What happens when `initialValue` is omitted?**

The first present element becomes the accumulator, and the callback starts at the next index. A single-element array returns that element without calling the callback. An empty or all-hole array throws `TypeError` because there is no seed. The implementation must use `arguments.length >= 2`, not `initialValue !== undefined`, because an explicitly supplied `undefined` is still an initial value.

**Q: Does `reduce` skip holes?**

Yes. It searches for the first present element when seeding and ignores absent indices during later iterations. An explicit `undefined` is present and is passed to the callback; a hole is not.

### 🧠 The Memory Hook

`reduce` means “choose a seed, then repeatedly replace the accumulator with the callback’s return value.” The seed rule is the interview question.

## 3. `flat` and `includes`: recursion versus equality

### What the Interviewer Is Really Testing

`flat` tests controlled recursion; `includes` tests `SameValueZero`, negative starting positions, and a different sparse-array rule. These methods punish the instinct to write a generic loop without first recovering the contract.

### Think Before You Code — The Senior Dev Thought Process

For `flat`, I pass current depth into a helper and recurse only while it is below the requested maximum. For `includes`, I normalize `fromIndex`, then compare using strict equality plus the special case that `NaN` equals `NaN`. Unlike the iterator methods above, `includes` observes a hole as `undefined` for comparison.

### The Solution — Fully Explained Code

```javascript
if (!Array.prototype.myFlat) {
  Array.prototype.myFlat = function (depth = 1) {
    const object = toObject(this);
    const maxDepth = toIntegerOrInfinity(depth);
    const result = [];

    function flatten(source, currentDepth) {
      for (let index = 0; index < source.length; index += 1) {
        if (!(index in source)) continue;
        const value = source[index];
        if (Array.isArray(value) && currentDepth < maxDepth) flatten(value, currentDepth + 1);
        else result.push(value);
      }
    }
    flatten(object, 0);
    return result;
  };
}

if (!Array.prototype.myIncludes) {
  Array.prototype.myIncludes = function (searchElement, fromIndex = 0) {
    const object = toObject(this);
    const length = toLength(object.length);
    if (length === 0) return false;
    const integer = toIntegerOrInfinity(fromIndex);
    if (integer === Infinity) return false;
    let index = integer >= 0 ? integer : Math.max(length + integer, 0);

    while (index < length) {
      const value = object[index]; // Reading a hole produces undefined.
      if (value === searchElement || (Number.isNaN(value) && Number.isNaN(searchElement))) return true;
      index += 1;
    }
    return false;
  };
}
```

**Complexity:** `flat` is O(n) over visited values with O(d) recursion stack plus output; `includes` is O(n) time and O(1) auxiliary space.

### Dry Run — Walk Through a Real Example

```javascript
[[1, 2], [3, [4]]].myFlat(1);
// Flatten the first level: 1, 2, 3 are emitted; [4] is at the depth limit.
// => [1, 2, 3, [4]]

[NaN].myIncludes(NaN); // true: SameValueZero treats NaN as equal to itself.
[ , ].myIncludes(undefined); // true: the hole is read as undefined.

[[1], [2]].myFlat(1.5); // same as depth 1: fractional depth is truncated toward zero.
[[[1]]].myFlat(Infinity); // [1]: Infinity means keep flattening.
```

### Edge Cases — The Ones That Break Naive Solutions

- `flat(0)` returns a shallow, hole-free array: `[ , 1].flat(0)` is `[1]`, not `[<empty>, 1]`. The traversal still skips absent source indices, but its depth check prevents flattening nested arrays.
- `flat(1.5)` uses ToIntegerOrInfinity, so the effective depth is `1`, not `1.5`.
- `flat(Infinity)` recurses until nested arrays are exhausted, subject to stack limits.
- `indexOf(NaN)` and `includes(NaN)` differ intentionally: strict equality versus `SameValueZero`.
- A negative `fromIndex` is added to length and clamped to zero; a starting index at or beyond length returns false.
- `flat(1n)` and `includes(value, 1n)` throw `TypeError`; BigInt is not silently converted to a Number.

### Variations and Follow-ups

For unbounded nesting, an explicit stack avoids recursion-depth limits. For `indexOf`, use `===` and skip holes. Whether holes are preserved depends on the exact native method.

### Interview Questions

**Q: Why does `includes(NaN)` return true when `indexOf(NaN)` does not?**

`indexOf` uses strict equality, and `NaN === NaN` is false. `includes` uses `SameValueZero`, which is strict equality plus the rule that `NaN` matches `NaN`; it also treats `-0` and `+0` as equal. The `Number.isNaN` branch is the readable way to express that exception.

**Q: What does `flat(1.5)` mean, and what does `flat(Infinity)` mean?**

The depth goes through `ToIntegerOrInfinity`: `1.5` becomes `1` by truncating toward zero, while `Infinity` remains `Infinity` and allows recursive flattening until no nested arrays remain. A BigInt depth is not converted to a Number; it throws `TypeError`.

**Q: Why can’t `flat(0)` simply return `slice()`?**

Because `flat` removes holes even when it does not flatten nested arrays. At depth zero, the algorithm must still walk the top level, skip absent indices, and emit present values—including nested arrays as intact values. `slice()` preserves the hole, so the same flattening loop is required for correct shallow semantics.

### 🧠 The Memory Hook

`flat` carries a depth counter down the tree. `includes` carries a different rule: strict equality, except `NaN` finally counts as itself.

## 4. `bind`, `call`, and `apply`: controlling `this`

### What the Interviewer Is Really Testing

This tests invocation semantics and closures. `bind` returns a new reusable function and optionally pre-fills arguments. `call` and `apply` invoke immediately with a chosen receiver. The important boundary is that `call` and `apply` themselves are engine primitives, so JavaScript can only simulate them.

### Think Before You Code — The Senior Dev Thought Process

For `bind`, I capture the original function, receiver, and bound arguments. Each invocation concatenates new arguments after the bound ones. For `call` and `apply`, I delegate to `Reflect.apply`: that is the engine-level operation that gives us the exact receiver behavior, including strict functions and primitive `this` values. A temporary-property trick is useful history, but it is only an approximation.

### The Solution — Fully Explained Code

```javascript
if (!Function.prototype.myBind) {
  Function.prototype.myBind = function (thisArg, ...boundArgs) {
    const original = this;
    if (typeof original !== "function") throw new TypeError("myBind must be called on a function");
    function bound(...callArgs) {
      const allArgs = [...boundArgs, ...callArgs];
      if (new.target) {
        // Native bind ignores thisArg under `new`. Use original as the newTarget
        // when the wrapper itself was constructed so its prototype is preserved.
        const newTarget = new.target === bound ? original : new.target;
        return Reflect.construct(original, allArgs, newTarget);
      }
      return Reflect.apply(original, thisArg, allArgs);
    };
    // Native bound functions do not need an own prototype; Reflect.construct uses
    // the original prototype through the substituted newTarget above.
    delete bound.prototype;
    Object.defineProperty(bound, Symbol.hasInstance, {
      value(instance) {
        // Keep `instanceof bound` meaningful even though bound has no prototype.
        return instance instanceof original;
      },
    });
    return bound;
  };
}

// These are exact invocation helpers, not replacements for the engine primitive
// Function.prototype.call/apply. Reflect.apply supplies the real semantics.
function myCall(fn, thisArg, ...args) {
  if (typeof fn !== "function") throw new TypeError("target must be a function");
  return Reflect.apply(fn, thisArg, args);
}

function myApply(fn, thisArg, args) {
  if (typeof fn !== "function") throw new TypeError("target must be a function");
  return Reflect.apply(fn, thisArg, args == null ? [] : Array.from(args));
}
```

**Complexity:** creating a bound function is O(1); invoking it takes O(b + c) to assemble bound and call-time arguments. The simulations use O(a) temporary argument space.

### Dry Run — Walk Through a Real Example

```javascript
function greet(greeting, punctuation) { return `${greeting}, ${this.name}${punctuation}`; }
const sayHi = greet.myBind({ name: "Ada" }, "Hi");
sayHi("!");
// The closure stores Ada and Hi; the call adds !; greet receives ["Hi", "!"] => "Hi, Ada!".

myCall(greet, { name: "Grace" }, "Hello", "."); // "Hello, Grace."

function Person(name) { this.name = name; }
Person.prototype.kind = "person";
const BoundPerson = Person.myBind({ name: "ignored" }, "Ada");
const ada = new BoundPerson();
// new ignores the bound receiver: ada.name is "Ada", and ada instanceof Person is true.
```

### Edge Cases — The Ones That Break Naive Solutions

- Arrow functions have lexical `this`; `call`, `apply`, and `bind` cannot replace it.
- With `new`, a real bound function ignores its bound receiver and uses the new instance. Full support needs `Reflect.construct` and prototype handling.
- Use a `Symbol`, not a string temporary property, to avoid collisions.
- `myCall` and `myApply` are exact invocation helpers because they delegate to `Reflect.apply`; they are not replacements for the engine’s own `Function.prototype.call/apply` methods.

### Variations and Follow-ups

Implement constructor support with `new.target`, `Reflect.construct`, and a prototype relationship. Compare bind with partial application: partial application pre-fills arguments; bind also fixes `this` for ordinary calls.

### Interview Questions

**Q: Can `call` and `apply` be polyfilled exactly in JavaScript?**

Not as replacements for the engine methods. `Reflect.apply` is the primitive that already performs the exact invocation semantics, including strict-mode `this` and primitive receivers. A temporary-property trick is only an approximation: it changes the receiver into an object and cannot reproduce strict-mode behavior reliably. The `myCall` and `myApply` helpers below delegate to `Reflect.apply` on purpose; they demonstrate the contract without pretending to reimplement the engine.

**Q: What changes when a bound function is called with `new`?**

The bound `thisArg` is ignored. JavaScript creates the new instance, passes it as `this`, and uses the original function’s prototype relationship. A practical implementation checks `new.target`, uses `Reflect.construct`, and substitutes the original function as the new target when the bound wrapper itself is constructed. Ordinary calls still use the captured receiver.

### 🧠 The Memory Hook

`bind` puts a function, receiver, and arguments in a closure for later. `call` opens that box now with separate arguments; `apply` opens it now with one argument list.

## 5. Promise core and combinators

### What the Interviewer Is Really Testing

This is a state-machine and ordering question. A Promise settles once, callbacks run asynchronously, `then` returns a new Promise, and combinators normalize ordinary values as well as thenables. For `all` and `any`, completion order must not silently replace input order.

### Think Before You Code — The Senior Dev Thought Process

I model `pending → fulfilled` or `pending → rejected`, with no reverse transition. Every `then` gets its own Promise so its callback can transform a value, recover from an error, or create another asynchronous link. Combinators preserve input indices, count completions, and rely on the returned Promise’s settlement guard so only the winning outcome matters.

### The Solution — Fully Explained Code

```javascript
class MyPromise {
  constructor(executor) {
    this.state = "pending";
    this.value = undefined;
    this.handlers = [];

    const fulfill = (value) => {
      if (this.state !== "pending") return;
      this.state = "fulfilled";
      this.value = value;
      const handlers = this.handlers.splice(0);
      queueMicrotask(() => handlers.forEach((handler) => this.run(handler)));
    };
    const reject = (reason) => {
      if (this.state !== "pending") return;
      this.state = "rejected";
      this.value = reason;
      const handlers = this.handlers.splice(0);
      queueMicrotask(() => handlers.forEach((handler) => this.run(handler)));
    };
    const resolve = (value) => {
      if (this.state !== "pending") return;
      if (value === this) return reject(new TypeError("A promise cannot resolve itself"));
      if (value && (typeof value === "object" || typeof value === "function")) {
        let then;
        try { then = value.then; } catch (error) { return reject(error); }
        if (typeof then === "function") {
          let called = false;
          try {
            then.call(value,
              (next) => { if (!called) { called = true; resolve(next); } },
              (error) => { if (!called) { called = true; reject(error); } });
          } catch (error) { if (!called) reject(error); }
          return;
        }
      }
      fulfill(value);
    };
    try { executor(resolve, reject); } catch (error) { reject(error); }
  }

  run(handler) {
    const callback = this.state === "fulfilled" ? handler.onFulfilled : handler.onRejected;
    if (typeof callback !== "function") {
      (this.state === "fulfilled" ? handler.resolve : handler.reject)(this.value);
      return;
    }
    try { handler.resolve(callback(this.value)); } catch (error) { handler.reject(error); }
  }

  then(onFulfilled, onRejected) {
    const next = new MyPromise((resolve, reject) => {
      const handler = { onFulfilled, onRejected, resolve, reject };
      if (this.state === "pending") this.handlers.push(handler);
      else queueMicrotask(() => this.run(handler));
    });
    return next;
  }

  catch(onRejected) { return this.then(undefined, onRejected); }
  static resolve(value) { return value instanceof MyPromise ? value : new MyPromise((resolve) => resolve(value)); }
  static reject(reason) { return new MyPromise((_, reject) => reject(reason)); }
  static all(iterable) {
    return new MyPromise((resolve, reject) => {
      const values = Array.from(iterable);
      if (values.length === 0) return resolve([]);
      const results = new Array(values.length);
      let completed = 0;
      values.forEach((value, index) => MyPromise.resolve(value).then((result) => {
        results[index] = result; // Input order, not completion order.
        completed += 1;
        if (completed === values.length) resolve(results);
      }, reject));
    });
  }
}

function myRace(iterable) {
  return new MyPromise((resolve, reject) => {
    for (const value of iterable) MyPromise.resolve(value).then(resolve, reject);
  });
}

function myAllSettled(iterable) {
  const wrapped = Array.from(iterable, (value) => MyPromise.resolve(value).then(
    (result) => ({ status: "fulfilled", value: result }),
    (reason) => ({ status: "rejected", reason }),
  ));
  return MyPromise.all(wrapped);
}

function myAny(iterable) {
  return new MyPromise((resolve, reject) => {
    const values = Array.from(iterable);
    if (values.length === 0) return reject(new AggregateError([], "All promises were rejected"));
    const errors = new Array(values.length);
    let rejected = 0;
    values.forEach((value, index) => MyPromise.resolve(value).then(resolve, (reason) => {
      errors[index] = reason;
      rejected += 1;
      if (rejected === values.length) reject(new AggregateError(errors, "All promises were rejected"));
    }));
  });
}
```

**Complexity:** each combinator is O(n); result/error arrays use O(n) space. Each `then` creates one new Promise and queued handlers stay retained until settlement.

### Dry Run — Walk Through a Real Example

```javascript
MyPromise.all([
  new MyPromise((resolve) => setTimeout(() => resolve("slow"), 20)),
  MyPromise.resolve("fast"),
]).then(console.log);
// "fast" settles first and is stored at results[1]. "slow" reaches results[0].
// The counter reaches 2, so the output is ["slow", "fast"].
```

### Edge Cases — The Ones That Break Naive Solutions

- Calling `resolve` twice, or a hostile thenable calling both callbacks, must honor only the first settlement.
- Returning the same Promise from a callback must reject instead of waiting forever.
- Missing handlers pass fulfillment through or propagate rejection.
- `all([])` resolves to `[]`; `any([])` rejects with `AggregateError`.
- `race` takes the first settlement; `allSettled` records all; `any` waits for the first fulfillment.
- A real implementation also handles iterator closing, species, unhandled rejection reporting, and exact host microtask behavior; this is a teaching implementation, not a drop-in replacement.

### Variations and Follow-ups

Explain why `Promise.all` stores by index, why `Promise.any` stores errors by index, and why `fetch` does not reject for HTTP 500. If asked to build a production Promise, discuss tests for thenables, chaining, thrown callbacks, and asynchronous handler execution before adding features.

### Interview Questions

**Q: What important Promise behavior is simplified here?**

The implementation covers the useful interview core: one-way settlement, thenable assimilation, asynchronous handlers, pass-through handlers, chaining, and input-order results for `all`. A production Promise also has exact iterator-closing behavior, species constructors, unhandled-rejection tracking, precise host scheduling, and more edge cases around subclassing. The right answer is to name those boundaries, not to call a small teaching implementation a drop-in replacement.

**Q: Why does `Promise.all` return input order when promises finish in a different order?**

Each input gets its original index. When it fulfills, the result is assigned to `results[index]`; a separate counter tracks how many have completed. Completion order controls when the counter reaches the total, but it never controls result order. `race` is the combinator where completion order is the result.

### 🧠 The Memory Hook

A Promise is a one-way state machine with a queue. `all` waits for every lane, `race` takes the first finish, `allSettled` records every finish, and `any` waits for the first success.

## 6. `fetch`: a useful browser adapter, not a perfect replacement

### What the Interviewer Is Really Testing

This tests whether you can wrap an older callback API in a Promise and preserve the important Fetch contract. It also tests whether you know that `fetch` is a browser host API, not an ECMAScript feature.

### Think Before You Code — The Senior Dev Thought Process

I use XHR for transport, resolve when status is available, and expose `text()` and `json()` as Promise-returning body readers. Network failures reject, but 404 and 500 resolve with `ok: false`. I state the boundary: redirects, streams, abort signals, credentials, CORS, and response types make a full Fetch implementation much larger.

### The Solution — Fully Explained Code

```javascript
function fetchFallback(url, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", url, true);
    Object.entries(options.headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.onload = () => {
      const responseText = xhr.responseText;
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        text: () => Promise.resolve(responseText),
        json: () => Promise.resolve().then(() => JSON.parse(responseText)),
      });
    };
    xhr.onerror = () => reject(new TypeError("Failed to fetch"));
    xhr.onabort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    xhr.send(options.body ?? null);
  });
}
```

**Complexity:** O(1) orchestration space before the response body is captured; storing the response text costs O(response size). Header setup is O(h), where `h` is the number of supplied headers.

### Dry Run — Walk Through a Real Example

```javascript
fetchFallback("/api/orders").then((response) => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
});
// A network-successful 500 fulfills the outer Promise with ok=false; the caller chooses to throw.
```

### Edge Cases — The Ones That Break Naive Solutions

- JSON parsing belongs in `json()` and can reject for invalid JSON.
- Network failure rejects; HTTP failure resolves with `ok: false`.
- A real `Response` body is stream-based and consumable; this simplified adapter reuses captured text.
- XHR may not exist in Node.js, workers, or restricted environments.

### Variations and Follow-ups

Add `AbortController`, response headers, credentials, timeout handling, and streaming only when equivalent primitives exist. In modern applications, prefer native `fetch` or a maintained client.

### Interview Questions

**Q: Should a Fetch polyfill reject when the server returns 404 or 500?**

No. A successful network exchange with an HTTP error status still fulfills the Fetch Promise. The caller checks `response.ok` or `response.status` and can throw an application-level error. Network failure, abort, or an invalid body operation is what rejects.

**Q: Why is this not a complete Fetch polyfill?**

Because XHR does not automatically reproduce Fetch’s streams, body-consumption rules, redirect behavior, credentials, CORS semantics, abort integration, and response types. This is a useful adapter that demonstrates the central Promise/status contract; production code should use native `fetch` or a maintained client.

### 🧠 The Memory Hook

XHR is the transport, the Promise is the bridge, and HTTP status is data—not rejection. Network failure rejects; 404/500 normally resolve.

## 7. `Object.create`: constructing a prototype relationship

### What the Interviewer Is Really Testing

This tests whether you understand that `Object.create(proto)` sets the new object’s internal `[[Prototype]]`; it does not copy properties. The new object starts empty and looks up missing properties through `proto`.

### Think Before You Code — The Senior Dev Thought Process

The classic pre-ES5 trick is a temporary constructor: assign `proto` to its `.prototype`, instantiate it, and define optional descriptors. I validate that `proto` is an object, function, or `null`.

### The Solution — Fully Explained Code

```javascript
function myCreate(proto, propertiesObject) {
  if (proto !== null && (typeof proto !== "object" && typeof proto !== "function")) {
    throw new TypeError("Object prototype may only be an Object or null");
  }
  if (proto === null && typeof Object.create === "function") {
    const object = Object.create(null);
    if (propertiesObject !== undefined) Object.defineProperties(object, propertiesObject);
    return object;
  }
  if (proto === null && typeof Object.setPrototypeOf !== "function") {
    throw new TypeError("This environment cannot create a null prototype");
  }
  function TemporaryConstructor() {}
  TemporaryConstructor.prototype = proto;
  const object = new TemporaryConstructor();
  if (proto === null) Object.setPrototypeOf(object, null);
  if (propertiesObject !== undefined) Object.defineProperties(object, propertiesObject);
  return object;
}
```

**Complexity:** O(1) object creation plus O(p) for `p` property descriptors. It does not copy properties from the prototype, so prototype size does not add to creation cost.

### Dry Run — Walk Through a Real Example

```javascript
const animal = { breathe: () => "breathing" };
const dog = myCreate(animal);
dog.name = "Milo";
// name is own; breathe is found by walking dog → animal.
Object.hasOwn(dog, "breathe"); // false
dog.breathe(); // "breathing"
```

### Edge Cases — The Ones That Break Naive Solutions

- Properties are not copied; descendants observe prototype lookup and later prototype mutations.
- `myCreate(null)` makes a dictionary-like object with no `Object.prototype` methods.
- The second argument contains descriptors, not ordinary values.

### Variations and Follow-ups

Contrast it with `new Constructor()`: `new` runs constructor code and uses `Constructor.prototype`; `Object.create` runs no constructor.

### Interview Questions

**Q: Does `Object.create(proto)` copy the prototype’s properties?**

No. It creates an object with an internal `[[Prototype]]` link to `proto`. Property lookup can find inherited values later, and mutations on `proto` can become visible, but the new object has no copied own properties.

**Q: What is special about `Object.create(null)`?**

The result has a genuinely null prototype, so it does not inherit `toString`, `hasOwnProperty`, or other `Object.prototype` members. The implementation uses native `Object.create` when available and falls back to `Object.setPrototypeOf`; if neither capability exists, a faithful null-prototype object cannot be manufactured by the old temporary-constructor trick alone.

### 🧠 The Memory Hook

`Object.create` copies nothing. It makes an empty object and points its prototype link at `proto`.

## 8. Browser APIs: fallback versus true polyfill

### What the Interviewer Is Really Testing

These questions test engineering honesty. A fallback can approximate behavior when a host API is absent; it cannot recreate the browser’s rendering scheduler, storage security model, or event loop from ordinary JavaScript.

### Think Before You Code — The Senior Dev Thought Process

I classify the target first. `requestAnimationFrame`, `localStorage`, and `setTimeout` are host capabilities. I can write an adapter or degraded fallback, but I must state which guarantees are lost. A busy wait is not a timer polyfill because it blocks input and rendering; cookies are not localStorage because they are sent with requests and have different quota and security rules.

### The Solution — Fully Explained Code

```javascript
// Scheduling approximation only: native rAF is synchronized with paint; this is not.
const requestFrame = globalThis.requestAnimationFrame || function (callback) {
  return setTimeout(() => callback(performance.now()), 1000 / 60);
};
const cancelFrame = globalThis.cancelAnimationFrame || clearTimeout;

function cookieStorage(documentObject) {
  return {
    setItem(key, value) {
      documentObject.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}; path=/`;
    },
    getItem(key) {
      const wanted = `${encodeURIComponent(key)}=`;
      const entry = documentObject.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(wanted));
      return entry ? decodeURIComponent(entry.slice(wanted.length)) : null;
    },
    removeItem(key) {
      documentObject.cookie = `${encodeURIComponent(key)}=; Max-Age=0; path=/`;
    },
  };
}
```

**Complexity:** scheduling or cancelling a frame is O(1) in the fallback. Cookie `setItem`, `getItem`, and `removeItem` are O(c), where `c` is the number of cookie entries scanned; stored data costs O(v) for value size.

### Dry Run — Walk Through a Real Example

```javascript
const id = requestFrame((timestamp) => console.log(timestamp));
cancelFrame(id);
// Native rAF aligns with a paint opportunity; the fallback merely approximates ~60fps.
```

### Edge Cases — The Ones That Break Naive Solutions

- **`setTimeout`/`setInterval`:** host event-loop features; JavaScript cannot faithfully recreate them. A busy wait freezes the thread.
- **`requestAnimationFrame`:** a timer fallback does not pause in hidden tabs, align with refresh rate, or provide native throttling.
- **Cookie storage:** roughly 4 KB per cookie, sent with matching requests, affected by path/domain/SameSite rules, and unsuitable as a general localStorage replacement.
- **Security:** storage choices change the XSS and token threat model; do not put sensitive bearer tokens in browser storage by default.

### Variations and Follow-ups

For timers, use the host scheduler. For animation, prefer native rAF and cancel work on teardown. For persistence, choose cookies, IndexedDB, Cache Storage, or localStorage based on size, request participation, transactions, and security.

### Interview Questions

**Q: Can `setTimeout` or `requestAnimationFrame` be truly polyfilled in JavaScript?**

No. They depend on host scheduling and, for rAF, the browser’s rendering pipeline. A timer fallback can schedule approximately 16 milliseconds later, but it cannot recreate paint synchronization, background throttling, or event-loop integration. `setTimeout` itself must come from the host; a busy wait blocks the very thread the timer is supposed to leave available.

**Q: Is cookie-backed storage equivalent to localStorage?**

No. Cookies are small, attached to matching HTTP requests, governed by domain/path/SameSite rules, and exposed to server traffic. localStorage is origin-scoped client storage with a different quota and access model. The adapter can mimic method names, not the security, quota, or network semantics.

### 🧠 The Memory Hook

A fallback keeps an application moving; a polyfill preserves a contract. Browser scheduling, networking, and storage guarantees cannot be manufactured by a JavaScript snippet.

## Interview checklist

Before coding, say the contract out loud:

1. What is the receiver and how should `this` behave?
2. What are the callback arguments and return value?
3. What happens with holes, mutation, empty input, and invalid input?
4. Does order mean input order or completion order?
5. Can this actually be polyfilled, or am I writing only a fallback?
6. What is the time/space cost, and which production guarantees did I intentionally leave out?

That reasoning is the answer. The code is evidence that you can turn it into behavior.
