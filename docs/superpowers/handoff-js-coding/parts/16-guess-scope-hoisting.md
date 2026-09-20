## `var` reads `undefined` before its assignment runs

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(a);
var a = 10;
console.log(a);
```

### Output

```text
undefined
10
```

### Explanation

Two timelines. **Setup:** before any statement runs, declaration instantiation finds `var a` in the variable environment, creates the binding, and initialises it to `undefined`. **Execution:** statement 1 reads the existing binding, so it prints `undefined`. Statement 2's declaration part is a no-op (the binding already exists); its *initializer* assigns `10` to the binding. Statement 3 reads the binding again and prints `10`.

### The Rule

`var` separates binding creation (setup, value `undefined`) from assignment (execution, at the statement). The declaration is prepared early; the value arrives only when execution reaches the `= 10`.

### How to Rewrite It Safely

Declare before use. Prefer `let`/`const` so an accidental early read throws instead of silently yielding `undefined`.

### Takeaway

For `var`, the name arrives at setup as `undefined` and the value arrives when execution reaches the assignment. Never collapse the two.

## `let` read before its declaration throws in the TDZ

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
console.log(a);
let a = 10;
```

### Output

```text
ReferenceError: Cannot access 'a' before initialization
```

### Explanation

Two timelines again, with a different setup rule. **Setup:** the engine finds `let a`, creates the binding in the lexical environment, but leaves it *uninitialised* — not `undefined`, but a locked slot. **Execution:** statement 1 must evaluate `a` before `console.log` can run. Reading an uninitialised lexical binding is an error, so the engine throws `ReferenceError` while evaluating the argument. `console.log` is never called, and `let a = 10` is never reached, so no value is ever printed.

### The Rule

`let` and `const` are created at setup but stay uninitialised until execution reaches their declaration. The span between creation and initialisation is the temporal dead zone (TDZ): any read there throws `ReferenceError: Cannot access 'a' before initialization`. (Exact wording varies by engine; the `ReferenceError` type is the stable contract.)

### How to Rewrite It Safely

Move the declaration above the first use. This snippet demonstrates the correct mental model — the throw *is* the safety net — so keep `let`/`const` as the default and treat an early-read `ReferenceError` as the engine catching a `var`-style silent bug.

### Takeaway

`let` reserves the name early but keeps it locked until its declaration executes; reading it in between throws rather than returning `undefined`.

## Inner `var` shadows the outer variable for the whole function body

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
var x = 1;

function func() {
  console.log(x);
  var x = 2;
}

func();
```

### Output

```text
undefined
```

### Explanation

**Setup (outer):** `var x` is created and, during execution of the top level, assigned `1`. The function declaration creates `func` with its body dormant. **Setup (call):** `func()` creates a fresh function execution context. Declaration instantiation finds the *local* `var x`, creates it, and initialises it to `undefined` — before a single line of the body runs. **Execution (body):** `console.log(x)` resolves `x` starting in the local environment, finds the local binding immediately, and stops. The outer `x` (`1`) is never consulted. The local binding still holds `undefined`, so that is what prints. The later `x = 2` assigns to the local binding, after the only log.

### The Rule

Identifier lookup stops at the nearest binding, and a function's `var` bindings are created for the *entire* body call before the body executes. A local `var x` therefore shadows the outer `x` on every line of the function — including lines above the `var x = 2` statement.

### How to Rewrite It Safely

If the function means to read the outer value, do not redeclare the name inside it — rename the local or delete the shadowing declaration. If it means to use a local, declare and assign it before the first read.

### Takeaway

A local `var` casts its shadow before it receives its value: every reference in the function resolves locally, and reads before the assignment see `undefined`.

## `let` in a block is dead before its declaration line

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
{
  console.log(y);
  let y = 2;
}
```

### Output

```text
ReferenceError: Cannot access 'y' before initialization
```

### Explanation

**Setup:** entering the block creates a fresh lexical environment. The engine finds `let y` and creates the binding in uninitialised state — locked, not `undefined`. **Execution:** the first statement inside the block evaluates `y` as the argument to `console.log`. The binding exists but is still in its TDZ because execution has not reached `let y = 2`, so the read throws `ReferenceError`. The declaration line never runs.

### The Rule

Each block gets its own lexical scope for `let`/`const`, and the TDZ applies per binding, not per program. A `let` is unreadable from the moment its scope is entered until its own declaration statement executes.

### How to Rewrite It Safely

Move `let y = 2;` above the first use inside the block. The dangerous variation is assuming the block "starts fresh" at each line — it does not; the binding is locked from block entry.

### Takeaway

`let` is block-scoped *and* TDZ-guarded: the binding exists for the whole block but is readable only after its declaration line runs.

