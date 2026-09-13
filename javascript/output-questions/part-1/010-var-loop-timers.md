# JavaScript Output Question 10: `var` in a Timer Loop

## The Code

```javascript
for (var i = 1; i <= 5; i++) {
  setTimeout(function () {
    console.log(i);
  }, i * 1000);
}
```

## The Answer

The program prints `6` five times:

```text
6
6
6
6
6
```

The lines do not appear immediately. The callbacks become eligible roughly one, two, three, four, and five seconds after they were scheduled, although the exact timing can be later. The important part is that every callback reads the same variable, and that variable is already `6` by the time any callback runs.

## Execution — Walk Through It Like the JS Engine

The `for` loop itself is synchronous. JavaScript runs all of it on the current call stack before the event loop gets a chance to run any timer callback.

First, `var i` is function-scoped. There is one binding named `i`, not a new binding for each pass through the loop. During the first pass, `i` is `1`, so JavaScript registers a timer whose delay is `1 * 1000` milliseconds. The callback function is stored for later; its body does not run now.

The loop increments the same `i` to `2`, registers the second timer, and repeats this for `3`, `4`, and `5`. At this point there are five callbacks waiting in the timer system, and each callback closes over the same `i` binding.

After the fifth body execution, the loop increment changes `i` from `5` to `6`. The condition `i <= 5` is now false, so the loop ends. Nothing in the timer registration copied the current numeric value into the callback. The callback only retained access to the variable itself.

The delays `i * 1000` were evaluated while the loop was running, so the timers were scheduled with delays of 1000, 2000, 3000, 4000, and 5000 milliseconds. That part does use the current value on each iteration. But a delay is only a time threshold; it does not create a snapshot of the variables used inside the callback.

When the first timer is eligible, its callback is moved onto the task queue only after the current stack is empty. The event loop places it on the stack, and `console.log(i)` looks up the shared binding. The loop has finished, so the binding contains `6`. The first callback prints `6`.

The remaining timers become eligible at their own delay thresholds. Each callback performs the same lookup of the same binding, which still contains `6`, so each prints `6` as well. A timer is not guaranteed to run at its exact requested delay: a busy call stack or other queued work can make it later. That scheduling uncertainty does not change the value printed here.

## The Concept This Question Tests

This tests the interaction between `var` scoping, closures, and timer scheduling.

`var` creates a function-scoped binding. A closure does not freeze the value of a variable at the moment the function is created; it keeps a live connection to the variable's binding. Every callback here therefore points to the one shared `i`.

`setTimeout` also does not pause the loop or run its callback inline. It registers the callback and returns immediately. The loop completes before the event loop processes timer callbacks. By then, the shared binding has reached its post-loop value, `6`.

The delay expression and the callback body are separate moments:

```javascript
setTimeout(callback, i * 1000);
//                         ^ evaluated now
// callback's console.log(i) runs later and reads i then
```

The first `i` determines when a timer becomes eligible. The second `i` is read when the callback executes. They are not the same operation.

## The Trap — Why Most People Get It Wrong

The tempting assumption is that each callback “remembers” the iteration number because the callback was created during that iteration. Functions remember their surrounding variables, not automatically a frozen copy of every value. With `var`, all five callbacks share one mutable binding.

Another common mistake is to think `setTimeout` makes the loop wait. It does not. The timer API schedules future work and the loop continues immediately. That is why the loop can finish and set `i` to `6` long before the first callback runs.

The usual fix is `let`, because a `let` declaration in a `for` loop gives each iteration its own binding:

```javascript
for (let i = 1; i <= 5; i++) {
  setTimeout(function () {
    console.log(i);
  }, i * 1000);
}
```

That version prints `1`, `2`, `3`, `4`, and `5` at approximately one-second intervals. An older alternative is an IIFE that receives the current value as an argument, creating a separate parameter binding for each callback. The key is not “use a timer trick”; the key is giving each callback a distinct binding.

## 🧠 The Memory Hook

`var` gives every callback one shared whiteboard; the loop finishes by writing `6` on it, so every delayed reader sees `6`. The timer remembers when to ask—not what `i` used to be.
