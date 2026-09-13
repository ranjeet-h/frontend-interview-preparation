# Question 15: `var` Inside an `if` Block

## The Code

```javascript
function test() {
  if (true) {
    var a = 10;
  }

  console.log(a);
}

test();
```

## The Answer

```text
10
```

The program prints `10`. Even though the declaration appears inside the `if` braces, `var` does not belong to that block. It is scoped to the surrounding function, so `a` is still available when execution reaches `console.log(a)` after the block.

## Execution — Walk Through It Like the JS Engine

Before running the statements, JavaScript registers the `test` function declaration. The function can then be called by the final `test()` statement.

When `test()` runs, JavaScript creates the function’s execution context. During setup, the `var a` declaration is hoisted to the function scope and initialized to `undefined`. The braces around the `if` do not create a separate scope for `var`.

The condition `true` is evaluated, so execution enters the `if` block and performs the assignment `a = 10`. The declaration has already been handled during function setup; at this point the statement simply gives the function-scoped binding its value.

Execution leaves the `if` block and reaches `console.log(a)`. Because `a` belongs to `test`, the function can still access it, and the current value is `10`. The call prints `10`, then `test()` finishes normally. Nothing is asynchronous here, so no timer, Promise, microtask, or macrotask changes the order.

## The Concept This Question Tests

This tests the difference between function scope and block scope. `var` is function-scoped: its binding belongs to the nearest surrounding function, not to an `if`, `for`, or standalone brace block. `let` and `const` are block-scoped, so replacing `var` with `let` would make `a` inaccessible after the closing brace.

Hoisting does not mean that the value `10` moves to the top. JavaScript moves the declaration into the function’s setup phase and initializes the binding to `undefined`; the assignment still happens only when execution reaches the line inside the `if` block.

## The Trap — Why Most People Get It Wrong

The usual mistake is assuming that every pair of braces creates a scope boundary for every declaration. Braces do create a block scope for `let` and `const`, but they do not contain a `var` declaration. In this example, `var a` is effectively a local variable of `test`, so the later read succeeds.

Another mistake is saying that hoisting makes `a` equal to `10` before the `if` runs. Before the assignment, the hoisted `var a` would be `undefined`:

```javascript
function beforeAssignment() {
  console.log(a); // undefined
  if (true) {
    var a = 10;
  }
}
```

The `if` block controls when the assignment executes, not where the `var` binding lives.

## 🧠 The Memory Hook

`var` ignores the nearest braces and belongs to the nearest function. The `if` block can assign the value, but it cannot lock the variable inside the block.
