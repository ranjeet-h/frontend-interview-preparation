## Implement `Function.prototype.call` (Custom `myCall`)

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `Function.prototype.myCall(thisArg, ...args)` matching `Function.prototype.call`: invoke the
receiver with `this = thisArg` and the remaining values as positional arguments, returning the
callee's result.

- The receiver must be callable, else `TypeError`.
- `thisArg` is passed **as-is**; `call` does no boxing. Coercion depends on the *callee's*
  strictness and belongs to `[[Call]]`, not `.call`: a strict callee sees `thisArg` exactly
  (including `null`/primitives); a sloppy callee gets `globalThis` for `null`/`undefined` and boxed
  primitives.
- Return value and exceptions are the callee's.

Honest caveat: **`call` cannot be truly polyfilled in pure JavaScript** without `Reflect.apply`. No
JS syntax performs `[[Call]]` with an arbitrary explicit `this` without either invoking a method on
an object (mutating it) or changing the `this` rules (which happens as soon as you box a
primitive). `Reflect.apply(fn, thisArg, args)` *is* that primitive, exposed.

### Examples

```text
function who() { "use strict"; return this; }
who.myCall(42)              // => 42        (strict: no boxing)
who.myCall(undefined)       // => undefined (strict: no globalThis swap)

const add = function (a, b) { return a + b + this.k; };
add.myCall({ k: 10 }, 1, 2) // => 13
Math.max.myCall(null, 1, 9) // => 9
Function.prototype.myCall.call(null) // => TypeError (receiver not callable)
```

### Approach

Two candidates, one correct.

1. **Temporary property.** Put the function on the receiver under a key, call it as a method
   (`receiver[key](...args)`), then delete the key — because a method call is the only *syntax*
   that sets `this`. It is wrong in three ways: it **mutates** the receiver (throws or silently
   no-ops on frozen/non-extensible objects); it **cannot attach to a primitive**, so you must box
   with `Object(thisArg)`, which changes `this` for a strict callee; and it **leaks** the key for
   the call's duration (observable by getters, proxies, re-entrant code) while needing a `Symbol`
   key plus `try/finally` cleanup.
2. **`Reflect.apply(this, thisArg, args)`** performs `[[Call]]` with an explicit `this`: no boxing,
   no mutation, and it forwards the callee's strictness handling. This is the answer; the exercise
   is knowing why the temp-property trick is a fallback.

### Implementation

```javascript
Function.prototype.myCall = function (thisArg, ...args) {
  // `this` is the function the method was invoked on.
  if (typeof this !== "function") {
    throw new TypeError("Function.prototype.myCall called on a non-function");
  }
  return Reflect.apply(this, thisArg, args); // [[Call]] with an explicit `this`
};
```

The classic fallback, annotated with why it is not equivalent:

```javascript
// Illustrative ONLY. Not equivalent to Reflect.apply.
function callViaTempProperty(fn, thisArg, ...args) {
  const key = Symbol("call");
  let receiver = thisArg == null ? globalThis : thisArg;   // wrong for strict callees
  if (typeof receiver !== "object" && typeof receiver !== "function") {
    receiver = Object(receiver);                           // boxes primitives
  }
  receiver[key] = fn;                                      // throws if frozen
  try { return receiver[key](...args); }                   // method call sets `this`
  finally { delete receiver[key]; }                        // leaked during the call
}
```

### Walkthrough

`const obj = { k: 10 }; const add = (a, b) => a + b + this.k;` won't work (arrow), so take
`function add(a, b) { return a + b + this.k; }` and call `add.myCall(obj, 1, 2)`:

1. `myCall` runs with `this === add`, `args = [1, 2]`.
2. `Reflect.apply(add, obj, [1, 2])` performs `[[Call]]` with `this = obj`.
3. `this.k === 10`, so `add` returns `1 + 2 + 10 === 13`, forwarded unchanged.

For strict `who` with `who.myCall(42)`, `this` stays the number `42` — the temp version would have
returned a boxed `Number`, so `=== 42` would be false.

### Complexity

Time: `O(n)` in argument count. Space: `O(n)` for `args`. `Reflect.apply` adds no extra pass.

### Edge Cases

- `null`/`undefined` `thisArg`: forwarded untouched; strict sees `null`, sloppy sees `globalThis`.
- Primitive `thisArg`: preserved for strict callees; unconditional `Object(...)` is the classic bug.
- Frozen/non-extensible receiver: `Reflect.apply` works; the temp trick throws or misbinds.
- Receiver that observes the key (setter/`Proxy`): temp trick is detectable; `Reflect.apply` is not.
- Arrow callee: ignores `thisArg` entirely — nothing an implementation does can change that.
- Non-callable receiver: `Function.prototype.myCall.call(null)` throws `TypeError`.
- Callee throws: `Reflect.apply` propagates; the temp trick needs `try/finally` or it leaks.

### Interview Follow-ups

- **Implement `apply` on top of `call`**: only argument spreading differs; both share `[[Call]]`.
- **Why does `Reflect.apply` exist?** `[[Call]]` with an explicit `this` used to be reachable only
  through patchable `Function.prototype.call`/`apply`; `Reflect.apply` cannot be spoofed.
- **Can you write `call` without `Reflect`?** Only the temp-property trick, with its gaps
  documented — the expected answer.
- **`Function.prototype.call.call(fn, thisArg)`** works because `call` is a method whose receiver
  is `call` and whose first argument becomes the function to invoke.

### Common Mistakes

- `Object(thisArg)` unconditionally, boxing primitives and changing `this` for strict callees.
- Forgetting `return`, losing the callee's result.
- Deleting the temp key outside `try/finally`, leaking it when the callee throws.
- A string key like `"__call__"` that a real object might own.
- Assuming `null`/`undefined` always map to `globalThis` — that is sloppy-mode behavior, not `call`.

### Takeaway

`call` is not a trick; it is `[[Call]]` with an explicit `this`. `Reflect.apply` exposes exactly
that primitive with no mutation and no boxing, which is why a temp-property "polyfill" is a
fallback whose flaws you should be able to explain.

## Implement `Function.prototype.apply` (Custom `myApply`)

`Difficulty: Easy` `Probability: Very High`

### Problem

