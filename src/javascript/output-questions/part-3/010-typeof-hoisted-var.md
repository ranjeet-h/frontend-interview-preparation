# The Code

```javascript
console.log(typeof a);
var a = 10;
```

# The Answer

```text
undefined
```

The value printed is the string returned by `typeof`: JavaScript reports that the current value of `a` has the type `"undefined"`. The `var` declaration already created the binding before the first line ran, but the assignment `a = 10` had not happened yet.

# Execution — Walk Through It Like the JS Engine

Before JavaScript executes the statements from top to bottom, it prepares the current scope. During that setup, it finds `var a` and creates a variable binding for `a`. A `var` binding is initialized immediately with the value `undefined`.

That preparation is why the runtime behaves roughly as if the code were arranged like this:

```javascript
var a; // created and initialized to undefined during scope setup
console.log(typeof a);
a = 10; // assignment still waits until this point in execution
```

The source code itself is not literally rearranged. “Hoisting” is a useful way to describe the fact that the declaration is processed before ordinary execution; the assignment remains exactly where the author wrote it.

Execution then begins at `console.log(typeof a)`. JavaScript resolves `a` successfully because the `var` binding exists. Its current value is `undefined`, so `typeof a` evaluates to the string `"undefined"`, and `console.log` prints that value.

Only after the log finishes does execution reach `var a = 10`. The declaration part has already been handled during setup, so the runtime now performs the assignment and changes the value stored in `a` to `10`. Nothing prints after that line.

The word “undefined” can be confusing here because it describes two different ideas:

```javascript
var declared;
console.log(typeof declared); // "undefined": the binding exists and holds undefined

console.log(typeof neverDeclared); // "undefined": typeof safely handles a missing binding
```

The interview question uses the first case. `a` is not missing; it is a real `var` binding whose value is temporarily `undefined`. The second case is a special safety behavior of `typeof` for an actually undeclared identifier. That special behavior does not make every pre-declaration read safe: a `let` or `const` binding exists but is in the Temporal Dead Zone, so `typeof` on it before initialization throws a `ReferenceError`.

# The Concept This Question Tests

This tests `var` hoisting, initialization timing, and the meaning of `typeof`.

`var a` is hoisted as a declaration and initialized to `undefined` during scope creation. The initializer `= 10` is an assignment performed later during normal execution. That is the complete reason the first read sees `undefined`.

It also tests whether you distinguish a declaration from an assignment. Saying “the whole line is hoisted” is imprecise. The name is made available early; the value `10` is not. The same distinction explains why this code does not fail, while the equivalent `let` example does:

```javascript
console.log(typeof a);
let a = 10; // ReferenceError: a is in the Temporal Dead Zone
```

`typeof` does not bypass the Temporal Dead Zone. Its special protection applies to an identifier that was never declared at all, not to a declared lexical binding that has not been initialized yet.

# The Trap — Why Most People Get It Wrong

The first common mistake is to answer `number` because the declaration says `a = 10`. The assignment has not executed when the log runs. At that moment the only value available is the `undefined` installed for the hoisted `var` binding.

The second mistake is to claim that `typeof a` throws because `a` appears later in the file. `var` declarations are initialized during scope setup, so the identifier is readable before the assignment. A later declaration does not automatically imply a Temporal Dead Zone; TDZ behavior belongs to `let`, `const`, and `class`.

The third mistake is to say that `typeof` always prevents a `ReferenceError`. It does not. This is safe because `var a` exists:

```javascript
console.log(typeof a);
var a = 10; // prints "undefined"
```

This is not safe because `a` is a declared lexical binding that has not been initialized:

```javascript
console.log(typeof a); // ReferenceError
let a = 10;
```

In an interview, give the output first, then separate the timeline into “binding created and initialized to `undefined`” and “assignment to `10` happens later.” That explanation demonstrates the rule instead of relying on the vague phrase “JavaScript moves variables to the top.”

# 🧠 The Memory Hook

With `var`, JavaScript puts the empty box in the room early, but it does not put `10` in the box until execution reaches the assignment. `typeof` looks inside the box first, so the first log sees `undefined`.
