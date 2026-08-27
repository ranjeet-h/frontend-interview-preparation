## The Code

```javascript
function createAdder(x) {
  return function (y) {
    return x + y;
  };
}

const add5 = createAdder(5);
const add10 = createAdder(10);

console.log(add5(2));
console.log(add10(2));
```

## The Answer

```text
7
12
```

The first call adds `2` to the `x` captured when `add5` was created: `5 + 2 = 7`. The second call uses a different closure, whose captured `x` is `10`: `10 + 2 = 12`.

## Execution — Walk Through It Like the JS Engine

There is no timer, Promise, `await`, or other asynchronous work here. Everything runs synchronously on the call stack, so the important question is not queue order; it is which lexical environment each returned function remembers.

1. JavaScript creates the `createAdder` function declaration during setup, so it is callable before its position in the file would matter. When execution reaches `const add5` and `const add10`, those `const` bindings receive their values normally; neither binding is used before initialization.
2. `createAdder(5)` calls `createAdder` with `x` set to `5`. That call creates a function for `function (y) { return x + y; }` and returns it. Even after `createAdder` returns, the returned function keeps access to the lexical environment containing `x = 5`. That retained environment is the closure.
3. The returned function is stored in `add5`. The name `add5` does not store the number `5`; it stores a function whose remembered `x` is `5`.
4. `createAdder(10)` runs again as a separate invocation. It creates another lexical environment with `x = 10`, creates another returned function, and stores that function in `add10`. This is a separate closure, not a replacement for the one held by `add5`.
5. `add5(2)` pushes the returned function onto the call stack. Its local parameter `y` becomes `2`. JavaScript looks for `x` in the returned function's own scope, does not find a local `x`, and follows the saved outer-scope link to the first `createAdder` invocation, where `x` is `5`. It returns `5 + 2`, so the first log prints `7`.
6. `add10(2)` does the same lookup through its own saved outer-scope link. This time it finds `x = 10`, returns `10 + 2`, and the second log prints `12`.

The key detail is that a closure remembers a binding and its surrounding environment, not merely a copied result. Here `x` is never changed, so the observable effect looks like each function simply stored a number. If the outer function changed `x` later, the returned function would observe that live binding when it was called.

## The Concept This Question Tests

This tests closures, lexical scope, and higher-order functions working together.

A function is a higher-order function when it returns another function. `createAdder` is therefore a factory: each invocation manufactures a specialized adder. The returned function closes over `x`, meaning its function object retains the scope chain needed to resolve `x` later, after `createAdder` has already finished.

Each invocation gets its own environment:

```text
add5  → returned function + remembered { x: 5 }
add10 → returned function + remembered { x: 10 }
```

Calling `createAdder` twice matters. If there were only one shared mutable `x`, both functions could produce the same result after an update. Instead, JavaScript creates two independent bindings, so changing one closure's captured state would not change the other closure's state.

This is the same idea behind configurable validators, event handlers with private configuration, memoized functions, and small module factories: call the factory once with configuration, then call the returned function many times with input.

## The Trap — Why Most People Get It Wrong

The common mistake is to say that `add5` is a function that “has `5` as an argument.” `5` was an argument to the factory call, not to the returned function. The returned function receives only `y`; it can still use `x` because the closure preserved the outer lexical environment.

Another mistake is to imagine that `add5` and `add10` share one `x`. They do not. Every call to `createAdder` creates a new invocation environment. `add5` points to the environment created by `createAdder(5)`, while `add10` points to the environment created by `createAdder(10)`.

Do not confuse a closure with a snapshot of every variable's value. Closures retain access to bindings, which are locations that can hold values. For example:

```javascript
function makeCounter() {
  let count = 0;
  return () => ++count;
}

const next = makeCounter();
console.log(next()); // 1
console.log(next()); // 2 — the same captured binding was updated
```

Finally, do not look for an event-loop explanation in this question. Both logs happen during the original synchronous script. There are no Web APIs, microtasks, or macrotasks involved, and adding a timer would create a different output-tracing problem.

## 🧠 The Memory Hook

Every factory call builds a private room with its own `x`, and the returned function keeps the key to that room. `add5` carries the key to the room containing `5`; `add10` carries the key to a different room containing `10`.