Add `Function.prototype.myApply(thisArg, argsArray)` matching `Function.prototype.apply`: invoke
the receiver with `this = thisArg` and the elements of `argsArray` as arguments.

- `argsArray` may be `null`/`undefined` → called with **zero** arguments.
- Otherwise it must be an **object** (array-like is enough: `arguments`, `NodeList`,
  `{0:"a", length:1}`, typed arrays). Primitives are rejected — the spec's `CreateListFromArrayLike`
  throws `TypeError`; in V8 `Math.max.apply(null, "123")` throws.
- `length` is read via `LengthOfArrayLike` (`ToLength`): negative/`NaN` → `0`, fractional
  truncates; indices are read with `Get`, so holes become `undefined`.
- Return value and exceptions are the callee's.

### Examples

```text
const add = function (a, b) { return a + b + this.k; };
add.myApply({ k: 10 }, [1, 2])                      // => 13

(function () { return arguments.length; }).myApply(null, null)      // => 0
(function () { return arguments.length; }).myApply(null, undefined) // => 0

Math.max.myApply(null, [3, 1, 9])                   // => 9
Math.max.myApply(null, { 0: 3, 1: 1, length: 2 })   // => 3  (array-like)
Math.max.myApply(null, "123")                       // => TypeError (primitive not array-like)
```

### Approach

`apply` is `call` plus `CreateListFromArrayLike`. The only new logic is normalizing `argsArray`
before delegating to `Reflect.apply`. `Reflect.apply` accepts array-likes, but unlike `apply` it
**throws when its third argument is `undefined`**
(`TypeError: CreateListFromArrayLike called on non-object`), so the `null`/`undefined` → `[]` branch
is the one place `myApply` must be more lenient than its delegate.

Spec order: (1) receiver callable, (2) `argsArray == null` → empty list, (3) not an object →
`TypeError`, (4) delegate.

Do not convert with `Array.from`: it changes the contract by using the **iterator** when present,
so a `Set` or a string primitive (which `apply` rejects) would suddenly be accepted, and
array-likes with `Symbol.iterator` but bogus `length` would behave differently. `Reflect.apply`
reads indices by `length`, which is the actual contract.

### Implementation

```javascript
Function.prototype.myApply = function (thisArg, argsArray) {
  if (typeof this !== "function") {
    throw new TypeError("Function.prototype.myApply called on a non-function");
  }

  // apply treats null/undefined as "no arguments".
  if (argsArray === null || argsArray === undefined) {
    return Reflect.apply(this, thisArg, []);
  }

  // Everything else must be an object (array-like); primitives are rejected.
  if (typeof argsArray !== "object" && typeof argsArray !== "function") {
    throw new TypeError("CreateListFromArrayLike called on non-object");
  }

  return Reflect.apply(this, thisArg, argsArray);
};
```

### Walkthrough

`add.myApply({ k: 10 }, [1, 2])`:

1. Receiver `add` is callable.
2. `[1, 2]` is an object, so the `null` branch is skipped.
3. `Reflect.apply(add, { k: 10 }, [1, 2])` builds the argument list from the array's indices and
   performs `[[Call]]`.
4. `add` runs with `this = { k: 10 }`, `a = 1`, `b = 2`, returning `13`.

For `myApply(null, null)`: step 2 fires and `Reflect.apply(fn, null, [])` calls `fn` with no
arguments, so `arguments.length === 0`.

### Complexity

Time: `O(n)` in argument count. Space: `O(n)` for the list (`[]` is `O(1)`). No copy of its own.

### Edge Cases

- `null`/`undefined` → zero arguments, no throw.
- Primitive `argsArray` → `TypeError`; do not coerce with `Object(...)`.
- `arguments` or `{0:1, length:1}` → works, because the list is built from `length` + indices.
- Sparse array → holes are read as `undefined`; the full argument count is still passed.
- Fractional/negative/`NaN` `length` → `ToLength` clamps (`1.9` → 1 arg, `-5` → 0); huge values
  clamp to `2^53-1`, producing many `undefined` arguments.
- Non-callable receiver → `TypeError`.

### Interview Follow-ups

- **Implement `call` in terms of `apply`**: `fn.apply(thisArg, args)` — both share one primitive.
- **Difference from spread:** `fn(...args)` requires an **iterable**; `apply` requires an
  **array-like**. `{0:'a', length:1}` works with `apply`, throws with spread.
- **`Function.prototype.bind.apply(Ctor, [null, ...args])`**: the old "construct without `new`"
  trick; `Reflect.construct` is the modern replacement and sets `new.target`.
- **Large arrays:** `apply` and spread both build an argument list, so both have engine limits.

### Common Mistakes

- Passing `argsArray` straight to `Reflect.apply` without the `null`/`undefined` guard.
- Converting with `Array.from`/`slice`, switching to iterator semantics.
- Forgetting the callable-receiver check.
- Assuming holes in a sparse array are skipped — they are read as `undefined`.
- Believing `apply` accepts strings; it reads `length` from objects only.

### Takeaway

`apply` is `call` plus `CreateListFromArrayLike`: array-likes only, `null`/`undefined` meaning "no
arguments." The whole polyfill is that normalization wrapped around `Reflect.apply`.

## Implement `Function.prototype.bind` (with Partial Application)

`Difficulty: Medium` `Probability: Very High`

### Problem

Add `Function.prototype.myBind(thisArg, ...boundArgs)` returning a new function that:

- calls the target with `this === thisArg`, **regardless of how it is called**
  (`bound.call(other, ...)` still uses `thisArg`);
- **prepends** `boundArgs` to the call-time arguments: `fn.bind(ctx, 1)(2)` runs `fn` with `(1, 2)`;
- forwards the target's return value and exceptions;
- has `.length === max(0, target.length - boundArgs.length)` and `.name === "bound " + target.name`;
- throws `TypeError` if the receiver is not callable.

Constructing with `new` is out of scope here — that is the next problem, where a naive `bind` breaks.

### Examples

