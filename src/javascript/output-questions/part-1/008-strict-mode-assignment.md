# JavaScript Output Question 8: Strict-Mode Assignment and `var` Hoisting

## 1. The Code

```javascript
"use strict";
x = 23;
var x;
console.log(x);
```

## 2. The Answer

```text
23
```

The `ReferenceError` shown in the original answer is incorrect. `var x` creates a function-scoped binding during the setup phase, before the statements execute. Strict mode rejects assignments to names for which no binding exists; here, `x` already has a binding because of `var x`. The assignment succeeds, so `console.log(x)` prints `23`.

## 3. Execution — Walk Through It Like the JS Engine

Before JavaScript executes the first statement, it prepares the current scope. The `var x` declaration is hoisted and its binding is initialized to `undefined`. Hoisting moves the declaration, not the assignment, so the engine effectively starts with a local variable named `x` whose value is `undefined`.

Execution then proceeds from top to bottom:

1. `"use strict"` is recognized as a directive prologue, so this script runs in strict mode.
2. `x = 23` looks up `x`. The lookup succeeds because the hoisted `var x` binding already exists. Strict mode does not prohibit ordinary assignment to an existing variable, so the binding changes from `undefined` to `23`.
3. `var x` has no runtime assignment to perform. The declaration was already handled during setup, and reaching it again does not erase the value.
4. `console.log(x)` reads the binding and prints `23`.

The important distinction is between a declaration and an assignment. `var x` declares the name early; `x = 23` assigns the value when execution reaches that line. Strict mode would throw only if `x` had no existing binding at the time of the assignment.

## 4. The Concept This Question Tests

This tests `var` hoisting, the difference between declaring a variable and assigning a value, and strict mode's handling of undeclared assignments.

`var` declarations are processed when the scope is created. Their bindings begin as `undefined`, which is why this is valid:

```javascript
console.log(x); // undefined
var x;
```

Strict mode changes what happens when an assignment targets a name that cannot be resolved to any variable binding. In sloppy mode, `missing = 23` can create an accidental property on the global object. In strict mode, that same assignment throws a `ReferenceError`. But `x = 23` in this question is not an assignment to a missing name: `var x` has already supplied the binding.

This is also why the declaration's position in the source does not make the assignment illegal. The declaration is handled before runtime execution; only its initializer, if it had one, would wait until that line ran.

## 5. The Trap — Why Most People Get It Wrong

The common mistake is to read the code literally and assume that `x = 23` happens before `var x`, so strict mode must treat `x` as undeclared. JavaScript does not process declarations that way. `var` declarations are hoisted during scope setup, while the executable statements still run in source order.

Another mistake is to remember the rule as “strict mode forbids assigning before declaring.” That is too broad. Strict mode forbids assigning to an identifier with no binding at all. Assigning before the textual `var` declaration is fine because the binding exists already:

```javascript
"use strict";
value = 23;
var value;
console.log(value); // 23
```

The rule does not apply the same way to `let` or `const`. Their bindings are created but remain uninitialized in the temporal dead zone until execution reaches the declaration, so reading or assigning them before that point throws a `ReferenceError`.

## 6. 🧠 The Memory Hook

Strict mode asks, “Does this name have a binding?” It does not ask, “Have I reached the declaration line yet?” `var` creates the binding early, so the assignment lands safely and the final value is `23`.
