# Part 1 — Question 15: A Closure Can Mutate the Value It Remembers

## The Code

```javascript
function outerFunc() {
  var x = 10;
  function innerFunc() {
    var y = 5;
    console.log(x + y);
    x = 20;
  }
  return innerFunc;
}

var inner = outerFunc();
inner();
inner();
```

## The Answer

```text
15
25
```

The first call prints `15` because the closed-over `x` starts at `10`, and the local `y` is `5`. That same call then changes the remembered `x` binding to `20`. The second call uses that updated binding, so it prints `20 + 5`, which is `25`.

## Execution — Walk Through It Like the JS Engine

JavaScript first registers the function declarations. No function body runs merely because the declarations appear in the source. When execution reaches `var inner = outerFunc()`, it calls `outerFunc` and creates a function execution context for that call.

Inside `outerFunc`, `var x = 10` creates the variable binding and assigns `10` to it. JavaScript then creates `innerFunc`. That function does not copy the current value of `x`; it keeps access to the surrounding lexical environment—the environment containing the live `x` binding. `outerFunc` returns the function, and `inner` now refers to it. The call to `outerFunc` is over, but the environment containing `x` stays reachable through `innerFunc`, so it is not discarded.

On the first `inner()` call:

1. A new `innerFunc` execution context is created.
2. `var y = 5` creates a fresh local `y` for this particular call.
3. `x` is not local to `innerFunc`, so JavaScript follows the closure to the outer environment and reads the current value, `10`.
4. `console.log(x + y)` prints `15`.
5. `x = 20` writes to the existing outer binding. It does not create a new local `x`, because there is no `var x` inside `innerFunc`.
6. The call ends. Its local `y` disappears, but the outer `x` remains alive because the returned function still closes over it.

On the second `inner()` call, JavaScript creates a new `y` and assigns it `5` again. It then reads the same persistent outer binding for `x`, which is now `20`. The function prints `25` and assigns `20` to `x` again. The important idea is that each invocation gets a fresh `y`, while both invocations share the same captured `x` binding.

There are no timers, promises, or queues involved here. Both calls run synchronously, one after the other. The surprising part comes from the lifetime of the closure, not from asynchronous scheduling.

## The Concept This Question Tests

This tests closures and the difference between capturing a variable binding and copying a value. A closure is a function together with the surrounding lexical environment it needs to access later. Here, `innerFunc` closes over `x`.

That captured environment contains a live, mutable binding. Reading `x` reads whatever value the binding has now. Assigning `x = 20` mutates that same binding, so later calls observe the mutation. A useful mental model is that the function carries a reference to a small private environment, not a frozen snapshot of `x` from the moment the function was created.

The two variables have different lifetimes:

- `x` belongs to the invocation of `outerFunc`, but survives because the returned function still references its environment.
- `y` belongs to one invocation of `innerFunc`, so a fresh `y = 5` is created each time `inner()` runs.

This is the same mechanism behind practical patterns such as private state, counters, memoization, and factory functions. Each call to `outerFunc` would create a separate `x` environment; repeated calls to the same returned `inner` function reuse one shared environment.

## The Trap — Why Most People Get It Wrong

The common mistake is to think `innerFunc` captured `x` as the number `10`. If that were true, both calls would print `15`. JavaScript closures do not automatically freeze primitive values at function-creation time. They retain access to the binding, and the binding can change.

Another mistake is to treat `x = 20` as if it created a new local variable inside `innerFunc`. Assignment only creates a new variable in some situations, such as sloppy-mode assignment to an undeclared identifier; it does not do that here. The existing `x` is found through the scope chain and updated. In strict mode, an accidentally undeclared assignment would throw, which is another reason to declare variables explicitly.

It is also easy to say that `y` is shared between calls. It is not. `y` is declared inside `innerFunc`, so every invocation creates a new local binding and initializes it to `5`. The shared state is `x`, because `x` belongs to the outer environment retained by the closure.

Finally, do not attribute the result to the event loop. The output is entirely synchronous: the first call finishes, mutates `x`, and only then does the second call begin.

## 🧠 The Memory Hook

Closures remember the room, not a photograph of what was in the room. Both calls return to the same room and see the mutated `x`; each call brings a new local `y` of its own.