## `var` in a block leaks out to the enclosing scope

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
var a = 1;
{
  var a = 2;
}
console.log(a);
```

### Output

```text
2
```

### Explanation

**Setup:** blocks do not create a variable environment, so both `var a` declarations register the *same* binding in the enclosing scope; the second declaration is a no-op at setup. **Execution:** `a = 1` runs, then the block is entered — but entering a block does nothing to `var` bindings. `a = 2` assigns to the one shared binding. The final `console.log(a)` reads that binding and prints `2`. There is only ever one `a`.

### The Rule

`var` is function-scoped (or global-scoped at the top level of a script), never block-scoped. A `var` inside `{ ... }`, an `if` body, or a loop body belongs to the enclosing function or script scope, so redeclaration in a block overwrites the outer value.

### How to Rewrite It Safely

Use `let`/`const` when the variable is meant to be block-local. This snippet demonstrates the leak to internalise; the breaking variation is swapping `var` for `let`, which produces two bindings and prints `1` (see the next question).

### Takeaway

Braces contain `var` code but never contain a `var` binding — a `var` declared in a block *is* the outer variable.

## `let` in a block stays in the block

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
let a = 1;
{
  let a = 2;
}
console.log(a);
```

### Output

```text
1
```

### Explanation

**Setup:** the outer scope gets a lexical binding `a`. Entering the block creates a nested lexical environment, and the inner `let a` creates a *second, distinct* binding there. **Execution:** `a = 1` initialises the outer binding; inside the block, `a = 2` initialises the inner one. The block ends and the inner environment (with its `a`) is discarded. The final `console.log(a)` resolves in the outer scope and prints `1`. The inner assignment never touched it.

### The Rule

`let`/`const` are block-scoped: each block's declaration is a separate binding that shadows any same-named outer binding only within that block. Contrast with `var`, where the same program has one binding and prints `2`.

### How to Rewrite It Safely

Nothing is broken — this is the scoping to default to. The variation that breaks it is declaring with `var`, which merges the two bindings into one and leaks the inner assignment outward.

### Takeaway

Same name, two boxes: a block-level `let` shadows the outer binding inside the braces and leaves it untouched outside them.

## `var` inside an `if` is visible before the `if` runs

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
function test() {
  console.log(a);
  if (true) {
    var a = 10;
  }
  console.log(a);
}

test();
```

### Output

```text
undefined
10
```

### Explanation

**Setup (call):** `test()` creates a function execution context. Declaration instantiation scans the *whole function body* and finds `var a` — buried inside the `if`, but blocks are invisible to `var`. The local binding is created and initialised to `undefined` before the body runs. **Execution:** the first `console.log(a)` reads the local binding → `undefined`. The `if (true)` passes, `a = 10` assigns to the same local binding, and the second log prints `10`. The condition's truth value is irrelevant to the first line: even `if (false)` would still print `undefined` first, because the binding is created at setup regardless of which branches execute.

### The Rule

Function-scope setup sees through blocks: a `var` anywhere in a function — in an `if`, a loop, a bare block — creates one function-wide binding initialised to `undefined`. The `if` guards the *assignment*, never the binding's existence.

### How to Rewrite It Safely

Declare the variable at the top of the function, or switch to `let` inside the `if` and read it only inside that block. The `if (false)` variation is the interviewer's favourite follow-up: the read still yields `undefined` instead of throwing.

### Takeaway

`if` controls whether a `var` assignment runs, not whether its binding exists — the function owns the binding from the moment it is called.

## `let` inside an `if` is invisible outside the block

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
function test() {
  if (true) {
    let b = 10;
  }
  console.log(b);
}

test();
```

### Output

```text
ReferenceError: b is not defined
```

### Explanation

**Setup (call):** the function's lexical environment is created. The `let b` belongs to the `if`-block's nested environment, not the function's, so the function scope has *no* binding named `b`. **Execution:** the block runs, `b` is initialised to `10` inside the block environment, then the block ends and that environment is discarded. `console.log(b)` resolves `b` in the function scope, finds nothing, continues to the outer scope, finds nothing — so the read throws `ReferenceError`. Note the message: `b is not defined` (no binding in scope) rather than `Cannot access 'b' before initialization` (binding exists but locked). The engine distinguishes "missing name" from "TDZ-locked name".

### The Rule

A block-level `let` lives and dies with its block. Outside the braces there is no binding at all, so the read is a scope error (`b is not defined`), not a TDZ error. TDZ means "binding exists, value not ready"; this is "no binding here".

### How to Rewrite It Safely

Declare `let b` in the function scope (before the `if`) and assign inside the block, or move the `console.log` into the block. The breaking variation is `var b = 10` in the block, which hoists to the function and prints `10`.

### Takeaway

Braces are walls for `let`: code outside the block cannot even name the binding, so the error is "not defined", not "before initialization".

## Calling a function declaration before its source position works

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
foo();

