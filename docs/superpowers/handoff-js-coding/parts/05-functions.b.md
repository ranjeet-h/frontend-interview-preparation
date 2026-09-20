## Implement Infinite Currying (`sum(1)(2)(3)(4)()`)

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `sum` so it can be called one value at a time and returns the running total
only when finally invoked with **no argument**:

```javascript
sum(1)(2)(3)(4)(); // => 10
```

The contract:

- `sum(n)` returns a **function**, not a number. The result is only produced by the
  terminal empty call.
- Each intermediate call adds its single argument to the accumulated total and returns a
  fresh function holding that total in a closure.
- `sum()` returns a curried function whose total is `0`, so `sum()()` is `0`.
- Independent chains share no state: `sum` is a pure function returning new closures.

This is the strict "one argument per call" form. Accepting batches such as
`sum(1, 2)(3)` is the next problem.

### Examples

```text
sum(1)(2)(3)(4)()   // => 10
sum(5)()            // => 5
sum()()             // => 0
sum(10)(-3)()       // => 7
typeof sum(1)(2)    // => "function"   (not terminated yet)
```

### Approach

The total must survive between calls, and the only place a function can keep private state
is a closure. So `sum` returns a function that (a) adds what it was given and (b) returns
*another* function bound to the new total, until it is called with nothing.

The invariant: **each returned function closes over exactly one number — the total so far.**
No module-level or shared mutable variable is involved, so two chains built at the same time
never interfere.

Two details a naive version misses:

1. **How to detect "the end".** With a rest parameter, `rest.length === 0` distinguishes a
   no-argument terminal call from `sum(1)(0)`. Relying on `b === undefined` breaks when
   someone legitimately passes `undefined`, and it cannot tell `f()` from `f(undefined)`.
2. **The order of accumulation.** The total is computed on the *way in* (before returning the
   next function), so the returned closure already holds the sum and never needs to re-walk a
   list. Accumulating an array of args and summing at the end also works but is `O(n)` memory
   for information already collapsed.

Returning a function is the whole trick: `sum(1)(2)` is a function, and calling it with `()`
is what signals "I am done." That is why the value cannot be read without the final call —
and why the `Symbol.toPrimitive` enhancement below lets arithmetic force it out.

### Implementation

```javascript
function sum(a = 0) {
  function addOne(...rest) {
    if (rest.length === 0) return a;      // terminal call: no argument present
    return sum(a + rest[0]);              // strict: exactly one value per step
  }
  // Optional: lets `sum(1)(2) + 3` coerce the curried function to its total.
  addOne[Symbol.toPrimitive] = () => a;
  return addOne;
}
```

`sum(a = 0)` makes a bare `sum()` start a chain at zero. `addOne` closes over `a`; the
recursive call to `sum(a + rest[0])` builds a brand-new closure, so the old one is untouched.
The `Symbol.toPrimitive` line is not required by the contract, but it demonstrates that a
function object can carry a scalar identity — useful when the caller forgets the final `()`.

### Walkthrough

Trace `sum(1)(2)(3)(4)()`:

1. `sum(1)` → `a = 1`, returns `addOne` closing over `1`.
2. `addOne(2)` → `rest = [2]`, so returns `sum(1 + 2)` = `sum(3)`; the new `addOne` closes
   over `3`.
3. `(3)` → `sum(3 + 3)` = `sum(6)`; the new closure holds `6`.
4. `(4)` → `sum(6 + 4)` = `sum(10)`; the new closure holds `10`.
5. `()` → `rest = []`, so it returns `a`, which is `10`.

Note that step 4 returns *the function*, and only step 5 unwraps it. For `sum(10)(-3)()`,
step 2 computes `7` and the terminal call returns `7`; negative operands need no special
handling because addition is just addition.

### Complexity

Time: `O(1)` per call (`O(n)` total for `n` calls) — each step does one addition. Space:
`O(n)` total across the chain because every step keeps its intermediate closure alive while
the next one is referenced; the live chain is `O(n)` deep until the terminal call releases it.

### Edge Cases

- `sum()()` → `0`: the default parameter supplies the seed.
- `sum(1)(0)()` → `1`: zero is a real value, not a terminator; only an *empty call* ends.
- `sum(1)()` → `1`: a one-value chain terminates immediately.
- `sum(1)(2) + 3` → `6` with the `Symbol.toPrimitive` enhancement; without it, the `+` sees a
  function and produces a string unless you call `()`.
- Passing `undefined` explicitly is treated as a value (`a + undefined` → `NaN`); use the
  no-arg form to terminate.
- Non-number operands coerce (`sum("1")(2)()` → `"12"`); validate if the contract demands it.

### Interview Follow-ups

- **Accept several arguments per call** (`sum(1, 2)(3)()`): fold over the rest array instead
  of reading only `rest[0]`. This is the next problem.
- **Force the value without `()`** using `Symbol.toPrimitive`/`valueOf` so `sum(1)(2) * 2`
  works; beware that a truthiness check (`if (sum(1)(2))`) then sees the function as truthy.
- **Seed from an argument** (`sum(10)(1)()`) and **support an explicit terminator** such as
  `sum(1)(2).value()` if a caller wants to add `0` repeatedly.
- **Why not a shared accumulator?** A module-level variable would leak totals between chains;
  the closure-per-step version is what makes the function reusable and re-entrant.

### Common Mistakes

- Returning the number instead of a function, so the second `(...)` in the chain throws
  "`sum(...) is not a function`".
