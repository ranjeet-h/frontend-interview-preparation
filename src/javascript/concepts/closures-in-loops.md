# Closures in Loops

## 1. Why This Exists — The Problem First

Imagine a page that renders ten buttons and attaches a click handler to each one. A user clicks the first button, but the handler reports `10`—the length of the list—instead of `0`. The same surprise appears when a loop schedules timers, requests, or animation callbacks: every callback seems to remember the last loop value.

This is not a timer bug. It is a scope-and-timing bug. The loop finishes synchronously, while the callback runs later, and the callback may still be looking at one shared, mutable binding. Understanding that distinction lets you predict the behavior and choose a fix instead of memorizing “use `let`.”

## 2. The Analogy — Make It Obvious

Picture a manager updating one whiteboard while three assistants are told, “When the meeting ends, read the number on the board.” The manager writes `0`, then `1`, then `2`, and finally `3` as a loop counter moves. If all assistants have directions to the same board, they all read `3` later. That is a `var` loop: each closure has access to the same binding, and the binding has been changed by the time the callback runs.

Now picture the manager handing each assistant a separate card: the first card says `0`, the second says `1`, and the third says `2`. Each assistant still reads their card later, but the cards are different. A `let` declaration in a `for` loop gives closures a distinct per-iteration binding, so each callback can read the value associated with its own iteration.

The whiteboard or card is the variable binding, not merely its current text. The delay is the event loop or another caller waiting to invoke the function. The important question is always: “Which binding will this callback look up when it eventually runs?”

## 3. How It Actually Works — The Full Explanation

A closure is a function together with access to variables from the surrounding lexical scope. The function does not automatically take a photograph of every value at the moment it is created. It retains access to the binding, so later execution performs a normal name lookup through the saved scope chain.

Consider the synchronous part of this loop:

```js
for (var i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 0);
}
```

There is one `var i` in the surrounding function scope. Each arrow function closes over that same binding. `setTimeout` registers the callback and returns; it does not interrupt the loop. The loop changes `i` to `1`, then `2`, then `3`, and stops. Only after the current synchronous work has finished can the timer callbacks run. All three callbacks then read the one binding, whose value is `3`, so the output is `3`, `3`, `3`.

With `let`, the `for` loop creates a per-iteration lexical binding when a closure needs that behavior:

```js
for (let i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 0);
}
```

The callback from the first iteration closes over that iteration's `i`, the second callback closes over the second iteration's `i`, and so on. The callbacks still run later; only the binding relationship changed. They read `0`, `1`, and `2`.

The event loop explains when the read happens, not which variable is shared. A zero-delay timer is still deferred work. A promise callback is usually placed in the microtask queue and runs sooner than a timer, but it also runs after the current synchronous stack has completed. Therefore both examples below observe the final `var` value:

```js
for (var i = 0; i < 2; i += 1) {
  Promise.resolve().then(() => console.log("microtask", i));
  setTimeout(() => console.log("timer", i), 0);
}
// microtask 2
// microtask 2
// timer 2
// timer 2
```

The callback's later execution is not itself a closure. The closure supplies access to `i`; the event loop supplies the later execution. Keeping those roles separate prevents a common explanation error.

There is also a useful distinction between capturing a binding and passing a value. This function sees a live binding:

```js
function makeReader() {
  let value = "before";
  const read = () => value;
  value = "after";
  return read;
}

console.log(makeReader()()); // after
```

The returned function reads the same `value` after it has been changed. If a fixed value is wanted, pass it into a new function call or create a new per-iteration binding. A `let` declaration is not a promise that every variable is immutable; an object stored in a `let` binding can still be mutated. It only gives the callback the correct binding for that iteration.

## 4. Real Code — See It Working

The following Node.js example waits for all callbacks so the difference is visible without relying on console timing:

```js
function collectWithVar() {
  return new Promise((resolve) => {
    const values = [];

    for (var i = 0; i < 3; i += 1) {
      // WHY: all three callbacks close over this one function-scoped `i`.
      setTimeout(() => {
        values.push(i);
        if (values.length === 3) resolve(values);
      }, 0);
    }
  });
}

function collectWithLet() {
  return new Promise((resolve) => {
    const values = [];

    for (let i = 0; i < 3; i += 1) {
      // WHY: this loop gives each callback its own iteration binding.
      setTimeout(() => {
        values.push(i);
        if (values.length === 3) resolve(values);
      }, 0);
    }
  });
}

async function main() {
  console.log(await collectWithVar()); // [3, 3, 3]
  console.log(await collectWithLet()); // [0, 1, 2]
}

main();
```

In browser code, the same choice affects event handlers. Prefer `let` or an iteration method when each handler needs its own index:

```js
const buttons = document.querySelectorAll("button");

for (let index = 0; index < buttons.length; index += 1) {
  buttons[index].addEventListener("click", () => {
    // WHY: this handler keeps the binding for its own iteration.
    console.log(`Button ${index} clicked`);
  });
}
```

If legacy code must keep `var`, an IIFE or helper function can receive the current value as a parameter. The parameter is a new local binding for that invocation:

```js
for (var i = 0; i < 3; i += 1) {
  (function (index) {
    // WHY: `index` belongs to this IIFE call, not to the changing outer `i`.
    setTimeout(() => console.log(index), 0);
  })(i);
}
// 0, 1, 2
```

An explicit value can also be carried by a data object, which is often clearer when the callback needs more than an index:

