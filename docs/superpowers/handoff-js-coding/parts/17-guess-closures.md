## Two counters from one factory keep independent environments

`Difficulty: Easy` `Probability: Very High`

### The Code

```javascript
function outer() {
  let count = 0;
  return function () {
    count += 1;
    return count;
  };
}

const a = outer();
const b = outer();
console.log(a());
console.log(a());
console.log(b());
console.log(a());
```

### Output

```text
1
2
1
3
```

### Explanation

Each call to `outer()` runs the function body fresh. **Setup:** calling `outer()` creates a new declarative environment holding a new `count` binding initialised to `0`, then returns the inner function with a reference to that environment. **Execution:** `const a = outer()` captures environment A (`count = 0`); `const b = outer()` captures a separate environment B (`count = 0`). `a()` reads and increments A's `count` → `1`, then `2`. `b()` reads B's `count`, which neither `a()` call touched → `1`. The final `a()` reads A's `count` again → `3`. The two inner functions share the same code but close over different environments, so they never observe each other.

### The Rule

A closure is a function bundled with a reference to the environment where it was created. Every invocation of the outer function creates a new environment, so factories like this produce independent state per returned function. Shared code does not mean shared bindings.

### How to Rewrite It Safely

Nothing is broken here — this is the canonical factory pattern to internalise. The variation that breaks it is creating only one counter and aliasing it (`const b = a`), which shares a single environment instead of two. If you ever need shared state across handles, create one environment deliberately and hand out multiple closures from it.

### Takeaway

One outer call, one environment. Two calls to the same factory give two independent closed-over bindings.

## `var` in a loop shares one binding across every timeout

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
```

### Output

```text
3
3
3
```

### Explanation

**Setup:** `var i` is hoisted to the enclosing function (or global) scope, so there is exactly one `i` binding for the whole loop — no fresh binding is created per iteration. **Execution:** the loop runs synchronously: iteration 1 (`i = 0`), iteration 2 (`i = 1`), iteration 3 (`i = 2`), each registering a timeout callback that closes over that same single binding. The loop's final update sets `i` to `3`, the condition fails, and the loop exits — all before any timer fires. Each `setTimeout(..., 0)` callback runs later as a macrotask and reads the live binding, which is now `3`. All three callbacks therefore log `3`. Compare with the next two questions: the only difference is how many `i`-like bindings exist when the callbacks finally run — here it is one, there it is three.

### The Rule

`var` has function scope, not block or per-iteration scope. A closure captures the binding (the variable itself), not a snapshot of its value at registration time, so callbacks that run after the loop all observe the loop's final value.

### How to Rewrite It Safely

Prefer `let` in the loop head (next question), which the language specifies to create a fresh binding per iteration. If you must keep `var`, freeze each iteration's value with an IIFE parameter (the question after next):

```javascript
for (var i = 0; i < 3; i++) {
  (function (x) {
    setTimeout(() => console.log(x), 0);
  })(i);
}
```

### Takeaway

One shared `var` binding plus late-running callbacks means every callback sees the final value. Count the bindings, not the callbacks.

## `let` in a loop gives each timeout its own binding

`Difficulty: Medium` `Probability: Very High`

### The Code

```javascript
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
```

### Output

```text
0
1
2
```

### Explanation

**Setup:** unlike `var`, a `let` declaration in a `for` head creates a new lexical binding for each iteration (conceptually, each iteration gets a fresh declarative environment whose `i` is initialised by copying the previous iteration's value, then applying the update expression). **Execution:** iteration 1 closes over binding `i₀ = 0` and schedules callback 1; iteration 2 closes over a distinct binding `i₁ = 1`; iteration 3 closes over `i₂ = 2`. The loop then ends with its internal copy at `3`, but no callback references that copy — each callback references only its own iteration's binding. When the three macrotasks run, they read `0`, `1`, and `2` respectively, in registration order. This is the direct counterpart to the previous question: identical timing, identical callbacks, but three bindings instead of one — which is the entire difference between `3 3 3` and `0 1 2`.

### The Rule

`let` (and `const`) in a `for` head get per-iteration bindings: each pass through the loop body sees a fresh variable, so closures created in different iterations capture different variables. This special-casing applies to `for`, `for...in`, and `for...of` heads.

### How to Rewrite It Safely

This code is already the safe version — it demonstrates the correct mental model. The variation that breaks it is switching `let` back to `var` (previous question): the three environments collapse into one and the output becomes `3 3 3`. In pre-ES6 codebases without `let`, the equivalent fix is the IIFE pattern in the next question.

### Takeaway

`let` in a loop head means one fresh binding per iteration. Same loop, same timers — but three captured variables instead of one shared one.

## An IIFE freezes each `var` value in its own parameter

`Difficulty: Medium` `Probability: High`

### The Code

```javascript
for (var i = 0; i < 3; i++) {
  (function (x) {
    setTimeout(() => console.log(x), 0);
  })(i);
}
```

### Output

```text
0
1
2
```

### Explanation

**Setup:** as in the `var` question, there is still exactly one shared `i` binding for the loop. The new element is the immediately invoked function expression: each call to it creates a fresh function environment with its own parameter binding `x`. **Execution:** iteration 1 calls the IIFE with `i = 0`, so environment 1 holds `x = 0` and schedules a callback closing over `x`, not `i`. Iteration 2 creates environment 2 with `x = 1`; iteration 3 creates environment 3 with `x = 2`. By the time the timers fire, the shared `i` is `3` as before — but no callback reads `i` anymore, so its final value is irrelevant. Each callback reads its own IIFE's `x`, producing `0`, `1`, `2`. Read the trio together: the `var` version has one binding and prints `3 3 3`; the `let` version gets three bindings from the language; this version builds the same three bindings by hand, one function call per iteration.

### The Rule

Function parameters are fresh bindings per invocation. Calling a function inside each iteration — passing the current loop value as an argument — copies that value into a binding whose lifetime is tied to the closure, insulating the callback from later mutations of the loop variable.

### How to Rewrite It Safely

In modern code, write `for (let i ...)` (previous question) instead of this pattern — it expresses the intent directly. Keep the IIFE form for recognising and maintaining pre-ES6 code, and note the equivalent block-scope alternative:

```javascript
for (var i = 0; i < 3; i++) {
  let x = i;
  setTimeout(() => console.log(x), 0);
}
```

### Takeaway

If the language does not give you a fresh binding per iteration, make one yourself: one IIFE call per pass turns one shared `var` into three private parameter bindings.
