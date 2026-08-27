# The Code

```javascript
function createCounter() {
  let count = 0;
  return function () {
    count++;
    return count;
  };
}
const counter = createCounter();
console.log(counter());
console.log(counter());
```

# The Answer

```text
1
2
```

The key detail is that `createCounter` returns a function, and that returned function still has access to `count` after `createCounter` has finished. Both calls use the same preserved `count` binding, so the first call changes it from `0` to `1`, and the second changes it from `1` to `2`.

# Execution — Walk Through It Like the JS Engine

JavaScript first processes the declarations needed by this synchronous script. The function declaration `createCounter` is available before execution reaches the first statement. The `const` binding for `counter` is created for the scope but is not initialized until its declaration executes; nothing reads it before then, so the temporal dead zone never causes an error.

Execution begins by evaluating `createCounter()`. JavaScript creates a new function execution context for that call. Inside it, `let count = 0` creates a local lexical binding and initializes it to `0`.

The `return function () { ... }` expression creates a new inner function. That function refers to `count`, so JavaScript retains access to the surrounding lexical environment when the function is returned. The call to `createCounter` then finishes, but the `count` binding cannot be discarded because the returned function still needs it.

The returned function is assigned to `counter`. At this point the important runtime picture is:

```text
counter ──> returned function ──> preserved environment { count: 0 }
```

JavaScript evaluates the first `counter()` call. The returned function is invoked and looks up `count` in its preserved outer environment. `count++` reads `0`, produces that old value as the expression result, and writes `1` back into the binding. The function then returns `1`, and `console.log` prints `1`.

JavaScript evaluates the second `counter()` call in exactly the same way. This is not a fresh counter and not a new `count` variable. The function reaches the same preserved binding, which now contains `1`; `count++` updates it to `2`, the function returns `2`, and the second `console.log` prints `2`.

There is no asynchronous scheduling in this question. Every statement runs synchronously, in source order, and the closure is what allows state to survive between the two calls.

# The Concept This Question Tests

This question tests **closures**. A closure is a function together with the surrounding lexical environment it needs in order to run later. The important part is not that the outer function “stores a copy” of `count` inside the inner function. The inner function keeps a live connection to the original binding created by `createCounter`.

That distinction explains why the value changes across calls. `counter()` is not executing the body of `createCounter` again. `createCounter` ran once, created one `count` binding, and returned one function. Each later call mutates that same binding.

It also explains privacy. Code outside the closure cannot directly access the local `count` name, but it can interact with the value through the operations exposed by the returned function. This is the basis of counter factories, module-style private state, memoization, and many callback patterns.

If the factory runs twice, each invocation creates a different environment and therefore a separate counter:

```javascript
const first = createCounter();
const second = createCounter();

console.log(first());  // 1
console.log(first());  // 2
console.log(second()); // 1: a different preserved `count`
```

The two returned functions may have identical source code, but they close over different bindings because they came from different executions of the factory.

# The Trap — Why Most People Get It Wrong

**Trap: expecting `1` and `1`.** Some readers see `let count = 0` and assume it runs for every `counter()` call. It does not. That declaration runs once, when `createCounter()` is called. The later calls invoke only the returned inner function.

**Trap: expecting the outer local variable to disappear.** The outer execution context finishes, but its lexical environment remains reachable through the returned function. JavaScript’s garbage collector can reclaim it only when nothing can reach the closure anymore.

**Trap: saying the closure captures a frozen value.** A closure retains access to a binding, not merely a snapshot. `count++` updates that binding, and the next invocation observes the updated value.

**Trap: assuming `counter` calls `createCounter` again.** `counter` holds the returned inner function. Calling it does not re-run the factory, recreate `count`, or reset the state.

**Trap: confusing private state with immutable state.** `count` is hidden from outside code, but it is mutable inside the closure. Privacy controls who can reach the binding; it does not prevent the function from changing it.

**Trap: treating every function as sharing one closure.** Each factory invocation creates its own lexical environment. Two counters made by two calls are independent, just as two objects made by a constructor have independent instance state.

# 🧠 The Memory Hook

`createCounter` builds a private room containing `count` and hands you a key—the returned function. The factory leaves, but the room stays alive behind the key, so every use of that same key finds the last number and increments it: `1`, then `2`.
