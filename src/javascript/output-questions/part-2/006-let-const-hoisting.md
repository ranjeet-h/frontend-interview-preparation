# `let` and `const` Hoisting: The Temporal Dead Zone

Source: Part 2, Question 6 from `03-javascript-coding-problems.md`.

## 1. The Code

```javascript
console.log(x);
let x = 10;
```

## 2. The Answer

The code throws a `ReferenceError` before it can print anything:

```text
ReferenceError: Cannot access 'x' before initialization
```

`let x` is known to JavaScript before the line is executed, but `x` is not given a usable value until execution reaches `let x = 10`. The region between entering the scope and reaching that declaration is the **temporal dead zone**, or **TDZ**. Reading `x` inside that region is an error.

That is different from `var`:

```javascript
console.log(a); // undefined
var a = 10;
console.log(a); // 10
```

With `var`, the declaration is hoisted and the binding is initialized to `undefined` immediately. The assignment to `10` still happens later, but reading the binding before that assignment is allowed.

`const` follows the same hoisting rule as `let`, with one additional rule: it must be initialized on its declaration line.

```javascript
console.log(b); // ReferenceError: Cannot access 'b' before initialization
const b = 10;

// This is also invalid:
// const c; // SyntaxError: Missing initializer in const declaration
```

The practical interview answer is: **`var` is hoisted and initialized to `undefined`; `let` and `const` are hoisted but remain uninitialized in the TDZ until execution reaches the declaration.**

## 3. Execution — Walk Through It Like the JS Engine

JavaScript handles this in two broad moments: it prepares the scope, then executes the statements in order.

1. JavaScript creates the scope for the script and registers the `let x` binding. The declaration is not ignored just because it appears below the `console.log`.

2. Unlike a `var` binding, `x` is not initialized to `undefined`. It exists, but it is marked as uninitialized. This is the state that creates the temporal dead zone.

3. Synchronous execution starts at `console.log(x)`. The engine resolves `x` to the lexical binding created for this scope.

4. The binding is still uninitialized because execution has not reached `let x = 10`. JavaScript refuses to return a value from an uninitialized `let` binding, so it throws `ReferenceError`.

5. Because the exception happens on the first line, execution stops. The declaration line is never reached, and nothing is logged.

The important detail is that “hoisted” does not mean “moved to the top and assigned its final value.” Hoisting is a useful shorthand for the preparation JavaScript performs before running the statements. The declaration is registered early, but initialization and assignment still follow the language rules for that declaration.

Here is the same comparison made runnable without allowing one error to stop the other examples:

```javascript
function run(label, readBeforeDeclaration) {
  try {
    console.log(label, readBeforeDeclaration());
  } catch (error) {
    console.log(label, `${error.name}: ${error.message}`);
  }
}

run("var", () => {
  console.log(varValue); // The binding exists and starts as undefined.
  var varValue = 10;
  return varValue;
});

run("let", () => {
  console.log(letValue); // The read happens inside the TDZ and throws.
  let letValue = 10;
  return letValue;
});

run("const", () => {
  console.log(constValue); // const is also uninitialized in the TDZ.
  const constValue = 10;
  return constValue;
});
```

Output:

```text
undefined
var 10
let ReferenceError: Cannot access 'letValue' before initialization
const ReferenceError: Cannot access 'constValue' before initialization
```

The `let` and `const` bindings are block-scoped as well. Their TDZ starts when execution enters the relevant block, not merely when execution reaches the declaration line:

```javascript
{
  // `score` already belongs to this block, but it is still uninitialized.
  try {
    console.log(score);
  } catch (error) {
    console.log(error.name); // ReferenceError
  }

  let score = 10;
  console.log(score); // 10: initialization has now happened.
}
```

## 4. The Concept This Question Tests

This question tests hoisting, lexical scope, initialization, and the temporal dead zone.

A declaration answers “which name belongs to this scope?” Initialization answers “does that name currently contain a usable value?” Those are separate ideas:

| Declaration | Scope | State before declaration executes | Can it be read early? |
| --- | --- | --- | --- |
| `var value` | Function-scoped | Initialized to `undefined` | Yes, value is `undefined` |
| `let value` | Block-scoped | Uninitialized in the TDZ | No, `ReferenceError` |
| `const value` | Block-scoped | Uninitialized in the TDZ | No, `ReferenceError` |

The TDZ is not a time delay and not a special runtime object. It is the interval in which a lexical binding has been created but has not yet been initialized. The name is “temporal” because the result depends on when the code tries to access it, and “dead zone” because access is forbidden there.

Once execution reaches `let x = 10` or `const x = 10`, the binding is initialized and subsequent reads work. For `const`, that initialization is also the only assignment allowed to the binding:

```javascript
let count = 1;
count = 2; // Allowed: let permits reassignment.

const limit = 1;
// limit = 2; // TypeError: Assignment to constant variable.
```

`const` does not freeze an object. It protects the variable binding from being pointed at a different object; the object itself can still be mutated unless it is separately frozen:

```javascript
const user = { name: "Ada" };
user.name = "Grace"; // Allowed: the object changed.
// user = {}; // TypeError: the const binding cannot be reassigned.
```

## 5. The Trap — Why Most People Get It Wrong

The most common wrong answer is `undefined` for the original code. That rule belongs to `var`, not to `let` or `const`. Modern declarations were deliberately designed to fail loudly when code reads a variable before its declaration, because silently receiving `undefined` often hides a real ordering or shadowing bug.

Another mistake is saying that `let` and `const` are “not hoisted.” They are hoisted in the sense that their bindings are created during scope setup before normal statement execution. The precise difference is that they are not initialized during that setup phase. Saying “they are hoisted but inaccessible in the TDZ” is the accurate interview explanation.

The TDZ can also surprise you when a local declaration shadows an outer variable:

```javascript
const name = "outer";

{
  // The inner `name` shadows the outer one for this block.
  // It is in the TDZ until the declaration below runs.
  // console.log(name); // ReferenceError, not "outer"
  const name = "inner";
  console.log(name); // inner
}
```

Finally, `const` has a separate syntax rule that is easy to mix up with the TDZ: a `const` declaration without an initializer is a `SyntaxError`, even if it is never read. The TDZ explains early reads; the required initializer explains why `const value;` is invalid in the first place.

## 6. 🧠 The Memory Hook

`var` arrives with an empty box labeled `undefined`; `let` and `const` arrive with a locked box. The box exists early, but it stays locked until execution reaches the declaration—try to open it before then, and JavaScript throws a `ReferenceError`.
