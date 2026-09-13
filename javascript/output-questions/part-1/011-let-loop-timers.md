# JavaScript Output Question 11: `let` in a Timer Loop

## The Code

```javascript
for (let i = 1; i <= 5; i++) {
  setTimeout(function () {
    console.log(i);
  }, i * 1000);
}
```

## The Answer

The callbacks print the numbers from `1` through `5`, one callback becoming eligible at roughly one-second intervals:

```text
1
2
3
4
5
```

The delays are approximately one, two, three, four, and five seconds. “Approximately” matters: `setTimeout` guarantees that a callback will not run before its delay has elapsed, but it can run later if the call stack or task queue is busy.

## Execution — Walk Through It Like the JS Engine

The loop runs synchronously. JavaScript does not wait for the timers between iterations, and none of the `console.log` calls runs while the loop body is being registered.

On the first iteration, `i` is `1`. JavaScript evaluates `i * 1000` immediately, so the first timer is registered with a 1000-millisecond delay. It also creates the callback function, but the callback body is saved for later.

The loop increments to `2`, creates the second iteration binding, and registers a timer with a 2000-millisecond delay. The same thing happens for `3`, `4`, and `5`. After the fifth iteration, the loop increments to `6`; the condition `i <= 5` fails, so the synchronous loop ends.

The important detail is what `let` does in a `for` loop. Each iteration gets its own lexical binding for `i`. The first callback closes over the binding containing `1`, the second closes over a different binding containing `2`, and so on. These are five distinct bindings, not five callbacks reading one shared variable.

The event loop can process timer callbacks only after the current call stack is empty. When roughly one second has passed, the first timer becomes eligible and its callback is placed in the task queue. The event loop eventually puts that callback on the stack, where `console.log(i)` reads its own captured binding and prints `1`.

At roughly two seconds, the second callback runs and reads its separate binding, which contains `2`. The remaining callbacks do the same at their respective delays. The loop’s later increment to `6` does not change any of those captured bindings, so the callbacks print `1`, `2`, `3`, `4`, and `5`.

The two uses of `i` happen at different times:

```javascript
setTimeout(callback, i * 1000);
//                         ^ evaluated while the loop is running

// Inside callback:
console.log(i);
//           ^ read when the timer callback runs later
```

The delay is calculated immediately, while the value logged by the callback is looked up later. `let` makes that later lookup safe by giving each iteration its own binding.

## The Concept This Question Tests

This tests the interaction between block scoping, closures, and asynchronous timer scheduling.

`let` is block-scoped, so its binding belongs to the loop iteration rather than behaving like one function-scoped `var` binding. In a `for` loop, JavaScript creates a fresh per-iteration binding when a closure could observe the loop variable. The callback is a closure because it retains access to variables from the surrounding scope after the loop body has finished.

The closure captures the binding, not a mysterious copy made by `setTimeout`. In this example, that distinction works in our favor: there are five bindings, each holding the value from one iteration. With `var`, there would be one shared binding, and every callback would read the final value after the loop finishes.

`setTimeout` only schedules work. It does not pause the loop, and its delay is not an exact appointment. Once a timer is eligible, its callback still waits for the current stack and earlier queued tasks to clear.

## The Trap — Why Most People Get It Wrong

The first trap is applying the classic `var` result to every loop variable. With `var`, the callbacks share one binding and commonly print `6` five times. Replacing `var` with `let` changes the binding behavior, so each callback sees its own iteration value.

The second trap is saying that a closure “copies the value.” A closure keeps a reference to a lexical binding. Here, each iteration has a different binding, which is why the result looks like a snapshot. If several callbacks closed over the same mutable binding, they would all observe that binding’s value at execution time.

The third trap is believing the timers execute in the middle of the loop because their delays are different. The loop completes first because JavaScript runs the synchronous code on the call stack. The timer callbacks are deferred until the stack is empty and the event loop can process their tasks.

The fourth trap is promising exact timestamps. A 1000-millisecond timeout means “do not make this callback eligible before about 1000 milliseconds,” not “run it at exactly 1000 milliseconds.” CPU-heavy synchronous work, another long-running callback, or queued tasks can delay it.

An older fix for the `var` version is an IIFE that receives the current number as an argument, creating a separate parameter binding for each callback. For modern JavaScript, `let` expresses the intended per-iteration binding directly:

```javascript
for (let i = 1; i <= 5; i++) {
  setTimeout(() => console.log(i), i * 1000);
}
```

The arrow function is not what fixes the problem. The important change is `let` in the loop declaration.

## 🧠 The Memory Hook

`var` gives every timer one shared whiteboard; `let` gives every iteration its own card. The callbacks read their cards later, so the loop can move on to `6` without changing the numbers already written on `1` through `5`.
