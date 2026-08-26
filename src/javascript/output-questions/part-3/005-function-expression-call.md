# Function Expression: The Call Happens Before Assignment

This one-puzzle page traces one small program through the JavaScript engine. Predict the output before reading the explanation.

## 1. The Code

```javascript
foo();

var foo = function () { console.log("hello"); };
```

## 2. The Answer

```text
TypeError: foo is not a function
```

The `var foo` binding is created and initialized to `undefined` before execution begins. The function-expression assignment has not happened when `foo()` runs, so JavaScript tries to call `undefined`, which throws a `TypeError`.

## 3. Execution — Walk Through It Like the JS Engine

Think of the engine as handling this code in two broad stages: creation and execution.

**Step 1: Create the binding**

Before running either statement, the engine sees `var foo` and creates a binding named `foo` in the current execution context.

Because this is a `var` binding, creation also initializes it to `undefined`:

```text
foo → undefined
```

The function expression has not been evaluated yet. The assignment is part of the second statement and belongs to normal execution.

**Step 2: Execute the first statement**

Execution starts at the first source statement:

```javascript
foo();
```

JavaScript resolves `foo` and finds its current value, `undefined`. It then tries to use that value as a function. Since `undefined` is not callable, the call expression throws a `TypeError` immediately.

The function body is never entered, so `console.log("hello")` does not run.

**Step 3: The assignment is never reached**

The error stops this synchronous execution before JavaScript can evaluate the second statement:

```javascript
var foo = function () { console.log("hello"); };
```

If execution did reach it, JavaScript would evaluate the function expression, create a function object, and assign that object to the existing `foo` binding:

```text
foo → function () { console.log("hello"); }
```

But the earlier failed call prevents that update in this program.

The important timeline is:

1. Create `foo` and initialize it to `undefined`.
2. Try to call `foo`.
3. Throw `TypeError` because `undefined` is not callable.
4. Stop before the function expression is evaluated and assigned.

A useful mental rewrite is:

```javascript
var foo;
foo(); // TypeError: foo is not a function
foo = function () { console.log("hello"); };
```

This rewrite shows the observable timing: declaration setup happens first, but the function value arrives only at the later assignment.

## 4. The Concept This Question Tests

This question tests the difference between a function declaration and a function expression assigned to a `var` binding.

- **Binding creation:** The engine creates the `foo` name during execution-context setup.
- **`var` initialization:** The new binding starts with `undefined`, not with the function from the later expression.
- **Call before assignment:** The first statement reads the current value of `foo` and immediately attempts to call it.
- **Function-expression evaluation:** The anonymous function object is created only when execution reaches the assignment statement.
- **Execution order:** Setup does not move the assignment above `foo()`, so the call still occurs before the function value is stored.

Compare this with a function declaration:

```javascript
foo();

function foo() { console.log("hello"); }
```

That call prints `hello` because the function declaration initializes `foo` with a callable function during setup. The function body still waits until `foo()` executes, but the callable value is already ready. With `var foo = function () { ... }`, setup creates only an `undefined` binding; the callable value appears later during assignment.

The declaration form also matters with lexical bindings. For example, `const foo = function () { ... }` creates an uninitialized binding, so calling `foo()` before its declaration would throw a `ReferenceError` from the TDZ. In this puzzle, `var` has no TDZ; its earlier call reaches a value, `undefined`, that is not callable, producing a `TypeError` instead.

## 5. The Trap — Why Most People Get It Wrong

The tempting answer is `hello` because the reader recognizes that `foo` eventually receives a function. But the assignment does not happen during the initial `var` setup. At the moment `foo()` runs, the binding still contains `undefined`.

Another common mistake is answering `ReferenceError`. `foo` is not missing: `var` created the binding before execution and initialized it to `undefined`. The error is specifically a `TypeError` because JavaScript found a value but that value cannot be called.

Do not treat this as equivalent to a function declaration. A declaration is initialized with a callable function during setup; a function expression produces its function object only when execution evaluates the expression.

In an interview, answer in this order: **`TypeError`; `var foo` exists as `undefined` during setup, and the function-expression assignment has not run when `foo()` is evaluated.**

## 6. 🧠 The Memory Hook

**`var` creates the box early, but a function expression fills it only at assignment time.**

When you see:

```javascript
foo();
var foo = function () { console.log("hello"); };
```

say to yourself: **“The box exists, but it still holds `undefined`; calling the empty box throws.”**