- Detecting the end with `b === undefined`, which also triggers on a legitimate `undefined`.
- Forgetting the `a = 0` default, making `sum()` return a closure whose total is `undefined`.
- Storing state outside the closure, so two interleaved chains contaminate each other.

### Takeaway

Infinite currying is a closure chain: each call folds one more value into a private total and
returns a new function, and the empty call is the terminator. The function *is* the
intermediate value; only the final `()` unwraps the number.

## Implement Mixed Currying (`sum(1, 2)(3)(4, 5)()`)

`Difficulty: Medium` `Probability: High`

### Problem

Generalise infinite currying so each call may pass **any number of arguments**, and the
running total is returned by a call with none:

```javascript
sum(1, 2)(3)(4, 5)(); // => 15
```

- Every call appends its arguments to a single growing list and returns a function.
- The terminal empty call folds the whole list with `+` and returns the number.
- `sum(1, 2)(3, 4)()` and `sum(1)(2)(3)(4)()` must agree; call grouping is irrelevant.

The second, related contract is **fixed-arity currying**: given a function of known arity,
keep collecting arguments across calls and invoke it once enough have arrived. The two forms
share the idea "remember what you have, decide when you are done".

### Examples

```text
sum(1, 2)(3)(4, 5)()      // => 15
sum(1)(2)(3)(4)()         // => 10
sum(1, 2, 3, 4)()         // => 10
sum()()                   // => 0
sum(1, 2)()               // => 3

const add3 = curry((a, b, c) => a + b + c);
add3(1)(2)(3)             // => 6
add3(1, 2)(3)             // => 6
add3(1)(2, 3)             // => 6
add3(1, 2, 3)             // => 6
curry((a, b) => a + b)    // => [Function] (not called until arity 2 is met)
```

### Approach

There are two termination rules, and mixing them up is the mistake this problem tests:

1. **Unbounded / sentinel termination.** `sum` has no fixed arity, so it cannot know when the
   caller is finished. The caller says so with an empty call: `rest.length === 0` means
   "evaluate now". Everything else is appended.
2. **Fixed-arity termination.** `curry(fn)` *does* know the target: `fn.length` (the count of
   parameters before the first default or rest). Accumulate until
   `received.length >= arity`, then call `fn`.

For both, the accumulator is a closure variable, not a mutated argument list: each call
builds a new closure with the extended list, or a shared array is avoided so chains stay
independent. Prefer `[...received, ...next]` over `received.push(...next)` — the latter
mutates a list that an earlier returned function still closes over, so branching a chain
(`const a = sum(1); const b = a(2); const c = a(3);`) corrupts `b`.

When arity is exceeded in the fixed-arity form, pass all of them through; native JS ignores
extras. `fn.length` is `0` for `(...args) => ...`, so expose an explicit `arity` override for
variadic targets.

### Implementation

```javascript
// Unbounded form: the caller signals completion with an empty call.
function sum(...received) {
  function step(...args) {
    if (args.length === 0) {                       // fold everything accumulated so far
      return received.reduce((total, n) => total + n, 0);
    }
    return sum(...received, ...args);              // fresh closure; `received` is never mutated
  }
  return step;
}
```

```javascript
// Fixed-arity form: count arguments until fn.length is satisfied.
function curry(fn, arity = fn.length) {
  function collect(received) {
    return function next(...args) {
      const all = [...received, ...args];
      if (all.length >= arity) return fn(...all);  // arity met: invoke
      return collect(all);                         // otherwise keep collecting
    };
  }
  return collect([]);
}
```

### Walkthrough

Trace `sum(1, 2)(3)(4, 5)()`:

1. `sum(1, 2)` closes over `received = [1, 2]` and returns `step`.
2. `step(3)` → `args = [3]`, not empty, so `sum(1, 2, 3)`; the new closure holds `[1, 2, 3]`.
3. `step(4, 5)` → `args = [4, 5]`, so `sum(1, 2, 3, 4, 5)`.
4. `step()` → `args.length === 0`, so `[1,2,3,4,5].reduce(..., 0)` returns `15`.

For `curry((a, b, c) => a + b + c)`:
`collect([])(1, 2)` builds `all = [1, 2]`, which is less than `arity = 3`, so it returns
`collect([1, 2])`. Calling that with `3` makes `all = [1, 2, 3]`, which meets the arity, so it
calls `fn(1, 2, 3)` → `6`. Calling `add3(1, 2, 3)` directly hits the arity check on the first
call and invokes immediately.

### Complexity

Time: `O(a)` per call to append `a` arguments, plus one `O(n)` fold at termination, where `n`
is the total argument count. Space: `O(n)` — every intermediate closure keeps its slice of
arguments alive until the chain is released.

### Edge Cases

- `sum()()` → `0`; `sum(1, 2, 3, 4)()` → `10`: grouping never changes the total.
- `sum(1, 2)()` → `3`: terminate at any point.
- `curry` on a function with defaults or a rest parameter sees a smaller `fn.length`; pass an
  explicit `arity` for `(...args) => ...` (`fn.length === 0`).
- Extra arguments beyond the arity are forwarded, not dropped.
- `this` is not forwarded by `curry` as written; capture it if the target is a method.
- Non-number input to `sum` coerces during `+`, so `sum("1")(2)()` → `"12"`.

### Interview Follow-ups

- **Placeholders** (`sum(1, _, 3)`): reserve a symbol and fill holes from later calls before
  deciding whether the arity is met.
