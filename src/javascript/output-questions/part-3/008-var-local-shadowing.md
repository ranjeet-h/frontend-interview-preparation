## 1. The Code

```javascript
var a = 1;
function test(){ console.log(a); var a = 2; }
test();
```

## 2. The Answer

```text
undefined
```

The output is not `1`. The `var a` inside `test` creates a local variable for the entire function, and that local variable shadows the outer `a` from the moment the function begins. Because the local declaration is hoisted and initialized to `undefined` before the function body runs, the `console.log` reads `undefined`.

## 3. Execution — Walk Through It Like the JS Engine

JavaScript first creates the outer scope. It sees `var a`, creates the outer variable, and then execution assigns `1` to it. At this point, the outer `a` contains `1`.

The function declaration creates `test`, but its body does not run yet. JavaScript then reaches `test()` and starts a new function execution context for that call.

Before executing the statements inside `test`, JavaScript processes declarations belonging to that function. It sees `var a` and creates a new local variable named `a`, initialized to `undefined`. This is a different variable from the outer `a`.

The function body effectively behaves like this:

```javascript
function test() {
  var a = undefined; // declaration is prepared before the body runs
  console.log(a);    // reads the local variable
  a = 2;            // assignment happens afterward
}
```

When `console.log(a)` executes, JavaScript looks in the current function scope first. It finds the local `a`, so it never continues outward to the global `a` containing `1`. The local variable still has its initial `undefined` value, so the first and only log prints `undefined`.

Finally, `var a = 2` performs its assignment. The declaration was already handled before execution; only the assignment happens here. The local `a` becomes `2`, and the function returns. The outer `a` remains `1` throughout.

## 4. The Concept This Question Tests

This tests two related rules: function-scoped `var` hoisting and lexical shadowing.

`var` declarations are scoped to the nearest function, not to a block such as an `if` statement or loop. The declaration is registered when the function execution context is created, and its initial value is `undefined`. Its assignment occurs only when execution reaches the assignment part of the statement.

Shadowing means an inner scope has its own binding with the same name as a binding in an outer scope. Name lookup starts in the innermost active scope and moves outward only if the name is not found. Since `test` has a local `a`, every `a` reference inside that function resolves to the local binding—even before the line containing `var a = 2` is reached.

This is why the outer value is not visible. The outer variable was not changed or deleted; it was simply hidden by the function's local binding while `test` was running.

## 5. The Trap — Why Most People Get It Wrong

The common mistake is to read the code top to bottom and assume that `console.log(a)` will use the outer `a = 1` because the local assignment appears later. That reasoning treats `var a = 2` as if the whole statement starts existing only at that line.

The declaration and assignment are separate runtime events. The declaration is prepared at function entry; the assignment waits until execution reaches it. So the function has a local `a` immediately, but that local `a` is still `undefined` when the log runs.

Another mistake is to think the outer `a` is overwritten. It is not. The two bindings are independent:

```javascript
var a = 1;

function test() {
  console.log(a); // local a: undefined
  var a = 2;      // local a becomes 2
}

test();
console.log(a);   // outer a is still 1
```

If the inner declaration used `let` or `const`, the name would still belong to the function's lexical scope, but reading it before its initialization would throw a `ReferenceError` because of the Temporal Dead Zone. `var` instead gives the local binding the initial value `undefined`.

## 6. 🧠 The Memory Hook

When a function contains `var a`, imagine a local name tag for `a` being placed on the function's desk before any statement runs. The tag hides the outer `a` immediately; until the assignment arrives, the value written on that local tag is just `undefined`.
