# `const` and the Temporal Dead Zone

This one-puzzle page traces one small program through the JavaScript engine. Predict the output before reading the explanation.

## 1. The Code

```javascript
console.log(a);
const a = 10;
```

## 2. The Answer

```text
ReferenceError
```

The `const a` binding is created when the lexical environment is set up, but it is not initialized yet. The first statement tries to read `a` before execution reaches its declaration, so the read occurs inside the Temporal Dead Zone (TDZ) and throws a `ReferenceError`.

## 3. Execution — Walk Through It Like the JS Engine

Think of the engine as handling this code in two broad stages: creation and execution.

**Step 1: Create the binding**

Before running either line, the engine sees the lexical declaration `const a` and creates a binding named `a` in the current lexical environment.

The binding exists, but it is marked internally as **uninitialized**. It does not contain `undefined`, `10`, or any other readable JavaScript value:

```text
a → uninitialized
```

This is the first part of the `const` rule. The name is known during setup, but the binding is not readable until its declaration is evaluated.

**Step 2: Execute the first line**

Execution proceeds from top to bottom and reaches:

```javascript
console.log(a);
```

To evaluate the argument, the engine resolves `a` in the current lexical environment. It finds the binding, but that binding is still uninitialized because execution has not reached `const a = 10`.

Reading an uninitialized lexical binding is not a normal read of `undefined`. The engine throws a `ReferenceError` immediately. Because evaluating the argument fails, `console.log` is never called and nothing is printed by this program.

**Step 3: The second line is never reached**

The thrown error interrupts this execution before the engine can evaluate:

```javascript
const a = 10;
```

If execution did reach that declaration, it would evaluate the initializer and initialize the binding with `10`:

```text
a → 10
```

But that transition never happens in this program because the earlier read already threw.

The important timeline is:

1. Create `a` as an uninitialized lexical binding.
2. Try to read `a`.
3. Throw `ReferenceError` because `a` is in the TDZ.
4. Stop before `const a = 10` initializes it.

## 4. The Concept This Question Tests

This question tests the difference between binding creation and binding initialization.

- **Binding creation:** The engine reserves the name `a` in the current lexical environment before ordinary statement execution begins.
- **Initialization:** The `const a = 10` declaration initializes that binding only when execution evaluates the declaration and its initializer.
- **Temporal Dead Zone:** The interval after the binding is created but before it is initialized. Reads during this interval throw a `ReferenceError`.
- **Execution order:** JavaScript still executes statements in source order. Creating the binding early does not move the initializer above the `console.log`.
- **`const` rule:** A `const` binding must be initialized by its declaration and cannot later be assigned a new value.

The contrast with `var` and `let` is precise: a `var a` binding is created and initialized to `undefined` during environment setup, so an early read returns `undefined`. A `let a` binding is created during setup but remains uninitialized, so an early read throws `ReferenceError`. `const` has the same TDZ behavior as `let`, but `const` also requires an initializer and does not allow reassignment. Thus `const a;` is a syntax error, while `let a;` is valid and initializes `a` to `undefined` when that declaration executes.

## 5. The Trap — Why Most People Get It Wrong

The tempting answer is `undefined` because many developers remember that declarations are processed before execution and apply the `var` rule to every declaration. But hoisting does not give every declaration the same initial state.

For this exact code, the engine has created the `const` binding, but it has not initialized it. The first line therefore does not read an empty value; it attempts an illegal read of an uninitialized binding and throws `ReferenceError`.

Another trap is saying that `const` does not exist before its declaration. The binding does exist, which is why the engine knows that `a` belongs to this lexical scope. It is simply unavailable until execution reaches `const a = 10`. The TDZ is an execution-time rule, not merely a rule about text appearing above another line.

In an interview, answer in this order: **`ReferenceError`; `const` creates the binding during setup but leaves it uninitialized, and the read happens before the declaration initializes it.**

## 6. 🧠 The Memory Hook

**`const` reserves the name during setup, but the value arrives only when execution reaches its declaration—and the binding cannot be reassigned afterward.**

When you see:

```javascript
console.log(a);
const a = 10;
```

say to yourself: **“The box exists, but it is locked until initialization—reading it now throws.”**