- **Lazy evaluation** (`sum(1)(2).value()`): return an object whose `value()` folds and whose
  `Symbol.toPrimitive` allows arithmetic, avoiding the empty-call convention entirely.
- **Recursive curry with `this`**: store the receiver from the first call and
  `Reflect.apply(fn, this, all)` so memoised methods keep their context.
- **Compose with currying**: `curry` plus `pipe` lets you build small point-free pipelines.

### Common Mistakes

- Mutating a shared `received` array with `push`, so branching a chain leaks arguments into
  sibling branches.
- Using `fn.length` for a variadic target and never invoking, because the arity never rises
  above zero.
- Treating any falsy argument (`0`, `""`) as the terminator instead of checking call arity.
- Recomputing the fold on every step rather than storing the accumulated list and folding once.

### Takeaway

Mixed currying is "accumulate a growing argument list, then decide when it is complete":
either the caller says so with an empty call, or the target's arity says so. Never mutate the
list an earlier returned function still closes over.

## Implement `compose`

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `compose(...fns)` returning a function that applies `fns` **right to left**:

```javascript
compose(f, g, h)(x); // => f(g(h(x)))
```

- `compose()` returns the identity function: `compose()(5)` is `5`.
- `compose(f)` behaves exactly like `f`.
- Only the **rightmost** function receives all call-time arguments; every function to its
  left receives the single value returned by the function to its right.
- Errors thrown by any stage propagate unchanged; no stage is retried or swallowed.
- The returned function is variadic (`compose(f, sum)(1, 2)` calls `sum(1, 2)` first).

### Examples

```text
const inc = (x) => x + 1;
const double = (x) => x * 2;
const square = (x) => x * x;

compose()(5)                         // => 5      (identity)
compose(double)(3)                   // => 6      (single function)
compose(double, inc)(3)              // => 8      (inc → 4, double → 8)
compose(double, inc, square)(3)      // => 20     (square 9, inc 10, double 20)
compose(inc, (a, b) => a + b)(1, 2)  // => 4      (rightmost gets both args)
compose(double, inc, square)         // => [Function]
```

### Approach

`compose` is `Array.prototype.reduceRight` with function application as the combinator. Fold
the list from the right, wrapping the accumulator in a function that has already applied the
next stage:

```javascript
fns.reduce((acc, fn) => (...args) => acc(fn(...args)))
```

The first element seeds the accumulator, so `compose(f)` returns `f` itself, and the empty
case needs an explicit identity. The nesting is what encodes the direction: each layer calls
its `fn` *first*, then feeds the result into `acc` — which is the functions to its left.

Contract points a naive version misses:

- **Arity.** Only the innermost (rightmost) function can take multiple arguments, because
  after the first stage the value is already collapsed to a single return value. If your
  composed pipeline needs `f(a, b)`, `f` must be the **rightmost** argument, not the leftmost.
- **`this`.** A reducer built from arrows drops the caller's receiver. If the rightmost
  function is a method that reads `this`, use a normal function and `Reflect.apply(fn, this, args)`
  for the first stage only.
- **Purity.** Each stage sees only the previous return value; a stage that mutates its input
  is visible to the later stages, so pure unary functions are the intended contract.

Compose is **associative**: `compose(a, compose(b, c))` and `compose(compose(a, b), c)` denote
the same function. That is what makes it safe to split and recombine pipelines.

### Implementation

```javascript
const identity = (x) => x;

function compose(...fns) {
  if (fns.length === 0) return identity;
  // Fold right: each layer runs its own function first, then the functions to its left.
  return fns.reduce((acc, fn) => (...args) => acc(fn(...args)));
}
```

The concise form above loses the composed function's `this`. This explicit form forwards it to
the first (rightmost) stage, which is where a method's receiver matters:

```javascript
function compose(...fns) {
  if (fns.length === 0) return identity;
  return function composed(...args) {
    let index = fns.length - 1;
    let result = Reflect.apply(fns[index], this, args); // rightmost: gets all args + `this`
    while (--index >= 0) result = fns[index](result);    // leftward: unary chain
    return result;
  };
}
```

### Walkthrough

Trace `compose(double, inc, square)(3)` with the `reduce` form:

1. `acc = double`, `fn = inc` → layer A = `(...args) => double(inc(...args))`.
2. `acc = A`, `fn = square` → layer B = `(...args) => A(square(...args))`.
3. Call `B(3)`: `square(3)` → `9`; `A(9)` → `inc(9)` → `10`, then `double(10)` → `20`.

The explicit version is the same order written as a loop: `fns[2] = square` runs first with
`(3)` and the composed call's `this`, then `index` walks to `inc`, then `double`. So the code
reads left-to-right while the data flows right-to-left — the one thing to keep straight.

### Complexity

Time: `O(k)` stage invocations per call, where `k` is the number of functions (plus the cost
of each stage). Space: `O(k)` for the nested closures created once at `compose` time, plus
whatever the stages allocate.

### Edge Cases

- `compose()` → identity; every value passes through unchanged.
- `compose(f)` returns `f` itself, so `compose(f) === f` and it keeps `f`'s arity.
- A `null`/`undefined` entry throws at call time (`fn is not a function`); validate the list
  if inputs are untrusted.
- Async stages return promises; `compose` does **not** await them, so the next stage receives
  a `Promise`. Use an async-aware compose for that.
- Multi-argument input reaches only the rightmost stage; put the multi-argument function there.
- `this` is dropped by the arrow form; use the explicit form for methods.

