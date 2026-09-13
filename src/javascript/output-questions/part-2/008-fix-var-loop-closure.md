# Fixing a `var` Loop Closure

Source: Part 2, Question 8 from `03-javascript-coding-problems.md`.

## 1. The Code

The modern fix is to declare the loop variable with `let`:

```javascript
for (let i = 0; i < 5; i++) {
  setTimeout(function () {
    console.log(i);
  }, 1000);
}
```

If older JavaScript compatibility requires `var`, an IIFE can create a fresh parameter binding during each iteration:

```javascript
for (var i = 0; i < 5; i++) {
  (function (j) {
    setTimeout(function () {
      console.log(j);
    }, 1000);
  })(i);
}
```

## 2. The Answer

Both versions log the values in this order, after the timers become eligible to run:

```text
0
1
2
3
4
```

The `let` version is the usual answer. A `for` loop declared with `let` gives each iteration its own binding for `i`. Each timer callback closes over that iteration's binding, so it later reads `0`, `1`, `2`, `3`, or `4` instead of reading one shared variable.

The IIFE version does the same job manually. Each call receives the current value of `i` as `j`, and that call creates a new parameter binding. The delayed callback closes over that private `j` binding.

## 3. Execution — Walk Through It Like the JS Engine

Trace the `let` version first:

1. JavaScript starts the `for` loop and initializes `i` to `0`. Unlike `var`, a `let` loop variable can have a separate binding for each iteration.

2. The condition `i < 5` is true. JavaScript creates the timer callback and passes it to `setTimeout`. The timer is registered with the host environment; the callback does not run immediately.

3. The loop advances. JavaScript prepares the next iteration with a new `i` binding whose value is `1`. This is the crucial difference: the first callback still points to the binding containing `0`, while the next iteration gets a different binding.

4. The same process repeats for `i = 1`, `i = 2`, `i = 3`, and `i = 4`. Five timers are registered, and each callback is associated with a different per-iteration binding.

5. After the `i = 4` body, the loop update produces `5`. The condition `5 < 5` is false, so the synchronous loop ends. No timer callback has needed to run for the loop to finish.

6. Once roughly one second has passed, the timer callbacks become eligible as tasks. The delay is a minimum wait, not a guarantee that JavaScript interrupts whatever is currently running at exactly one second.

7. When the call stack is empty, the event loop runs the timer callbacks in registration order. The first callback reads its own preserved binding (`0`), then the others read their own bindings (`1`, `2`, `3`, and `4`).

The IIFE version creates the same separation explicitly:

```text
iteration 0: call IIFE with 0 → create j = 0 → callback closes over it
iteration 1: call IIFE with 1 → create j = 1 → callback closes over it
iteration 2: call IIFE with 2 → create j = 2 → callback closes over it
iteration 3: call IIFE with 3 → create j = 3 → callback closes over it
iteration 4: call IIFE with 4 → create j = 4 → callback closes over it
later: callbacks read their separate j bindings → 0, 1, 2, 3, 4
```

## 4. The Concept This Question Tests

This tests whether you understand that a closure preserves access to a variable binding, not automatically a frozen copy of its value.

With the original `var` code, all five callbacks pointed to one shared `i` binding. The loop finished and left that binding at `5`, so every callback later read `5`. Fixing the problem means giving each callback a different binding that contains the value from its iteration.

`let` gives a `for` loop those per-iteration bindings automatically. The language creates a fresh binding as the loop moves to the next iteration, and the callback closes over the binding belonging to the iteration where it was created.

The IIFE is the pre-`let` pattern. Passing `i` into a function does not merely pass a label; it initializes a new parameter binding for that particular function call. The callback created inside that call closes over that new parameter.

## 5. The Trap — Why Most People Get It Wrong

The most common mistake is to say that `let` simply “copies the value.” That description is useful shorthand, but the important mechanic is a fresh binding per iteration. Closures still capture bindings; they just capture different bindings in this version.

Another mistake is thinking `setTimeout` pauses the loop. It does not. The loop registers all five timers synchronously, reaches its end, and only afterward do timer tasks run.

Do not claim that the `1000` millisecond delay makes execution exact. It means the callback cannot run before the delay has elapsed; the event loop may run it later if the call stack or earlier tasks are busy. Here, because all timers are registered in order with the same delay, their callbacks run in that registration order under normal event-loop behavior.

Finally, an IIFE is not magic. Its value comes from the new function call and its new parameter binding. If the callback still closed over the original shared `var i`, the bug would remain.

## 6. 🧠 The Memory Hook

The bug is five callbacks reaching for one shared box. `let` gives every lap of the loop a new box; the IIFE builds those boxes by hand—so each delayed callback opens its own box and finds `0`, `1`, `2`, `3`, or `4`.
