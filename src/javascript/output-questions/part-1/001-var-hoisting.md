# `var` Hoisting: Declaration First, Assignment Later

## 1. The Code

```javascript
console.log(x);
var x = 5;
console.log(x);
```

## 2. The Answer

```text
undefined
5
```

The first log sees the `var` binding before the assignment has executed. A `var` binding is initialized to `undefined` during scope setup, so reading it is valid. The second log runs after `x = 5`, so it sees `5`.

## 3. Execution — Walk Through It Like the JS Engine

The useful interview model has two distinct stages: environment setup, then statement execution. “Hoisting” is shorthand for what happens during setup; JavaScript does not literally move the source line to the top and then execute the moved line.

1. Before the first statement runs, JavaScript creates the execution environment for this code. During declaration instantiation, it finds `var x` in the current variable scope.

2. JavaScript creates a mutable binding named `x` and initializes that binding with `undefined`. The declaration has been handled, but the initializer expression `5` has not been evaluated as an assignment yet.

   A useful mental model is:

   ```javascript
   var x; // binding created and initialized to undefined
   ```

3. Synchronous execution begins at the first source statement:

   ```javascript
   console.log(x);
   ```

   The identifier lookup finds the existing binding. Its current value is `undefined`, so `console.log` prints `undefined`.

4. JavaScript reaches:

   ```javascript
   var x = 5;
   ```

   The declaration part is not performed again in any interesting way here—the binding already exists. The initializer is the important part. JavaScript evaluates `5`, then assigns that value to the existing `x` binding. `x` now contains `5`.

   The runtime effect is equivalent to separating the declaration from the assignment:

   ```javascript
   var x;
   // first log happens here
   x = 5;
   // second log happens here
   ```

5. JavaScript executes the final statement:

   ```javascript
   console.log(x);
   ```

   The same binding now contains `5`, so the second log prints `5`.

There is no asynchronous work in this puzzle. Nothing goes to a Web API, microtask queue, or macrotask queue. The entire result comes from declaration instantiation followed by ordinary, top-to-bottom synchronous execution.

The exact surrounding environment can change where the binding belongs, but not this output:

- Inside a function, `var x` belongs to that function's variable environment.
- In a browser classic script, a top-level `var` can also create or connect to a property on the global object, subject to the global environment rules.
- In an ES module, top-level `var` is module-scoped rather than a global-object property.
- In Node.js CommonJS code, top-level `var` is normally scoped to the module wrapper.

In every case above, the binding is available with the value `undefined` before the runtime reaches `= 5`.

## 4. The Concept This Question Tests

This tests `var` hoisting: the separation between creating a variable binding and executing its initialization assignment.

For a `var` declaration, JavaScript prepares the binding before the code's statements execute and gives it the value `undefined`. The initializer in `var x = 5` is different from the declaration. It is an assignment expression that runs only when execution reaches that statement.

That is why these two ideas must not be collapsed into “the whole line is hoisted”:

```javascript
var x = 5;
```

Conceptually, the binding creation happens during setup, while the value assignment happens during execution. The first `console.log` occurs in the gap between those events.

This behavior is specific to `var` and should not be generalized to every declaration form. `let` and `const` bindings are also established before execution, but they remain uninitialized until their declaration is evaluated. Reading them before that point throws a `ReferenceError` because they are in the temporal dead zone. A function declaration has yet another behavior: its callable function value is available during setup. The declaration kind determines the binding's initialization state.

The important invariant is:

> A binding can exist before the source line that declares it executes, but its value depends on the declaration kind and on whether its initializer has run.

## 5. The Trap — Why Most People Get It Wrong

The common wrong answer is `ReferenceError`, usually because the candidate remembers that “using a variable before declaration” is dangerous. That rule is incomplete. `var` is created and initialized to `undefined`, so this read succeeds. `let` and `const` are the declarations that remain uninitialized and produce a `ReferenceError` when read before initialization.

Another mistake is expecting `5` from both logs because the candidate treats `var x = 5` as if the complete statement moved upward. Only the binding is prepared early. The assignment is still located at its original execution point, after the first log.

Do not say that JavaScript “moves all variables to the top” as a literal implementation claim. That shortcut hides the part the question is testing: environment creation and initialization happen before statement execution, while the initializer runs later. A stronger interview explanation says that `var` declaration instantiation creates and initializes the binding to `undefined`, then synchronous evaluation later assigns `5`.

A few nearby variations expose the same boundary:

- `console.log(y); let y = 5;` throws a `ReferenceError`, not `undefined`, because `y` is uninitialized in the temporal dead zone.
- `console.log(z); const z = 5;` has the same `ReferenceError` behavior, and `const` also requires initialization in its declaration.
- `var x = 5;` inside a block does not make `x` block-scoped; `var` is function-scoped, or global-scoped when used in the applicable global-script context.
- Repeating `var x` does not create a new block-scoped binding. It follows `var`'s function/global declaration rules, which is one reason accidental redeclarations can be hard to spot.

The safest tracing habit is to write two timelines: first record which bindings exist and their initial values, then execute each statement and update those values. Never record the initializer's value during setup unless the declaration form's rules explicitly say that the value is initialized at that stage.

## 6. 🧠 The Memory Hook

`var` arrives in two deliveries:

> The name arrives early as `undefined`; the value arrives only when execution reaches the assignment.

When you see `console.log(x)` before `var x = value`, ask: “Does the binding exist, and has the assignment run?” For `var`, the answers are “yes” and “no,” so the result is `undefined`.