### Interview Follow-ups

- **Async compose:** `(...fns) => fns.reduceRight((acc, fn) => async (...args) => fn(await acc(...args)))`,
  which sequences promises correctly (evaluate right to left, await each stage).
- **Implement `pipe` as `compose(...fns.reverse())`** and explain why the direction flips but
  the implementation is shared.
- **Curried stages:** `compose(map(f), filter(g))` builds a reusable transformer; note that
  the innermost stage still takes the input array.
- **Variadic first stage:** to give multiple arguments to a stage other than the rightmost,
  wrap the composed function so those arguments are captured before folding.

### Common Mistakes

- Folding with `reduce` instead of `reduceRight`, silently reversing evaluation order.
- Returning `fns[0]` for the empty case, so `compose()(x)` throws on `undefined`.
- Expecting multiple arguments to reach every stage instead of only the rightmost.
- Forgetting that arrow stages discard `this`, then wondering why a method call broke.
- Assuming `compose` awaits promises; it composes values, and a promise is a value.

### Takeaway

`compose` is `reduceRight` over a list of unary functions, wrapping each stage so the value
flows right to left, with only the rightmost stage seeing the original arguments. Direction,
arity, and `this` are the three contract points.

## Implement `pipe`

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement `pipe(...fns)` returning a function that applies `fns` **left to right**:

```javascript
pipe(f, g, h)(x); // => h(g(f(x)))
```

- `pipe()` returns the identity function.
- `pipe(f)` behaves like `f`.
- The **leftmost** function receives all call-time arguments; each later function receives the
  previous stage's single return value.
- Only the value produced by the last stage is returned; intermediate values are not exposed.
- The result of each stage feeds the next, so stage order is the dataflow order — the only
  difference from `compose`.

### Examples

```text
const inc = (x) => x + 1;
const double = (x) => x * 2;
const square = (x) => x * x;

pipe()(5)                            // => 5      (identity)
pipe(inc)(3)                         // => 4
pipe(inc, double)(3)                 // => 8      (inc → 4, double → 8)
pipe(square, inc, double)(3)         // => 20     (square 9, inc 10, double 20)
pipe((a, b) => a + b, inc)(1, 2)     // => 4      (leftmost gets both args)
pipe(inc, double)(3)                 // => [Function] until called
```

### Approach

`pipe` is `Array.prototype.reduce` with function application as the combinator: seed the
accumulator with the incoming value and apply each function in list order.

```javascript
(...args) => fns.reduce((value, fn) => fn(value), args)
```

Because the seed must be the *argument list* for the first stage, the clean shape is to run
`fns[0]` explicitly and then `reduce` the remainder. That is why `pipe(f)` returns `f` with
its original arity, and why `pipe()` needs an identity.

Contract points:

- **First stage is variadic.** `pipe(sum, double)(1, 2)` calls `sum(1, 2)` then `double(3)`.
  Every later stage is unary by construction — there is only one value to hand forward.
- **Implementation identity with `compose`.** `pipe(...fns)` is exactly
  `compose(...fns.reverse())`. `reverse()` mutates the rest array, which is safe because it was
  created fresh by the rest parameter; if you accept a caller's array, copy it first.
- **`this`.** Forward the receiver to the first stage with `Reflect.apply(fn, this, args)`;
  arrow reducers otherwise drop it.
- **Purity and order.** A stage that mutates its input changes what later stages see; `pipe`
  assumes single-value, side-effect-free steps.

### Implementation

```javascript
const identity = (x) => x;

function pipe(...fns) {
  if (fns.length === 0) return identity;
  return function piped(...args) {
    let result = Reflect.apply(fns[0], this, args); // leftmost: all args + caller's `this`
    for (let i = 1; i < fns.length; i += 1) {
      result = fns[i](result);                      // left to right, unary
    }
    return result;
  };
}
```

The one-liner most interviewers accept is the reuse form:

```javascript
// `reverse()` is safe: `fns` is a fresh rest array, not the caller's array.
const pipe = (...fns) => compose(...fns.reverse());
```

### Walkthrough

Trace `pipe(square, inc, double)(3)`:

1. `fns[0] = square` is applied to the incoming arguments: `square(3)` → `9`.
2. `fns[1] = inc`: `inc(9)` → `10`.
3. `fns[2] = double`: `double(10)` → `20`.
4. The loop ends and `20` is returned.

For `pipe((a, b) => a + b, inc)(1, 2)`: the first stage receives both arguments and returns
`3`, and `inc` then returns `4`. If the two stages were swapped, the sum stage would receive
only `inc(1)` and the extra argument would be lost — a good way to demonstrate that only the
first stage is variadic.

### Complexity

Time: `O(k)` stage invocations per call for `k` functions. Space: `O(k)` for the loop's local
state (the concise reduce form allocates an accumulator per stage); no extra array is built.

### Edge Cases

- `pipe()` → identity; `pipe(f)` → `f`, preserving `f`'s arity and `this`.
- Extra arguments past the first stage are impossible to consume; put multi-argument work first.
- A throwing stage stops the pipeline and propagates the error; later stages never run.
- Async stages produce promises; either make every downstream stage promise-aware or await
  inside each stage.
- Reusing the `compose(...fns.reverse())` form on a *caller-owned* array mutates their array;
  spread into a local copy first.
- `this` is dropped by arrow reducers; the explicit loop forwards it.

### Interview Follow-ups

