# Var Hoisting: Why This Logs `undefined`

This one-puzzle page traces one small program through the JavaScript engine. Predict the output before reading the explanation.

## 1. The Code

```javascript
console.log(a);
var a = 10;
```

## 2. The Answer

```text
undefined
```

The `var a` declaration is hoisted and its binding is initialized to `undefined` before the code starts executing. The assignment `a = 10` happens later, so the first line reads the existing binding before it receives `10`.

## 3. Execution — Walk Through It Like the JS Engine

Think of the engine as handling this code in two broad stages: creation and execution.

### Step 1: Create the binding

Before running either line, the engine sees the `var a` declaration and creates a binding named `a` in the current execution context.

At this point, the source has not assigned `10` yet. For a `var` binding, creation also initializes the binding with `undefined`:

```text
a → undefined
```

This is what people mean when they say that `var` is hoisted. The declaration is available before the line where it appears.

### Step 2: Execute the first line

The engine now executes:

```javascript
console.log(a);
```

It looks up `a`, finds its current value, `undefined`, and passes that value to `console.log`.

So the output is:

```text
undefined
```

### Step 3: Execute the second line

Only after the log has finished does the engine execute:

```javascript
a = 10;
```

The existing binding is updated:

```text
a → 10
```

Nothing printed earlier changes retroactively. The log already read the value that existed at that moment.

A useful mental rewrite is:

```javascript
var a;
console.log(a); // undefined
a = 10;
```

This rewrite shows the observable order, while remembering that JavaScript does not literally move the assignment above the `console.log`.

## 4. The Concept This Question Tests

This question tests the difference between declaration processing and assignment execution.

- **Binding creation:** The engine creates a name for `a` before executing the statements.
- **Initialization:** Because the declaration uses `var`, the new binding starts with `undefined`.
- **Execution order:** Statements still run from top to bottom. The assignment to `10` has not happened when `console.log(a)` runs.
- **Read versus write:** The first line reads the current value; the second line writes a new value into the same binding.

Hoisting does not mean “the whole line moves to the top.” It means the declaration is handled during execution-context setup, while the assignment remains in its original position.

For comparison, `let` and `const` declarations are also known before execution reaches their line, but their bindings are not initialized to a usable value at creation time. Reading either one before its declaration is evaluated throws a `ReferenceError` because of the Temporal Dead Zone. `var` is different here because its binding is initialized to `undefined` immediately.

## 5. The Trap — Why Most People Get It Wrong

The tempting answer is `10` because the reader notices `var a = 10` and mentally treats the declaration and assignment as one indivisible action. JavaScript separates them:

```javascript
var a;   // declaration and var initialization happen during setup
a = 10;  // assignment happens when this statement executes
```

The opposite mistake is to expect a `ReferenceError`, as would happen when reading a `let` or `const` binding in its Temporal Dead Zone. `var` has already created a readable binding whose value is `undefined`, so this program logs a value instead of throwing.

In an interview, answer in this order: **`undefined`; `var` creates and initializes the binding during setup, then the later assignment changes it to `10`.**

## 6. 🧠 The Memory Hook

**`var` gets a name and `undefined` during setup; the value arrives when execution reaches the assignment.**

When you see:

```javascript
console.log(a);
var a = 10;
```

say to yourself: **“The box exists, the box is empty, then the box gets `10`.”**
