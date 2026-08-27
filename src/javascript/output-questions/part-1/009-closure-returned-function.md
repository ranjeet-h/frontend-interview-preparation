# JavaScript Output Question 9: A Closure Returned from a Function

## 1. The Code

```javascript
function outer() {
  var x = "Hello";
  function inner() {
    console.log(x);
  }
  return inner;
}
var myFunc = outer();
myFunc();
```

## 2. The Answer

```text
Hello
```

`outer()` returns the `inner` function itself, not the result of calling `inner`. That returned function is stored in `myFunc`, and when `myFunc()` runs, it still finds `x` from the scope where `inner` was created. This preserved access to an outer variable is a closure.

## 3. Execution — Walk Through It Like the JS Engine

JavaScript first prepares the surrounding scope. It creates the function binding for `outer`, and the top-level `var myFunc` binding is also initialized to `undefined`. The function body of `outer` does not run merely because the function was declared; it runs only when the code calls `outer()`.

Execution then proceeds in source order:

1. JavaScript reaches `var myFunc = outer()`. To evaluate the initializer, it calls `outer` and creates a fresh function execution context for that call.
2. Inside this particular call to `outer`, `var x = "Hello"` creates a local `x` binding and assigns the string `"Hello"` to it.
3. JavaScript creates the `inner` function. `inner` is defined inside `outer`, so its lexical environment points back to the environment containing this call's `x` binding. That remembered link is the important part of a closure.
4. `return inner` returns the function object. It does not execute `inner`, because there are no parentheses after the name. The `outer` call finishes, so its normal execution is over.
5. The returned function object is assigned to `myFunc`. Although the call to `outer` has finished, the environment containing `x` cannot be discarded: the still-reachable `inner` function may need it. The engine keeps that environment reachable through `inner`'s lexical environment reference.
6. JavaScript reaches `myFunc()`. This calls the same function object that `outer` returned. Inside `inner`, `console.log(x)` looks for `x` in `inner`'s own local scope first. There is no local `x`, so the lookup follows the function's preserved outer lexical environment and finds `x = "Hello"`.
7. `console.log` prints `Hello`.

The closure is not a frozen copy of the value. It is a function together with access to the relevant lexical environment. If the outer function had returned another function that changed `x`, later calls could observe that same retained binding. Here there is only a read, so the visible result is simply `Hello`.

## 4. The Concept This Question Tests

This tests lexical scope and closures. A function is created in a particular surrounding scope, and its variable lookups continue to follow that scope even when the function is called somewhere else later.

The phrase “`outer` has returned” can make it sound as if all of its local variables must have vanished. What actually ends is the execution of that call: its statements no longer run. Its lexical environment remains available as long as a reachable function, such as `inner`, still refers to it. This is why `myFunc` can access `x` after `outer()` has finished.

The function remembers the binding, not just the text `"Hello"`. For example, this related closure shares a retained `count` variable across calls:

```javascript
function makeCounter() {
  var count = 0;
  return function () {
    count += 1;
    return count;
  };
}

var next = makeCounter();
console.log(next()); // 1
console.log(next()); // 2
```

Each call to `makeCounter()` creates a separate environment. A function returned from one call does not share that call's local variables with a function returned from another call.

## 5. The Trap — Why Most People Get It Wrong

The first trap is assuming that `return inner` calls the function. It does not. `return inner` returns a reference to the function object; `return inner()` would call it immediately and return whatever `inner` returns. In this question, returning the function is exactly what allows the later `myFunc()` call to use the retained environment.

The second trap is assuming that `x` becomes inaccessible as soon as `outer()` finishes. Function execution and lexical-environment lifetime are different things. The call has ended, but the environment is still reachable through `inner`, so the engine preserves it for the closure.

The third trap is thinking that `x` is looked up from the place where `myFunc()` is called. JavaScript uses lexical scope, meaning the function's access path is determined where the function is written, not where it is eventually invoked. Calling `myFunc` at the top level does not make `x` a top-level variable.

Finally, a closure does not automatically mean a memory leak. The retained environment consumes memory only while something can still reach the closure. Once `myFunc` and every other reference to the returned function are gone, the function and its retained environment can be garbage-collected if nothing else reaches them.

## 6. 🧠 The Memory Hook

`outer()` can finish its work, but `inner` leaves with a key to the room where `x` lives. A closure is that function carrying access to its birthplace, so calling it later can still find the variables that were around when it was created.