- **Async pipe:** `(...fns) => async (...args) => { let v = await fns[0](...args); for (const f of fns.slice(1)) v = await f(v); return v; }`.
- **Unify compose and pipe:** one factory plus a `direction` flag, or define `pipe` as
  `compose` of the reversed list and explain that only evaluation order differs.
- **Debugging stage:** insert `tap` stages (`(x) => { log(x); return x; }`) between functions
  to trace dataflow without changing the pipeline.
- **Bundle/typing:** with TypeScript, `pipe` is expressed with overloads or a recursive
  `Fns` tuple type; the runtime is unchanged.

### Common Mistakes

- Reversing the order, so `pipe(f, g)(x)` computes `f(g(x))` — that is `compose`.
- Using `reduce` seeded with `fns[0](...)` *and* iterating from `0`, applying the first stage
  twice.
- Assuming every stage takes multiple arguments.
- Letting `compose(...fns.reverse())` mutate a caller-provided array.
- Forgetting the empty case and returning `undefined` instead of the identity.

### Takeaway

`pipe` is `reduce` with function application, seeding the accumulator from the first stage's
variadic call and then running unary stages left to right. It is `compose` with the list
reversed — the code is identical, only the direction differs.

## Implement Partial Application

`Difficulty: Easy` `Probability: High`

### Problem

Implement `partial(fn, ...preset)` returning a function that calls `fn` with `preset`
**prepended** to whatever arguments the returned function receives:

```javascript
partial(fn, a)(b, c); // => fn(a, b, c)
```

- Preset arguments come first; call-time arguments are appended after them.
- The returned function forwards its **call-time `this`** to `fn` (unlike `bind`, which fixes
  `this` permanently).
- `fn`'s return value and exceptions pass through unchanged.
- Implement `partialRight(fn, ...preset)` for the mirrored case, where preset arguments are
  **appended**: `partialRight(fn, c)(a, b)` → `fn(a, b, c)`.
- Support a placeholder so a later call can fill an earlier slot:
  `partial(fn, _, c)(a, b)` → `fn(a, b, c)`.

### Examples

```text
const greet = (greeting, name, punct) => `${greeting}, ${name}${punct}`;

const hi = partial(greet, "Hi");
hi("Ada", "!")                    // => "Hi, Ada!"
hi("Bob", ".")                    // => "Hi, Bob."

const hiAda = partial(greet, "Hi", "Ada");
hiAda("?")                        // => "Hi, Ada?"

const add3 = (a, b, c) => a + b + c;
partial(add3, 1)(2, 3)            // => 6
partial(add3, 1, 2)(3)            // => 6
partialRight(add3, 3)(1, 2)       // => 6
partial(add3, partial._, 2)(1, 3) // => 6  (placeholder filled later)
```

### Approach

Partial application **fixes some arguments now and returns a function for the rest**. It is a
single closure factory, not a loop: capture `preset`, and on each invocation build
`[...preset, ...later]` and call `fn`. Currying is the stricter cousin — `partial` fixes a
specific prefix and expects the remainder in one or more calls, while `curry` keeps returning
functions until the arity is met.

Contract points that separate a correct version from a wrong one:

- **`this` is dynamic.** The returned function must forward its own receiver, so a method
  works: `partial(obj.method)(arg)` should still run with `this === obj`. Capture `this`
  inside a normal function and pass it through `Reflect.apply`.
- **No arity guessing.** `partial` never inspects `fn.length`; the caller decides how many
  arguments to preset. This is what makes it work for variadic functions.
- **Placeholders need a sentinel.** Use a unique `Symbol` (or a `partial.placeholder` object)
  and, while merging, consume the next call-time argument for each placeholder; leftovers are
  appended. Never use `undefined` as the placeholder — it is a legitimate value.
- **`partialRight` mirrors the merge.** Prepend the call-time arguments instead: `[...later, ...preset]`.

### Implementation

```javascript
const PLACEHOLDER = Symbol("partial.placeholder");

function mergeArgs(preset, later) {
  const args = [];
  let next = 0;
  for (const value of preset) {
    if (value === PLACEHOLDER && next < later.length) {
      args.push(later[next]);            // fill the hole from this call
      next += 1;
    } else {
      args.push(value);                  // keep preset values (and leftover placeholders)
    }
  }
  args.push(...later.slice(next));       // append extra call-time arguments
  return args;
}

function partial(fn, ...preset) {
  return function (...later) {
    return Reflect.apply(fn, this, mergeArgs(preset, later)); // forward this
  };
}

function partialRight(fn, ...preset) {
  return function (...later) {
    return Reflect.apply(fn, this, [...later, ...preset]);
  };
}

partial.placeholder = PLACEHOLDER;       // expose the sentinel as `partial._`
partial._ = PLACEHOLDER;
```

### Walkthrough

Trace `partial(greet, "Hi")("Ada", "!")`:

1. `partial` captures `fn = greet`, `preset = ["Hi"]`, and returns the wrapper.
2. Calling the wrapper with `("Ada", "!")` sets `later = ["Ada", "!"]` and `this` to
   `undefined` (a bare call).
3. `mergeArgs(["Hi"], ["Ada", "!"])`: `"Hi"` is not a placeholder, so it is kept; then
   `later.slice(0)` appends `"Ada", "!"` → `["Hi", "Ada", "!"]`.
4. `Reflect.apply(greet, undefined, ["Hi", "Ada", "!"])` → `"Hi, Ada!"`.

