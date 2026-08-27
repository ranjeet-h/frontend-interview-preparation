# `var` and Function Declaration Hoisting: Two Bindings Become Usable at Different Times

## 1. The Code

```javascript
function test() {
  console.log(a);
  console.log(foo());

  var a = 1;
  function foo() {
    return 2;
  }
}
test();
```

## 2. The Answer

```text
undefined
2
```

The first log reads `a` before its assignment has executed, so it receives `undefined`. The second log successfully calls `foo()` because a function declaration is available when the function's execution context is prepared.

In a normal Node.js CommonJS file, a browser classic script, or a browser console where this snippet is entered as one unit, the observable output is the same two lines. There is no asynchronous work here, so the result does not depend on the event loop.

## 3. Execution — Walk Through It Like the JS Engine

The easiest way to trace this is to separate “make the bindings available” from “run the statements.” JavaScript does not move the source lines upward and execute them early. It prepares the function's bindings first, then runs the body from top to bottom.

1. JavaScript evaluates the top-level function declaration:

   ```javascript
   function test() { ... }
   ```

   The name `test` is created and initialized with a function object. The body is not run yet.

2. JavaScript reaches `test()` and creates a fresh function execution context for that call. Before the first statement in the body runs, it prepares the declarations inside `test`.

3. The `var` declaration creates a local binding named `a` and initializes it to `undefined`. The assignment from `var a = 1` has not happened yet.

   Conceptually, the function starts with this local state:

   ```text
   a   → undefined
   foo → function object
   ```

4. The function declaration for `foo` is fully initialized during this setup. That means `foo` already refers to a callable function before JavaScript reaches the written `function foo()` line in the source.

   A useful teaching model is:

   ```javascript
   // Preparation for this call, conceptually:
   var a = undefined;
   function foo() {
     return 2;
   }
   ```

   This is a model of the binding state, not a literal source rewrite.

5. Body execution begins at the first statement:

   ```javascript
   console.log(a);
   ```

   Name lookup finds the local `a` immediately. Its current value is `undefined`, so the first line printed is:

   ```text
   undefined
   ```

6. JavaScript executes:

   ```javascript
   console.log(foo());
   ```

   The local `foo` binding already contains the function object. JavaScript calls it synchronously. Its body returns `2`, and `console.log` prints that returned value:

   ```text
   2
   ```

7. JavaScript eventually reaches the written declarations:

   ```javascript
   var a = 1;
   function foo() {
     return 2;
   }
   ```

   The `var` part does not create a second `a`; that binding already exists. Its initializer now runs and assigns `1` to the existing local binding. The `foo` declaration was already handled during setup, so reaching it does not call the function or print anything.

8. `test` reaches the end of its body and returns `undefined` implicitly. The outer code does not log the return value of `test()`, so no third line appears.

The complete timeline is:

```text
test binding created
→ test() called
→ local a = undefined
→ local foo = callable function
→ log a: undefined
→ call foo(): 2
→ assign a = 1
→ test returns undefined (not logged)
```

## 4. The Concept This Question Tests

This question tests that different declaration forms are initialized differently during function setup.

For `var a = 1`, JavaScript creates the local binding early and initializes it with `undefined`. The `= 1` portion is a later assignment performed only when execution reaches that statement.

For `function foo() { ... }`, JavaScript creates the function binding and gives it the actual function object during declaration instantiation. The function can therefore be called before its written declaration.

That gives us two different timelines inside the same function:

```text
var a = 1       → binding early, value undefined early, assignment later
function foo()  → binding and callable value available during setup
```

“Hoisting” is the interview shorthand for this preparation phase. It is more accurate to say that declarations are processed while the execution context is created, and that each declaration kind has its own initialization rule.

If the code were changed to this:

```javascript
function test() {
  console.log(a);
  console.log(foo());

  let a = 1;
  function foo() {
    return 2;
  }
}
```

the first `console.log` would throw a `ReferenceError` instead. `let` creates its binding before execution but keeps it uninitialized until the declaration is evaluated. That uninitialized period is the temporal dead zone. The original question uses `var`, so the read succeeds with `undefined`.

## 5. The Trap — Why Most People Get It Wrong

The most common wrong answer is `ReferenceError` for the first line. People often remember the vague rule “a variable cannot be used before it is declared.” The real rule depends on the declaration form: `var` is already initialized to `undefined`, while `let` and `const` are not initialized during their temporal dead zone.

Another common wrong answer is `undefined` followed by an error on `foo()`. That treats a function declaration like a function expression. Function declarations are callable during setup. This would behave differently:

```javascript
function test() {
  console.log(a);
  console.log(foo()); // TypeError: foo is not a function

  var a = 1;
  var foo = function () {
    return 2;
  };
}
```

Here `var foo` is initialized to `undefined`, not to a function. The call happens before the later assignment, so JavaScript tries to call `undefined` and throws a `TypeError`.

Do not say that JavaScript executes the function body before the `function foo` line. The body of `foo` is not executed during hoisting. Only the binding is initialized with a function object. The body runs later, exactly when `foo()` is called.

Also do not treat `var a = 1` as if the complete line moved to the top. If it had, the first log would be `1`. Only the binding is prepared early; the assignment remains at its original execution point.

The reliable approach is to make a declaration table before tracing:

```text
a   → local binding, initialized to undefined
foo → local binding, initialized to a function
```

Then execute the body in order and update `a` only when the assignment is reached.

## 6. 🧠 The Memory Hook

Inside a function, `var` brings the empty box early, while a function declaration brings the finished tool early. So the first read sees `a` as `undefined`, but `foo()` is already ready to run.