```text
const add = function (a, b, c) { return a + b + c + (this.k ?? 0); };

const plus10 = add.myBind({ k: 10 });
plus10(1, 2, 3)                 // => 16

const partial = add.myBind({ k: 0 }, 1, 2);
partial(3)                      // => 6   (bound args prepended)
partial.call({ k: 100 }, 3)     // => 6   (call cannot rebind `this`)

add.myBind(null).length         // => 3
add.myBind(null, 1).length      // => 2
add.myBind(null, 1).name        // => "bound add"
Function.prototype.myBind.call({})  // => TypeError (receiver not callable)
```

### Approach

`bind` is a closure factory. The returned function ignores its own `this` and forwards to the target
with the captured `thisArg` and a concatenated argument list. The order
`[...boundArgs, ...callArgs]` is the entire partial-application contract; getting it backwards is
the most common bug.

- `Reflect.apply(target, thisArg, args)` is the call; the captured `thisArg` wins because the
  closure never reads its own `this`.
- That is "hard binding": `bound.call(x)` sets the closure's `this` to `x`, but the body never
  consults it, so `thisArg` still wins.
- `length`/`name` are own non-enumerable properties set with `Object.defineProperty` (they are
  non-writable by default; `configurable: true` matches native).
- Do not use an arrow for `bound` if `new` support is wanted later — arrows have no `[[Construct]]`.

Honest note: userland cannot reproduce every observable of a native bound function. Native bound
functions have **no own `prototype`**, are non-constructable when the target is, and encode
`[[BoundTargetFunction]]`/`[[BoundArguments]]` internally. The `length`/`name` mimicry is
best-effort.

### Implementation

```javascript
Function.prototype.myBind = function (thisArg, ...boundArgs) {
  const target = this;

  if (typeof target !== "function") {
    throw new TypeError("Function.prototype.myBind called on a non-function");
  }

  // A normal function (not an arrow) so that a later `new` can work.
  function bound(...callArgs) {
    // boundArgs are PREPENDED to the call-site arguments.
    return Reflect.apply(target, thisArg, [...boundArgs, ...callArgs]);
  }

  Object.defineProperty(bound, "length", {
    value: Math.max(0, target.length - boundArgs.length), configurable: true,
  });
  Object.defineProperty(bound, "name", {
    value: "bound " + target.name, configurable: true,
  });
  return bound;
};
```

### Walkthrough

`const partial = add.myBind({ k: 0 }, 1, 2);` then `partial(3)`:

1. `myBind` captures `target = add`, `thisArg = { k: 0 }`, `boundArgs = [1, 2]`.
2. `bound.length` is `Math.max(0, 3 - 2) = 1`; `bound.name` is `"bound add"`.
3. `partial(3)` calls `bound` with `callArgs = [3]`; its receiver `this` is ignored.
4. `Reflect.apply(add, { k: 0 }, [1, 2, 3])` runs `add` with `a=1, b=2, c=3` → `6`.

Now `partial.call({ k: 100 }, 3)`: `bound`'s `this` is `{ k: 100 }`, but the body never reads it, so
`{ k: 0 }` still wins and the result is `6`, not `106`.

### Complexity

Time: `O(n + m)` per call. Space: `O(n + m)` for the concatenated array, plus `O(n)` in the closure.

### Edge Cases

- Zero bound args: `length` equals `target.length`; behavior matches an unbound call.
- More bound args than parameters: `length` floors at `0`; extras are still passed via rest.
- **The bound `this` is permanent** — `.call`/`.apply` cannot override it.
- Arrow target: arrows ignore `this`, so `thisArg` is inert; `myBind` still returns a wrapper.
- Primitive `thisArg`: preserved exactly for strict targets (problem 1); do not box it.
- `target.length` counts only parameters before the first default/rest.
- **`new bound()` here is wrong** — it would pass `thisArg` and lose the target's prototype;
  problem 4 fixes it.
- Frozen or `null`-prototype `thisArg`: no mutation occurs, so it works.

### Interview Follow-ups

- **Add `new` support** — the next problem: detect `new.target`, construct the target, ignore
  `thisArg`.
- **Why can't `.call` override the bound `this`?** The wrapper never reads its own `this`; binding
  is a closure over a value, not a dynamic lookup.
- **What does a second `.bind` do?** `bound.bind(x)` fixes the outer wrapper's unused `this`, so
  for `[[Call]]` nothing changes; the original `thisArg` still wins.
- **Production:** use native `bind`, or `Reflect.apply` for one-offs.

### Common Mistakes

- Concatenating as `[...callArgs, ...boundArgs]`, appending bound args instead of prepending.
- Writing `bound` as an arrow referencing `this` from `myBind` — captures the receiver, not
  `thisArg`.
- Using `target.apply(thisArg, args)` where `target` might be a class — throws, which is why `new`
  needs `Reflect.construct`.
- Ignoring `length`/`name`; interviewers assert on `bound.length`.
- Assuming `.call` on the bound function can rebind it.

### Takeaway

`bind` is a closure that hard-codes `thisArg` and prepends `boundArgs`. The returned function never
reads its own `this`, which is exactly why rebinding is impossible. `new` bypasses all of this.

## Make a Custom `bind` Work with `new`

`Difficulty: Hard` `Probability: High`

### Problem

Extend `myBind` so the bound function is usable as a constructor:

```javascript
function Point(x, y) { this.x = x; this.y = y; }
const BoundPoint = Point.myBind(null, 1);
new BoundPoint(2); // => Point { x: 1, y: 2 }; instanceof Point === true
```

The contract when called with `new`:

- **`thisArg` is ignored.** `new` supplies its own fresh `this`, so the captured context has no effect.
- `boundArgs` are still prepended to the constructor arguments.
- The instance's prototype is `target.prototype`, so `instanceof target` holds.
- `new.target` inside the target resolves as the spec resolves it: if the bound function itself is
  the `newTarget`, substitute the **target**; any other `newTarget` passes through — which is what
  lets `Reflect.construct(Bound, args, Sub)` chain prototypes correctly.
- A bound function whose target is not constructable (arrow, method shorthand) must **not** be
  constructable.

### Examples

