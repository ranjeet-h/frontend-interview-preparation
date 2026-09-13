# `var` Loop Closures: One Binding, Five Callbacks

Source: Part 2, Question 7 from `03-javascript-coding-problems.md`.

## 1. The Code

```javascript
for (var i = 0; i < 5; i++) {
  setTimeout(function () {
    console.log(i);
  }, 1000);
}
```

## 2. The Answer

After the timer delay, the console logs:

```text
5
5
5
5
5
```

The five callbacks all close over the same function-scoped `i` binding. The loop finishes before the callbacks run, and its final increment changes that shared binding to `5`. When the timer callbacks eventually execute, each one reads the current value from that same binding: `5`.

## 3. Execution — Walk Through It Like the JS Engine

1. JavaScript enters the surrounding execution context and creates the `var i` binding. A `var` declaration is function-scoped (or global-scoped when this code is at the top level); the `for` loop does not create a new `i` binding for each iteration.

2. The loop initializes `i` to `0`. JavaScript checks `i < 5`, which is true, and enters the loop body.

3. The function expression passed to `setTimeout` is created. It refers to `i`, so it forms a closure over the existing binding. The closure remembers access to that binding, not a frozen copy of the current value `0`.

4. `setTimeout` registers the callback with the host timer system and returns. The callback is not executed immediately. Once its delay has elapsed, the host will make a timer task eligible to be placed on the task queue.

5. The loop update runs: `i++` changes the shared binding from `0` to `1`. The condition is checked again, and the same sequence schedules a second callback. That callback also closes over the same `i` binding.

6. The loop repeats for `i = 1`, `i = 2`, `i = 3`, and `i = 4`. Five distinct callback function objects are registered, but all five closures retain access to one shared `i` binding. The values used to reach those iterations are not separately stored for later.

7. After the fifth body finishes, the loop update runs one more time. It changes the shared `i` binding from `4` to `5`. The next condition check, `i < 5`, is false, so the loop ends. The synchronous script has now completed, with `i` equal to `5`.

8. The JavaScript engine can now continue processing other work. A timer becoming ready does not interrupt the currently running JavaScript; it only makes its callback eligible for a later task.

9. About one second after each registration, the corresponding timer task is placed on the task queue. The exact moment can be later than 1000 milliseconds because the delay is a minimum wait before the callback becomes eligible, not a promise of exact execution time.

10. When the call stack is empty, the event loop takes a timer task from the task queue and runs its callback. The callback evaluates `console.log(i)`. Its closure looks up the shared binding, which is already `5`, so it logs `5`.

11. The event loop runs the other four timer callbacks in turn. Each callback performs the same lookup against the same binding. No callback has a private iteration value to read, so all five log `5`.

The execution timeline is:

```text
sync: i = 0 → schedule callback → i++
sync: i = 1 → schedule callback → i++
sync: i = 2 → schedule callback → i++
sync: i = 3 → schedule callback → i++
sync: i = 4 → schedule callback → i++ → i = 5 → loop ends
later task queue: callback → read i → 5
later task queue: callback → read i → 5
later task queue: callback → read i → 5
later task queue: callback → read i → 5
later task queue: callback → read i → 5
```

## 4. The Concept This Question Tests

This tests the difference between closing over a binding and copying a value, plus the relationship between timers and the event loop.

A closure retains access to variables in its surrounding lexical environment. In this example, every callback retains access to the same `i` binding created by `var`. Closures do not automatically snapshot the value that a variable had at the moment the function was created. When the callback runs, it reads whatever value the binding contains then.

The timer adds a scheduling boundary:

- The loop body runs synchronously and completes quickly.
- `setTimeout` registers callbacks with the host; it does not pause the loop or call the callback inline.
- After the delay, each callback becomes a task eligible for the task queue.
- A callback runs only after the current call stack is empty.
- By callback time, the shared `i` binding is already `5`.

To preserve each iteration's value, the callback must close over a different binding per iteration. `let` does this naturally because a `for` loop with `let` provides a per-iteration binding:

```javascript
for (let i = 0; i < 5; i++) {
  setTimeout(function () {
    console.log(i); // 0, 1, 2, 3, 4
  }, 1000);
}
```

An older equivalent is an IIFE that receives the current value as an argument, creating a new function-scoped parameter for each call:

```javascript
for (var i = 0; i < 5; i++) {
  (function (current) {
    setTimeout(function () {
      console.log(current); // 0, 1, 2, 3, 4
    }, 1000);
  })(i);
}
```

## 5. The Trap — Why Most People Get It Wrong

The common wrong answer is `0, 1, 2, 3, 4`, because it feels as though each callback should remember the value from the iteration where it was registered. But the callback remembers the shared `i` binding, not an automatic value snapshot.

Another mistake is to imagine that `setTimeout` pauses the loop for one second. It does not. The loop schedules five callbacks immediately, finishes, and leaves `i` at `5`; the timer tasks run later.

Do not confuse five callback functions with five `i` variables. There are five function objects, but with `var` they all reference one binding. The useful interview trace is:

```text
binding count → scheduling order → final binding value → callback lookup
```

## 6. 🧠 The Memory Hook

`var` gives the loop one shared box named `i`; every delayed callback points to that box. The loop fills it through `4`, performs one final increment to `5`, and only then do the timer tasks read it—so every callback prints `5`.
