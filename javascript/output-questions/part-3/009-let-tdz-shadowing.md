# JavaScript Output Question 9: `let` Shadowing and the TDZ

## The Code

```javascript
let a = 1;

function test() {
  console.log(a);
  let a = 2;
}

test();
```

## The Answer

```text
ReferenceError
```

Nothing is printed. `test()` throws when it reaches `console.log(a)`, so execution never reaches `let a = 2`.

## Execution — Walk Through It Like the JS Engine

Before the program starts running, JavaScript creates the bindings declared in the surrounding scope and in `test`'s function scope. The outer scope gets a binding named `a`; when execution reaches `let a = 1`, that binding is initialized to `1`.

The function declaration creates `test`, so the call at the bottom is valid. JavaScript does not execute the function body when it declares the function; it waits until `test()` is called.

When `test()` runs, JavaScript creates a new function scope. That scope contains its own local binding named `a` because of `let a = 2`. This local `a` is separate from the outer `a` and shadows it for the entire function body.

The important detail is that a `let` binding exists before its declaration line is executed, but it is not initialized yet. The period between entering the scope and executing `let a = 2` is the Temporal Dead Zone, or TDZ, for the local `a`.

At `console.log(a)`, name lookup finds the nearest binding first: the local `a`. JavaScript stops there; it does not continue outward to look for the already-initialized `a` with value `1`. Because the local binding is still in its TDZ, reading it throws a `ReferenceError`.

The exception happens before the assignment/initialization of the local `a` can run. Therefore `2` is never assigned, the `console.log` never receives a value to print, and the outer `a` remains unchanged at `1`.

## The Concept This Question Tests

This tests the interaction between lexical scope, shadowing, and the Temporal Dead Zone.

Lexical scope means JavaScript decides which variables are visible from a piece of code based on where that code was written. A function can see names from its surrounding scope, but a local declaration with the same name takes precedence. That is shadowing.

Here, the outer scope has `a = 1`, but `test` declares another `a`. The local declaration wins during lookup everywhere inside `test`. The outer value is not a fallback merely because the local value has not been initialized yet.

`let` and `const` bindings are in the TDZ from the moment their scope is entered until execution evaluates their declaration. Accessing the binding during that interval is an error. This is different from `var`, whose binding is initialized to `undefined` when the scope is created.

## The Trap — Why Most People Get It Wrong

The common wrong answer is `1`. That answer assumes JavaScript checks the local `a`, notices it has not received a value, and then falls back to the outer `a`. JavaScript does not work that way: “uninitialized” is not the same as “missing.” The local binding exists, so lookup stops there.

Another tempting answer is `undefined`, based on `var` hoisting. That would be the behavior if the function contained `var a = 2`; `var` is initialized to `undefined` during function setup. A `let` binding is created but left uninitialized, so reading it throws instead.

The line `let a = 2` does not execute early just because the declaration is known during setup. JavaScript knows the binding exists early, but initialization still happens at that line during normal execution. Since the earlier read throws, the declaration is never reached.

## 🧠 The Memory Hook

Shadowing puts a nearer name in front of the outer name; the TDZ puts a locked door on that nearer name. JavaScript stops at the locked local binding—it never walks past it to borrow the outer value.
