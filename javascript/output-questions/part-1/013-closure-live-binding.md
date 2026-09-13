# The Code

```js
function outer() {
  let a = 10;
  function inner() {
    console.log(a);
  }
  a = 20;
  return inner;
}

outer()();
```

# The Answer

```text
20
```

The surprising part is that `inner` was defined while `a` was `10`, but it does not preserve a frozen copy of that value. It closes over the variable itself. By the time the returned function runs, that variable contains `20`.

# Execution — Walk Through It Like the JS Engine

1. JavaScript creates the `outer` function declaration during the scope setup phase. The function is available before execution reaches the declaration.

2. `outer()()` starts by calling `outer`. JavaScript creates a new function execution context for this call. That context contains the lexical binding `a`.

3. `let a = 10` initializes the binding, so `a` now refers to the value `10`.

4. JavaScript creates the function object `inner`. Because `inner` is defined inside `outer`, it remembers the surrounding lexical environment. That remembered environment contains the binding for `a`, not merely a snapshot of the value `10`.

5. `a = 20` updates the same binding. No new `a` is created, and the already-created `inner` function is not rewritten. Its closure still points to that binding, which now contains `20`.

6. `return inner` returns the function object. The `outer` call finishes, but the lexical environment containing `a` remains reachable through `inner`, so it cannot be discarded.

7. The second pair of parentheses immediately calls the returned function. Inside `inner`, `console.log(a)` looks up `a` in its preserved outer lexical environment and finds the current value, `20`.

This is entirely synchronous. Nothing enters the Web API, microtask queue, or macrotask queue: there is no promise, timer, event listener, or other asynchronous operation in the code. The log happens before the whole expression finishes.

# The Concept This Question Tests

This tests closures and live lexical bindings.

A closure is a function together with the lexical environment it needs to resolve variables. The important detail is that the environment stores bindings—named storage locations—not copied primitive values. When a closed-over variable is later reassigned, calls to the closure observe the updated binding.

That is why this is different from imagining that JavaScript secretly transformed the code into something like `inner = () => console.log(10)`. It did not. Conceptually, `inner` retains access to the variable named `a`, and the lookup happens when `inner` executes.

The same mechanic makes closures useful for private state:

```js
function createCounter() {
  let count = 0;

  return () => ++count;
}

const counter = createCounter();
console.log(counter()); // 1
console.log(counter()); // 2
```

Both calls use the same preserved `count` binding and mutate it over time.

# The Trap — Why Most People Get It Wrong

The common wrong assumption is: “The function was created when `a` was `10`, so it must print `10`.” That confuses closing over a variable with copying a variable’s current value. Closures capture access to the binding; they do not automatically freeze the binding at function-creation time.

Another mistake is to think the assignment creates a second variable. `a = 20` is only an update to the `let a` declared earlier. Since `inner` refers to that same binding, it sees `20`.

Do not confuse this with a parameter or local snapshot created explicitly:

```js
function outer() {
  let a = 10;
  const snapshot = a;

  return () => [snapshot, a];
}

const read = outer();
// `snapshot` would remain 10, while `a` would reflect later reassignment.
```

If the original code had used a timer, the queue would affect *when* the closure ran, but not what the closure captured. For example, `setTimeout(() => console.log(a), 0)` would read the value of `a` when the timer callback eventually executed. Here there is no timer, so there is no event-loop delay to reason about.

# 🧠 The Memory Hook

A closure keeps the drawer, not a photocopy of what was inside the drawer. `inner` keeps access to the `a` drawer, and when it opens it, the current contents are `20`.
