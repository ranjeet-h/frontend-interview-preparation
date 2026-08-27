# The Code

```javascript
var a = 10;

{
  var a = 20;
  console.log(a);
}

console.log(a);
```

This question looks as if the braces create a second `a`. That would be true for `let` or `const`, but not for `var`. The braces create a block in the control-flow structure, not a new `var` scope.

# The Answer

```text
20
20
```

The first `console.log` sees `a` after the assignment inside the block, so it prints `20`. The second `console.log` also prints `20` because the assignment did not create a block-local variable; it changed the same `a` that was declared outside the block.

# Execution — Walk Through It Like the JS Engine

Before running the statements, JavaScript processes the `var` declaration for the surrounding function or script scope. Both `var a` declarations refer to that same function-scoped binding. The second declaration does not create another variable, and redeclaring a `var` in the same scope is allowed.

Execution then begins:

1. `var a = 10` creates the binding if necessary and assigns `10` to it.
2. JavaScript enters the braces. The braces group statements into a block, but they do not change which binding `var a` refers to.
3. `var a = 20` is only a redeclaration at this point. Its assignment runs normally and changes the existing binding from `10` to `20`.
4. The first `console.log(a)` reads that shared binding and prints `20`.
5. JavaScript leaves the block. Leaving the block does not restore the old value; the assignment already changed the one shared binding.
6. The final `console.log(a)` reads the same binding and prints `20` again.

The important distinction is between a block and a scope for a particular declaration. The braces do introduce a lexical block, which matters to `let` and `const`. But `var` is scoped to a function, or to the script/global environment when it appears at top level. It ignores ordinary block boundaries such as `{}`, `if`, `for`, and `while`.

# The Concept This Question Tests

This tests `var` function scoping and redeclaration. A `var` declaration belongs to the nearest function scope, not the nearest block scope. Therefore, both occurrences of `var a` point to one binding, and the later assignment overwrites the earlier value.

Compare the mechanism with `let`:

```javascript
let a = 10;

{
  let a = 20;
  console.log(a); // 20: the block-local binding
}

console.log(a); // 10: the outer binding was untouched
```

Here the block creates a separate lexical environment, so the inner `let a` shadows the outer `a` instead of overwriting it. With `var`, there is no separate block-local binding to shadow the outer one.

At the top level, the exact relationship between a top-level `var` and the global object depends on whether the code is running as a classic browser script, an ES module, or in a host such as Node.js. That environment detail does not change this question's result: inside this block, both `var a` declarations resolve to the same surrounding `var` binding.

# The Trap — Why Most People Get It Wrong

The common mistake is to treat braces as if they automatically create a new scope for every declaration. Braces create a block, but JavaScript has different scoping rules for different declarations. `let` and `const` respect the block; `var` does not.

Another mistake is to think that the second `var a` somehow disappears when execution leaves the block. The declaration was already associated with the surrounding function or script scope, and the assignment changed its value. Scope determines which variable exists; it does not create a temporary copy of the variable's previous value.

The reliable way to trace this is to ask, “What kind of declaration is this, and what is its nearest scope?” For `var`, skip ordinary block boundaries and look for the containing function. Since both declarations land there, the sequence is simply `10`, then overwrite with `20`, then read `20` twice.

# 🧠 The Memory Hook

Braces are a room, but `var` has a key to the whole building: entering and leaving the room does not make a second variable or restore the old value. `var` inside a block means “the same function-scoped variable, updated here.”