Now the placeholder case, `partial(add3, partial._, 2)(1, 3)`:

1. `preset = [PLACEHOLDER, 2]`, `later = [1, 3]`.
2. `PLACEHOLDER` is first and `next = 0 < 2`, so push `later[0] = 1`; `next` becomes `1`.
3. `2` is kept as-is.
4. `later.slice(1)` is `[3]`, appended → `[1, 2, 3]`; `add3` returns `6`.

### Complexity

Time: `O(p + n)` per call to merge `p` preset and `n` call-time arguments, plus the cost of
`fn`. Space: `O(p + n)` for the merged argument array; the preset array itself is `O(p)` and
is never mutated.

### Edge Cases

- Zero preset args: behaves exactly like a pass-through wrapper, still forwarding `this`.
- More call-time args than placeholders: the extras are appended in order.
- Fewer call-time args than placeholders: the unmatched placeholder is passed through as the
  symbol, which the target usually ignores — decide whether that should throw instead.
- Arrow `fn`: it ignores `this`, so forwarding has no effect; the return value is unaffected.
- `partial` does not update `fn.length`; the wrapper reports its own arity, unlike native `bind`.
- `partialRight(fn, c)(a, b)` differs from `partial(fn, c)(a, b)`; the preset goes to the end.

### Interview Follow-ups

- **`placeRight`:** combine placeholders with `partialRight` so `partialRight(fn, _, c)(a, b)`
  fills the middle slot.
- **Difference from `bind`:** `bind` fixes `this` permanently; `partial` preserves the call-time
  `this`, which is why it is the right tool for methods used as callbacks.
- **Difference from `curry`:** `partial` presets a specific prefix; `curry` waits for arity.
  `curry(fn)(a)(b)` and `partial(fn, a)(b)` can compute the same thing but make different
  promises about when the call happens.
- **Underscore convention:** libraries overload the placeholder token to mean "skip"; a real
  `Symbol` cannot collide with user data.

### Common Mistakes

- Merging as `[...later, ...preset]`, silently turning partial application into `partialRight`.
- Using `undefined` as the placeholder, which cannot be distinguished from a real `undefined`.
- Writing an arrow wrapper so `this` is captured lexically and the method's receiver is lost.
- Mutating the `preset` array with `push`/`splice` while filling placeholders, corrupting the
  closure for later calls.

### Takeaway

Partial application is one closure: capture the preset arguments and prepend them to each
call's arguments, forwarding the caller's `this`. Placeholders are just a unique sentinel that
lets a later call fill an earlier slot.

## Implement Function Chaining

`Difficulty: Medium` `Probability: High`

### Problem

Implement a chainable wrapper around a value, so a sequence of operations reads like a
sentence and only runs once at the end:

```javascript
chain([1, 2, 3, 4]).map((x) => x * 2).filter((x) => x > 4).take(1).value();
// => [6]
```

- Every builder method returns **`this`** (the same wrapper), which is what makes `.` chaining
  possible; the terminal `.value()` returns the result.
- Operations are **recorded, not executed**, until `.value()` runs them once, left to right.
- `.value()` is idempotent: a second call returns the cached result without re-running.
- Calling a builder method after `.value()` throws, so a chain cannot be silently reused.
- `.tap(fn)` runs a side effect and passes the value through unchanged (a debugging seam).

### Examples

```text
const result = chain([1, 2, 3, 4])
  .map((x) => x * 2)
  .filter((x) => x > 4)
  .take(1)
  .value();
result                       // => [6]

chain("hello")
  .thru((s) => s.toUpperCase())
  .thru((s) => s + "!")
  .value();                  // => "HELLO!"

const c = chain([1, 2]).tap((xs) => console.log("seen", xs)); // nothing logged yet
c.value();                   // logs "seen [1, 2]" then returns [1, 2]
c.value();                   // returns [1, 2] again; no second log
c.map((x) => x);             // throws: chain already evaluated
```

### Approach

Chaining is not a language feature; it is the convention that a builder method returns
`this`. Two decisions define the design:

1. **Eager vs lazy.** An eager chain applies each operation immediately and returns `this`.
   A lazy chain pushes the operation onto a list and applies the whole list in `value()`. Lazy
   wins when operations can be fused or skipped, and it makes `.tap` side effects happen at a
   single, predictable moment. The cost is that a bad operation only throws at `value()`.
2. **Mutable vs immutable.** Returning `this` means all references see the same chain, so two
   branches off one chain interfere. The immutable alternative returns a **new** wrapper that
   shares the recorded ops; then `const a = c.map(f)` and `const b = a.filter(g)` are
   independent. Mutable is cheaper; immutable is safer to share.

The terminal method is what turns a builder back into a value. `.value()` folds the recorded
operations over the source with `reduce`, so the pipeline runs exactly once and in insertion
order. Marking the chain "done" stops reuse of a spent chain — a real hazard when a wrapper is
accidentally held and mutated later.

### Implementation

