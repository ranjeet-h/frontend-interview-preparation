# JavaScript Output Question 12: Closure Counter

## The Code

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

## The Answer

```text
1
2
```

The two calls do not create two counters. `createCounter()` runs once, creates one `count` variable initialized to `0`, and returns one function that remembers how to reach that variable. Both calls invoke that same returned function, so both update the same `count`: first from `0` to `1`, then from `1` to `2`.

## Execution — Walk Through It Like the JS Engine

JavaScript first registers the `createCounter` function declaration. Nothing inside the function runs merely because the function was declared; its body runs only when `createCounter()` is called.

Execution then reaches:

```javascript
const counter = createCounter();
```

The call creates a new function-execution environment for `createCounter`. Inside that environment, `let count = 0` creates a lexical binding named `count` and stores `0` in it. The function then creates and returns the inner anonymous function.

That inner function closes over the surrounding environment. In practical terms, the returned function carries a hidden reference to the environment containing `count`; it does not receive a detached copy of `count`. Because `counter` now holds the returned function, the environment remains reachable after `createCounter` has finished, so JavaScript keeps it alive for later calls.

The first log evaluates `counter()`:

1. JavaScript calls the returned inner function.
2. `count++` reads the captured `count`, which is `0`, then stores `1` back into that same binding. The expression itself evaluates to the old value, but that value is not used here.
3. `return count` reads the updated binding, which is now `1`.
4. `console.log` prints `1`.

The second log calls the same function again. It does not call `createCounter` again, so no new `count` is initialized. The closure reads the existing binding, which currently contains `1`; `count++` changes it to `2`, and `return count` returns `2`. The second `console.log` prints `2`.

The key timeline is:

```text
createCounter() once:  count = 0, return inner function
counter() first time: count = 1, return 1
counter() second time: count = 2, return 2
```

There is no asynchronous scheduling here. Every operation is synchronous: the first call completes before the second call starts.

## The Concept This Question Tests

This tests closures, lexical scope, and mutation of a captured binding.

A closure is the combination of a function and the surrounding lexical environment it can still access. The inner function can read and update `count` even after the outer function has returned because the inner function still references that environment.

The closure preserves the binding, not just the value that existed when the function was created. That is why the second call sees the first call's update. The `count` variable is private from the outside: code outside `createCounter` cannot directly name it, but the returned function provides controlled access to it.

The number of calls to `createCounter` determines the number of independent counters. Here it runs once, so there is one shared private state:

```javascript
const first = createCounter();
const second = createCounter();

console.log(first());  // 1
console.log(first());  // 2
console.log(second()); // 1 — a different closure and a different count
```

`first` and `second` each retain a different execution environment. The original question has only one `counter`, so both calls use the same environment.

## The Trap — Why Most People Get It Wrong

The most common mistake is assuming that `count` is reset to `0` every time `counter()` runs. It is not. The reset happens inside `createCounter`, and `createCounter()` is called only once. Calling the returned function runs the inner function body, not the outer function body.

Another mistake is saying that the closure stores a frozen snapshot of `count`. It does not. It keeps access to the live lexical binding. Since `count++` mutates that binding, later calls observe the new value.

People also sometimes expect `count++` to return `0` on the first call because post-increment evaluates to the old value. That would matter if the code returned `count++` directly:

```javascript
return count++; // returns 0 first, then increments count to 1
```

The actual code uses two separate operations. `count++` updates the binding, and the following `return count` reads the updated value, so the first call returns `1`.

Finally, a closure is not automatically a memory leak. The captured environment is eligible for garbage collection when no reachable function or object can access it. Here, `counter` keeps the returned function reachable, so its private `count` must remain available. If `counter` becomes unreachable, the function and captured state can eventually be collected.

## 🧠 The Memory Hook

`createCounter` builds one private room containing `count`; the returned function keeps the key. Every call uses the same room, so the number rises from `0` to `1` to `2` instead of starting over.
