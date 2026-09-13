# JavaScript Output Question 12: Function-Scoped `var` and Local Shadowing

## The Code

```javascript
var a = 10;

function test() {
  var a = 20;
  console.log(a);
}

test();
console.log(a);
```

## The Answer

```text
20
10
```

The call to `test()` prints the function's local `a`, which is `20`. After the function returns, the final log uses the outer `a`, which is still `10`.

## Execution — Walk Through It Like the JS Engine

Before running the statements, JavaScript creates the top-level `var a` binding and initializes it to `undefined`. It also creates the `test` function binding, so the function can be called when execution reaches `test()`.

Execution then evaluates `a = 10`, changing the outer binding from `undefined` to `10`. The function body has not run yet, so its local `a` does not exist in the current execution context.

When JavaScript reaches `test()`, it creates a new function execution context for that call. During setup for this context, the `var a` declaration inside `test` is hoisted to the top of the function and initialized to `undefined`. This local binding is separate from the outer binding; the two variables happen to share a name but do not share storage.

The function then executes `a = 20`, assigning `20` to its local binding. The following `console.log(a)` starts name lookup in the function's own environment, finds the local `a`, and prints `20`. JavaScript does not continue outward to the global `a` because lookup stops as soon as it finds a matching local name.

After `test()` returns, its execution context and local `a` are gone from the active call stack. The final `console.log(a)` runs in the outer scope, where the only visible `a` is the top-level binding containing `10`, so it prints `10`.

This example is entirely synchronous. The call to `test` is placed on the call stack and runs to completion before the final statement executes. No timer, promise callback, microtask, or macrotask is scheduled.

## The Concept This Question Tests

This tests function scope, `var` hoisting, and shadowing. A `var` declaration belongs to the nearest function body. The `var a` inside `test` therefore creates a local function-scoped binding, while the `var a` outside the function creates a separate outer binding.

Shadowing means that an inner binding with the same name temporarily hides an outer binding during name lookup. It does not copy the outer value, and it does not mutate the outer variable. Inside `test`, `a` resolves to the local box; after the function returns, `a` resolves to the outer box.

The hoisting detail matters here because the local `var a` is initialized during function setup, before the first line of the body executes. If the function logged `a` before assigning `20`, it would print `undefined`, not the outer `10`:

```javascript
var a = 10;

function test() {
  var a;
  console.log(a); // undefined: the local binding shadows the outer one
}

test();
```

The function declaration itself is also available when the surrounding scope is being prepared. That is why the call can appear after the declaration in this example without any special setup code.

## The Trap — Why Most People Get It Wrong

The first trap is treating the two `a` variables as one shared variable. If the function were modifying the outer binding, the final log would be `20`. It remains `10` because the assignment targets the nearest binding, the function-local one.

The second trap is thinking that `var` is block-scoped because the declaration appears inside the function's braces. Function braces define the function body, so they establish the function boundary for `var`; an ordinary nested block does not. For example, this declaration still belongs to `test`:

```javascript
function test() {
  if (true) {
    var value = 20;
  }

  console.log(value); // 20
}

test();
```

The third trap is assuming that hoisting moves the assignment too. JavaScript effectively prepares `var a` and gives it `undefined`; it does not move `a = 20` ahead of the log. In the original code the assignment runs before the log because that is the source order inside the function.

Finally, do not call this a closure question. `test` does not return a function or preserve access to its local variable after returning. The key mechanism is a fresh function execution context plus lexical name lookup, not an asynchronous queue or a retained closure.

## 🧠 The Memory Hook

Every function call gets its own room. A local `var a` puts a new `a` in that room and hides the outer `a` while you are inside; leave the room, and the outer `a` is still exactly where you left it.
