# The Code

```javascript
async function getData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Data");
    }, 1000);
  });
}

async function main() {
  const data = await getData();
  console.log(data);
}

main();
console.log("End");
```

# The Answer

```text
End
Data
```

`End` is printed immediately. `Data` is printed roughly one second later, after the timer resolves the Promise. The important point is that calling an `async` function does not make the entire surrounding script wait; only the execution inside that function pauses at `await`.

# Execution — Walk Through It Like the JS Engine

There is no surprising `var`/`let` hoisting or temporal-dead-zone behavior in this example. During setup, JavaScript creates the two function declarations, `getData` and `main`, so both functions are available before top-level execution begins.

JavaScript then executes `main()`. Calling an `async` function starts running its body synchronously, just like calling an ordinary function. The function enters `await getData()`, so it first calls `getData()`.

Inside `getData`, JavaScript creates a new Promise. The Promise executor runs immediately, so `setTimeout` registers a timer with the host environment. The timer is not JavaScript code sitting on the call stack; the browser or Node.js runtime tracks the one-second delay. The Promise is still pending, because `resolve("Data")` has not run yet.

`getData()` immediately returns that pending Promise. `main` now reaches `await` with that Promise. Because the Promise is not settled, JavaScript suspends the rest of `main`—the `const data` assignment and `console.log(data)`—and arranges for that continuation to resume when the Promise fulfills. The `await` does not block the JavaScript thread and does not block the caller.

Control returns to the top-level script, which continues with the next statement:

```javascript
console.log("End");
```

That statement runs synchronously, so `End` is printed before the timer has finished. At this point the top-level script and the current call stack are complete. The runtime waits while the host timer counts down; JavaScript is free to handle other work during this time.

After approximately one second, the timer callback becomes eligible to run as a task. The callback is placed on the call stack, calls `resolve("Data")`, and fulfills the Promise returned by `getData`. Resolving the Promise does not directly run the suspended `main` code inside the timer callback. Instead, the reaction created for the `await` is queued as a microtask.

Once the timer task finishes, the call stack becomes empty. The runtime reaches a microtask checkpoint and runs the `await` continuation. `main` receives the fulfilled value, so `data` becomes `"Data"`; then `console.log(data)` prints `Data`. Finally, `main` returns a fulfilled Promise, although this code does not attach a handler to observe that returned Promise.

The timeline is:

```text
main() → getData() → register 1-second timer → await pending Promise
top-level script → print End
one second later: timer task → resolve("Data")
after timer task: await microtask → print Data
```

# The Concept This Question Tests

This tests three connected ideas: `async` functions, `await`, and the event loop.

An `async` function always returns a Promise. In this example, `main()` returns a Promise even though the function body appears to return nothing explicitly. The returned Promise fulfills after the awaited work and the remaining body have completed.

`await` is best understood as a controlled pause in one async function, not as a pause for the whole program. When the awaited Promise is pending, JavaScript exits that function and gives control back to its caller. When the Promise fulfills, JavaScript schedules the rest of the async function as a Promise reaction, which runs through the microtask queue.

The timer is a host API. `setTimeout` waits at least the requested delay, then queues its callback as a task; it does not resolve the Promise itself until that callback runs. The callback calls `resolve`, and that settlement schedules the continuation after the timer task has finished.

That is why the order is not “call `main`, wait, then print `End`.” The actual order is “start `main`, pause at `await`, return to the caller, print `End`, resolve later, resume `main`, print `Data`.”

# The Trap — Why Most People Get It Wrong

**Trap: treating `await` as a blocking sleep.** `await` pauses only the current async function. It does not freeze the call stack, the top-level script, or the browser. The caller immediately continues and prints `End`.

**Trap: assuming `async` makes every operation asynchronous from the first line.** The body starts synchronously. `main()` calls `getData()`, and `getData()` creates the Promise and registers the timer before execution reaches the suspension point.

**Trap: thinking `setTimeout(..., 1000)` runs at exactly one second.** The delay is a minimum eligibility time. If the runtime is busy, the callback waits until the call stack is free and the event loop selects the timer task. “After about one second” is the accurate description.

**Trap: saying the timer prints `Data`.** The timer callback only calls `resolve("Data")`. That settlement wakes the suspended `await`; the `console.log(data)` statement in `main` is what actually prints `Data`, in a later microtask continuation.

**Trap: expecting `Data` immediately after `resolve`.** Promise reactions are never run in the middle of the current timer callback. The timer task finishes first; then the runtime drains the microtask queue.

**Trap: believing `main()` blocks the next top-level statement.** Calling an async function returns a Promise, but this code does not `await main()` from an enclosing async context. The top-level script therefore continues directly to `console.log("End")`.

# 🧠 The Memory Hook

`await` is a pause button attached to one function, not to JavaScript itself: `main` pauses, the caller prints `End`, and only after the timer settles the Promise does `main` come back and print `Data`.