```text
function Point(x, y) { this.x = x; this.y = y; }
Point.prototype.sum = function () { return this.x + this.y; };

const BP = Point.myBind({ ignored: true }, 1);   // thisArg is discarded under new
new BP(2)                            // => Point { x: 1, y: 2 }
new BP(2).sum()                      // => 3
new BP(2) instanceof Point           // => true
BP.prototype                         // => an object (native bound fns expose undefined)

let seen;
function Who() { seen = new.target && new.target.name; }
new (Who.myBind(null))();
seen                                 // => "Who"  (newTarget collapses to the target)

const arrow = () => 0;
new (arrow.myBind(null))()           // => TypeError (not constructable)
```

### Approach

Two paths inside the wrapper, chosen by `new.target`:

- **Normal call** (`new.target === undefined`): `Reflect.apply(target, thisArg, [...boundArgs, ...callArgs])`.
- **Construct call** (`new.target !== undefined`): `Reflect.construct(target, args, resolvedNewTarget)`.
  `[[Construct]]` creates its own `this`, so `thisArg` never enters the picture.

`resolvedNewTarget = new.target === bound ? target : new.target` is the literal spec step in a bound
function's `[[Construct]]`, and it keeps `new.target` inside the target consistent with native.

Two points worth stating plainly:

1. **`Reflect.construct` is the only correct primitive.** You cannot construct via
   `target.apply(this)` for classes (they throw "cannot be invoked without `new`"), and `apply`
   cannot set `new.target` or choose `[[Prototype]]` from a `newTarget`.
2. **Constructability is per-target.** A plain function wrapper is always constructable, but a
   native bound function over an arrow is not. Guard with the `isConstructor` probe and return a
   non-constructable arrow wrapper when the target cannot be constructed.

`instanceof bound` fidelity: native delegates through `[[BoundTargetFunction]]`, which JS does not
expose. Our wrapper is ordinary, so `p instanceof bound` is `false` unless you add a
`Symbol.hasInstance` delegating to the target's own `@@hasInstance`.

### Implementation

```javascript
Function.prototype.myBind = function (thisArg, ...boundArgs) {
  const target = this;
  if (typeof target !== "function") {
    throw new TypeError("Function.prototype.myBind called on a non-function");
  }

  function bound(...callArgs) {
    const args = [...boundArgs, ...callArgs];

    if (new.target !== undefined) {
      // `new bound()`: ignore thisArg; collapse newTarget to the target per spec.
      const newTarget = new.target === bound ? target : new.target;
      return Reflect.construct(target, args, newTarget);
    }
    return Reflect.apply(target, thisArg, args);
  }

  Object.defineProperty(bound, "length", {
    value: Math.max(0, target.length - boundArgs.length), configurable: true,
  });
  Object.defineProperty(bound, "name", {
    value: "bound " + target.name, configurable: true,
  });
  return bound;
};
```

If the target is not constructable, return an arrow wrapper instead (no `[[Construct]]`), using the
`isConstructor` probe from the next problem.

### Walkthrough

`const BP = Point.myBind({ ignored: true }, 1);` then `new BP(2)`:

1. `boundArgs = [1]`; `bound.length = Math.max(0, 2 - 1) = 1`.
2. `new BP(2)` invokes `bound.[[Construct]]` with `new.target === bound`, `callArgs = [2]`.
3. `args = [1, 2]`; since `new.target !== undefined`, `newTarget = bound === new.target ? Point : ... = Point`.
4. `Reflect.construct(Point, [1, 2], Point)` creates a fresh object with `Point.prototype` and runs
   `Point` with `this` = that object and `new.target === Point`.
5. `Point` sets `this.x = 1; this.y = 2` and returns `undefined`, so `[[Construct]]` yields
   `Point { x: 1, y: 2 }`. `{ ignored: true }` never appears — `[[Construct]]` owns `this`.

Contrast `BP(2)` (no `new`): `new.target` is `undefined`, so it applies `Point` to
`{ ignored: true }` and returns `undefined`.

### Complexity

Time: `O(n + m)` per call for concatenation; construction is native. Space: `O(n + m)` per call,
plus `O(n)` in the closure.

### Edge Cases

- `thisArg` is ignored under `new` — always; the construct branch never reads it.
- Class targets: `Reflect.construct` handles them; `Reflect.apply` would throw.
- Non-constructable target (arrow/method): guard with `isConstructor`, or `new` silently runs it as
  a function.
- `new.target` passthrough: `Reflect.construct(MyBound, [], Sub)` must let `Sub` control the
  prototype; the identity guard preserves this.
- `bound.prototype`: ours is a default object, unlike native's `undefined`; instances still use
  `target.prototype` via `newTarget`, but the difference is observable.
- `instanceof bound`: `false` without a `Symbol.hasInstance` shim.
- Target returns an object: `Reflect.construct` honors it, like `new target()`.

### Interview Follow-ups

- **Implement `new` yourself** — the next problem makes the `[[Construct]]` steps explicit.
- **Why is `thisArg` ignored?** `bind` only affects `[[Call]]`; `new` goes through `[[Construct]]`,
  which creates its own `this`. Different internal methods.
- **Subclass through a bound class:** `class Sub extends Bound` plus `new.target` shows why the
  passthrough matters.
- **Full fidelity via `Proxy`:** a `construct` trap can return an object with an arbitrary prototype
  and leave `bound.prototype` undefined.

### Common Mistakes

- Using `target.apply(this, args)` in the construct branch — throws for classes, never sets
  `new.target`.
- Reading `thisArg` in the construct branch, so `new bound()` writes to the context object.
- Forgetting the `new.target === bound ? target : new.target` collapse, breaking subclassing.
- Making the wrapper an arrow, so it can never be used with `new`.
- Assuming `bound.prototype` is `undefined` or that `p instanceof bound` works for free.

### Takeaway

`bind` separates two internal methods: `[[Call]]` uses the captured `thisArg`, while `[[Construct]]`
creates its own `this` and only needs the bound arguments.
`Reflect.construct(target, args, resolvedNewTarget)` is the exact implementation, and the
`new.target` collapse keeps classes and subclassing correct.

## Implement the `new` Operator (`myNew`)

`Difficulty: Hard` `Probability: High`

### Problem

Write `myNew(Constructor, ...args)` reproducing `new Constructor(...args)`:

1. Throw `TypeError` if `Constructor` is not a function.
2. Create a new object whose `[[Prototype]]` is `Constructor.prototype` — or `Object.prototype` if
   that is not an object.
