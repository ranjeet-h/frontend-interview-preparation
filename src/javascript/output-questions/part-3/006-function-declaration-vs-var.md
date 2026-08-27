# 1. The Code

```javascript
console.log(foo);

function foo() {}

var foo = 10;
```

# 2. The Answer

```text
[Function: foo]
```

The first line logs the function object. The later `var foo = 10` assignment does eventually replace that function with the number `10`, but it runs only after the `console.log` has already executed. `[Function: foo]` is Node.js's display format for the value; the underlying value at that moment is the function declared as `foo`.

# 3. Execution — Walk Through It Like the JS Engine

JavaScript handles this in two broad moments: it prepares the function's scope, and then it executes the statements from top to bottom.

During declaration instantiation, the engine sees the function declaration `function foo() {}` and creates the function object immediately. The binding named `foo` points to that function before the first executable statement runs.

The engine also sees `var foo`. This is another declaration for the same function-scoped binding, but it does not reset the binding to `undefined` or erase the function. A `var` declaration has no effect when the binding already exists with the function value created by the function declaration. This is why the declaration phase leaves `foo` pointing at the function.

Execution then begins:

1. `console.log(foo)` reads the current value of `foo`. It is still the function object, so Node prints it as `[Function: foo]`.
2. The function declaration itself does not execute like a call; its function object was already created during declaration instantiation.
3. `var foo = 10` is now reached. The declaration part has already been handled, so the only meaningful runtime operation here is the assignment. The binding `foo` is changed from the function object to the number `10`.

If we logged `foo` after that assignment, the result would be `10`. The important distinction is between a declaration, which is prepared before execution, and an assignment, which happens exactly when execution reaches it.

Node's `[Function: foo]` text is an environment-specific representation produced by `console.log`. Browsers may display the same value as `ƒ foo() {}` or an expandable function object. Those displays differ, but the JavaScript value is the same named function.

# 4. The Concept This Question Tests

This tests declaration instantiation, hoisting, and the difference between a function declaration and a `var` assignment.

A function declaration is created with its callable function object before ordinary code starts running. A `var` declaration is also processed early, but its initializer is not. In `var foo = 10`, the `10` is an assignment that waits until the statement is executed. The two declarations therefore do not compete as two separate variables: they refer to the same binding, and the later assignment is what eventually changes its value.

That is also why this is different from a function expression:

```javascript
console.log(foo); // undefined
var foo = function () {};
```

Here only the `var` binding exists during preparation; the function object is created later, when the assignment runs. In the question's code, the function declaration has already supplied the function object before the log.

# 5. The Trap — Why Most People Get It Wrong

The common mistake is to treat `var foo = 10` as if the entire line were hoisted and executed at the top. It is not. Only `var foo` is handled during declaration instantiation; the `= 10` part remains in the normal execution flow.

Another mistake is to assume that the `var` declaration immediately overwrites the function with `undefined`. In this scope, the function declaration has already initialized the shared `foo` binding with a function, and the bare `var foo` declaration does not reinitialize it. Only the later assignment changes it.

The opposite mistake is to think the function wins forever. It does not. The function wins only until execution reaches `foo = 10` through the initializer. For example:

```javascript
function foo() {}
var foo = 10;

console.log(foo); // 10
```

Finally, do not over-focus on the exact string `[Function: foo]`. That is Node's inspection format, not a language-level output token. The interview-relevant fact is that the first read obtains the function value; the later assignment changes the same binding to `10`.

# 6. 🧠 The Memory Hook

Function declarations arrive during setup; `var` initializers arrive during the walk. So the first glance sees the function, and only the later assignment turns `foo` into `10`.
