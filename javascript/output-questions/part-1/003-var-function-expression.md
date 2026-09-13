# `var` Function Expression: The Binding Exists Before the Function Does

## 1. The Code

```javascript
console.log(bar); var bar = function () { console.log("World"); }; bar();
```

## 2. The Answer

```text
undefined
World
```

The first `console.log` reads the `var` binding before its assignment has executed, so the value is `undefined`. The function expression is created and assigned to `bar` only when execution reaches the `var bar = function () { ... }` statement. By the time execution reaches `bar()`, `bar` contains the function, so the call enters its body and prints `World`.

## 3. Execution — Walk Through It Like the JS Engine

This puzzle has two separate moments: declaration instantiation prepares the `var` binding, and normal synchronous execution later evaluates the function expression and assigns its result. “Hoisting” does not move the complete assignment to the top or run the function body early.

1. Before the first source statement runs, JavaScript creates the execution context for the surrounding code. During declaration instantiation, it scans the applicable variable scope and finds `var bar`.

2. JavaScript creates a mutable binding named `bar` and initializes that binding to `undefined`. At this point, the name exists, but no function expression has been evaluated and no function object has been assigned to the binding.

   A useful mental model for the setup phase is:

   ```javascript
   var bar; // binding created and initialized to undefined
   ```

3. Setup does not execute any `console.log` call. It does not evaluate `function () { console.log("World"); }`, and it does not call `bar()`. It only prepares the binding's initial value.

4. Synchronous execution begins at the first source statement:

   ```javascript
   console.log(bar);
   ```

   JavaScript resolves `bar` through the current environment. The binding is present, and its current value is still `undefined`, so `console.log` prints the first output line:

   ```text
   undefined
   ```

5. Execution continues to the declaration-and-initializer statement:

   ```javascript
   var bar = function () { console.log("World"); };
   ```

   The `var bar` declaration does not create a new binding at this point; that binding was already prepared during setup. The initializer is the important runtime work. JavaScript evaluates the function expression, creates a function object, and assigns that object to the existing `bar` binding.

   Conceptually, the runtime effect can be separated like this:

   ```javascript
   var bar; // setup already happened
   // first console.log happens here
   bar = function () { console.log("World"); };
   ```

   After this assignment, `bar` no longer contains `undefined`; it contains a callable function.

6. JavaScript reaches the final statement:

   ```javascript
   bar();
   ```

   Identifier lookup now finds the same `bar` binding, but its value is the function object assigned in the previous step. The call is therefore valid and does not throw a `TypeError`.

7. Calling `bar()` creates a function execution context for the anonymous function and begins evaluating its body:

   ```javascript
   console.log("World");
   ```

   The string literal evaluates to `"World"`, and the synchronous `console.log` call prints the second output line:

   ```text
   World
   ```

8. The function reaches the end of its body and implicitly returns `undefined` to its caller. That return value is not printed because the source calls `bar()` directly rather than wrapping the call in another `console.log`.

The complete order is:

```text
create bar = undefined → log undefined → evaluate function expression → assign function to bar → call bar → log World
```

There is no asynchronous work here. No timer, promise reaction, Web API callback, microtask, or macrotask changes the order. The first log happens before the assignment; the call happens after the assignment. That source-order boundary explains both output lines.

## 4. The Concept This Question Tests

This tests the difference between hoisting a `var` binding and evaluating a function expression assigned to that binding.

For `var bar = function () { ... }`, JavaScript handles two different pieces at different times:

- During declaration instantiation, it creates the `bar` binding and initializes it to `undefined`.
- During ordinary execution, when the statement is reached, it evaluates the function expression and assigns the resulting function object to `bar`.

The function expression is a value-producing expression. It is not a function declaration whose callable value is installed during scope setup. The expression must be evaluated before `bar` becomes callable. Until then, `bar` is a real binding with the value `undefined`.

That explains why the first read succeeds rather than throwing: the `var` binding already exists and has a defined JavaScript value, `undefined`. It also explains why the later call succeeds: the assignment has run by the time execution reaches `bar()`.

The equivalent conceptual separation is:

```javascript
var bar; // early binding initialization
console.log(bar); // undefined
bar = function () { console.log("World"); }; // runtime assignment
bar(); // function is now available
```

The declaration keyword controls the binding's early state; the expression controls when the function value is produced. Hoisting the name does not hoist the function value, and evaluating the function expression does not execute its body. Only the later call enters the body.

## 5. The Trap — Why Most People Get It Wrong

The most common wrong answer is `World` followed by `World`, because the candidate treats the whole `var bar = function () { ... }` line as if it had moved before the first log. Only the `bar` binding is prepared early. The function expression and its assignment remain at their original execution point, so the first read sees `undefined`.

Another wrong answer is `ReferenceError`, based on the broad rule that a variable cannot be used before declaration. That rule does not fit this `var` binding. `var` is initialized to `undefined`, so reading `bar` is allowed. A different declaration kind can have different early-read behavior, but this puzzle uses `var`.

Do not say that `World` is printed while the function expression is evaluated. Evaluating the expression creates a function object; it does not run the function body. The body runs only after the final `bar()` call.

A further trap is claiming that the final call must fail because `bar` was initially `undefined`. The binding's value is not permanently fixed at setup. The assignment later replaces `undefined` with the function object, so the same binding is callable by the time the final statement executes.

The reliable tracing habit is to track both the binding and its current value at each statement:

```text
after setup:       bar → undefined
after first log:   bar → undefined
after assignment:  bar → function
after bar():       function body logs World
```

## 6. 🧠 The Memory Hook

`var` hoists the name, not the function expression:

> Name early as `undefined`; function value later at `=`; body only at `()`.

When tracing this pattern, ask three questions in order: “Does the binding exist?” Yes. “Has the function expression been assigned?” Not for the first log, yes for the call. “Has the function been called?” Only at `bar()`. That gives `undefined`, then `World`.