3. Run `Constructor` with the new object as `this`, with `args`, and `new.target === Constructor`.
4. If `Constructor` returns a non-`null` object/function, that value is the result; otherwise the
   new object is.

Step 3 is the hard part: a plain call (`Reflect.apply`/`.call`) **cannot** set `new.target`, and it
**cannot** invoke a class at all. The only correct primitive is `Reflect.construct`.

### Examples

```text
function Person(name) { this.name = name; }
Person.prototype.greet = function () { return "hi " + this.name; };

const p = myNew(Person, "Ada");
p.greet()                    // => "hi Ada"
p instanceof Person          // => true

function ReturnsObject() { return { custom: true }; }
myNew(ReturnsObject)         // => { custom: true }   (object return wins)

function ReturnsNull() { this.ok = 1; return null; }
myNew(ReturnsNull).ok        // => 1                  (null ignored)

class Box { constructor(v) { this.v = v; } }
myNew(Box)                   // => TypeError via apply path; works via Reflect.construct
myNew(42)                    // => TypeError (not a function)
```

### Approach

The spec's `[[Construct]]` is four steps; only the last two are subtle.

- **Object creation.** `Object.create(proto)` where `proto = Constructor.prototype`, guarded: if
  `prototype` is not an object (`null`, or reassigned to a primitive), fall back to
  `Object.prototype` — what `GetPrototypeFromConstructor` does.
- **Invocation.** `.apply` looks natural and is wrong twice: it leaves `new.target` as `undefined`,
  and it throws for classes and other constructor-only functions. `Reflect.construct(Constructor, args)`
  performs the real `[[Construct]]`: it creates the object, sets `new.target = Constructor`, enforces
  constructability, and applies the object-return rule.
- **Return rule.** Keep it explicit in the manual version to document the contract;
  `Reflect.construct` applies it for free.

Give two answers: a "manual" one that shows you know the steps (and admits the `new.target`/class
gap), and the exact one-liner. If classes must work, `Reflect.construct` is mandatory. A fully
faithful manual version also needs the constructability probe (`isConstructor`) and must throw for
arrows/methods, since `Reflect.apply` would otherwise "call" them as plain functions.

### Implementation

```javascript
function isConstructor(value) {
  try {
    // Reflect.construct requires a constructor `newTarget`; use it as a probe.
    Reflect.construct(function () {}, [], value);
    return true;
  } catch {
    return false;
  }
}

// "Manual" version: teaches the four steps, but new.target stays undefined and
// class constructors cannot be called this way.
function myNew(Constructor, ...args) {
  if (typeof Constructor !== "function" || !isConstructor(Constructor)) {
    throw new TypeError(`${Constructor?.name ?? Constructor} is not a constructor`);
  }

  const proto = Constructor.prototype;
  const hasObjectProto = proto !== null && (typeof proto === "object" || typeof proto === "function");
  const instance = Object.create(hasObjectProto ? proto : Object.prototype);

  const result = Reflect.apply(Constructor, instance, args); // new.target is undefined here

  const isObject = result !== null && (typeof result === "object" || typeof result === "function");
  return isObject ? result : instance;
}

// Exact version: Reflect.construct IS [[Construct]].
function myNewExact(Constructor, ...args) {
  return Reflect.construct(Constructor, args); // sets new.target, enforces constructability
}
```

### Walkthrough

`myNew(Person, "Ada")`:

1. `Person` is a function and the `isConstructor` probe succeeds.
2. `proto = Person.prototype` is an object, so `instance = Object.create(Person.prototype)`.
3. `Reflect.apply(Person, instance, ["Ada"])` runs `Person` with `this = instance`, setting
   `instance.name = "Ada"`; `Person` returns `undefined`.
4. `undefined` is not an object, so the fresh `instance` is returned.
5. `instance.greet()` resolves through `Person.prototype` → `"hi Ada"`, and
   `instance instanceof Person` is `true`.

For `class Box { constructor(v) { this.v = v; } }`, `myNewExact(Box)` uses `Reflect.construct`, which
creates the instance via the class's `[[Construct]]` and sets `new.target = Box`. The manual
`myNew(Box)` throws, because a class body cannot be called without `new`.

### Complexity

Time: `O(n)` in the constructor's argument count. Space: `O(n)` for `args`. The probe is `O(1)`.

### Edge Cases

- Constructor returns an object/function → that wins; returns `null` or a primitive → ignored.
- **Class constructors:** only `Reflect.construct` works; `.apply` throws
  `TypeError: Class constructor cannot be invoked without 'new'`.
- Arrow functions and object methods: not constructors; throw explicitly.
- `Constructor.prototype` is `null`/primitive → fall back to `Object.prototype`; passing it to
  `Object.create` would create a prototype-less object.
- `new.target`-sensitive constructors see `undefined` on the apply path, so abstract-base-class
  guards misbehave.
- Built-ins (`Date`, `Map`, `Error`): `.apply` gives broken instances for some; `Reflect.construct`
  works.
- Non-callable or missing first argument → `TypeError`.

### Interview Follow-ups

- **Custom `newTarget`** so subclasses control the prototype: `Reflect.construct(Base, args, Derived)`.
- **Why can't `.apply` call a class?** Class constructors have no `[[Call]]`; only `[[Construct]]`
  exists, and `apply` performs `[[Call]]`.
- **How does `new.target` get set?** Only `[[Construct]]` sets it; there is no JS syntax for "call
  this with a newTarget," hence `Reflect.construct`.
- **What is `new.target` for?** Detecting direct construction vs subclassing, and blocking abstract
  base classes (`if (new.target === Base) throw ...`).

### Common Mistakes

- Forgetting the object-return rule and always returning the instance.
- Calling `Object.create` without guarding when `prototype` is not an object.
- Using `Constructor.call(instance, ...)` for classes.
- Claiming the manual version equals `new` without noting `new.target` and constructability.
- Passing the whole args array as one argument (`Reflect.apply(C, null, [args])`).

### Takeaway

`new` is: create an object with `Constructor.prototype`, run the constructor as `[[Construct]]`, then
keep an object return if there is one. The first two steps are easy by hand; the third is why
`Reflect.construct` — not `apply` — is the exact implementation.

