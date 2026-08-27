# The Code

```javascript
console.log(typeof a);
let a = 10;
```

# The Answer

```text
ReferenceError
```

The program throws before `console.log` can print anything. The important detail is that `a` is a `let` binding: it exists in the scope during setup, but it has not been initialized when the first line tries to read it.

`typeof` does not turn this into `"undefined"`. Its special safety rule applies to an identifier that was never declared at all, not to a declared `let` or `const` binding that is still inside its Temporal Dead Zone (TDZ).

# Execution — Walk Through It Like the JS Engine

Before executing the first statement, JavaScript prepares the surrounding scope and registers the lexical binding named `a`. Registering the binding is not the same as giving it a usable value. Until execution reaches `let a = 10`, the binding is uninitialized and is said to be in the TDZ.

Execution starts with `console.log(typeof a)`. To evaluate `typeof a`, JavaScript must resolve and inspect the binding for `a`. It finds the local lexical binding, but that binding is still uninitialized. Reading it is illegal, so JavaScript immediately throws a `ReferenceError`.

Because the error happens while evaluating the argument to `console.log`, `console.log` is never called and no value is printed. Normal execution stops at that point; the later assignment to `10` is never reached.

The source is not literally rearranged, but this sketch shows the relevant timeline:

```javascript
// Scope setup: create `a`, but leave it uninitialized (TDZ).

console.log(typeof a); // reading the uninitialized binding throws here
a = 10;               // never reached
```

Compare that with an actually undeclared name:

```javascript
console.log(typeof neverDeclared); // "undefined"
```

There is no binding for `neverDeclared`, and `typeof` has a historical exception for that case. `a` is different: JavaScript knows that a `let a` binding exists, so the TDZ rule wins.

The same failure happens with a direct `typeof` comparison:

```javascript
typeof a === "undefined"; // ReferenceError, not true or false
let a = 10;
```

The comparison is never evaluated. There is no coercion-based escape hatch here: JavaScript must first produce the left-hand value, and producing `typeof a` already requires the forbidden read. If the read were valid, `typeof` would return the string `"undefined"`, and strict equality would compare that string without coercing either side.

# The Concept This Question Tests

This tests lexical declaration setup, the Temporal Dead Zone, and the precise limits of the `typeof` operator.

`let`, `const`, and `class` declarations are known during scope setup, which is why their names can shadow an outer binding from the beginning of the scope. They are not initialized to `undefined`, though. Initialization occurs only when execution reaches the declaration, and the interval before that moment is the TDZ.

That gives us three different situations:

```javascript
var readyLater;
console.log(typeof readyLater); // "undefined": binding exists and holds undefined

console.log(typeof missing); // "undefined": no binding exists, typeof has a special exception

console.log(typeof lexicalLater); // ReferenceError: binding exists but is uninitialized
let lexicalLater = 10;
```

The return value of `typeof` is always a string when evaluation succeeds, such as `"undefined"`, `"number"`, or `"function"`. That string result should not be confused with the JavaScript value `undefined`, and it cannot be produced when evaluating the operand itself violates the TDZ.

# The Trap — Why Most People Get It Wrong

The most common wrong answer is `undefined`. People remember the safe undeclared-variable pattern—`typeof missingName`—and overgeneralize it to every name that appears before its declaration. The rule is narrower: `typeof` protects against a completely unresolved identifier, not an existing lexical binding in the TDZ.

Another mistake is saying that `let` is not hoisted. The binding is created during scope setup; what is delayed is usable initialization. A useful explanation is “`let` is hoisted but uninitialized,” with the warning that “hoisting” is shorthand for the runtime setup and does not mean the source line moved.

Some candidates also answer that the code prints `false` because `typeof a === "undefined"` would be false after `a` becomes `10`. That imagines the later assignment happening first. The first read throws synchronously, so neither a boolean result nor the assignment is reached.

Finally, do not use loose equality to blur the issue:

```javascript
// This does not help; evaluating `a` still throws first.
typeof a == "undefined";
let a = 10;
```

`==` versus `===` matters only after both operands have been evaluated. Here the TDZ error happens earlier, while evaluating `typeof a`.

# 🧠 The Memory Hook

`typeof` can forgive a name that was never declared, but it cannot forgive a declared lexical name that has not been born yet. A `let` binding is a locked box: the box exists, but touching it before initialization throws.
