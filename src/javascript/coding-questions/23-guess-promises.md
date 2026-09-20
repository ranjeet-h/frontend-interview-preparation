# Guess the Output: async/await, Chaining & Errors

An `async` function always returns a promise, `await` pauses only its own function, a missing `return` threads `undefined` through the chain, and `finally` observes without transforming. The executor-runs-synchronously question opens the page because everything else assumes it.

## `await` splits an `async` function into a sync head and a microtask tail

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
async function foo() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

console.log("C");
foo();
console.log("D");
```

### Output

```text
C
A
D
B
```

### Explanation

```text
1. synchronous execution: C logs; foo() is called and runs synchronously up to the await — A logs; the await suspends foo and queues its resumption; D logs.
2. call stack: empty after D.
3. scheduled microtasks: [foo's resumption (console.log("B"))].
4. scheduled macrotasks: [].
5. microtask execution order: foo resumes after its awaited promise settles — B logs.
6. next macrotask: none.
7. final output: C, A, D, B.
```

An `async` function body runs synchronously until the first `await`. The `await` suspends the function and schedules the remainder as a microtask, so the caller's synchronous code (`D`) runs before the code after `await` (`B`).

### The Rule

`await` yields control back to the caller; everything after the `await` in that function runs as a microtask once the awaited value settles. Synchronous code that follows the `async` call always runs first.

### How to Rewrite It Safely

Nothing is broken — this is the canonical `await` ordering to internalise. The dangerous variation is assuming code after `await` runs before the caller's next line; if ordering matters, `await` the call itself (`await foo()`).

### Takeaway

Code before the first `await` runs immediately; code after it waits in the microtask queue behind the current synchronous execution.

## An `async` function always returns a promise

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
async function foo() {
  return 10;
}

console.log(foo());
```

### Output

```text
Promise { 10 }
```

(In Node.js the exact formatting is `Promise { 10 }`; in browsers it renders as a `Promise` object that resolves to `10`. It never prints a bare `10`.)

### Explanation

`foo()` is invoked and its body runs: `return 10` completes the async function's promise with the fulfillment value `10`. But the call expression `foo()` itself evaluates to that pending-then-fulfilled `Promise` object, not to `10` — the value is unwrapped only via `await` or `.then`. `console.log` therefore prints the promise wrapper. No `.then` callbacks are registered, so nothing else is queued.

### The Rule

Every `async` function returns a `Promise`, unconditionally. A returned value becomes the fulfillment value; a thrown error becomes the rejection reason. There is no way to get the plain value out synchronously.

### How to Rewrite It Safely

This demonstrates the correct mental model, not a bug. The variation that breaks it is treating the result as the value:

```javascript
const result = foo(); // a Promise, not 10
console.log(await result); // => 10
```

### Takeaway

`async` means "returns a promise, always" — `return 10` is shorthand for "fulfill with `10`", and only `await`/`.then` sees through the wrapper.

## `throw` inside `async` becomes a rejected promise

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
async function foo() {
  throw new Error("oops");
}

foo().catch((err) => console.log(err.message));
```

### Output

```text
oops
```

### Explanation

`foo()` runs its body synchronously: the `throw` executes immediately. Instead of propagating to the caller as a synchronous exception, the async machinery captures it and rejects the promise `foo()` returned with the `Error`. The `.catch` handler is registered on that rejected promise, so it is queued as a microtask and runs with `err` bound to the error; `err.message` logs `oops`. Without the `.catch`, the call would produce an unhandled promise rejection rather than a thrown error.

### The Rule

Inside an `async` function, `throw` does not throw to the caller — it rejects the function's promise. The caller observes it only through `.catch`/`await`-in-`try`, exactly as if the function had returned `Promise.reject(err)`.

### How to Rewrite It Safely

This is the correct pattern for async errors — always attach rejection handling. The breaking variation is calling `foo()` with no `.catch` and no `try`/`await`, which yields an unhandled rejection instead of a visible error.

### Takeaway

In `async` code, `throw` is spelled "reject": handle it with `catch`, or it escapes as an unhandled rejection, not a crash at the call site.

## Returned values thread through a `.then` chain

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
Promise.resolve(1)
  .then((value) => {
    console.log(value);
    return 2;
  })
  .then((value) => {
    console.log(value);
  });
```

### Output

```text
1
2
```

### Explanation

`Promise.resolve(1)` creates an already-fulfilled promise, so the first `.then` callback is queued as a microtask and runs with `value === 1`, logging `1`. Because that callback returns `2` (a plain value), the promise returned by the first `.then` fulfills with `2`. The second `.then` callback is then queued and runs with `value === 2`, logging `2`. Each `return` inside `.then` becomes the input of the next link.

### The Rule

`.then` returns a new promise that fulfills with whatever its callback returns — a plain value is wrapped, a promise is assimilated. Returning is how data flows down the chain.

### How to Rewrite It Safely

This is the correct chaining pattern. The variation that breaks it is dropping a `return` (see the next question): the chain silently continues with `undefined` instead of failing loudly.

### Takeaway

A promise chain is a pipeline: each `.then` callback's return value is the next link's input.

## A `.then` without `return` passes `undefined` onward

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
Promise.resolve(1)
  .then((value) => {
    console.log(value);
  })
  .then((value) => {
    console.log(value);
  });
```

### Output

```text
1
undefined
```

### Explanation

The first `.then` callback runs with `value === 1` and logs `1`, but it has no `return` statement, so it returns `undefined`. The promise produced by the first `.then` therefore fulfills with `undefined`. The second `.then` callback runs with `value === undefined` and logs `undefined`. The chain did not stall or reuse `1` — it moved on with the default return value of the callback.

### The Rule

A `.then` callback that returns nothing returns `undefined`, and the chain adopts it like any other value. "Missing return" never preserves the previous value; it replaces it with `undefined`.

### How to Rewrite It Safely

Return explicitly from every `.then` that feeds a later link, or collapse the chain with `await`, where the value flows through ordinary variables:

```javascript
const first = await Promise.resolve(1);
console.log(first);
console.log(first); // still 1 — no implicit undefined step
```

### Takeaway

Forgetting `return` in `.then` is the classic silent pipeline break: downstream receives `undefined`, not the previous value.

## `throw` skips forward to `catch`, which can recover the chain

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
Promise.resolve("A")
  .then((value) => {
    throw new Error("B");
  })
  .catch((err) => {
    console.log(err.message);
    return "C";
  })
  .then((value) => {
    console.log(value);
  });
```

### Output

```text
B
C
```

### Explanation

The first `.then` callback runs with `"A"` and throws. That throw rejects the promise the first `.then` produced, so the chain skips any intermediate fulfillment handlers and the `.catch` callback is queued instead. It runs with the error, logs `B`, and returns `"C"` — a normal return from `.catch` *fulfills* the chain again. The final `.then` therefore runs with `"C"` and logs it. `catch` both observes the failure and restarts the pipeline.

### The Rule

A throw (or rejection) propagates down the chain past fulfillment handlers until a `.catch` (or a rejection handler) handles it. If that handler returns normally, the chain is recovered and subsequent `.then` callbacks run with the returned value.

### How to Rewrite It Safely

This is the correct recover-and-continue pattern. The breaking variation is rethrowing (or returning a rejected promise) inside `.catch` when you meant to recover — that keeps the chain rejected and skips the following `.then` fulfillment handlers.

### Takeaway

`.catch` is a repair station: handle the error and `return` to put the chain back on the fulfillment track.

## Returning a rejected promise rejects the chain

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
Promise.resolve()
  .then(() => {
    return Promise.reject("A");
  })
  .catch((err) => {
    console.log(err);
  });
```

### Output

```text
A
```

### Explanation

The `.then` callback runs on fulfillment and returns `Promise.reject("A")` — an already-rejected promise. The promise produced by `.then` *assimilates* the returned promise rather than wrapping it, so it adopts the rejection with reason `"A"`. The `.catch` handler is therefore queued, runs with `err === "A"`, and logs it. Returning a rejected promise from `.then` is functionally identical to throwing inside it.

### The Rule

When a `.then` callback returns a promise, the chain follows that promise's fate (assimilation): fulfillment flows on, rejection diverts to the next `catch`. `return Promise.reject(x)` and `throw x` are interchangeable inside `.then`.

### How to Rewrite It Safely

This is the correct way to fail a chain asynchronously (e.g. after another async check). The breaking variation is returning an *unrelated* rejected promise you never meant to adopt — with `await` syntax the equivalent mistake is awaiting a rejecting promise outside `try`.

### Takeaway

The chain adopts whatever promise you return — hand back a rejection and the chain rejects, exactly as if you had thrown.

## `finally` does not change the settled value

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
Promise.resolve("A")
  .finally(() => {
    return "B";
  })
  .then((value) => {
    console.log(value);
  });
```

### Output

```text
A
```

### Explanation

The promise fulfills with `"A"`, so the `.finally` callback is queued and runs — but `.finally` callbacks take no value argument and their return value is discarded (unless they throw or return a rejected promise). The promise produced by `.finally` therefore still fulfills with the original `"A"`. The `.then` callback runs with `"A"` and logs it; the `"B"` vanishes.

### The Rule

`.finally` is transparent to the settlement: it observes (for cleanup) but cannot transform. Its return value is ignored; the original fulfillment value or rejection reason passes through unchanged.

### How to Rewrite It Safely

Use `.finally` only for side-effect cleanup (closing loaders, releasing locks), never to compute the next value — put value logic in `.then`. The breaking variation is throwing inside `.finally` (or returning a rejected promise), which *does* replace the outcome with a rejection.

### Takeaway

`finally` is a window, not a pipe: it sees the result go by but cannot change it — use it for cleanup only.

## `finally` runs on rejection too, then the rejection continues

`Difficulty: Medium` `Probability: Medium`

### The Code

```javascript
Promise.reject("A")
  .finally(() => {
    console.log("B");
  })
  .catch((err) => {
    console.log(err);
  });
```

### Output

```text
B
A
```

### Explanation

The promise is already rejected with `"A"`. `.finally` registers for both outcomes, so its callback is queued as a microtask and runs first, logging `B`. Since the callback returns normally, the `.finally`-produced promise adopts the *original* rejection (`"A"`), not a fulfillment. The `.catch` handler is then queued, runs with `err === "A"`, and logs it. Cleanup ran, and the failure continued past it.

### The Rule

`.finally` fires on both fulfillment and rejection, then passes the original settlement through. On the rejection path the chain stays rejected after `finally` unless the callback itself throws or returns a rejected promise (which would replace the reason).

### How to Rewrite It Safely

This is the correct cleanup-on-failure shape (hide spinner, then still handle the error in `.catch`). The breaking variation is putting recovery logic in `.finally` — it cannot convert rejection to fulfillment; only `.catch` (or a rejection handler) can.

### Takeaway

`finally` runs no matter how the promise settled, then gets out of the way: rejections keep propagating to the next `catch`.

## The Promise executor runs synchronously

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log("A");
new Promise((resolve) => {
  console.log("C");
  resolve();
  console.log("D");
}).then(() => {
  console.log("B");
});
```

### Output

```text
A
C
D
B
```

### Explanation

```text
1. synchronous execution: A logs; the Promise constructor invokes the executor immediately — C logs, resolve() marks the promise fulfilled (callbacks queued, nothing runs yet), D logs; .then registers B.
2. call stack: empty after the constructor and .then registration.
3. scheduled microtasks: [B].
4. scheduled macrotasks: [].
5. microtask execution order: B runs.
6. next macrotask: none.
7. final output: A, C, D, B.
```

Calling `resolve()` does not run `.then` callbacks inline — it only marks the promise settled and queues them. So `D` (still synchronous executor code) prints before `B` (queued microtask).

### The Rule

The executor passed to `new Promise` runs synchronously during construction; only the `.then`/`.catch`/`.finally` callbacks are ever deferred. `resolve`/`reject` schedule handlers as microtasks — they never execute observers re-entrantly.

### How to Rewrite It Safely

Nothing is broken — this is the construction contract to internalise. The breaking variation is doing slow or throwing work in the executor: it blocks construction and any throw becomes an automatic rejection, so keep executors small and total.

### Takeaway

`new Promise(executor)` runs the executor *now* and the handlers *later*: `resolve()` queues, it never calls back synchronously.

## `try`/`catch`/`finally` inside `async` follows sync rules

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
async function foo() {
  try {
    throw new Error("B");
  } catch (err) {
    console.log(err.message);
  } finally {
    console.log("C");
  }
}

foo();
```

### Output

```text
B
C
```

### Explanation

`foo()` runs synchronously until its first suspension point — but there is no `await` here, so the whole body runs in one go. The `throw` transfers control to the `catch` block, which logs `B`. The `finally` block then runs unconditionally and logs `C`. Because the error was caught, the async function's promise fulfills (with `undefined`) rather than rejecting. `async` changes how the *result* is delivered (via the returned promise), not how `try`/`catch`/`finally` dispatch.

### The Rule

`try`/`catch`/`finally` inside an `async` function behaves exactly as in synchronous code: `catch` handles the throw, `finally` always runs. The only async twist is the outcome mapping — uncaught throws reject the returned promise, caught ones do not.

### How to Rewrite It Safely

This demonstrates correct local handling of async errors. The variation that breaks it is `await`-ing a rejecting promise outside the `try` — the rejection then bypasses the `catch` and rejects `foo()`'s promise instead.

### Takeaway

`async` does not change `try`/`catch`/`finally` dispatch — it only changes where an *uncaught* error lands (the returned promise's rejection).

## `return` in `finally` overrides `return` in `try`

`Difficulty: Hard` `Probability: Medium`

### The Code

```javascript
async function foo() {
  try {
    return "A";
  } finally {
    return "B";
  }
}

foo().then((value) => console.log(value));
```

### Output

```text
B
```

### Explanation

`foo()` runs its body: the `try` block's `return "A"` evaluates the value and prepares to complete the async function with it — but `finally` must run first. The `finally` block executes its own `return "B"`, which *replaces* the pending completion entirely; the `"A"` is discarded. The async function's promise therefore fulfills with `"B"`, and the `.then` callback logs `B`. The same override applies in synchronous functions — `async` only wraps the winning value in a promise.

### The Rule

A `return` (or `throw`) in `finally` supersedes any in-flight `return`/`throw` from `try`/`catch`. The `finally` outcome wins unconditionally, which is why returning from `finally` is almost always a mistake.

### How to Rewrite It Safely

Never `return` from `finally` — restrict it to cleanup side effects so the `try`/`catch` outcome survives:

```javascript
async function foo() {
  try {
    return "A";
  } finally {
    cleanup(); // no return here
  }
}
```

### Takeaway

`finally` with a `return` hijacks the function's result — keep `finally` to side effects and let `try`/`catch` decide the value.

## `async`, timers, and promises combined ordering

`Difficulty: Hard` `Probability: Very High`

### The Code

```javascript
console.log("1");
setTimeout(() => console.log("2"), 0);
Promise.resolve().then(() => console.log("3"));

async function foo() {
  console.log("4");
  await Promise.resolve();
  console.log("5");
}

foo();
console.log("6");
```

### Output

```text
1
4
6
3
5
2
```

### Explanation

```text
1. synchronous execution: 1 logs; setTimeout schedules macrotask 2; .then schedules microtask 3; foo() is called and runs sync to its await — 4 logs, the await suspends foo and queues its resumption (5) after the already-queued microtask 3; 6 logs.
2. call stack: empty after 6.
3. scheduled microtasks: [3, foo-resumption (5)] in FIFO order.
4. scheduled macrotasks: [2].
5. microtask execution order: 3 runs, then foo resumes and 5 runs; the microtask queue drains fully before any macrotask.
6. next macrotask: 2 runs.
7. final output: 1, 4, 6, 3, 5, 2.
```

The two traps: `foo()`'s head (`4`) runs synchronously at the call, while its tail (`5`) queues *behind* the earlier `.then` (`3`); and the zero-delay timer (`2`) runs last because one macrotask waits until every queued microtask has drained.

### The Rule

Order the work by queue, not by position: synchronous code first (including `async` heads up to `await`), then all microtasks FIFO (promise callbacks, `await` resumptions, `queueMicrotask`), then the next macrotask (`setTimeout`/I/O). `setTimeout(..., 0)` means "earliest macrotask", which always loses to any pending microtask.

### How to Rewrite It Safely

Nothing is broken — this is the full ordering model to internalise. The dangerous variation is relying on this interleaving for correctness between unrelated tasks; sequence dependent work explicitly with `await` instead of depending on queue priority.

### Takeaway

Sync first, then every microtask in order, then one macrotask: `1, 4, 6` run now, `3, 5` drain FIFO, and the timer's `2` goes last.