## Implement `instanceof` (`myInstanceof`)

`Difficulty: Medium` `Probability: High`

### Problem

Write `myInstanceof(object, Constructor)` matching the `instanceof` operator:

- If `Constructor` is not callable → `TypeError`.
- If `Constructor` has a custom `Symbol.hasInstance`, call it with `[object]` and return the boolean.
- Otherwise walk `object`'s prototype chain, returning `true` if any link is `Constructor.prototype`.
- A non-object `object` → `false` (not a throw).
- If `Constructor.prototype` is not an object → `TypeError`.

The operator is `OrdinaryHasInstance` plus the `Symbol.hasInstance` override, and ordering matters:
the `@@hasInstance` check happens **before** the "left side must be an object" check.

### Examples

```text
class Animal {}
class Dog extends Animal {}

myInstanceof(new Dog(), Dog)        // => true
myInstanceof(new Dog(), Animal)     // => true
myInstanceof(new Animal(), Dog)     // => false

myInstanceof({}, Object)            // => true
myInstanceof(Object.create(null), Object) // => false
myInstanceof([], Array)             // => true

myInstanceof(1, Number)             // => false   (primitive, no throw)
myInstanceof({}, 5)                 // => TypeError (RHS not callable)

class Answer { static [Symbol.hasInstance](x) { return x === 42; } }
myInstanceof(42, Answer)            // => true    (custom @@hasInstance, even for a primitive)
```

### Approach

Mirror the spec's two layers:

1. **`InstanceofOperator(C, O)`**: if `C` is callable and has an own/inherited `Symbol.hasInstance`
   that is not the default, call it and coerce with `Boolean`. The default `@@hasInstance` is
   `Function.prototype[Symbol.hasInstance]`; calling it would just run `OrdinaryHasInstance`, so
   compare identity and treat it as "no override."
2. **`OrdinaryHasInstance(C, O)`**: reject non-object `O` first; read `C.prototype`; if that is not
   an object, throw `TypeError`; then walk.

The walk is `current = O; while (current !== null) { current = Object.getPrototypeOf(current); if (current === prototype) return true; }`.
Comparing `getPrototypeOf(current)` rather than `current` itself avoids testing an object against its
own prototype.

`Function.prototype[Symbol.hasInstance]` is non-writable and non-configurable, so subclasses define
their own; identity comparison distinguishes "custom" from "inherited default."

Two honest limitations:

- **Bound functions.** Native `instanceof` delegates through `[[BoundTargetFunction]]` (a bound
  function has no `prototype`), and JS exposes no way to read the bound target, so userland cannot
  reproduce it — it throws or returns `false` where native returns `true`. A heuristic
  (`!hasOwnProperty.call(C, "prototype") && typeof C === "function"`) is unreliable.
- **Proxies** with a lying `getPrototypeOf` trap can make the walk non-terminating; the spec's own
  algorithm has the same property, so that is faithful, not a bug.

### Implementation

```javascript
function myInstanceof(object, Constructor) {
  if (typeof Constructor !== "function") {
    throw new TypeError("Right-hand side of 'instanceof' is not callable");
  }

  // 1) A custom Symbol.hasInstance wins and runs before the object check.
  const hasInstance = Constructor[Symbol.hasInstance];
  if (typeof hasInstance === "function" && hasInstance !== Function.prototype[Symbol.hasInstance]) {
    return Boolean(Reflect.apply(hasInstance, Constructor, [object]));
  }

  // 2) OrdinaryHasInstance: primitives are simply `false`, not an error.
  if (object === null || (typeof object !== "object" && typeof object !== "function")) {
    return false;
  }

  const prototype = Constructor.prototype;
  if (prototype === null || (typeof prototype !== "object" && typeof prototype !== "function")) {
    throw new TypeError("Function has non-object prototype in instanceof check");
  }

  // 3) Walk the prototype chain.
  let current = object;
  while (current !== null) {
    current = Object.getPrototypeOf(current);
    if (current === prototype) return true;
  }
  return false;
}
```

### Walkthrough

`myInstanceof(new Dog(), Animal)`:

1. `Animal` is a function, so no `TypeError`.
2. `Animal[Symbol.hasInstance]` is the inherited default, so skip the override.
3. `new Dog()` is an object, so continue; `Animal.prototype` is an object.
4. Walk: `getPrototypeOf(dog)` → `Dog.prototype` (≠). Advance; `getPrototypeOf(Dog.prototype)` →
   `Animal.prototype` → **match**, return `true`.

For `myInstanceof(42, Answer)` with `Answer[Symbol.hasInstance] = (x) => x === 42`: the override is
not the default, so it is called with `[42]` → `true`; the primitive never reaches the walk.

### Complexity

Time: `O(d)` in prototype-chain depth (`getPrototypeOf` is `O(1)`). Space: `O(1)` — the walk is
iterative, so no recursion stack.

### Edge Cases

- `Object.create(null)` → `false`; the chain ends at `null` and `Object.prototype` is never found.
- Primitives → `false` without throwing: `1 instanceof Number` is `false`, but
  `Object(1) instanceof Number` is `true`.
- `Constructor` not callable → `TypeError`.
- `Constructor.prototype` reassigned to a primitive → `TypeError`, same as native.
- Custom `Symbol.hasInstance` → used even for primitive left-hand sides, coerced with `Boolean`,
  and called exactly once.
- Bound functions → not faithfully reproducible; `[[BoundTargetFunction]]` is unobservable.
- Cross-realm objects → `myInstanceof(iframeObj, Object)` is `false` across realms, matching native.

### Interview Follow-ups

- **Implement it recursively** and discuss stack depth on long chains.
- **`Object.prototype.isPrototypeOf`** performs the same walk without the constructor; so why does
  `instanceof` need the callable check?
- **When is `Symbol.hasInstance` useful?** Virtual types and branded checks.
- **Why does a bound function's `instanceof` still work natively?** `OrdinaryHasInstance` recurses
  on `[[BoundTargetFunction]]` before reading `prototype`.

### Common Mistakes

- Checking `object` before `Symbol.hasInstance`, so `42 instanceof Answer` returns `false`.
- Reading `Constructor.prototype` before the object check, turning `1 instanceof Foo` into a
  spurious `TypeError`.