```js
const jobs = ["invoice", "email", "backup"];

jobs.forEach((job, index) => {
  setTimeout(() => {
    // WHY: `job` and `index` are parameters of this callback's iteration.
    console.log({ job, index });
  }, 0);
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does a `var` loop usually print the final value?**

`var` creates one function-scoped binding. Every callback created by the loop refers to that same binding. The synchronous loop reaches its terminating value before timers or user events invoke the callbacks, so every callback reads the final value from the shared binding.

**Q: Why does `let` fix the timer and event-handler version?**

For a `for` loop, `let` provides a distinct lexical binding for each iteration when closures need it. The callbacks still run later, but each one looks up its own iteration's binding. `let` fixes the scope relationship; it does not make callbacks synchronous or freeze arbitrary objects.

**Q: Do closures capture values or variables?**

They retain access to lexical bindings. In ordinary language, that means a closure can observe a later assignment to a variable in the captured scope. A value can appear fixed when the binding is never changed, but that result should not be mistaken for a snapshot guarantee.

**Q: Is `setTimeout(fn, 0)` immediate?**

No. It asks the host environment to queue the callback after the delay. The callback cannot run until the current synchronous work finishes. A zero delay changes the earliest scheduling time, not the fact that the loop runs to completion first.

**Q: Are promise callbacks different from timer callbacks for this bug?**

They use a different queue and promise microtasks normally run before timers after the current stack is empty. But both are deferred relative to the loop. If both callbacks close over one `var` binding, both can read its final value.

**Q: What did developers use before `let` existed?**

They created a new function invocation per iteration, commonly with an IIFE or helper. Passing `i` as an argument binds the current value to a new parameter, and the nested callback closes over that parameter rather than the shared outer variable. This is a scope technique, not a special timer feature.

**Q: Does `forEach` solve every closure problem?**

It gives each callback invocation its own `index` and `value` parameters, so it avoids this specific `var` counter pattern. It does not make asynchronous work sequential, provide cancellation, or replace a loop when `break`, `continue`, or controlled concurrency is required.

**Q: What should you use in modern production code?**

Use `const` when the per-iteration binding does not need reassignment and `let` when it does. Use an explicit parameter or data object when passing a value makes the callback's dependency clearer. Use an IIFE only when maintaining older code or when deliberately introducing a function scope.

## 6. The Traps — What Goes Wrong

**Mistaking a closure for a snapshot.** A callback is not automatically handed a frozen copy of every outer value. If several callbacks share a binding, a later assignment is visible to all of them. Fix the binding relationship with `let`, a parameter, or a value-specific helper.

**Blaming the timer instead of tracing the read.** Replacing `setTimeout` with a promise changes queue priority, not the captured binding. First ask when the callback runs; then ask what binding it reads at that time.

**Using `let` while mutating shared state inside it.** This still has a shared-state bug:

```js
const records = [];
for (let i = 0; i < 2; i += 1) {
  setTimeout(() => records.push(i), 0);
}
```

The indices are isolated, but `records` is intentionally shared. That is fine if the shared collection is protected by the design, but `let` does not make `records` private to an iteration.

**Fixing the wrong variable in an IIFE.** This does not fix the problem because the callback still reads `i`:

```js
for (var i = 0; i < 3; i += 1) {
  (function (index) {
    setTimeout(() => console.log(i), 0); // still reads outer `i`
  })(i);
}
```

The callback must read `index`, the parameter created for that invocation.

**Assuming an event handler runs during registration.** `addEventListener` stores the function. The function runs later, after a user action, so the loop's later mutations matter exactly as they do for a timer.

**Assuming `const` freezes an object.** `const` prevents rebinding the variable, but this is still possible:

```js
for (const item of [{ done: false }, { done: false }]) {
  item.done = true; // the binding is stable; the object is mutable
}
```

The per-iteration binding answers “which item?” It does not answer “can that item change?”

## 7. Compare With Related Concepts

**`var` versus `let`/`const`.** `var` shares one function-scoped loop binding; `let` and `const` provide block-scoped bindings, including per-iteration bindings for `for` loops. Use `const` by default, `let` when reassignment is needed, and avoid `var` in new code unless preserving a deliberate legacy behavior.

**Closure versus event loop.** A closure determines which surrounding bindings a function can access. The event loop determines when deferred work gets a chance to run. Use the closure model to predict the value and the queue model to predict the ordering.

**`let` versus an IIFE/helper.** Both can give each callback a private binding, but `let` expresses the intent directly and is easier to read. Use an IIFE or helper when supporting pre-ES2015 code or when a function boundary is useful for other reasons.

**`for` versus `forEach`.** `forEach` supplies a fresh callback invocation with `value` and `index`, but it does not support early `break` or controlled async sequencing. Use `for` for cancellation, `break`, `continue`, or explicit concurrency control; use `forEach` for simple per-item registration where its callback parameters make ownership clear.

**A captured primitive versus a captured object.** A separate primitive binding often looks like a saved value. A separate binding that points to the same object can still observe mutations to that object. Use immutable data or copy the object when the callback needs a stable object state, not merely a stable variable name.

## 8. 🧠 The Memory Hook — What Sticks

Ask every delayed callback: “Does it get its own card, or does it return to the one whiteboard?” `var` sends every callback back to one changing board; `let`, `const`, parameters, and helpers give each callback the right card. The event loop decides when they read it, but the scope decides which board or card they read.
