# 1. The Code

```javascript
console.log(foo);

var foo = 10;

function foo() {}
```

# 2. The Answer

```text
[Function: foo]
```

The log runs before the assignment `foo = 10`, so JavaScript still sees the function. The `var foo` declaration does not create a second variable that competes with the function declaration; both declarations refer to the same binding.

The exact display of a function can vary by runtime. Node commonly prints `[Function: foo]`; a browser console may display the function object in a different format. The important result is that `foo` is callable, not `10` and not `undefined`.

# 3. Execution — Walk Through It Like the JS Engine

Before JavaScript executes the first line, it prepares the current scope. It encounters two declarations with the same name:

```javascript
var foo;
function foo() {}
```

These do not produce two separate `foo` variables. They are declarations for one shared binding. During declaration instantiation, the function declaration is created as a function object and that object is placed into the `foo` binding. A `var` declaration does not replace an already initialized function binding with `undefined`; its useful effect here is only to confirm that a `var`-style binding exists.

At this point, before any executable assignment has run, the scope is effectively holding:

```javascript
foo → function foo() {}
```

Execution then starts at the first statement, `console.log(foo)`. JavaScript looks up the already-created `foo` binding and finds the function object. The function is passed to `console.log`, which prints its runtime representation: `[Function: foo]` in Node.

Next, execution reaches `var foo = 10`. The declaration part was handled during setup, but the initializer is executable code. Only now does JavaScript perform the assignment:

```javascript
foo = 10;
```

The shared binding now contains `10`. The function has not “lost” a race with `var`; the log happened before the assignment. If another statement followed the assignment, it would see `10`:

```javascript
console.log(foo); // 10
```

The function declaration appears later in the source text, but source order does not determine when function declarations become available. Function declarations are initialized while the scope is being prepared. The `var` initializer, on the other hand, waits until normal top-to-bottom execution reaches it.

# 4. The Concept This Question Tests

This tests declaration instantiation, hoisting, and the difference between a declaration and an initializer when multiple declarations share one binding.

“Hoisting” is a convenient description, not a literal movement of lines. Before running statements, JavaScript creates the scope’s bindings. A function declaration is initialized with its function object during that preparation phase. A `var` binding is available with `undefined` when no earlier initialization has supplied a value. When a function declaration and a `var` declaration use the same name, JavaScript does not create two independent variables. The function declaration initializes the single binding to the function, and the later `var foo = 10` assignment changes that same binding when execution reaches it.

That is why these two snippets differ:

```javascript
console.log(foo); // function object
var foo = 10;
function foo() {}
```

```javascript
console.log(foo); // 10
function foo() {}
var foo = 10;
console.log(foo);
```

The function is available from the beginning in both cases. The value changes only when the assignment statement actually executes.

# 5. The Trap — Why Most People Get It Wrong

The common mistake is to read the file as if JavaScript simply executes every line during setup. That leads to the thought: “There is `var foo`, so `foo` must be `undefined` at the first log.” That rule applies when the binding has not already been initialized by a function declaration. Here, the function declaration initializes the shared binding first.

Another mistake is to imagine that the later `function foo() {}` runs after `var foo = 10` and therefore somehow changes the value back into a function. Function declarations are processed before ordinary execution, regardless of where they appear in this scope. The only runtime change in this example is the assignment `foo = 10`, and it happens after the log.

Finally, do not confuse the declaration with its initializer. `var foo` is handled during scope setup; `= 10` is not. A useful rewrite for reasoning is:

```javascript
// Preparation: one binding named foo, initialized to the function.
foo = function foo() {};

// Execution:
console.log(foo); // function object
foo = 10;        // assignment happens later
```

This rewrite is a mental model, not source-code transformation. It captures the timing that matters without claiming that the engine physically moves the function text.

# 6. 🧠 The Memory Hook

Declarations prepare the name; initializers change the value. A function declaration puts the function into the shared `foo` box before execution, and `var foo = 10` replaces what is in that box only when the assignment line is reached.
