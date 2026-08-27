## 1. The Code

```javascript
var z = 10;
function outer() {
  console.log(z);
}
outer();
```

## 2. The Answer

```text
10
```

The program prints `10` exactly once. `outer` does not declare its own `z`, so the `z` inside `console.log(z)` is resolved from the surrounding scope, where `z` is `10`.

## 3. Execution — Walk Through It Like the JS Engine

This is a synchronous scope-lookup question. There are no timers, promises, callbacks, or queued jobs involved. JavaScript prepares the declarations, then runs the top-level statements in order.

1. During declaration instantiation for the surrounding scope, JavaScript registers `var z` and initializes it to `undefined`. It also creates the function object for the declaration `function outer() { ... }` and binds it to `outer`. The function body does not run during this setup phase.

2. Execution begins with `var z = 10`. The `var z` declaration was already handled during setup; now its initializer runs and assigns the number `10` to the surrounding scope's `z` binding.

3. Execution reaches the function declaration. The function was already created during declaration instantiation, so this line does not call `outer`. Nothing is logged yet.

4. Execution reaches `outer()`. JavaScript resolves `outer`, finds the function, and calls it synchronously. A new function execution context is created for `outer`, and execution enters its body.

5. Inside the function, JavaScript evaluates `console.log(z)`. It first checks `outer`'s local lexical environment. There is no local declaration named `z`, so the lookup continues through the function's outer lexical environment—the scope where `outer` was defined.

6. That surrounding scope contains `z`, whose value is now `10`. The lookup stops there. `console.log` receives `10` and prints it. The function then returns, and the program finishes.

The important point is that the function uses lexical scope: it looks outward according to where it was defined, not according to who called it. In this example, both the definition and the call are at the top level, so the surrounding `z` is easy to see.

## 4. The Concept This Question Tests

This tests lexical scope, the scope chain, and synchronous function execution.

Every function can access bindings in its own scope and, when a name is not found there, in the scopes surrounding where the function was defined. Those linked environments form the scope chain. When JavaScript evaluates `z` inside `outer`, it follows this process:

```text
outer's local scope:      no z
outer's outer scope:      z → 10  ← found
```

Because `outer` has no local `z`, the engine finds the top-level `z`. If `outer` had declared another `z`, that local binding would win because lookup stops at the first matching name:

```javascript
var z = 10;

function outer() {
  var z = 20;
  console.log(z); // 20
}

outer();
```

This is lexical scope rather than dynamic scope. The caller does not inject its local variables into the called function. The function's source location determines which outer environments are available to it.

## 5. The Trap — Why Most People Get It Wrong

A common mistake is to assume that `z` must be declared inside `outer` because it is used there. JavaScript does not require that. The engine checks the current scope first, then walks outward until it finds a matching binding. Since `outer` has no local `z`, it uses the surrounding one.

Another mistake is to confuse the function declaration with a function call. `function outer() { ... }` makes `outer` available during declaration instantiation, but it does not execute the body. The `console.log` runs only when the later `outer()` call is reached.

It is also easy to forget the timing of the `var` initializer. During setup, `var z` starts as `undefined`; the value becomes `10` when execution reaches `var z = 10`. The call happens afterward, so `outer` sees the assigned value:

```javascript
var z; // setup leaves z as undefined
z = 10; // assignment happens before outer() runs

function outer() {
  console.log(z);
}

outer(); // 10
```

Finally, do not reason as if `outer` searches for `z` in the caller's local variables. It follows its lexical scope chain. If a function is defined outside a caller, the caller's locals are not automatically visible inside it.

## 6. 🧠 The Memory Hook

When a function cannot find a name inside itself, it looks outward along the places where it was born—not inward toward the caller. `outer` has no local `z`, so its eyes travel one scope out and find `z = 10`.
