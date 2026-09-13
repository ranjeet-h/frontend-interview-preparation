# `var` Shadowing: The Function Reads Its Own `undefined` Binding

## 1. The Code

This is runnable JavaScript. Save it as a `.js` file and run it with Node.js, or paste it into a browser console.

```javascript
var x = 1; function func() { console.log(x); var x = 2; } func();
```

## 2. The Answer

```text
undefined
```

The function prints `undefined`. The `var x` inside `func` creates a function-local binding during function setup. That local binding shadows the global `x`, even before the local assignment `x = 2` runs. Because the local binding starts as `undefined`, `console.log(x)` reads and prints `undefined` instead of reading the global value `1`.

## 3. Execution — Walk Through It Like the JS Engine

The key is to separate function setup from statement execution. JavaScript does not move the entire `var x = 2` statement to the top and execute it there. It prepares the local binding early, then performs the assignment only when execution reaches that statement.

1. JavaScript creates the outer execution context and processes the top-level declaration:

   ```javascript
   var x = 1;
   ```

   The outer `x` binding is created. During normal execution, the initializer runs and assigns `1`, so the outer scope contains:

   ```text
   outer x → 1
   ```

2. JavaScript reaches the function declaration. It creates the `func` binding and initializes it with the function object. Creating the function object does not run its body yet.

3. JavaScript reaches the call:

   ```javascript
   func();
   ```

   The call is synchronous, so JavaScript creates a new function execution context for `func` and starts setting up that function's environment.

4. During setup for `func`, JavaScript finds the local declaration:

   ```javascript
   var x;
   ```

   It creates a new mutable binding named `x` in the function's variable environment and initializes it to `undefined`. The local state is now:

   ```text
   local x → undefined
   outer x  → 1
   ```

5. Function-body execution begins at the first statement:

   ```javascript
   console.log(x);
   ```

   JavaScript resolves `x` starting in the function's local environment. It finds the local `x` binding immediately, so lookup stops there. The outer `x` with value `1` is never consulted. The local binding's current value is `undefined`, so `console.log` prints:

   ```text
   undefined
   ```

6. Execution continues to:

   ```javascript
   var x = 2;
   ```

   The declaration part does not create a second local binding. That binding already exists from function setup. JavaScript evaluates the initializer `2` and assigns it to the existing local binding:

   ```text
   local x → 2
   ```

   This assignment happens after the only `console.log`, so it cannot change the output that was already printed.

7. The function reaches the end of its body and implicitly returns `undefined`. The call's return value is not logged. The complete order is:

   ```text
   outer x becomes 1 → func binding is prepared → func() is called
   → local x is created as undefined → local x is logged
   → local x becomes 2 → func returns undefined
   ```

There is no asynchronous work in this puzzle. No timer, promise, Web API callback, microtask, or macrotask changes the order. The result comes entirely from function-local binding creation, name resolution, and synchronous execution.

## 4. The Concept This Question Tests

This tests two related ideas: `var` hoisting and shadowing.

When JavaScript prepares a function execution context, it creates the function's `var` bindings before executing the function body. A `var` binding is initialized to `undefined` during that setup. The initializer in `var x = 2` is a separate assignment that runs later, when execution reaches the statement.

The inner `x` also shadows the outer `x`. Shadowing means that a nearer binding uses the same name as a farther binding. Identifier lookup searches the current function environment first. Since it finds the local `x`, it stops; it does not continue outward to the global `x`.

Conceptually, the function behaves like this:

```javascript
function func() {
  var x;       // function setup: local x is undefined
  console.log(x); // reads the local binding
  x = 2;       // runtime assignment
}
```

The important distinction is that the global `x` still exists and still has the value `1`. It is simply hidden from this reference by the local binding. If the function had no local `var x`, lookup could continue outward and find the global binding. Here, the local binding is present from the beginning of the function call, so the global value is not read.

## 5. The Trap — Why Most People Get It Wrong

The common wrong answer is `1`. That answer assumes that `console.log(x)` must use the already initialized global `x`. But the declaration `var x` inside `func` determines the name resolution for the entire function body. Its local binding shadows the global binding before the assignment to `2` occurs.

Another wrong answer is `ReferenceError`. `var` does not leave the local binding in the temporal dead zone. The binding exists and contains `undefined`, so reading it is valid. The assignment to `2` is late, but the binding itself is available from function setup.

Do not say that the global `x` is temporarily changed to `undefined`. It is not changed at all. There are two different bindings:

```text
global x  → 1
local x   → undefined, then 2
```

The reliable tracing habit is to draw the scope boundary first, then track each binding separately. Ask: “Is there a nearer binding with this name?” Here the answer is yes. Then ask: “Has that binding received its assignment yet?” At the log, the answer is no, so the function prints `undefined`.

## 6. 🧠 The Memory Hook

> A local `var` casts a shadow before it receives its value.

When a function contains `var x`, every `x` in that function points to the local binding. `var` prepares that local binding as `undefined`; only the later `= 2` changes it. So the trace is:

```text
local binding wins → local value is undefined → log undefined → assign 2
```