function foo() {
  console.log("Hello");
}
```

### Output

```text
Hello
```

### Explanation

**Setup:** declaration instantiation finds the function declaration `foo`, creates the binding, and initialises it with the complete function object — body included. **Execution:** the first statement is the call `foo()`. Lookup finds the already-initialised binding, a function execution context is created, the body runs, and `console.log("Hello")` prints. Setup prepared the callable; only the call executed the body — nothing printed during setup itself.

### The Rule

Function declarations are initialised with their callable value during scope setup, so they are invocable anywhere in their scope, including above their source position. This is the one declaration kind where "use before the line" is safe by design.

### How to Rewrite It Safely

Nothing is broken — this is the canonical pattern to recognise. The variation that breaks it is converting the declaration to an expression assigned to a variable (`var`/`let`/`const`); then availability follows the variable's rules instead.

### Takeaway

A function declaration brings the callable with the name: ready at setup, executed only when called.

## Calling a `var` function expression early throws `TypeError`

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
foo();

var foo = function () {
  console.log("hi");
};
```

### Output

```text
TypeError: foo is not a function
```

### Explanation

**Setup:** the engine finds `var foo` and initialises the binding to `undefined`. Crucially, the function expression on the right-hand side is *not* evaluated — setup only prepares the name. **Execution:** the first statement calls `foo()`. Lookup succeeds (the binding exists), but its current value is `undefined`, and `undefined` is not callable, so the call throws `TypeError: foo is not a function`. The assignment line never runs because the throw stops execution. Had the call come after the assignment, `foo` would hold the function and print `"hi"`.

### The Rule

`var` hoists the name, not the value. A function *expression* produces its function object only when execution evaluates that expression; until the assignment runs, the variable holds `undefined`, and calling `undefined` is a `TypeError` — a different failure from the `ReferenceError` of a missing or TDZ-locked binding.

### How to Rewrite It Safely

Move the call below the assignment, or use a function declaration if the function must be callable from anywhere in the scope. When triaging "is not a function", check the call's position against the assignment, not just the declaration.

### Takeaway

For `var foo = function ...`, the timeline is: name as `undefined` at setup, function value at the `=`, callable only after that line.

## Calling a `let` function expression early throws `ReferenceError`

`Difficulty: Easy` `Probability: High`

### The Code

```javascript
foo();

let foo = function () {
  console.log("hi");
};
```

### Output

```text
ReferenceError: Cannot access 'foo' before initialization
```

### Explanation

**Setup:** the engine creates the lexical binding `foo` but leaves it uninitialised (TDZ). The function expression is not evaluated. **Execution:** the first statement tries to call `foo()`, which requires reading the binding to get the callee. The binding is still locked in its TDZ because execution has not reached `let foo = ...`, so the read itself throws `ReferenceError: Cannot access 'foo' before initialization`. The engine never gets as far as asking whether the value is callable — compare with the `var` version, where the read succeeds (`undefined`) and the *call* throws `TypeError`.

### The Rule

With `let`/`const`, the variable's TDZ rule dominates: no read of any kind — not even to attempt a call — is allowed before the declaration executes. Same source shape as the `var` version, one keyword different, and the error type changes from `TypeError` to `ReferenceError`.

### How to Rewrite It Safely

Move the call below the declaration. This snippet demonstrates the guard working as intended: the `ReferenceError` names the exact binding and fires at the earliest possible read, instead of failing later as a confusing `TypeError`.

### Takeaway

`let foo = function ...` fails at the *read* (`ReferenceError`, TDZ), while `var foo = function ...` fails at the *call* (`TypeError`, `undefined` is not callable) — the keyword picks the error.

## A `var` assignment overwrites a hoisted function of the same name

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
console.log(typeof foo);

var foo = () => console.log("arrow");

function foo() {
  console.log("declaration");
}

foo();
```

### Output

```text
function
arrow
```

### Explanation

**Setup:** both declarations register the *same* binding `foo`. Function declarations are installed during setup, so the binding starts life holding the `declaration` function object; the `var` declaration does not overwrite it (the binding already exists). **Execution:** line 1 reads `foo`, finds the hoisted function, and prints `"function"`. Line 3's declaration part is a setup-time artefact and does nothing at execution; but line 3 is also a `var` statement with an initializer, so its assignment runs: the arrow function object is created and *overwrites* the binding. The final `foo()` therefore calls the arrow and prints `"arrow"` — the declaration's body never runs.

### The Rule

When a `var` and a function declaration share a name, setup gives the binding the function value, and execution then runs the `var` initializer like any ordinary assignment, replacing it. Source order decides the winner at runtime: the last assignment executed wins, regardless of which form was "hoisted".

Scope warning: this snippet assumes a sloppy classic script (a console paste, an interview whiteboard). In strict mode and in ES modules the same source is an early `SyntaxError` — duplicate lexical binding — and nothing runs at all. If an interviewer asks "would this behave differently in a module?", that error is the answer.

### How to Rewrite It Safely

Never declare the same name twice in one scope — rename one of them. If you inherit this code, read it as two phases: setup installs the function, then the `var` line reassigns it; the call sees only whatever was assigned last.

### Takeaway

Same-name `function foo` plus `var foo = ...` is one binding with two writers: the declaration writes at setup, the assignment overwrites at execution — the last write wins.