```javascript
function chain(source) {
  const ops = [];       // recorded { kind, fn } steps, in insertion order
  let evaluated = false;
  let cached;

  function assertOpen() {
    if (evaluated) throw new Error("chain already evaluated");
  }

  const api = {
    map(fn) {
      assertOpen();
      if (typeof fn !== "function") throw new TypeError("map expects a function");
      ops.push({ kind: "map", fn });
      return api;
    },
    thru(fn) {
      assertOpen(); // like map, but the name signals a whole-value transform
      if (typeof fn !== "function") throw new TypeError("thru expects a function");
      ops.push({ kind: "map", fn });
      return api;
    },
    tap(fn) {
      assertOpen(); // observe without changing the flowing value
      if (typeof fn !== "function") throw new TypeError("tap expects a function");
      ops.push({ kind: "tap", fn });
      return api;
    },
    value() {
      if (evaluated) return cached; // idempotent: run once, replay the result
      cached = ops.reduce(
        (current, op) => {
          if (op.kind === "tap") {
            op.fn(current);
            return current;
          }
          return op.fn(current);
        },
        source,
      );
      evaluated = true;
      return cached;
    },
  };
  return api;
}
```

### Walkthrough

```javascript
chain("hello")
  .thru((s) => s.toUpperCase()) // ops: [upper]
  .thru((s) => s + "!")         // ops: [upper, bang]
  .value();                     // => "HELLO!"
```

`value()` reduces over `ops` starting from `"hello"`: `upper("hello")` → `"HELLO"`,
then `bang("HELLO")` → `"HELLO!"`. Nothing ran before `value()` — the two `thru`
calls only recorded. A second `value()` returns the cached `"HELLO!"` without
re-running, while any further `.map`/`.thru`/`.tap` throws because the chain is spent.

### Complexity