- Starting the walk by comparing `object` itself to `prototype` (off by one).
- Using recursion with no depth guard.
- Assuming bound functions can be handled; they cannot.

### Takeaway

`instanceof` is "does `Constructor.prototype` appear anywhere in `object`'s prototype chain,"
preceded by a `Symbol.hasInstance` escape hatch and a callability check. The ordering of those three
checks is the whole question.

## Permanently Bind `this` (Hard Binding)

`Difficulty: Hard` `Probability: Medium`

### Problem

Write `hardBind(fn, context, ...preset)` returning a function whose `this` is **permanently**
`context`: no `.call`, `.apply`, `.bind`, or method-call receiver can change it. Preset arguments are
prepended. This exposes the mechanism `.bind` uses for `[[Call]]` and makes "binding is a closure,
not a dynamic lookup" concrete.

- Every call runs `fn` with `this === context`; call-site `this` is ignored entirely.
- `preset` args are prepended to call-site args.
- The returned function is constructable in JS, but `new hardBound()` must **not** rebind unless you
  deliberately add `new` support.

### Examples

```text
const describe = hardBind(function (suffix) {
  return this.name + "/" + suffix;
}, { name: "A" });

describe("x")                        // => "A/x"
describe.call({ name: "B" }, "x")    // => "A/x"   (call cannot override)
describe.apply({ name: "B" }, ["x"]) // => "A/x"   (apply cannot override)
describe.bind({ name: "B" })("x")    // => "A/x"   (bind cannot override)

const withPreset = hardBind(function (a, b) { return this.k + a + b; }, { k: 1 }, 2);
withPreset(3)                        // => 6
```

### Approach

Return a closure that ignores its own `this` and forwards to `fn` via
`Reflect.apply(fn, context, args)`. Because `context` is a captured constant, no calling convention
can influence it: a method call, `.call`, `.apply`, and `.bind` all set the *wrapper's* `this`, which
the body never reads. That is "hard binding" — not an engine feature, just a closure over a value.
Native `bind` is exactly this for `[[Call]]`, plus the `[[Construct]]` behavior from problem 4.

Two details:

1. **`context` is captured by reference.** Mutating the context object later is visible inside `fn`
   (identity is fixed, not contents); a primitive context is fixed exactly, per problem 1.
2. **`new` is the escape hatch.** A plain closure is constructable, so `new hardBound()` runs `fn`
   with `context` *and* returns a different object. Guard with `new.target` and delegate to
   `Reflect.construct` to get a complete `bind`; if binding must truly be permanent, block `new`.

### Implementation

```javascript
// Hard binding: the returned closure never reads its own `this`.
function hardBind(fn, context, ...preset) {
  if (typeof fn !== "function") {
    throw new TypeError("hardBind expects a function");
  }
  return function (...args) {
    return Reflect.apply(fn, context, [...preset, ...args]);
  };
}

// Variant that also behaves under `new` (a complete `bind`).
function hardBindConstructable(fn, context, ...preset) {
  function bound(...args) {
    if (new.target !== undefined) {
      // `new` is the one caller that legitimately ignores the bound context.
      const newTarget = new.target === bound ? fn : new.target;
      return Reflect.construct(fn, [...preset, ...args], newTarget);
    }
    return Reflect.apply(fn, context, [...preset, ...args]);
  }
  return bound;
}
```

### Walkthrough

`const describe = hardBind(fn, { name: "A" });` then `describe.call({ name: "B" }, "x")`:

1. `hardBind` captures `fn` and `context = { name: "A" }`.
2. `describe.call({ name: "B" }, "x")` invokes the wrapper with `this = { name: "B" }`.
3. The body is `Reflect.apply(fn, context, ["x"])` — it never references `this`, so
   `{ name: "B" }` is discarded.
4. `fn` runs with `this === { name: "A" }` and returns `"A/x"`. `.apply` and `.bind` take the same
   path, so they also return `"A/x"`.

With `hardBindConstructable`, `new describe()` takes the `new.target` branch and constructs `fn`,
ignoring the context — the same rule real `bind` follows.

### Complexity

Time: `O(n + m)` per call. Space: `O(n + m)` per call, plus `O(n)` in the closure.

### Edge Cases

- Method-call receiver, `.call`, `.apply`, `.bind` → all ignored; context always wins.
- `context` primitive or `null` → preserved exactly for a strict `fn` (problem 1).
- Arrow `fn` → ignores `context` entirely; hard binding cannot inject a `this` into an arrow.
- Mutating the context object after binding → visible, because only the reference is fixed.
- `new hardBound()` with the plain version → constructs a fresh object *and* still calls `fn` with
  `context`; guard with `new.target`.
- `fn` throws → propagates; no cleanup needed because nothing is mutated.

### Interview Follow-ups

- **Difference from `.bind`:** for `[[Call]]` there is none; the difference is `[[Construct]]`,
  which ignores the bound context natively but is honored by the plain closure.
- **Partial application:** `hardBind(fn, ctx, 1)` prepends `1`, so the two compose.
- **Preventing rebinding:** wrap a method once with `hardBind`; useful for event callbacks and class
  methods passed by reference.
- **Memory:** the closure retains `fn`, `context`, and `preset` for the bound function's lifetime.

### Common Mistakes

- Writing the wrapper as an arrow referencing `this` lexically — captures the wrong receiver.
- Referencing `this` anywhere in the wrapper, reintroducing dynamic binding.
- Forgetting `return`, losing the result.
- Assuming hard binding overrides `new`; it does not without the `new.target` branch.
- Concatenating preset args after the call-site args.

### Takeaway

Hard binding is not magic: binding is a closure over a value. If the wrapper never reads its own
`this`, nothing in the language can change what `fn` sees — and `new` is the one caller that
legitimately bypasses it.

## Borrow a Method From Another Object (Without `bind`)

`Difficulty: Easy` `Probability: High`

### Problem

Call a method that lives on one object (usually a prototype) using a *different* receiver, without
`Function.prototype.bind`. Demonstrate it with `Array.prototype.map`, `Array.prototype.slice`, and
`Object.prototype.hasOwnProperty`, then compare modern alternatives.

