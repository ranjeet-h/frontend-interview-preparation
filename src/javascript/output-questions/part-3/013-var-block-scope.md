# JavaScript Output Question 13: Block-Scoped `let` and Shadowing

## The Code

```javascript
let a = 10;

{
  let a = 20;
  console.log(a);
}

console.log(a);
```

## The Answer

```text
20
10
```

The inner block prints `20` because it declares its own `a`. Once execution leaves that block, the inner binding is out of scope, so the final log finds the outer `a`, which is still `10`.

## Execution — Walk Through It Like the JS Engine

Before executing the first statement, JavaScript creates the top-level lexical environment for the script. The outer `let a` binding exists there, but `let` bindings begin in the temporal dead zone and cannot be read until execution reaches their declaration. The declaration is reached immediately, so JavaScript initializes the outer `a` with `10`.

Execution then enters the standalone block. A block creates a new lexical environment. The `let a` inside it is a new binding in that inner environment; it does not reuse, copy, or overwrite the outer binding. While execution is inside the block, the inner `a` shadows the outer one.

The inner declaration initializes its binding to `20`. When `console.log(a)` runs, name lookup starts in the current block environment, finds the inner binding first, and prints `20`. JavaScript never continues outward once it has found a matching name.

The closing brace ends the block. The inner lexical environment is no longer available to ordinary code after that point, and the inner `a` cannot be referenced outside the block. The outer `a` remains initialized to `10` because nothing assigned to it.

The final `console.log(a)` therefore performs lookup in the outer environment and prints `10`. This is entirely synchronous. No function call, timer, promise, microtask, or macrotask changes the order.

## The Concept This Question Tests

This tests block scope, lexical environments, and shadowing. `let` and `const` are block-scoped: a declaration inside `{ ... }` belongs to that block and is visible only between the declaration and the block's closing brace.

The two `a` declarations create two separate bindings. You can picture them as two different labeled storage locations:

```javascript
let a = 10; // outer binding: 10

{
  let a = 20; // inner binding: 20
  console.log(a); // reads inner binding
}

console.log(a); // reads outer binding
```

Shadowing does not mean the inner variable changes the outer variable. It means the inner name takes precedence during lookup while the inner scope is active. Once that scope ends, lookup naturally resolves to the outer binding again.

The temporal dead zone is part of the same lexical-binding rule. The inner `a` is unavailable from the start of the block until its declaration executes. For example, this throws before it can use the outer `a`:

```javascript
let a = 10;

{
  console.log(a); // ReferenceError: the inner a is in its TDZ
  let a = 20;
}
```

The name already belongs to the inner block, so JavaScript does not fall back to the outer binding while the inner declaration is uninitialized.

## The Trap — Why Most People Get It Wrong

The first trap is treating the two `a` variables as one shared variable. The inner declaration does not assign `20` to the outer `a`; it creates a second binding. That is why the final line still prints `10`.

Another mistake is thinking that braces are only for formatting. With `let` and `const`, a standalone block is a real scope boundary. The inner `a` disappears from name lookup after the closing brace, so this would fail:

```javascript
{
  let message = "inside";
}

console.log(message); // ReferenceError: message is out of scope
```

Do not apply `var` rules to this example. `var` is function-scoped and would ignore an ordinary block, but `let` is block-scoped and creates the separate inner binding shown here.

Another common mistake is assuming `typeof` can always safely read a `let` variable before its declaration. The `typeof` exception applies to an undeclared identifier, not to a lexical binding in the temporal dead zone:

```javascript
{
  console.log(typeof value); // ReferenceError
  let value = 20;
}
```

Finally, do not invent asynchronous behavior. The block executes immediately from top to bottom, so the output is determined by scope and name lookup, not by the event loop.

## 🧠 The Memory Hook

A block is a room, and `let a` inside it puts a new `a` in that room. While you are inside, you see `20`; step outside, the inner label vanishes and the outer `a` is still `10`.