Time: `O(ops)` per `value()` call for the fold (each op's own cost aside); repeat
`value()` calls are `O(1)` via the cache. Space: `O(ops)` for the recorded list.

### Edge Cases

- Empty chain (`chain(x).value()`) returns the source untouched.
- `tap` must return the input unchanged even if the observer returns something.
- Building after `value()` throws; calling `value()` twice is safe and cached.
- An op that throws aborts the fold and the chain stays unevaluated (no partial cache).
- `this`-dependent callbacks receive `undefined` `this` — document it or forward one.

### Interview Follow-ups

- **Immutable chains:** return a *new* wrapper sharing the ops list so branches don't
  interfere (`const b = a.map(f)` leaves `a` usable).
- **Async chains:** `value()` becomes `async` and awaits each step.
- **Debug views:** record op names so a failure can say *which* step threw.

### Common Mistakes

- Eager application (running each op in `map`) — then `tap` timing is unpredictable
  and nothing can be fused or skipped.
- Returning a new object from every method but forgetting to copy the ops list.
- Caching the result but still allowing `map` after `value()`, silently dropping ops.
- `tap` accidentally transforming the value by returning the observer's result.

### Takeaway

A chain is a recorded op list plus a terminal fold: builders return the API, `value()`
runs the pipeline once and caches it, and a spent chain rejects further building.

## Implement a Chainable Calculator

`Difficulty: Easy` `Probability: High`

### Problem

Implement `calculator(start)` returning an object with chainable `.add(n)`,
`.subtract(n)`, `.multiply(n)`, `.divide(n)`, and a terminal `.value()`. Unlike the
lazy chain in the previous problem, this calculator is **eager**: each method updates
the running total immediately and returns the same API for the next call. Division by
zero throws a `RangeError` rather than producing `Infinity`.

### Examples

```text
calculator(10).add(5).multiply(2).subtract(4).value() // => 26
calculator(100).divide(4).add(5).value()              // => 30
calculator(0).add(1).divide(0)                        // => RangeError
calculator(7).value()                                 // => 7 (no operations)
```

### Approach

Hold the total in a closure. Each arithmetic method validates its operand, updates the
total, and returns the shared `api` object — that single `return api` is the entire
"chainable" mechanism. `.value()` just reads the total. Eager evaluation fits here
because every operation is cheap, total, and order-fixed; there is nothing to fuse or
skip, so recording ops (as the lazy chain does) would only add machinery.

Validate operands with `Number.isFinite`: `NaN`, `Infinity`, and non-numbers throw
`TypeError` at the call that supplies them, not three calls later at `value()`.

### Implementation

```javascript
function calculator(start = 0) {
  if (typeof start !== "number" || Number.isNaN(start)) {
    throw new TypeError("calculator expects a numeric start");
  }
  let total = start;

  function checkOperand(n, name) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
      throw new TypeError(`${name} expects a finite number`);
    }
  }

  const api = {
    add(n) {
      checkOperand(n, "add");
      total += n;
      return api;
    },
    subtract(n) {
      checkOperand(n, "subtract");
      total -= n;
      return api;
    },
    multiply(n) {
      checkOperand(n, "multiply");
      total *= n;
      return api;
    },
    divide(n) {
      checkOperand(n, "divide");
      if (n === 0) throw new RangeError("division by zero");
      total /= n;
      return api;
    },
    value() {
      return total;
    },
  };
  return api;
}
```

### Walkthrough

`calculator(10).add(5).multiply(2).subtract(4).value()`:

1. `total = 10`. `.add(5)` → `total = 15`, returns `api`.
2. `.multiply(2)` → `total = 30`, returns `api`.
3. `.subtract(4)` → `total = 26`, returns `api`.
4. `.value()` → `26`. // => 26

Every method observes the updated total, because they all close over the same `total`
binding — there is no copying, so no drift.

### Complexity

Time: `O(1)` per method — a check and one arithmetic op. Space: `O(1)` — one number
and one object.

### Edge Cases

- Division by zero throws `RangeError` (a deliberate contract, stated up front).
- `NaN`/`Infinity`/non-number operands throw `TypeError` immediately.
- Floating point still applies: `calculator(0.1).add(0.2).value()` is `0.30000000000000004`.
- Calling `.value()` mid-chain is fine; the chain remains usable afterwards (eager, no
  spent state).
- Sharing one calculator across two call sites interleaves their operations — document
  that instances are not forkable (contrast the immutable-chain follow-up).

### Interview Follow-ups

- **Undo:** keep a history stack of totals; `.undo()` pops it.
- **Lazy calculator:** record ops and fold in `value()`, like the previous problem —
  then ask when laziness pays off (it doesn't, here).
- **Expression parsing:** `calculate("10 + 5 * 2")` needs precedence, a different problem.

### Common Mistakes

- Forgetting `return api` (or returning `total`), which breaks the chain at that call.
- Returning a *new* object per method without sharing `total`.
- Letting division by zero silently produce `Infinity`.
- Validating only at `value()` instead of at the offending call.

### Takeaway

Eager chaining is a closure total plus `return api` on every method. Validate each
operand where it arrives, and make the division-by-zero contract explicit.

## Implement Function Caching by Argument Combination

`Difficulty: Medium` `Probability: High`

### Problem

Implement `cacheByArgs(fn)` — a memoizer keyed on the **combination** of arguments, so
`f(1, 2)` and `f(1, 3)` cache separately, and object arguments work **by reference**
without serialisation. Single-argument `Map` memoization (earlier on this page) is the
special case; the general case needs a key structure that handles any arity. Use a
nested-`Map` trie: each argument selects the next level, and the leaf holds the result.

### Examples

```text
let calls = 0;
const add = cacheByArgs((a, b) => { calls += 1; return a + b; });
add(1, 2)  // => 3 (calls: 1)
add(1, 2)  // => 3 (calls: 1, cached)
add(1, 3)  // => 4 (calls: 2 — different combination)

const key = { id: 1 };
const get = cacheByArgs((k) => ({ copy: k.id }));
get(key) === get(key)  // => true (same reference, one call)
get({ id: 1 })         // => new call (different reference)
```

### Approach

A `Map` tree mirrors the argument list: the root maps the first argument to a child
`Map`, which maps the second argument, and so on; the final level maps to the cached
result (stored under a dedicated leaf key so a result can never collide with a child
map). `Map` uses SameValueZero, so primitives dedupe by value, objects by reference,
and `NaN` works — all without `JSON.stringify`, which would be order-sensitive,
reference-blind, and crash on cycles.

Zero-argument calls need care: with no levels, the root itself holds the leaf. `this`
is forwarded with `fn.apply(this, args)` so methods memoize correctly.

### Implementation

```javascript
const LEAF = Symbol("cached-result");

function cacheByArgs(fn) {
  if (typeof fn !== "function") throw new TypeError("cacheByArgs expects a function");
  const root = new Map();

  return function memoized(...args) {
    let node = root;
    for (const arg of args) {
      // Primitives and objects alike are Map keys: value vs reference semantics free.
      if (!node.has(arg)) node.set(arg, new Map());
      node = node.get(arg);
    }
    if (node.has(LEAF)) return node.get(LEAF);
    const result = fn.apply(this, args);
    node.set(LEAF, result);
    return result;
  };
}
```

### Walkthrough

`add(1, 2)` then `add(1, 2)` then `add(1, 3)`:

1. First call: root has no `1` → create level-1 map; it has no `2` → create level-2
   map; no `LEAF` → call `fn(1, 2)` → `3`, store under `LEAF`. Calls: 1.
2. Second call: walk root → `1` → `2` → `LEAF` hit → return `3`. Calls: still 1.
3. `add(1, 3)`: root → `1` exists, but it has no `3` → create level-2 map → miss →
   call `fn(1, 3)` → `4`. Calls: 2.

### Complexity

Time: `O(args)` map operations per call on a hit, plus the function cost on a miss.
Space: `O(calls × arity)` map nodes in the worst case — one node per argument per
distinct call. Shared prefixes share nodes, which is the whole point of the trie.

### Edge Cases

- Zero arguments: the loop never runs, so the root holds the `LEAF` directly — one
  slot, correct.
- `NaN` arguments dedupe via SameValueZero; `-0` and `+0` collapse.
- Object arguments use reference identity — structurally equal but distinct objects
  are separate entries (document this; it surprises people).
- `this` is forwarded, so `obj.method = cacheByArgs(obj.method)` still sees `obj`.
- Unbounded growth: distinct arguments accumulate forever — pair with an LRU/TTL
  eviction policy in production (see the Data Structures page).

### Interview Follow-ups

- **Custom key function:** accept a `resolver(...args)` like lodash `memoize` for
  structural keys.
- **Async functions:** cache the *promise* so concurrent identical calls share flight.
- **Eviction:** cap the root map (LRU) or timestamp leaves (TTL).

### Common Mistakes

- `JSON.stringify(args)` as the key: key order matters, functions/`undefined`/cycles
  break, and distinct references with equal shape collide.
- Joining args with a separator (`args.join("|")`): `"1|2"` collides with `"1", "2"`
  vs `"1|2"` single-arg, and objects all become `"[object Object]"`.
- Caching by first argument only and ignoring the rest.
- Losing `this` by calling `fn(...args)` instead of `fn.apply(this, args)`.
- Storing the result directly as a level value, where it can collide with a child map.

### Takeaway

Multi-argument memoization is a `Map` trie over the argument list with the result under
a leaf key: value semantics for primitives, reference semantics for objects, no
serialisation, and `this` forwarded.