There is no single function to write — the deliverable is idioms plus the rule that makes them work:
a method is usable on another receiver only if it is **generic** (it reads `this`, and for arrays
`this.length`, rather than checking the receiver's nominal type).

### Examples

```text
function toArray() { return Array.prototype.slice.call(arguments); }
toArray("a", "b")                                // => ["a", "b"]

const like = { 0: 1, 1: 2, length: 2 };
Array.prototype.map.call(like, (x) => x * 10)     // => [10, 20]

const bare = Object.create(null);
bare.k = 1;
Object.prototype.hasOwnProperty.call(bare, "k")  // => true
bare.hasOwnProperty                              // => undefined

Object.prototype.toString.call([])               // => "[object Array]"
```

### Approach

The mechanism is the "method call sets `this`" rule from problem 1, minus the mutation:

- **`.call` / `.apply`** — `Array.prototype.slice.call(receiver, ...)` invokes `slice` with
  `receiver` as `this`. This is borrowing, without `bind`.
- **`Reflect.apply(method, receiver, args)`** — the same thing with no dependency on
  `Function.prototype.call` being unpatched.
- **Temporary property** — assign the method onto the receiver, call it, delete it. Works, but
  mutates; fails on frozen/primitive receivers. Prefer the two above.

Why it works: these built-ins are **generic**. `Array.prototype.map` needs only `this.length` and
indexed access, not a real `Array`. `Object.prototype.hasOwnProperty` reads the receiver's own
property table. `Object.prototype.toString` reads `this`'s `@@toStringTag`/internal slots.

What to reach for now: `Array.from` (array-likes and iterables, with `mapFn`/`thisArg`; fills holes
with `undefined`); rest parameters instead of `arguments`; and `Object.hasOwn(obj, key)` (ES2022)
instead of borrowed `hasOwnProperty`, which also works on null-prototype objects and proxies.

Borrowing is still the only tool when the receiver genuinely is a foreign object and you must call
one specific prototype method.

### Implementation

```javascript
// 1) Borrow via .call — the canonical "method borrowing" form.
function toArray(arrayLike) {
  return Array.prototype.slice.call(arrayLike);
}

// 2) Borrow via Reflect.apply — same semantics, no reliance on Function.prototype.call.
function mapLike(arrayLike, callback, thisArg) {
  return Reflect.apply(Array.prototype.map, arrayLike, [callback, thisArg]);
}

// 3) Safe property check that survives null-prototype / shadowed hasOwnProperty.
function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

// 4) Type tag, robust against `instanceof` crossing realms.
function typeTag(value) {
  return Object.prototype.toString.call(value).slice(8, -1); // "Array", "Null", ...
}
```

```text
toArray("abc").join("-")                         // => "a-b-c"
mapLike({ 0: 2, 1: 4, length: 2 }, (x) => x / 2) // => [1, 2]
typeTag([]) + " " + typeTag(null)                // => "Array Null"
```

### Walkthrough

`mapLike({ 0: 2, 1: 4, length: 2 }, (x) => x / 2)`:

1. `Array.prototype.map` is fetched as a value — detached from any receiver.
2. `Reflect.apply(map, arrayLike, [callback, undefined])` performs `[[Call]]` on `map` with
   `this = arrayLike`.
3. `map` reads `this.length` (`2`) and calls `callback(this[i], i, this)` per present index:
   `2/2 = 1`, `4/2 = 2`.
4. It returns a real `Array`: `[1, 2]`; `arrayLike` is untouched.

Contrast `const map = Array.prototype.map; map([1,2], fn)`: `map` is invoked as a bare function, so
`this` is `undefined` (strict) or `globalThis` (sloppy), and `this.length` throws or is nonsense.
Detaching a method loses its receiver — the mistake borrowing exists to avoid.

### Complexity

Time: `O(n)` per borrowed call (`n = this.length` for array methods). Space: `O(n)` for the returned
array; borrowing adds no extra copy, unlike `Array.from` plus a separate map.

### Edge Cases

- `arguments` object → array-like and iterable; both `slice.call` and `Array.from` work, but
  `Array.from` uses `Symbol.iterator`.
- Null-prototype object → has no methods at all, so borrowing is mandatory; `Object.hasOwn` is the
  modern fix.
- Frozen receiver → borrowing works (no mutation), unlike the temp-property approach.
- Primitives as receivers → `Array.prototype.map.call("ab", fn)` works (strings have `length` and
  indices); methods that need an object still throw.
- Holes → `slice`/`map` preserve them; `Array.from` turns them into `undefined`.
- Shadowed methods → `obj.hasOwnProperty = null` breaks direct calls; borrowing is immune.
- `Symbol.toStringTag` → changes `Object.prototype.toString` output, so `typeTag` is spoofable.
- Detached method with no receiver → throws or misbehaves; always supply the receiver.

### Interview Follow-ups

- **`slice.call` vs spread:** spread needs an **iterable**; `slice.call` needs an **array-like**.
  `arguments` and strings are both; a bare `{length: 2}` is only the latter.
- **Why `Object.hasOwn` over borrowed `hasOwnProperty`?** Shorter, cannot be shadowed, works on
  null-prototype objects.
- **Borrowing constructors:** `Reflect.construct(Array, [1, 2])` gives a real array;
  `Array.prototype.concat.apply([], nested)` flattens one level.
- **When can you not borrow?** When the method brand-checks internal slots, e.g.
  `Promise.prototype.then` on a non-promise throws.

### Common Mistakes

- Detaching the method (`const m = Array.prototype.map; m(...)`) and losing the receiver — the
  classic `Cannot read length of undefined`.
- Mutating the receiver with the temp-property approach and breaking on frozen objects.
- Assuming `arguments` is an array (it has no `map`/`push`; it is array-like).
- Using `Array.from` when hole preservation matters — it fills holes with `undefined`.
- Calling `obj.hasOwnProperty(...)` on an object that shadows it or has a `null` prototype.

### Takeaway

Method borrowing is "call this prototype method with *that* object as `this`." It works only for
generic methods, it never needs `bind` (`.call`/`apply`/`Reflect.apply` are enough), and modern code
should prefer `Array.from`, rest parameters, and `Object.hasOwn`.
